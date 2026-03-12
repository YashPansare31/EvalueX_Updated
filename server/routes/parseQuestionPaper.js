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

    // Flatten question tree and upsert into exam_questions
    const { questions, total_marks } = parsed;
    let questionOrder = 0;
    const insertedQuestions = [];

    for (const q of questions) {
      const hasSubQuestions = q.sub_questions && q.sub_questions.length > 0;

      if (!hasSubQuestions) {
        // Top-level question with no sub-questions
        const { data, error } = await supabase.from('exam_questions').upsert({
          assignment_id: assignmentId,
          question_text: q.question_text,
          points: q.total_marks,
          question_order: ++questionOrder,
          optional_group: q.optional_group || null,
        }, { onConflict: 'assignment_id,question_order' }).select().single();

        if (!error && data) insertedQuestions.push({ ...data, question_label: q.question_label });
      } else {
        // Insert sub-questions
        for (const sq of q.sub_questions) {
          const { data, error } = await supabase.from('exam_questions').upsert({
            assignment_id: assignmentId,
            question_text: `${q.question_label}: ${sq.question_text}`,
            points: sq.marks,
            question_order: ++questionOrder,
            optional_group: sq.optional_group || q.optional_group || null,
          }, { onConflict: 'assignment_id,question_order' }).select().single();

          if (!error && data) insertedQuestions.push({ ...data, question_label: sq.question_label });
        }
      }
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
