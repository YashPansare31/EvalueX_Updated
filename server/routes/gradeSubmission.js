const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { gradeQuestion, gradeSubmissionHolistic } = require('../services/openaiService');
const { applyOptionalQuestionRules } = require('../utils/optionalQuestionsRules');
const { aggregateScores } = require('../utils/scoreAggregator');

// POST /api/grade-submission
// Accepts: { submissionId: string, assignmentId: string }
// Behavior:
//   - If submission_answers exist in DB → use QCP (per-question grading)
//   - Otherwise → fall back to holistic grading with full text from submissions.content
// Returns: { ai_score, ai_feedback, question_grades (if QCP) }
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

    // --- Check if QCP answers exist ---
    const { data: submissionAnswers } = await supabase
      .from('submission_answers')
      .select('*')
      .eq('submission_id', submissionId);

    const useQCP = submissionAnswers && submissionAnswers.length > 0 && questions && questions.length > 0;

    if (useQCP) {
      // ===== QUESTION-CENTRIC PIPELINE =====

      // Update grading_status
      await supabase.from('submissions').update({ grading_status: 'grading' }).eq('id', submissionId);

      // Grade each question in PARALLEL
      const gradingPromises = submissionAnswers.map(async (sa) => {
        const question = questions.find(q => q.id === sa.question_id);
        if (!question) return null;

        // Use assignment-level rubric as fallback (concatenated)
        const rubricText = rubrics && rubrics.length > 0
          ? rubrics.map(r => r.rubric_content).join('\n')
          : null;

        try {
          const grade = await gradeQuestion({
            questionLabel: sa.question_label,
            questionText: question.question_text,
            maxMarks: question.points,
            studentAnswer: sa.extracted_text || '[NO ANSWER FOUND]',
            rubricCriteria: rubricText,
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
      });

      const rawGrades = (await Promise.all(gradingPromises)).filter(Boolean);

      // Apply optional question rules
      const policy = assignment.optional_question_policy || 'educator_choice';
      const processedGrades = applyOptionalQuestionRules(rawGrades, policy);

      // Upsert question_grades into DB
      for (const g of processedGrades) {
        await supabase.from('question_grades').upsert({
          submission_id: g.submission_id,
          question_id: g.question_id,
          question_label: g.question_label,
          ai_score: g.ai_score,
          max_score: g.max_score,
          ai_feedback: g.ai_feedback,
          rubric_breakdown: g.rubric_breakdown || [],
          confidence: g.confidence,
          is_counted: g.is_counted,
        }, { onConflict: 'submission_id,question_id' });
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
        ai_score: finalScore,
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
      // ===== HOLISTIC FALLBACK (backward compat) =====

      // Fetch submission text
      const { data: submission, error: sErr } = await supabase
        .from('submissions')
        .select('content')
        .eq('id', submissionId)
        .single();
      if (sErr || !submission) throw new Error('Submission not found: ' + submissionId);

      await supabase.from('submissions').update({ grading_status: 'grading' }).eq('id', submissionId);

      const result = await gradeSubmissionHolistic({
        assignmentTitle: assignment.title,
        assignmentDescription: assignment.description,
        maxScore: assignment.max_score,
        studentText: submission.content,
        questions: questions || [],
        rubrics: rubrics || [],
      });

      await supabase.from('submissions').update({
        ai_score: result.score,
        ai_feedback: result.feedback,
        grading_status: 'aggregated',
      }).eq('id', submissionId);

      return res.json({
        ai_score: result.score,
        ai_feedback: result.feedback,
        grading_method: 'holistic',
      });
    }

  } catch (err) {
    console.error('[grade-submission] Fatal error:', err.message);
    // Revert grading status on failure
    try {
      await supabase.from('submissions').update({ grading_status: 'pending' }).eq('id', submissionId);
    } catch {}
    return res.status(500).json({ error: 'Grading failed', details: err.message });
  }
});

module.exports = router;
