const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { parseQuestionPaperStructure } = require('../services/geminiService');

// POST /api/parse-question-paper
// Accepts: { assignmentId: string, images: string[] (base64), mimeType?: string }
// Action: Extracts structured question schema and upserts into exam_questions table
// Returns: { questions: [...], total_marks: number }
router.post('/', async (req, res) => {
  const { assignmentId, images, mimeType = 'image/jpeg' } = req.body;

  if (!assignmentId || !images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Missing assignmentId or images array' });
  }

  try {
    const parsed = await parseQuestionPaperStructure(images, mimeType);

    // Store each question directly — the parser now returns a flat list
    // (Q1a, Q1b, Q2a, Q2b etc.) with no nested sub_questions
    const { questions, total_marks } = parsed;

    // Delete all existing questions for this assignment before inserting fresh ones.
    // This prevents duplicate rows when the question paper is re-parsed, which would
    // corrupt the question list shown to Gemini during answer layout detection.
    const { error: deleteErr } = await supabase
      .from('exam_questions')
      .delete()
      .eq('assignment_id', assignmentId);
    if (deleteErr) throw new Error(`Failed to clear old questions: ${deleteErr.message}`);

    let questionOrder = 0;
    const insertedQuestions = [];

    for (const q of questions) {
      const { data, error } = await supabase.from('exam_questions').insert({
        assignment_id: assignmentId,
        question_text: q.question_text,
        points: q.marks ?? q.total_marks ?? 0,
        question_order: ++questionOrder,
        optional_group: q.optional_group || null,
        question_label: q.question_label || null,
      }).select().single();

      if (!error && data) insertedQuestions.push({ ...data, question_label: q.question_label });
    }

    // Update assignment max_score if parsed total_marks is available
    if (total_marks) {
      await supabase.from('assignments').update({ max_score: total_marks }).eq('id', assignmentId);
    }

    return res.json({
      questions: insertedQuestions,
      total_marks: total_marks || null,
      raw_structure: parsed,
    });

  } catch (err) {
    console.error('[parse-question-paper] Error:', err.message);
    return res.status(500).json({ error: 'Question paper parsing failed', details: err.message });
  }
});

module.exports = router;
