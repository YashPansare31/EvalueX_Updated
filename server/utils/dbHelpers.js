/**
 * Shared Supabase helpers for common submission and question operations.
 *
 * Several route files (extractAnswers, parseModelAnswers, gradeSubmission) contain
 * near-identical patterns for:
 *   1. Fetching exam_questions ordered by question_order
 *   2. Building questionsWithLabels (adding Q1, Q2, ... labels)
 *   3. Updating grading_status on a submission
 *
 * Centralised here to eliminate duplication.
 */

const supabase = require('../services/supabaseClient');

/**
 * Fetch all exam questions for an assignment, ordered by question_order.
 *
 * @param {string} assignmentId
 * @returns {Promise<Array>} Raw question rows
 */
async function fetchExamQuestions(assignmentId) {
  const { data: questionsRaw, error: qErr } = await supabase
    .from('exam_questions')
    .select('id, question_text, points, question_order, optional_group')
    .eq('assignment_id', assignmentId)
    .order('question_order', { ascending: true });

  if (qErr) throw new Error(`Failed to fetch questions: ${qErr.message}`);
  return questionsRaw || [];
}

/**
 * Fetch exam questions and attach sequential Q-labels (Q1, Q2, …).
 *
 * @param {string} assignmentId
 * @returns {Promise<Array>} Questions with an added `question_label` field
 */
async function fetchExamQuestionsWithLabels(assignmentId) {
  const questionsRaw = await fetchExamQuestions(assignmentId);
  return questionsRaw.map((q, idx) => ({
    ...q,
    question_label: `Q${idx + 1}`,
  }));
}

/**
 * Update the grading_status column for a single submission.
 *
 * @param {string} submissionId
 * @param {string} status  e.g. 'pending' | 'extracting' | 'grading' | 'aggregated'
 * @returns {Promise<void>}
 */
async function updateSubmissionStatus(submissionId, status) {
  await supabase
    .from('submissions')
    .update({ grading_status: status })
    .eq('id', submissionId);
}

module.exports = {
  fetchExamQuestions,
  fetchExamQuestionsWithLabels,
  updateSubmissionStatus,
};
