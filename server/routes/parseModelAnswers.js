const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { parseModelAnswersStructure } = require('../services/geminiService');

// POST /api/parse-model-answers
// Accepts: { assignmentId: string, images: string[] (base64) }
router.post('/', async (req, res) => {
  const { assignmentId, images, mimeType = 'image/jpeg' } = req.body;

  if (!assignmentId || !images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'Missing assignmentId or images array' });
  }

  try {
    // get questions for mapping
    const { data: questionsRaw, error: qErr } = await supabase
      .from('exam_questions')
      .select('id, question_text, question_order')
      .eq('assignment_id', assignmentId)
      .order('question_order', { ascending: true });

    if (qErr || !questionsRaw || questionsRaw.length === 0) {
      return res.status(400).json({ error: 'No questions found for this assignment.' });
    }

    // Build question list with labels
    const questionsWithLabels = questionsRaw.map((q, idx) => ({
      ...q,
      question_label: `Q${idx + 1}`,
    }));

    const parsed = await parseModelAnswersStructure(images, questionsWithLabels, mimeType);

    const insertedAnswers = [];
    for (const ans of parsed.model_answers) {
      const { data, error } = await supabase.from('model_answers').upsert({
        assignment_id: assignmentId,
        question_id: ans.question_id,
        answer_text: ans.answer_text,
        key_concepts: ans.key_concepts
      }, { onConflict: 'assignment_id,question_id' }).select().single();

      if (!error && data) insertedAnswers.push(data);
    }

    return res.json({
      model_answers: insertedAnswers,
      raw_structure: parsed,
    });

  } catch (err) {
    console.error('[parse-model-answers] Error:', err.message);
    return res.status(500).json({ error: 'Model answers parsing failed', details: err.message });
  }
});

module.exports = router;
