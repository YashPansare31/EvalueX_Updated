const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

const pdf = require('pdf-parse');

// POST /api/parse-rubric-pdf
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

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

        return res.json({
            success: true,
            extractedText: pdfText.trim(),
        });
    } catch (error) {
        console.error('[parse-rubric-pdf] Error:', error.message);
        return res.status(500).json({
            error: error.message || 'Unknown PDF extraction error',
        });
    }
});

module.exports = router;
