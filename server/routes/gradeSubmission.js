const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { gradeQuestion } = require('../services/openaiService');
const { applyOptionalQuestionRules } = require('../utils/optionalQuestionsRules');
const { aggregateScores } = require('../utils/scoreAggregator');
const { updateSubmissionStatus } = require('../utils/dbHelpers');

// POST /api/grade-submission
// Accepts: { submissionId: string, assignmentId: string }
// Behavior:
//   - If submission_answers exist in DB → use QCP (per-question grading), batched 3 at a time
//   - Otherwise → 400 error (MISSING_SUBMISSION_ANSWERS) — run extract-answers first
// Returns: { ai_score, ai_feedback, question_grades, grading_method }
router.post('/', async (req, res) => {
  const { submissionId, assignmentId } = req.body;

  if (!submissionId || !assignmentId) {
    return res.status(400).json({ error: 'Missing submissionId or assignmentId' });
  }

  try {
    // --- Fetch assignment details ---
    const { data: assignment, error: aErr } = await supabase
      .from('assignments')
      .select('id, title, description, max_score, optional_question_policy')
      .eq('id', assignmentId)
      .single();
    if (aErr || !assignment) throw new Error('Assignment not found: ' + assignmentId);

    // --- Fetch exam questions with rubrics and model answers ---
    const { data: questions } = await supabase
      .from('exam_questions')
      .select('id, question_text, points, question_order, optional_group')
      .eq('assignment_id', assignmentId)
      .order('question_order', { ascending: true });

    const { data: rubrics } = await supabase
      .from('exam_rubrics')
      .select('rubric_content')
      .eq('assignment_id', assignmentId);

    // --- Fetch model answers (per question, if any) ---
    const { data: modelAnswers } = await supabase
      .from('model_answers')
      .select('question_id, answer_text')
      .eq('assignment_id', assignmentId);

    // Build a lookup map: question_id → model answer text
    const modelAnswerMap = {};
    if (modelAnswers && modelAnswers.length > 0) {
      for (const ma of modelAnswers) {
        modelAnswerMap[ma.question_id] = ma.answer_text;
      }
    }

    // --- Check if QCP answers exist ---
    const { data: submissionAnswers } = await supabase
      .from('submission_answers')
      .select('*')
      .eq('submission_id', submissionId);

    const useQCP = submissionAnswers && submissionAnswers.length > 0 && questions && questions.length > 0;

    if (useQCP) {
      // ===== QUESTION-CENTRIC PIPELINE =====

      // Update grading_status
      await updateSubmissionStatus(submissionId, 'grading');

      // Grade each question in BATCHES of 3 (prevents OpenAI rate-limit hits)
      const BATCH_SIZE = 3;
      const BATCH_DELAY_MS = 600;
      const rawGrades = [];

      for (let i = 0; i < submissionAnswers.length; i += BATCH_SIZE) {
        const batch = submissionAnswers.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(batch.map(async (sa) => {
          const question = questions.find(q => q.id === sa.question_id);
          if (!question) return null;

          // Use assignment-level rubric (concatenated)
          const rubricText = rubrics && rubrics.length > 0
            ? rubrics.map(r => r.rubric_content).join('\n')
            : null;

          // Look up model answer for this specific question
          const modelAnswer = modelAnswerMap[question.id] || null;

          try {
            const grade = await gradeQuestion({
              questionLabel: sa.question_label,
              questionText: question.question_text,
              maxMarks: question.points,
              studentAnswer: sa.extracted_text || '[NO ANSWER FOUND]',
              rubricCriteria: rubricText,
              modelAnswer,
              assignmentContext: assignment.title,
            });

            return {
              submission_id: submissionId,
              question_id: question.id,
              question_label: sa.question_label,
              ai_score: grade.score,
              max_score: question.points,
              ai_feedback: grade.feedback,
              rubric_breakdown: grade.rubric_breakdown || [],
              confidence: grade.confidence,
              optional_group: question.optional_group,
              attempted: true,
              is_counted: true,
            };
          } catch (err) {
            console.error(`[grade-submission] Failed grading ${sa.question_label}:`, err.message);
            return {
              submission_id: submissionId,
              question_id: question.id,
              question_label: sa.question_label,
              ai_score: 0,
              max_score: question.points,
              ai_feedback: 'Grading failed — requires manual review',
              confidence: 'low',
              optional_group: question.optional_group,
              is_counted: true,
            };
          }
        }));

        rawGrades.push(...batchResults.filter(Boolean));

        // Delay between batches (skip after the last batch)
        if (i + BATCH_SIZE < submissionAnswers.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // Apply optional question rules
      const policy = assignment.optional_question_policy || 'educator_choice';
      const processedGrades = applyOptionalQuestionRules(rawGrades, policy);

      // Upsert question_grades into DB
      for (const g of processedGrades) {
        const { error: upsertErr } = await supabase.from('question_grades').upsert({
          submission_id: g.submission_id,
          question_id: g.question_id,
          question_label: g.question_label,
          ai_score: Math.round(g.ai_score),
          max_score: g.max_score,
          ai_feedback: g.ai_feedback,
          rubric_breakdown: g.rubric_breakdown || [],
          confidence: g.confidence,
          is_counted: g.is_counted,
        }, { onConflict: 'submission_id,question_id' });

        if (upsertErr) {
          console.error(`[grade-submission] Upsert failed for ${g.question_label}:`, upsertErr.message);
          // We continue to next question but log it
        }
      }

      // Aggregate final score
      const { finalScore, maxPossible, breakdown, needsEducatorChoice, lowConfidenceCount } = aggregateScores(processedGrades);

      // Build summary feedback string
      const feedbackSummary = processedGrades
        .filter(g => g.is_counted)
        .map(g => `${g.question_label} [${g.ai_score}/${g.max_score}]: ${g.ai_feedback}`)
        .join('\n\n');

      // Update submissions table with final aggregated score
      await supabase.from('submissions').update({
        ai_score: Math.round(finalScore),
        ai_feedback: feedbackSummary,
        grading_status: needsEducatorChoice ? 'grading' : 'aggregated',
      }).eq('id', submissionId);

      return res.json({
        ai_score: finalScore,
        ai_feedback: feedbackSummary,
        max_possible: maxPossible,
        question_grades: processedGrades,
        needs_educator_choice: needsEducatorChoice,
        low_confidence_count: lowConfidenceCount,
        grading_method: 'question_centric',
      });

    } else {
      // ===== HARD GUARD — No submission_answers found =====
      // extract-answers must be run before grade-submission.
      // Log this so we can track which submissions are hitting this path.
      console.warn(
        `[grade-submission] Blocked: No submission_answers (n=${submissionAnswers?.length}) or ` +
        `exam_questions (n=${questions?.length}) found for submission ${submissionId}. ` +
        `Ensure /api/extract-answers has successfully populated rows for this submission.`
      );

      return res.status(400).json({
        error: 'No extracted answers found for this submission. Run extract-answers first.',
        code: 'MISSING_SUBMISSION_ANSWERS',
        details: {
          submissionId,
          assignmentId,
          answersFound: submissionAnswers?.length || 0,
          questionsFound: questions?.length || 0
        }
      });
    }

  } catch (err) {
    console.error('[grade-submission] Fatal error:', err.message);
    // Revert grading status on failure
    try {
      await updateSubmissionStatus(submissionId, 'pending');
    } catch {}
    return res.status(500).json({ error: 'Grading failed', details: err.message });
  }
});

module.exports = router;
