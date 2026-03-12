/**
 * Handles the business logic for optional questions.
 *
 * When a student attempts both Q1 and Q2 (where only one is required),
 * this module determines which answer to count based on the assignment policy.
 *
 * @param {Array} questionGrades - Array of { question_id, question_label, ai_score, max_score, optional_group }
 * @param {string} policy - 'educator_choice' | 'auto_higher'
 * @returns {Array} - Same array with is_counted set correctly
 */
function applyOptionalQuestionRules(questionGrades, policy = 'educator_choice') {
  // Group grades by optional_group
  const groups = {};
  const ungrouped = [];

  for (const grade of questionGrades) {
    if (grade.optional_group) {
      if (!groups[grade.optional_group]) groups[grade.optional_group] = [];
      groups[grade.optional_group].push(grade);
    } else {
      ungrouped.push({ ...grade, is_counted: true });
    }
  }

  const result = [...ungrouped];

  for (const [groupId, groupGrades] of Object.entries(groups)) {
    const attempted = groupGrades.filter(g => g.attempted !== false);

    if (attempted.length <= 1) {
      // Only one attempted — count it, mark others as not counted
      result.push(...groupGrades.map(g => ({
        ...g,
        is_counted: attempted.length === 1 ? g.question_id === attempted[0]?.question_id : false,
      })));
      continue;
    }

    // Multiple attempted — apply policy
    if (policy === 'auto_higher') {
      // Find the grade with the highest score percentage
      const sorted = [...attempted].sort(
        (a, b) => (b.ai_score / b.max_score) - (a.ai_score / a.max_score)
      );
      const winnerId = sorted[0].question_id;
      result.push(...groupGrades.map(g => ({
        ...g,
        is_counted: g.question_id === winnerId,
        not_counted_reason: g.question_id !== winnerId
          ? `Optional: auto-selected higher score (${sorted[0].question_label})`
          : null,
      })));
    } else {
      // 'educator_choice' — flag all as needing educator decision
      result.push(...groupGrades.map(g => ({
        ...g,
        is_counted: false, // educator must explicitly choose
        needs_educator_choice: true,
        optional_group: groupId,
      })));
    }
  }

  return result;
}

module.exports = { applyOptionalQuestionRules };
