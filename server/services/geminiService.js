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
      const isRetryable = err.message.includes('429') || 
                          err.message.includes('fetch failed') || 
                          err.message.includes('503') || 
                          err.message.includes('500') ||
                          err.message.includes('502') ||
                          err.message.includes('ECONNRESET');

      if (isRetryable && attempt < maxRetries) {
        const waitTime = attempt * 8000; // 8s, 16s...
        console.log(`[Gemini API] Transient error (${err.message}). Waiting ${waitTime / 1000}s before retry ${attempt}/${maxRetries}`);
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

  const prompt = `You are an academic document parser. Analyze this exam question paper and extract a FLAT list of every gradeable question/sub-question as JSON.

RULES:
- Return each gradeable item (sub-question or standalone question) as a separate entry in the flat "questions" array
- Copy the question_label EXACTLY as printed on the paper — preserve dots, spaces, and capitalisation
  Examples: if the paper says "Q.1 A" use "Q.1 A", if it says "Q1(a)" use "Q1(a)", if it says "1a" use "1a"
  DO NOT normalise or reformat: never convert "Q.1 A" to "Q1a" or vice versa
- If Q.1 has parts A and B, return TWO separate entries: one with label "Q.1 A" and one with "Q.1 B"
  (NOT a parent Q.1 entry with nested sub_questions)
- Identify optional question groups (e.g. "Answer Q.7 OR Q.8" → optional_group = "OPT_G")
- Assign the SAME optional_group string to both questions in an optional pair
- Preserve the exact question text including any formulas or special notation
- Each entry has its own marks value (the marks for that specific part)

Return ONLY this JSON structure, no explanation:
{
  "total_marks": <number>,
  "instructions": "<any general exam instructions>",
  "questions": [
    {
      "question_label": "Q.1 A",
      "question_text": "<full text of this sub-question or question>",
      "marks": <number>,
      "optional_group": null
    }
  ]
}`;

  const result = await callGeminiWithRetry(() => model.generateContent([prompt, ...imageParts]));
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

  const questionList = questions
    .map(q => `- ${q.question_label}: "${q.question_text.substring(0, 250)}"`)
    .join('\n');

  const prompt = `You are analyzing a university student's handwritten exam answer sheet.

The exam has these questions (these are the CANONICAL labels — use them EXACTLY in your output):
${questionList}

Examine ALL pages carefully. For EACH question listed above, identify:
1. Which page numbers contain the student's answer (an answer may span multiple pages)
2. The approximate region on each page (top_third / middle_third / bottom_third / full_page / top_half / bottom_half)
3. Whether the student attempted this question
4. IMPORTANT: If the student wrote answers for BOTH questions in an optional pair, set optional_also_attempted = true for BOTH

CRITICAL — DEFAULT TO ATTEMPTED:
If there is ANY written content on the pages that could plausibly be for a question, mark attempted = true.
Only mark attempted = false if the section is completely blank or the student explicitly wrote "Not attempted".
When in doubt, mark attempted = true.

CRITICAL — LABEL MATCHING AND CONTINUATION:
Students write labels in many ways. Your job is to match what the student wrote to the canonical label from the list above.

Step 1 — Direct match (ignore dots, spaces, capitalisation, brackets):
  Student writes    →  Canonical label (from the list)
  "Q.1 A"           →  whatever the list has for Q1 part A  (e.g. "Q.1 A")
  "Q1 A", "Q1a"     →  same
  "Q.2 B"           →  whatever the list has for Q2 part B  (e.g. "Q.2 B")

Step 2 — Bare-letter continuation (VERY COMMON):
  A student often writes the full label for the FIRST part and then writes ONLY the letter for subsequent parts on the same or next page.
  Example: student writes "Q.1 A" then later writes just "B" or "(b)" or "Ans B" — this means Q.1 B.
  Rule: if you see a lone letter (A, B, C, ...) with no question number, inherit the last seen question number to form the full label, then match that to the canonical list.

Step 3 — Output rule:
  ALWAYS use the EXACT canonical label from the question list in your JSON output.
  NEVER output the student's written version. If the list has "Q.1 B" and the student wrote "B", output "Q.1 B".

Roman numerals (i, ii, iii) within an answer block are part of that answer, not separate questions.

IMPORTANT: Your answer_map MUST contain an entry for EVERY question in the list above, even if attempted = false.

Return ONLY this JSON structure:
{
  "total_pages_analyzed": <number>,
  "answer_map": [
    {
      "question_label": "Q.1 A",
      "attempted": true,
      "optional_also_attempted": false,
      "page_refs": [
        { "page": 1, "region": "top_half" },
        { "page": 2, "region": "top_third" }
      ]
    }
  ]
}`;

  const result = await callGeminiWithRetry(() => model.generateContent([prompt, ...imageParts]));
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

THE QUESTION BEING ANSWERED: ${questionLabel}
"${questionText}"

INSTRUCTIONS:
- Extract ONLY the text that is the student's answer to the above question
- If the answer spans across multiple pages, stitch it together in reading order
- Preserve mathematical notation, numbered points, and paragraph breaks
- Mark any completely illegible word as [ILLEGIBLE]
- If no answer is found for this question in these images, return exactly: [NO ANSWER FOUND]
- Do NOT include text that belongs to other questions
- Do NOT include the question text itself, only the student's answer

HOW TO FIND THIS ANSWER ON THE PAGE:
The question label is "${questionLabel}". Look for these written by the student:
  • The full label exactly: "${questionLabel}"
  • Variants ignoring dots/spaces: e.g. if label is "Q.1 A" also look for "Q1 A", "Q1a", "Q.1A"
  • BARE LETTER CONTINUATION: if label ends in a letter like "A" or "B", the student may have
    written the parent number earlier on the page and then written ONLY the letter ("B", "b)", "Ans B")
    to start this answer. Treat any such bare letter that follows a previous sub-question as this answer.
  • The answer content begins immediately after the student writes the label (or bare letter)

Return the extracted answer text directly — no JSON, no explanation, just the answer text.`;

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

  const result = await callGeminiWithRetry(() => model.generateContent([
    prompt,
    { inlineData: { data: stripBase64Prefix(base64Image), mimeType } },
  ]));

  return result.response.text();
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
- Extract every gradeable question/sub-question as a separate entry
- Copy question_label EXACTLY as printed (e.g. "Q.1 A", "Q.1 B", "Q.2", "1a") — do NOT reformat or normalise
- If a question has no explicit label, infer one from its position (e.g. "Q.1", "Q.2")
- Return ONLY JSON matching this exact structure:
[
  {
    "question_label": "<exact label as on paper, e.g. Q.1 A>",
    "text": "<full text of the question>",
    "points": <number>
  }
]

EXAM TEXT:
${pdfText}`;

  const result = await callGeminiWithRetry(() => model.generateContent(prompt));
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

  const result = await callGeminiWithRetry(() => model.generateContent(prompt));
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
  extractQuestionsFromPdfText,
  extractModelAnswersFromPdfText,
};
