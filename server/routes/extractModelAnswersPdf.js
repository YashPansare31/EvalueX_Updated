const express = require('express');
const router = express.Router();
const { extractModelAnswersFromPdfText } = require('../services/geminiService');
const { upload } = require('../utils/multerUpload');
const { parsePdfBuffer } = require('../utils/pdfParser');
const { handleGeminiError, requireGeminiKey } = require('../utils/geminiErrors');

// POST /api/extract-model-answers-pdf
// Accepts: multipart/form-data with 'file' field (PDF) and 'questions' field (JSON string)
// Returns: { success: true, modelAnswers: [...] }
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const questionsStr = req.body.questions;
        if (!questionsStr) {
            return res.status(400).json({ error: 'No questions provided mapping' });
        }

        let questions = [];
        try {
            questions = JSON.parse(questionsStr);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid questions JSON' });
        }

        if (requireGeminiKey(res)) return;

        const pdfText = await parsePdfBuffer(req.file.buffer);

        const modelAnswers = await extractModelAnswersFromPdfText(pdfText, questions);

        return res.json({
            success: true,
            modelAnswers,
        });
    } catch (error) {
        return handleGeminiError(error, res, '[extract-model-answers-pdf]');
    }
});

module.exports = router;
