const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');

/**
 * POST /api/upload-feedback-pdf
 * Body: { submissionId: string, pdfBase64: string }
 * 
 * Accepts a base64-encoded PDF blob from the client, uploads it to Supabase Storage
 * using the SERVICE ROLE key (bypassing any RLS issues), stores the public URL back
 * to submissions.feedback_pdf_url, and returns the URL.
 * 
 * This approach is more reliable than client-side uploads, which require precise
 * Storage RLS policies to be set up on the Supabase Dashboard.
 */
router.post('/', async (req, res) => {
  const { submissionId, pdfBase64 } = req.body;

  if (!submissionId || !pdfBase64) {
    return res.status(400).json({ error: 'Missing submissionId or pdfBase64' });
  }

  try {
    // Decode base64 PDF back to binary buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    const filePath = `${submissionId}/feedback.pdf`;

    // Upload using service-role client (bypasses Storage RLS)
    const { error: uploadError } = await supabase.storage
      .from('feedback-reports')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[upload-feedback-pdf] Storage upload error:', uploadError.message);
      return res.status(500).json({ error: `Storage upload failed: ${uploadError.message}` });
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('feedback-reports')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Store the URL in submissions table
    const { error: dbError } = await supabase
      .from('submissions')
      .update({ feedback_pdf_url: publicUrl })
      .eq('id', submissionId);

    if (dbError) {
      console.error('[upload-feedback-pdf] DB update error:', dbError.message);
      return res.status(500).json({ error: `Failed to store PDF URL: ${dbError.message}` });
    }

    console.log(`[upload-feedback-pdf] ✅ Uploaded feedback PDF for submission ${submissionId}`);
    return res.json({ url: publicUrl });

  } catch (err) {
    console.error('[upload-feedback-pdf] Fatal error:', err.message);
    return res.status(500).json({ error: 'PDF upload failed', details: err.message });
  }
});

module.exports = router;
