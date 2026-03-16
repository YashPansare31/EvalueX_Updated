const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { gradeQuestion } = require('../services/openaiService');

// POST /api/grade-question
// Use case: Educator manually re-grades a single question after extraction
// Accepts: { submissionId, questionId, assignmentId }
// Returns: { question_grade }
router.post('/', async (req, res) => {
  const { submissionId, questionId, assignmentId } = req.body;

  if (!submissionId || !questionId || !assignmentId) {
    return res.status(400).json({ error: 'Missing submissionId, questionId, or assignmentId' });
  }

  try {
    // Fetch the submission answer for this question
    const { data: sa, error: saErr } = await supabase
      .from('submission_answers')
      .select('*')
      .eq('submission_id', submissionId)
      .eq('question_id', questionId)
      .single();

    if (saErr || !sa) return res.status(404).json({ error: 'Submission answer not found for this question' });

    // Fetch question details
    const { data: question, error: qErr } = await supabase
      .from('exam_questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (qErr || !question) return res.status(404).json({ error: 'Question not found' });

    // Fetch assignment context
    const { data: assignment } = await supabase
      .from('assignments')
      .select('title')
      .eq('id', assignmentId)
      .single();



    // Fetch rubric
    const { data: rubrics } = await supabase
      .from('exam_rubrics')
      .select('rubric_content')
      .eq('assignment_id', assignmentId);

    // Fetch model answer for this specific question (if available)
    const { data: modelAnswerRow } = await supabase
      .from('model_answers')
      .select('answer_text')
      .eq('question_id', questionId)
      .eq('assignment_id', assignmentId)
      .maybeSingle();

    const grade = await gradeQuestion({
      questionLabel: sa.question_label,
      questionText: question.question_text,
      maxMarks: question.points,
      studentAnswer: sa.extracted_text || '[NO ANSWER FOUND]',
      rubricCriteria: rubrics?.map(r => r.rubric_content).join('\n') || null,
      modelAnswer: modelAnswerRow?.answer_text || null,
      assignmentContext: assignment?.title || '',
    });

    // Upsert the grade
    const { data: savedGrade } = await supabase.from('question_grades').upsert({
      submission_id: submissionId,
      question_id: questionId,
      question_label: sa.question_label,
      ai_score: grade.score,
      max_score: question.points,
      ai_feedback: grade.feedback,
      rubric_breakdown: grade.rubric_breakdown || [],
      confidence: grade.confidence,
      is_counted: true,
    }, { onConflict: 'submission_id,question_id' }).select().single();

    return res.json({ question_grade: savedGrade });

  } catch (err) {
    console.error('[grade-question] Error:', err.message);
    return res.status(500).json({ error: 'Question grading failed', details: err.message });
  }
});

module.exports = router;
