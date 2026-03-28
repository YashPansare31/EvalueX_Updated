/**
 * Shared Gemini API error handler for route files.
 *
 * extractQuestionsPdf and extractModelAnswersPdf both had identical catch blocks
 * that translated Gemini-specific error messages into HTTP responses.
 * Centralised here so error-message strings and status codes are maintained once.
 *
 * @param {Error} error  - The error thrown by a Gemini service call
 * @param {Response} res - Express response object
 * @param {string} [routeTag='gemini'] - Log prefix, e.g. '[extract-questions-pdf]'
 */
function handleGeminiError(error, res, routeTag = '[gemini]') {
  console.error(`${routeTag} Error:`, error.message);

  if (error.message?.includes('API key')) {
    return res.status(500).json({ error: 'Invalid Gemini API key' });
  }
  if (error.message?.includes('rate')) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }

  return res.status(error.statusCode || 500).json({
    error: error.message || 'Unknown error',
  });
}

/**
 * Check that GEMINI_API_KEY is set and send a 500 if not.
 * Returns true if the key is missing (caller should return immediately).
 *
 * @param {Response} res
 * @returns {boolean}
 */
function requireGeminiKey(res) {
  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    return true;
  }
  return false;
}

module.exports = { handleGeminiError, requireGeminiKey };
