const express = require('express');
const router = express.Router();
const { extractTextFromImage } = require('../services/geminiService');

function sanitizeText(text) {
  if (!text) return text;
  // Regex to match the college header across line breaks and variations
  const regex = /AISSMS\s+INSTITUTE\s+OF[\s\S]*?(Approved\s+by\s+AICTE,\s*New\s+Delhi\s+and\s+Recognised\s+by\s+Govt\.\s+of\s+Maharashtra)?[\s\S]*?(Accredited\s+by\s+NAAC\s+with\s+"A\+"\s+Grade\s*\|\s*NBA-S\s+UG\s+Programmes)?[\s\S]*?Pune\s+University\s*\d*/gi;
  return text.replace(regex, '').trim();
}

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

    let text = await extractTextFromImage(base64Data, mimeType);
    text = sanitizeText(text);
    return res.json({ text, extractedText: text });
  } catch (err) {
    console.error('[extract-text] Error:', err.message);
    return res.status(500).json({ error: 'OCR extraction failed', details: err.message });
  }
});

module.exports = router;
