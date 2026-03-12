const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const { applyOptionalQuestionRules } = require('../utils/optionalQuestionsRules');
const { aggregateScores } = require('../utils/scoreAggregator');

// POST /api/aggregate-scores
// Use case: Re-compute final score after educator overrides or optional question choices
// Accepts: { submissionId, assignmentId }
// Returns: { final_score, max_possible, breakdown, needs_educator_choice }
router.post('/', async (req, res) => {
  const { submissionId, assignmentId } = req.body;

  if (!submissionId || !assignmentId) {
    return res.status(400).json({ error: 'Missing submissionId or assignmentId' });
  }

  try {
    const { data: assignment } = await supabase
      .from('assignments')
      .select('max_score, optional_question_policy')
      .eq('id', assignmentId)
      .single();

    const { data: grades, error: gErr } = await supabase
      .from('question_grades')
      .select('*, exam_questions(optional_group)')
      .eq('submission_id', submissionId);

    if (gErr || !grades || grades.length === 0) {
      return res.status(404).json({ error: 'No question grades found for this submission. Run grading first.' });
    }

    // Attach optional_group from join
    const gradesWithGroup = grades.map(g => ({
      ...g,
      optional_group: g.exam_questions?.optional_group || null,
    }));

    const policy = assignment?.optional_question_policy || 'educator_choice';
    const processed = applyOptionalQuestionRules(gradesWithGroup, policy);
    const { finalScore, maxPossible, breakdown, needsEducatorChoice, lowConfidenceCount } = aggregateScores(processed);

    // Update submissions table
    await supabase.from('submissions').update({
      ai_score: finalScore,
      grading_status: needsEducatorChoice ? 'grading' : 'aggregated',
    }).eq('id', submissionId);

    return res.json({
      final_score: finalScore,
      max_possible: maxPossible,
      breakdown,
      needs_educator_choice: needsEducatorChoice,
      low_confidence_count: lowConfidenceCount,
    });

  } catch (err) {
    console.error('[aggregate-scores] Error:', err.message);
    return res.status(500).json({ error: 'Score aggregation failed', details: err.message });
  }
});

// GET /api/aggregate-scores/:submissionId
// Fetch existing per-question grade breakdown for a submission
router.get('/:submissionId', async (req, res) => {
  const { submissionId } = req.params;

  try {
    const { data: grades, error } = await supabase
      .from('question_grades')
      .select('*')
      .eq('submission_id', submissionId)
      .order('question_label', { ascending: true });

    if (error) throw error;

    return res.json({ question_grades: grades || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch grades', details: err.message });
  }
});

module.exports = router;
