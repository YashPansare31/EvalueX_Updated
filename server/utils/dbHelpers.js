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
    .select('id, question_text, points, question_order, optional_group, question_label')
    .eq('assignment_id', assignmentId)
    .order('question_order', { ascending: true });

  if (qErr) throw new Error(`Failed to fetch questions: ${qErr.message}`);
  return questionsRaw || [];
}

/**
 * Fetch exam questions for an assignment, requiring that every row has a question_label.
 *
 * question_label is populated by parse-question-paper and stores the exact label printed
 * on the exam paper (e.g. "Q.1 A", "Q.1 B"). It is used by answer layout detection so
 * that Gemini sees the same labels students write on their answer sheets.
 *
 * Throws if any question is missing a label — this means parse-question-paper has not
 * been run yet (or the question was added manually without a label). The old fallback
 * of assigning sequential Q1/Q2/Q3 is intentionally removed: it produced wrong mappings
 * because Q.1 A became "Q1", Q.1 B became "Q2", Q.2 A became "Q3" etc., which never
 * matched what students actually wrote.
 *
 * @param {string} assignmentId
 * @returns {Promise<Array>} Questions — every row guaranteed to have a non-empty question_label
 */
async function fetchExamQuestionsWithLabels(assignmentId) {
  const questionsRaw = await fetchExamQuestions(assignmentId);

  const missing = questionsRaw.filter(q => !q.question_label);
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} question(s) for assignment ${assignmentId} have no question_label. ` +
      `Run /api/parse-question-paper first so labels are stored from the question paper.`
    );
  }

  return questionsRaw;
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
