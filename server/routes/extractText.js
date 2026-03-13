const express = require('express');
const router = express.Router();
const { extractTextFromImage } = require('../services/geminiService');

// POST /api/extract-text
// Accepts: { image: base64string, mimeType?: string }
// Returns: { text: string }
router.post('/', async (req, res) => {
  try {
    const { image, imageBase64, mimeType = 'image/jpeg' } = req.body;
    const base64Data = image || imageBase64;

    if (!base64Data) {
      return res.status(400).json({ error: 'Missing required field: image or imageBase64 (base64 string)' });
    }

    const text = await extractTextFromImage(base64Data, mimeType);
    return res.json({ text, extractedText: text });
  } catch (err) {
    console.error('[extract-text] Error:', err.message);
    return res.status(500).json({ error: 'OCR extraction failed', details: err.message });
  }
});

module.exports = router;
