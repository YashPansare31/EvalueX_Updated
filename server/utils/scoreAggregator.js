/**
 * Computes the final aggregated score from individual question grades.
 * Only sums questions where is_counted = true.
 *
 * @param {Array} questionGrades - Array of question grade objects
 * @returns {object} { finalScore, maxPossible, breakdown, needsEducatorChoice }
 */
function aggregateScores(questionGrades) {
  const counted = questionGrades.filter(g => g.is_counted);
  const needsEducatorChoice = questionGrades.some(g => g.needs_educator_choice);

  const finalScore = counted.reduce((sum, g) => {
    const score = g.educator_override !== null && g.educator_override !== undefined
      ? g.educator_override
      : (g.ai_score || 0);
    return sum + score;
  }, 0);

  const maxPossible = counted.reduce((sum, g) => sum + (g.max_score || 0), 0);

  const breakdown = questionGrades.map(g => ({
    question_label: g.question_label,
    score: g.educator_override ?? g.ai_score ?? 0,
    max: g.max_score,
    is_counted: g.is_counted,
    confidence: g.confidence,
    needs_educator_choice: g.needs_educator_choice || false,
  }));

  return {
    finalScore: Math.round(finalScore * 10) / 10,
    maxPossible,
    breakdown,
    needsEducatorChoice,
    lowConfidenceCount: questionGrades.filter(g => g.confidence === 'low').length,
  };
}

module.exports = { aggregateScores };
