require('dotenv').config();
const express = require('express');
const cors = require('cors');

// ── Validate required env vars on startup ─────────────────────────────────
const REQUIRED_ENV = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error('[STARTUP ERROR] Missing required environment variables:', missing.join(', '));
  console.error('Create server/.env with all required keys. See README.');
  process.exit(1);
}

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080', process.env.FRONTEND_URL].filter(Boolean) }));
app.use(express.json({ limit: '50mb' }));    // Large limit for base64 image uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Request logger ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────

// BACKWARD COMPATIBLE (existing frontend calls these)
app.use('/api/extract-text',       require('./routes/extractText'));
app.use('/api/grade-submission',   require('./routes/gradeSubmission'));

// NEW QCP ENDPOINTS
app.use('/api/parse-question-paper', require('./routes/parseQuestionPaper'));
app.use('/api/parse-model-answers',  require('./routes/parseModelAnswers'));
app.use('/api/extract-questions-pdf', require('./routes/extractQuestionsPdf'));
app.use('/api/extract-model-answers-pdf', require('./routes/extractModelAnswersPdf'));
app.use('/api/parse-rubric-pdf',     require('./routes/parseRubricPdf'));
app.use('/api/extract-answers',      require('./routes/extractAnswers'));
app.use('/api/grade-question',       require('./routes/gradeQuestion'));
app.use('/api/aggregate-scores',     require('./routes/aggregateScores'));
app.use('/api/upload-feedback-pdf',  require('./routes/uploadFeedbackPdf'));

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      gemini:   !!process.env.GEMINI_API_KEY,
      openai:   !!process.env.OPENAI_API_KEY,
      supabase: !!process.env.SUPABASE_URL,
    },
  });
});

// ── Global error handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// ── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n✅ EvalueX backend running on http://localhost:${PORT}`);
  console.log('   Endpoints:');
  console.log('   POST /api/extract-text          (OCR — backward compat)');
  console.log('   POST /api/grade-submission       (Grading — upgraded to QCP)');
  console.log('   POST /api/parse-question-paper   (NEW: structure exam paper)');
  console.log('   POST /api/extract-answers        (NEW: 2-pass answer mapping)');
  console.log('   POST /api/grade-question         (NEW: single question re-grade)');
  console.log('   POST /api/aggregate-scores       (NEW: compute final score)');
  console.log('   GET  /api/aggregate-scores/:id   (NEW: fetch grade breakdown)');
  console.log('   GET  /api/health');
  console.log('\n   NOTE: Feedback PDFs are generated client-side and stored in Supabase Storage (feedback-reports bucket)\n');
});
