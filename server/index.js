import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY not configured');
}
if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY not configured');
}

// Initialize Supabase admin client (for DB operations)
let supabaseAdmin = null;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next();
});

// Middleware to verify Bearer token from frontend
function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
  }
  // Store token for potential future use (e.g., DB operations)
  req.token = authHeader.replace('Bearer ', '');
  next();
}

// ============================================================================
// POST /api/extract-text
// Extract text from image/PDF using Gemini Vision
// ============================================================================
app.post('/api/extract-text', verifyAuth, async (req, res) => {
  try {
    const { imageBase64, mimeType, fileName } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const contentType = mimeType || 'image/jpeg';
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const ocrPrompt = `You are an expert OCR system. Extract ALL text from this image/document exactly as written, maintaining the original structure and formatting as much as possible.

Instructions:
1. Extract every piece of text visible in the image
2. Preserve paragraph breaks and list formatting
3. If there are handwritten answers, transcribe them accurately
4. If text is unclear, use [unclear] to mark it
5. Maintain question numbers if visible
6. Do not add any commentary or analysis - just extract the text

If this appears to be a student's answer sheet or exam, extract all answers as written by the student.

Begin extraction now:`;

    // Send image as base64 to Gemini
    const response = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: contentType,
        },
      },
      ocrPrompt,
    ]);

    const extractedText = response.response.text();

    return res.json({
      success: true,
      extractedText,
      fileName,
      charCount: extractedText.length,
    });
  } catch (error) {
    console.error('OCR error:', error.message);

    // Handle common Gemini API errors
    if (error.message?.includes('API key')) {
      return res.status(500).json({ error: 'Invalid Gemini API key' });
    }
    if (error.message?.includes('rate')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    return res.status(500).json({
      error: error.message || 'Unknown OCR error',
    });
  }
});

// ============================================================================
// POST /api/grade-submission
// Grade student submission using Gemini
// ============================================================================
app.post('/api/grade-submission', verifyAuth, async (req, res) => {
  try {
    const { submissionId, content, assignmentTitle, assignmentDescription, maxScore, assignmentId } = req.body;

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // TODO: In production, fetch these from Supabase using the service key
    // For now, gracefully handle optional questions/rubrics
    const hasQuestions = false;
    const hasRubric = false;

    const systemPrompt = `You are an experienced educator and grading assistant. Your task is to evaluate student submissions and provide constructive feedback.

When grading, consider:
1. Understanding of the topic
2. Quality of arguments/explanations
3. Organization and structure
4. Grammar and clarity
5. Creativity and critical thinking

Provide specific, actionable feedback that helps students improve. Be encouraging while being honest about areas for improvement.`;

    const userPrompt = `Please grade the following student submission:

Assignment: ${assignmentTitle}
${assignmentDescription ? `Description: ${assignmentDescription}` : ''}
Maximum Score: ${maxScore} points

Student's Submission:
---
${content}
---

Please provide:
1. A suggested score out of ${maxScore}
2. Detailed feedback explaining the score
3. Specific suggestions for improvement

IMPORTANT: Format your response as PLAIN TEXT only. Do NOT use any markdown formatting like **, ##, ###, bullet points with *, etc. Use simple dashes (-) for lists and write headings as regular text followed by a colon.

Format your response as:
SCORE: [number]

FEEDBACK:
[Your detailed feedback here in plain text format]`;

    const response = await model.generateContent([
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'user', parts: [{ text: userPrompt }] },
    ]);

    const aiResponse = response.response.text();

    // Parse score from response
    const scoreMatch = aiResponse.match(/SCORE:\s*(\d+)/i);
    const aiScore = scoreMatch ? Math.min(parseInt(scoreMatch[1]), maxScore) : Math.round(maxScore * 0.75);

    // Extract feedback
    const feedbackMatch = aiResponse.match(/FEEDBACK:\s*([\s\S]*)/i);
    const aiFeedback = feedbackMatch ? feedbackMatch[1].trim() : aiResponse;

    // Save to Supabase if configured
    if (supabaseAdmin) {
      const { error: updateError } = await supabaseAdmin
        .from('submissions')
        .update({
          ai_score: aiScore,
          ai_feedback: aiFeedback,
        })
        .eq('id', submissionId);

      if (updateError) {
        console.error('Failed to save grades to Supabase:', updateError.message);
        // Don't fail the request - grades are still computed
      }
    }

    return res.json({
      success: true,
      ai_score: aiScore,
      ai_feedback: aiFeedback,
    });
  } catch (error) {
    console.error('Grading error:', error.message);

    if (error.message?.includes('API key')) {
      return res.status(500).json({ error: 'Invalid Gemini API key' });
    }
    if (error.message?.includes('rate')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    return res.status(500).json({
      error: error.message || 'Unknown grading error',
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root path handler (so you don't get "Cannot GET /" in the browser)
app.get('/', (req, res) => {
  res.send('<h1>EvalueX Backend Server is Running 🚀</h1><p>API endpoints are available at /api/...</p><a href="/api/health">Check Health</a>');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 EvalueX backend server running on http://localhost:${PORT}`);
  console.log(`   API: POST /api/extract-text`);
  console.log(`   API: POST /api/grade-submission`);
  console.log(`   Health: GET /api/health`);
});
