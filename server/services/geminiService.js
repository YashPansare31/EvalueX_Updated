const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function stripBase64Prefix(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/^data:image\/\w+;base64,/, '');
}

async function callGeminiWithRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.message.includes('429') && attempt < maxRetries) {
        const waitTime = attempt * 12000; // 12s, 24s, 36s
        console.log(`Rate limited, waiting ${waitTime / 1000}s before retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        throw err;
      }
    }
  }
}

/**
 * Extract structured question paper schema from image(s).
 * Returns parsed JSON with full question tree.
 * @param {string[]} base64Images - Array of base64 image strings (all pages of question paper)
 * @param {string} mimeType - e.g. "image/jpeg" or "image/png"
 */
async function parseQuestionPaperStructure(base64Images, mimeType = 'image/jpeg') {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.0,
      responseMimeType: 'application/json',
    },
  });

  const imageParts = base64Images.map(b64 => ({
    inlineData: { data: stripBase64Prefix(b64), mimeType },
  }));

  const prompt = `You are an academic document parser. Analyze this exam question paper and extract its COMPLETE structure as JSON.

RULES:
- Extract every question, sub-question, and their exact marks allocation
- Identify optional question groups (e.g. "Answer Q1 OR Q2" means optional_group = "OPT_A")
- Assign the SAME optional_group string to both questions in an optional pair
- Preserve the exact question text including any formulas or special notation
- question_label must be human-readable: "Q1", "Q1a", "Q1b", "Q2", "Q2a", etc.

Return ONLY this JSON structure, no explanation:
{
  "total_marks": <number>,
  "instructions": "<any general exam instructions>",
  "questions": [
    {
      "question_label": "Q1",
      "question_text": "<full text of the question>",
      "total_marks": <number>,
      "optional_group": null,
      "sub_questions": [
        {
          "question_label": "Q1a",
          "question_text": "<sub-question text>",
          "marks": <number>,
          "optional_group": null
        }
      ]
    }
  ]
}`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini did not return valid JSON for question paper structure');
  }
}

/**
 * Pass 2A: Layout analysis — which pages contain answers to which questions.
 * @param {string[]} base64Pages - All pages of the student answer sheet
 * @param {Array} questions - The structured question list from parseQuestionPaperStructure
 * @param {string} mimeType
 */
async function detectAnswerLayout(base64Pages, questions, mimeType = 'image/jpeg') {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const imageParts = base64Pages.flatMap((b64, idx) => [
    { text: `[PAGE ${idx + 1}]` },
    { inlineData: { data: stripBase64Prefix(b64), mimeType } }
  ]);

  const flatQuestions = flattenQuestions(questions);
  const questionList = flatQuestions
    .map(q => `- ${q.question_label}: "${q.question_text.substring(0, 250)}"`)
    .join('\n');

  const prompt = `You are analyzing a university student's handwritten exam answer sheet.

The exam has these questions:
${questionList}

Examine ALL pages carefully. For EACH question listed above, identify:
1. Which page numbers contain the student's answer (an answer may span multiple pages)
2. The approximate region on each page (top_third / middle_third / bottom_third / full_page / top_half / bottom_half)
3. Whether the student attempted this question
4. IMPORTANT: If the student wrote answers for BOTH questions in an optional pair (e.g., both Q1 and Q2 when only one is required), set optional_also_attempted = true for BOTH

CRITICAL — DEFAULT TO ATTEMPTED:
If there is ANY written content on the pages that could plausibly be for a question, mark attempted = true.
Only mark attempted = false if the pages are completely blank for that question or if the student explicitly wrote "Not attempted" or left a clearly empty section.
When in doubt, mark attempted = true — it is better to extract an empty answer than to miss a real one.

CRITICAL — PARTIAL LABEL HANDLING:
Students often use shorthand when writing multi-part answers. For example, for Q1 which has parts A and B:
- They may write "Q.1 A" or "Q1 a)" for the first part
- Then ONLY write "B" or "b)" (WITHOUT repeating "Q.1") immediately after for the second part
- A standalone letter label like "B", "b)", "b." following a Q1 answer block almost certainly means "Q1 B" (the next sub-part of the same question)
- Similarly, roman numerals (i, ii, iii) appearing after a sub-question heading belong to that sub-question
- A student writing "Q1" may be answering what the exam calls Q1a and Q1b — assign those pages to BOTH sub-parts
Always try to match orphan letter/numeral labels to the most recently headed parent question.

IMPORTANT: Your answer_map MUST contain an entry for EVERY question in the list above, even if attempted = false.

Return ONLY this JSON structure:
{
  "total_pages_analyzed": <number>,
  "answer_map": [
    {
      "question_label": "Q1a",
      "attempted": true,
      "optional_also_attempted": false,
      "page_refs": [
        { "page": 1, "region": "top_half" },
        { "page": 2, "region": "top_third" }
      ]
    }
  ]
}`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini did not return valid JSON for answer layout detection');
  }
}

/**
 * Pass 2B: Extract text for a SINGLE question using only the relevant page images.
 * @param {string[]} relevantPageImages - Only the pages that contain this answer
 * @param {string} questionText - The question being answered (for semantic context)
 * @param {string} questionLabel - e.g. "Q1a"
 * @param {string} mimeType
 */
async function extractSingleAnswerText(relevantPageImages, questionText, questionLabel, mimeType = 'image/jpeg') {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.1 },
  });

  const imageParts = relevantPageImages.map(b64 => ({
    inlineData: { data: stripBase64Prefix(b64), mimeType },
  }));

  const prompt = `You are extracting a student's handwritten exam answer from scanned images.

THE QUESTION BEING ANSWERED (${questionLabel}):
"${questionText}"

INSTRUCTIONS:
- Extract ONLY the text that is the student's answer to the above question
- If the answer spans across multiple pages, stitch it together in reading order
- Preserve mathematical notation, numbered points, and paragraph breaks
- Mark any completely illegible word as [ILLEGIBLE]
- If no answer is found for this question in these images, return exactly: [NO ANSWER FOUND]
- Do NOT include text that belongs to other questions
- Do NOT include the question text itself, only the student's answer

CRITICAL — PARTIAL / SHORTHAND LABEL HANDLING:
Students frequently use shorthand when writing multi-part answers. Examples:
  • For Q1 with parts A and B: they write "Q.1 A" (or "Q1 a)") for part A, then ONLY "B" or "b)" for part B without re-writing "Q.1"
  • A bare letter label (A, B, C or a, b, c) or roman numeral (i, ii, iii) that appears right after the previous sub-part is a continuation — treat it as the next sub-part of the same parent question
  • If ${questionLabel} ends with a letter (e.g. Q1b), also look for content introduced by just "b", "b)", "b." or "B" after the "Q1 a" section on the same page(s)
Do not skip answer content simply because the student omitted the full question number prefix.

Return the extracted answer text directly, no JSON wrapper, no explanation.`;

  const result = await callGeminiWithRetry(() => model.generateContent([prompt, ...imageParts]));
  return result.response.text().trim();
}

/**
 * Simple single-image OCR for backward compatibility with /api/extract-text
 * @param {string} base64Image
 * @param {string} mimeType
 */
async function extractTextFromImage(base64Image, mimeType = 'image/jpeg') {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.0 },
  });

  const prompt = `Extract ALL text from this image exactly as written. Preserve paragraph breaks and line structure. Transcribe handwritten text accurately. Return only the extracted text, no commentary.`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: stripBase64Prefix(base64Image), mimeType } },
  ]);

  return result.response.text();
}

// Helper: flatten nested question tree into a flat array.
// Includes BOTH parent questions AND their sub-questions so that
// a student writing "Q1" (without A/B suffix) is still matched.
function flattenQuestions(questions) {
  const flat = [];
  for (const q of questions) {
    if (!q.sub_questions || q.sub_questions.length === 0) {
      flat.push(q);
    } else {
      // Include the parent question itself so layout AI can match it
      flat.push(q);
      for (const sq of q.sub_questions) {
        flat.push(sq);
      }
    }
  }
  return flat;
}

async function extractQuestionsFromPdfText(pdfText) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const prompt = `You are an academic document parser. Extract all questions from the following exam paper text.

RULES:
- Extract every question along with its points/marks.
- Return ONLY JSON matching this exact structure:
[
  {
    "text": "<full text of the question>",
    "points": <number>
  }
]

EXAM TEXT:
${pdfText}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini did not return valid JSON array for pdf questions');
  }
}

async function extractModelAnswersFromPdfText(pdfText, questions) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const questionList = questions.map(q => `- ${q.text}`).join('\n');

  const prompt = `You are an academic document parser. Extract model answers for the following exam questions from the provided model answer sheet text.

QUESTIONS:
${questionList}

RULES:
- Map each question to its corresponding model answer found in the text.
- If an exact answer is not found, leave that model answer blank.
- Return ONLY JSON matching this exact structure:
[
  {
    "question_text": "<text of the question>",
    "model_answer": "<extracted model answer>"
  }
]

MODEL ANSWER SHEET TEXT:
${pdfText}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini did not return valid JSON array for model answers');
  }
}

module.exports = {
  parseQuestionPaperStructure,
  detectAnswerLayout,
  extractSingleAnswerText,
  extractTextFromImage,
  flattenQuestions,
  extractQuestionsFromPdfText,
  extractModelAnswersFromPdfText,
};
