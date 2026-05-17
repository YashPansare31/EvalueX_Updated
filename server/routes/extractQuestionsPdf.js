const express = require('express');
const router = express.Router();
const { extractQuestionsFromPdfText, parseQuestionPaperStructure } = require('../services/geminiService');
const { upload } = require('../utils/multerUpload');
const { parsePdfBuffer } = require('../utils/pdfParser');
const { handleGeminiError, requireGeminiKey } = require('../utils/geminiErrors');

// POST /api/extract-questions-pdf
// BACKWARD COMPATIBLE — preserves existing frontend contract in UploadExam.tsx
// Accepts: multipart/form-data with 'file' field (PDF)
// Returns: { success: true, questions: [...] }
//
// Two-path extraction:
//   Path A — Text-based PDF: pdf-parse extracts text → Gemini reads text
//   Path B — Scanned/image-based PDF: text extraction returns empty →
//             send raw PDF bytes to Gemini Vision (application/pdf inline data)
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        if (requireGeminiKey(res)) return;

        let questionsArray = [];

        // ── Path A: try text extraction first ──────────────────────────────
        let pdfText = null;
        try {
            pdfText = await parsePdfBuffer(req.file.buffer);
        } catch (textErr) {
            // Only swallow the "empty/unreadable" error — rethrow anything else
            if (!textErr.message?.includes('empty or unreadable')) throw textErr;
            console.log('[extract-questions-pdf] Text extraction returned empty — falling back to Gemini Vision (scanned PDF)');
        }

        if (pdfText) {
            // Text-based PDF: ask Gemini to parse the extracted text
            questionsArray = await extractQuestionsFromPdfText(pdfText);
        } else {
            // ── Path B: scanned/image-based PDF — send raw bytes to Gemini Vision ──
            // Gemini 2.5-flash accepts application/pdf as inline data and can OCR
            // scanned pages, making pdf-parse irrelevant for image-only PDFs.
            const base64Pdf = req.file.buffer.toString('base64');
            const parsed = await parseQuestionPaperStructure([base64Pdf], 'application/pdf');

            // Map parseQuestionPaperStructure's shape → extractQuestionsPdf shape
            questionsArray = (parsed.questions || []).map(q => ({
                question_label: q.question_label || null,
                text: q.question_text || '',
                points: q.marks ?? q.total_marks ?? 10,
            }));
        }

        // Strip any stray modelAnswer field that may come through
        questionsArray = questionsArray.map(({ modelAnswer, ...rest }) => rest);

        return res.json({
            success: true,
            questions: questionsArray,
        });
    } catch (error) {
        return handleGeminiError(error, res, '[extract-questions-pdf]');
    }
});

module.exports = router;
