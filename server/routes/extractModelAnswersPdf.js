const express = require('express');
const router = express.Router();
const multer = require('multer');
const { extractModelAnswersFromPdfText } = require('../services/geminiService');
const pdf = require('pdf-parse');

const upload = multer({ storage: multer.memoryStorage() });

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

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
        }

        // Parse the PDF using standard pdf-parse
        let pdfText = '';
        try {
            const pdfData = await pdf(req.file.buffer);
            pdfText = pdfData.text;
        } catch (pdfErr) {
            console.error('PDF parsing error:', pdfErr);
            return res.status(400).json({ error: 'Failed to parse PDF content. Ensure it is a valid PDF.' });
        }

        if (!pdfText.trim()) {
            return res.status(400).json({ error: 'Appears to be an empty or unreadable PDF' });
        }

        const modelAnswers = await extractModelAnswersFromPdfText(pdfText, questions);

        return res.json({
            success: true,
            modelAnswers,
        });
    } catch (error) {
        console.error('[extract-model-answers-pdf] Error:', error.message);

        if (error.message?.includes('API key')) {
            return res.status(500).json({ error: 'Invalid Gemini API key' });
        }
        if (error.message?.includes('rate')) {
            return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
        }

        return res.status(500).json({
            error: error.message || 'Unknown PDF extraction error',
        });
    }
});

module.exports = router;
