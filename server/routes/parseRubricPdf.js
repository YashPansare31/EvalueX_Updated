const express = require('express');
const router = express.Router();
const { upload } = require('../utils/multerUpload');
const { parsePdfBuffer } = require('../utils/pdfParser');

// POST /api/parse-rubric-pdf
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const pdfText = await parsePdfBuffer(req.file.buffer);

        return res.json({
            success: true,
            extractedText: pdfText.trim(),
        });
    } catch (error) {
        console.error('[parse-rubric-pdf] Error:', error.message);
        return res.status(error.statusCode || 500).json({
            error: error.message || 'Unknown PDF extraction error',
        });
    }
});

module.exports = router;
