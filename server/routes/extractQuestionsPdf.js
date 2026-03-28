const express = require('express');
const router = express.Router();
const { extractQuestionsFromPdfText } = require('../services/geminiService');
const { upload } = require('../utils/multerUpload');
const { parsePdfBuffer } = require('../utils/pdfParser');
const { handleGeminiError, requireGeminiKey } = require('../utils/geminiErrors');

// POST /api/extract-questions-pdf
// BACKWARD COMPATIBLE — preserves existing frontend contract in UploadExam.tsx
// Accepts: multipart/form-data with 'file' field (PDF)
// Returns: { success: true, questions: [...] }
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        if (requireGeminiKey(res)) return;

        const pdfText = await parsePdfBuffer(req.file.buffer);

        let questionsArray = await extractQuestionsFromPdfText(pdfText);

        // Remove modelAnswer from the extracted questions as per user request
        questionsArray = questionsArray.map(q => {
            const { modelAnswer, ...rest } = q;
            return rest;
        });

        return res.json({
            success: true,
            questions: questionsArray,
        });
    } catch (error) {
        return handleGeminiError(error, res, '[extract-questions-pdf]');
    }
});

module.exports = router;
