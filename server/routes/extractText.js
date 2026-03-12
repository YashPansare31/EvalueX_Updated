const express = require('express');
const router = express.Router();
const { extractTextFromImage } = require('../services/geminiService');

// POST /api/extract-text
// Accepts: { image: base64string, mimeType?: string }
// Returns: { text: string }
router.post('/', async (req, res) => {
  try {
    const { image, mimeType = 'image/jpeg' } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Missing required field: image (base64 string)' });
    }

    const text = await extractTextFromImage(image, mimeType);
    return res.json({ text });
  } catch (err) {
    console.error('[extract-text] Error:', err.message);
    return res.status(500).json({ error: 'OCR extraction failed', details: err.message });
  }
});

module.exports = router;
