const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { detectAnswerLayout, extractSingleAnswerText, flattenQuestions } = require('../services/geminiService');

function sanitizeExtractedText(text) {
  if (!text) return text;
  // Regex to remove the recurring college header with optional trailing numbers (relaxed to account for slight OCR variations)
  const regex = /AISSMS\s+INSTITUTE\s+OF[\s\S]*?Pune\s+University\s*\d*/gi;
  return text.replace(regex, '').trim();
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
    // Fetch structured questions from DB
    const { data: questionsRaw, error: qErr } = await supabase
      .from('exam_questions')
      .select('id, question_text, points, question_order, optional_group')
      .eq('assignment_id', assignmentId)
      .order('question_order', { ascending: true });

    if (qErr || !questionsRaw || questionsRaw.length === 0) {
      return res.status(400).json({
        error: 'No questions found for this assignment. Run /api/parse-question-paper first, or add questions manually.',
      });
    }

    // Build question list with labels for the AI prompt
    const questionsWithLabels = questionsRaw.map((q, idx) => ({
      ...q,
      question_label: `Q${idx + 1}`,
    }));

    // Mark grading status
    await supabase.from('submissions').update({ grading_status: 'extracting' }).eq('id', submissionId);

    // ── PASS 2A: Layout Detection ──────────────────────────────────────────
    const layoutResult = await detectAnswerLayout(pages, questionsWithLabels, mimeType);
    const answerMap = layoutResult.answer_map || [];

    // Save answer_map to submissions table
    await supabase.from('submissions').update({ answer_map: answerMap }).eq('id', submissionId);

    // ── PASS 2B: Targeted Extraction (run for each question in parallel) ──
    const extractionPromises = answerMap.map(async (mapEntry) => {
      if (!mapEntry.attempted) return null;

      const question = questionsWithLabels.find(q => q.question_label === mapEntry.question_label);
      if (!question) return null;

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

        return {
          submission_id: submissionId,
          question_id: question.id,
          question_label: mapEntry.question_label,
          extracted_text: extractedText,
          page_refs: mapEntry.page_refs || [],
          is_optional_attempt: mapEntry.optional_also_attempted || false,
          ocr_confidence: extractedText.includes('[ILLEGIBLE]') ? 0.6 : 0.9,
        };
      } catch (err) {
        console.error(`[extract-answers] Failed Pass 2B for ${mapEntry.question_label}:`, err.message);
        return {
          submission_id: submissionId,
          question_id: question.id,
          question_label: mapEntry.question_label,
          extracted_text: '[EXTRACTION FAILED — MANUAL REVIEW REQUIRED]',
          page_refs: mapEntry.page_refs || [],
          is_optional_attempt: false,
          ocr_confidence: 0.0,
        };
      }
    });

    const extractedAnswers = (await Promise.all(extractionPromises)).filter(Boolean);

    // Upsert all extracted answers into submission_answers
    for (const answer of extractedAnswers) {
      await supabase.from('submission_answers').upsert(answer, {
        onConflict: 'submission_id,question_id',
      });
    }

    // Reset status to pending (ready for grading)
    await supabase.from('submissions').update({ grading_status: 'pending' }).eq('id', submissionId);

    return res.json({
      answer_map: answerMap,
      submission_answers_count: extractedAnswers.length,
      extracted_answers: extractedAnswers.map(a => ({
        question_label: a.question_label,
        has_text: !!a.extracted_text && !a.extracted_text.includes('[NO ANSWER FOUND]'),
        is_optional_attempt: a.is_optional_attempt,
        ocr_confidence: a.ocr_confidence,
        text_preview: a.extracted_text?.substring(0, 100) + (a.extracted_text?.length > 100 ? '...' : ''),
      })),
    });

  } catch (err) {
    console.error('[extract-answers] Fatal error:', err.message);
    await supabase.from('submissions').update({ grading_status: 'pending' }).eq('id', submissionId).catch(() => { });
    return res.status(500).json({ error: 'Answer extraction failed', details: err.message });
  }
});

module.exports = router;
