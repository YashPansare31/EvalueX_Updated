const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Grade a single question using GPT-4o with rubric-guided reasoning.
 * All context is scoped to THIS question only.
 *
 * @param {object} params
 * @param {string} params.questionLabel        - e.g. "Q1a"
 * @param {string} params.questionText         - Full question text
 * @param {number} params.maxMarks             - Total marks for this question
 * @param {string} params.studentAnswer        - Extracted student answer text
 * @param {string} [params.modelAnswer]        - Model answer (reference only)
 * @param {string} [params.rubricCriteria]     - Rubric for this question only
 * @param {string} [params.assignmentContext]  - Subject/course name for context
 */
async function gradeQuestion({
  questionLabel,
  questionText,
  maxMarks,
  studentAnswer,
  rubricCriteria = null,
  assignmentContext = '',
}) {
  const systemPrompt = `You are an experienced university examiner grading a student's answer.

CRITICAL RULES:
1. Award marks based on conceptual understanding, NOT word-for-word similarity to the model answer
2. A student using different but correct terminology deserves full credit
3. Apply partial marks where the rubric permits — do not give 0 if the student showed partial understanding
4. If the student answer is [NO ANSWER FOUND] or blank, award 0 with feedback "No answer provided"
5. Be specific in your feedback — mention what was correct, what was missing, and what would earn more marks. 
6. If an answer is somewhat related you can award some marks but be clear in feedback about what was correct and what was missing. Do NOT give full marks for an answer that is only partially correct or off-topic.
7. You MUST return valid JSON only, no extra text outside the JSON block`;

  let userMessage = `QUESTION (${questionLabel}):
${questionText}

MAXIMUM MARKS: ${maxMarks}
${assignmentContext ? `SUBJECT/COURSE: ${assignmentContext}` : ''}`;

  if (rubricCriteria) {
    userMessage += `\n\nGRADING RUBRIC (apply these criteria strictly):
${rubricCriteria}`;
  }



  userMessage += `\n\nSTUDENT'S ANSWER:
${studentAnswer || '[NO ANSWER FOUND]'}

Respond with ONLY this JSON (no markdown, no code blocks, raw JSON only):
{
  "score": <number between 0 and ${maxMarks}, can be decimal like 3.5>,
  "max_score": ${maxMarks},
  "confidence": "<high|medium|low>",
  "feedback": "<specific constructive feedback string, 2-4 sentences>",
  "rubric_breakdown": [
    { "criterion": "<criterion name or description>", "awarded": <number>, "max": <number> }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const raw = response.choices[0].message.content;

  try {
    const parsed = JSON.parse(raw);
    // Clamp score to valid range
    parsed.score = Math.max(0, Math.min(maxMarks, parseFloat(parsed.score) || 0));
    parsed.max_score = maxMarks;
    return parsed;
  } catch {
    throw new Error(`GPT-4o returned invalid JSON for ${questionLabel}: ${raw.substring(0, 200)}`);
  }
}

/**
 * Grade entire submission holistically (fallback / backward compat).
 * Used by the legacy /api/grade-submission endpoint.
 */
async function gradeSubmissionHolistic({
  assignmentTitle,
  assignmentDescription,
  maxScore,
  studentText,
  questions = [],
  rubrics = [],
}) {
  const systemPrompt = `You are an experienced university examiner. Grade the student's submission fairly and thoroughly.`;

  let context = `ASSIGNMENT: ${assignmentTitle}
${assignmentDescription ? `DESCRIPTION: ${assignmentDescription}` : ''}
MAXIMUM SCORE: ${maxScore}`;

  if (questions.length > 0) {
    context += `\n\nEXAM QUESTIONS:\n`;
    questions.forEach((q, i) => {
      context += `${q.question_label || `Q${i + 1}`} [${q.points} marks]: ${q.question_text}\n`;
    });
  }

  if (rubrics.length > 0) {
    context += `\n\nGRADING RUBRIC:\n`;
    rubrics.forEach(r => { context += `- ${r.rubric_content}\n`; });
  }

  context += `\n\nSTUDENT SUBMISSION:\n${studentText}

Respond with ONLY this JSON:
{
  "score": <number>,
  "feedback": "<detailed feedback string>"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: context },
    ],
  });

  const parsed = JSON.parse(response.choices[0].message.content);
  parsed.score = Math.max(0, Math.min(maxScore, parseFloat(parsed.score) || 0));
  return parsed;
}

module.exports = { gradeQuestion, gradeSubmissionHolistic };
