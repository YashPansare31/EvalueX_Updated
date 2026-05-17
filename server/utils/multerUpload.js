/**
 * Shared multer upload middleware for the EvalueX backend.
 *
 * Three route files (extractQuestionsPdf, extractModelAnswersPdf, parseRubricPdf)
 * each had `const upload = multer({ storage: multer.memoryStorage() })`.
 * Exported once from here and imported wherever needed.
 */

const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = { upload };
