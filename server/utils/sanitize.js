/**
 * Shared text-sanitization utilities for the EvalueX backend.
 *
 * The AISSMS college header regex appears in multiple routes (extractText, extractAnswers).
 * Centralised here so that any future regex tweaks only need to be made in one place.
 */

/**
 * Strips the recurring AISSMS college header from OCR-extracted text.
 * The regex is intentionally broad to handle OCR variations (extra spaces, line-breaks, etc.)
 *
 * @param {string|null|undefined} text
 * @returns {string|null|undefined} cleaned text (same type as input)
 */
function sanitizeExtractedText(text) {
  if (!text) return text;
  // Match the full college header block, including optional AICTE/NAAC sub-lines
  const regex =
    /AISSMS\s+INSTITUTE\s+OF[\s\S]*?(Approved\s+by\s+AICTE,\s*New\s+Delhi\s+and\s+Recognised\s+by\s+Govt\.\s+of\s+Maharashtra)?[\s\S]*?(Accredited\s+by\s+NAAC\s+with\s+"A\+"\s+Grade\s*\|\s*NBA-S\s+UG\s+Programmes)?[\s\S]*?Pune\s+University\s*\d*/gi;
  return text.replace(regex, '').trim();
}

module.exports = { sanitizeExtractedText };
