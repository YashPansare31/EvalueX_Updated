/**
 * Shared PDF parsing utility for the EvalueX backend.
 *
 * Three routes (extractQuestionsPdf, extractModelAnswersPdf, parseRubricPdf) all had
 * identical boilerplate for: running pdf-parse, catching corrupt-PDF errors, and
 * rejecting empty/unreadable docs. Centralised here.
 */

const pdf = require('pdf-parse');

/**
 * Parse a PDF buffer and return the extracted text.
 * Throws a structured Error (with a `statusCode` property) on failure so callers
 * can forward the right HTTP status code to the client.
 *
 * @param {Buffer} buffer  - Raw PDF buffer (e.g. from multer memoryStorage)
 * @returns {Promise<string>} Extracted plain text
 */
async function parsePdfBuffer(buffer) {
  let pdfText = '';
  try {
    const pdfData = await pdf(buffer);
    pdfText = pdfData.text;
  } catch (pdfErr) {
    console.error('PDF parsing error:', pdfErr);
    const err = new Error('Failed to parse PDF content. Ensure it is a valid PDF.');
    err.statusCode = 400;
    throw err;
  }

  if (!pdfText.trim()) {
    const err = new Error('Appears to be an empty or unreadable PDF');
    err.statusCode = 400;
    throw err;
  }

  return pdfText;
}

module.exports = { parsePdfBuffer };
