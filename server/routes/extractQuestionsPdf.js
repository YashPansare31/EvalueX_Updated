const express = require('express');
const router = express.Router();
const multer = require('multer');
const { extractQuestionsFromPdfText } = require('../services/geminiService');

const upload = multer({ storage: multer.memoryStorage() });

const { PDFParse } = require('pdf-parse');

// POST /api/extract-questions-pdf
// BACKWARD COMPATIBLE — preserves existing frontend contract in UploadExam.tsx
// Accepts: multipart/form-data with 'file' field (PDF)
// Returns: { success: true, questions: [...] }
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
        }

        // Parse the PDF
        let pdfText = '';
        const parser = new PDFParse({ data: req.file.buffer });
        try {
            const pdfData = await parser.getText();
            pdfText = pdfData.text;
        } finally {
            await parser.destroy();
        }

        if (!pdfText.trim()) {
            return res.status(400).json({ error: 'Appears to be an empty or unreadable PDF' });
        }

        const questionsArray = await extractQuestionsFromPdfText(pdfText);

        return res.json({
            success: true,
            questions: questionsArray,
        });
    } catch (error) {
        console.error('[extract-questions-pdf] Error:', error.message);

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
