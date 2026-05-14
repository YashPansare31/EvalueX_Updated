const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { detectAnswerLayout, extractSingleAnswerText } = require('../services/geminiService');
const { sanitizeExtractedText } = require('../utils/sanitize');
const { fetchExamQuestionsWithLabels, updateSubmissionStatus } = require('../utils/dbHelpers');

// Normalize a question label for fuzzy matching.
// "Q.1 A", "Q1 A", "Q1a", "Q1A", "Q1-a", "Q01a" → "q1a"
function normalizeLabel(label) {
  return (label || '')
    .toLowerCase()
    .replace(/[\s\.\(\)\[\]\-_,;:]/g, '') // remove punctuation and separators
    .replace(/q0*(\d)/g, 'q$1');           // strip zero-padding: "q01" → "q1"
}

// POST /api/extract-answers
// Accepts: { submissionId, assignmentId, pages: string[] (base64, one per page), mimeType? }
// Action:
//   Pass 2A: Detect which pages contain which answers (layout analysis)
//   Pass 2B: Extract text per question using only relevant pages
//   Stores: submission_answers rows + updates submissions.answer_map
// Returns: { answer_map, submission_answers_count }
router.post('/', async (req, res) => {
  const { submissionId, assignmentId, pages, mimeType = 'image/jpeg' } = req.body;

  if (!submissionId || !assignmentId || !pages || !Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'Missing submissionId, assignmentId, or pages array' });
  }

  try {
    // Fetch structured questions with labels from DB
    const questionsWithLabels = await fetchExamQuestionsWithLabels(assignmentId);

    if (!questionsWithLabels || questionsWithLabels.length === 0) {
      return res.status(400).json({
        error: 'No questions found for this assignment. Run /api/parse-question-paper first, or add questions manually.',
      });
    }

    // Mark grading status
    await updateSubmissionStatus(submissionId, 'extracting');

    // ── PASS 2A: Layout Detection ──────────────────────────────────────────
    const layoutResult = await detectAnswerLayout(pages, questionsWithLabels, mimeType);
    const rawAnswerMap = layoutResult.answer_map || [];

    // Remap every AI-returned label to the exact DB label using normalized matching.
    // Gemini may return "Q1 A", "Q.1 A", "Q1A" etc. — we normalize both sides and
    // replace with the DB's canonical label so all downstream matching is exact.
    const answerMap = rawAnswerMap.map(entry => {
      const matched = questionsWithLabels.find(
        q => normalizeLabel(q.question_label) === normalizeLabel(entry.question_label)
      );
      return matched ? { ...entry, question_label: matched.question_label } : entry;
    });

    // Save answer_map to submissions table
    await supabase.from('submissions').update({ answer_map: answerMap }).eq('id', submissionId);

    // ── PASS 2B: Targeted Extraction (sequential — one question at a time to avoid rate limits) ──
    const extractedAnswers = [];
    for (const mapEntry of answerMap) {
      if (!mapEntry.attempted) continue;

      // Exact match now guaranteed because we remapped labels above
      const question = questionsWithLabels.find(q => q.question_label === mapEntry.question_label);
      if (!question) {
        console.warn(`[extract-answers] No DB question found for label "${mapEntry.question_label}" — skipping`);
        continue;
      }

      // Collect only the relevant pages for this answer
      const relevantPages = (mapEntry.page_refs || [])
        .map(ref => {
          const pageIdx = ref.page - 1; // Convert 1-indexed to 0-indexed
          return pageIdx >= 0 && pageIdx < pages.length ? pages[pageIdx] : null;
        })
        .filter(Boolean);

      // If no specific pages identified, use all pages (safety fallback)
      const pagesToUse = relevantPages.length > 0 ? relevantPages : pages;

      try {
        let extractedText = await extractSingleAnswerText(
          pagesToUse,
          question.question_text,
          mapEntry.question_label,
          mimeType
        );

        extractedText = sanitizeExtractedText(extractedText);

        extractedAnswers.push({
          submission_id: submissionId,
          question_id: question.id,
          question_label: mapEntry.question_label,
          extracted_text: extractedText,
          // DB column is INTEGER[], so we extract only the page numbers
          page_numbers: (mapEntry.page_refs || []).map(ref => ref.page),
          // DB column is confidence (numeric)
          confidence: extractedText.includes('[ILLEGIBLE]') ? 0.6 : 0.9,
        });

        // Small delay to prevent overwhelming fetch/rate-limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`[extract-answers] Failed Pass 2B for ${mapEntry.question_label}:`, err.message);
        extractedAnswers.push({
          submission_id: submissionId,
          question_id: question.id,
          question_label: mapEntry.question_label,
          extracted_text: '[EXTRACTION FAILED — MANUAL REVIEW REQUIRED]',
          page_numbers: (mapEntry.page_refs || []).map(ref => ref.page),
          confidence: 0.0,
        });
      }
    }

    // ── PASS 2B FALLBACK: catch questions that Pass 2A missed entirely ─────
    // Any question in the DB that has NO entry in answer_map at all (not even attempted:false)
    // should still get a Pass-2B extraction attempt.
    // Use normalized labels so format differences don't create false "orphans".
    const mappedNormalized = new Set(answerMap.map(e => normalizeLabel(e.question_label)));
    const orphanedQuestions = questionsWithLabels.filter(
      q => !mappedNormalized.has(normalizeLabel(q.question_label))
    );

    if (orphanedQuestions.length > 0) {
      console.warn(
        `[extract-answers] WARN: Pass 2A missed ${orphanedQuestions.length} question(s): ` +
        `${orphanedQuestions.map(q => q.question_label).join(', ')}. ` +
        `This likely means question_label values in the DB don't match what Gemini returned. ` +
        `Check that parse-question-paper was run and question_labels are stored correctly.`
      );

      // Limit fallback to at most 4 pages to avoid overwhelming Gemini on long answer sheets.
      // Sending all 8-10 pages causes it to pick up wrong question sections or return garbage.
      // Most orphaned questions appear in the first half of the answer sheet.
      const FALLBACK_PAGE_LIMIT = 4;
      const fallbackPages = pages.slice(0, FALLBACK_PAGE_LIMIT);

      const fallbackAnswers = [];
      for (const question of orphanedQuestions) {
        try {
          let extractedText = await extractSingleAnswerText(
            fallbackPages,
            question.question_text,
            question.question_label,
            mimeType
          );
          extractedText = sanitizeExtractedText(extractedText);

          // Only store if we actually found something (not [NO ANSWER FOUND])
          if (!extractedText || extractedText.trim() === '[NO ANSWER FOUND]') {
            console.log(`[extract-answers] Fallback: no answer found for ${question.question_label} in first ${FALLBACK_PAGE_LIMIT} pages`);
            continue;
          }

          fallbackAnswers.push({
            submission_id: submissionId,
            question_id: question.id,
            question_label: question.question_label,
            extracted_text: extractedText,
            page_numbers: fallbackPages.map((_, i) => i + 1),
            // Lower confidence than Pass 2B proper (0.85 → 0.7) because page selection is a guess
            confidence: extractedText.includes('[ILLEGIBLE]') ? 0.5 : 0.7,
          });

          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          console.error(`[extract-answers] Fallback extraction failed for ${question.question_label}:`, err.message);
        }
      }

      extractedAnswers.push(...fallbackAnswers);

      if (fallbackAnswers.length > 0) {
        console.log(`[extract-answers] Fallback recovered ${fallbackAnswers.length} answer(s): ${fallbackAnswers.map(a => a.question_label).join(', ')}`);
      }
    }

    // Delete ALL old submission_answers for this submission before writing fresh ones.
    // If the question paper was re-parsed (new question UUIDs), old rows would have stale
    // question_id foreign keys that grading can never resolve — silently skipping answers.
    const { error: deleteAnswersErr } = await supabase
      .from('submission_answers')
      .delete()
      .eq('submission_id', submissionId);
    if (deleteAnswersErr) {
      console.error('[extract-answers] Failed to delete stale submission_answers:', deleteAnswersErr.message);
      throw new Error(`Failed to clear stale answers: ${deleteAnswersErr.message}`);
    }

    // Also clear any stale question_grades so grading starts fresh
    await supabase.from('question_grades').delete().eq('submission_id', submissionId);

    // Insert all extracted answers into submission_answers
    for (const answer of extractedAnswers) {
      const { error: insertErr } = await supabase.from('submission_answers').insert(answer);
      if (insertErr) {
        console.error(`[extract-answers] Insert failed for ${answer.question_label}:`, insertErr.message);
        throw new Error(`Failed to save extracted answer for ${answer.question_label}: ${insertErr.message}`);
      }
    }

    // Reset status to pending (ready for grading)
    await updateSubmissionStatus(submissionId, 'pending');

    return res.json({
      answer_map: answerMap,
      submission_answers_count: extractedAnswers.length,
      extracted_answers: extractedAnswers.map(a => ({
        question_label: a.question_label,
        has_text: !!a.extracted_text && !a.extracted_text.includes('[NO ANSWER FOUND]'),
        confidence: a.confidence,
        text_preview: a.extracted_text?.substring(0, 100) + (a.extracted_text?.length > 100 ? '...' : ''),
      })),
    });

  } catch (err) {
    console.error('[extract-answers] Fatal error:', err.message);
    await updateSubmissionStatus(submissionId, 'pending').catch(() => { });
    return res.status(500).json({ error: 'Answer extraction failed', details: err.message });
  }
});

module.exports = router;
