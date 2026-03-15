/**
* API Client for EvalueX Backend Server
* Replaces supabase.functions.invoke() calls
*/

import { supabase } from './supabase/client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Get current user's auth token
 */
async function getAuthToken() {
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session?.access_token) {
    throw new Error('Not authenticated');
  }
  return session.session.access_token;
}

/**
 * Extract text from image/PDF using OCR
 */
export async function extractTextFromImage(
  imageBase64: string,
  mimeType: string,
  fileName: string
) {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/api/extract-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      imageBase64,
      mimeType,
      fileName,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Grade a student submission
 */
export async function gradeSubmission(
  submissionId: string,
  content: string,
  assignmentTitle: string,
  assignmentDescription: string | null,
  maxScore: number,
  assignmentId: string
) {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/api/grade-submission`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      submissionId,
      content,
      assignmentTitle,
      assignmentDescription,
      maxScore,
      assignmentId,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Health check
 */
export async function healthCheck() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function parseQuestionPaper(
  assignmentId: string,
  images: string[],
  mimeType: string = 'image/jpeg'
) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/parse-question-paper`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ assignmentId, images, mimeType }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  return response.json();
}

export async function parseModelAnswers(
  assignmentId: string,
  images: string[],
  mimeType: string = 'image/jpeg'
) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/parse-model-answers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ assignmentId, images, mimeType }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  return response.json();
}

export async function extractAnswers(
  submissionId: string,
  assignmentId: string,
  pages: string[],
  mimeType: string = 'image/jpeg'
) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/extract-answers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ submissionId, assignmentId, pages, mimeType }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  return response.json();
}

export async function regradeSingleQuestion(
  submissionId: string,
  questionId: string,
  assignmentId: string
) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/grade-question`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ submissionId, questionId, assignmentId }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  return response.json();
}

export async function aggregateScores(
  submissionId: string,
  assignmentId: string
) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/aggregate-scores`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ submissionId, assignmentId }),
  });
  if (!response.ok) throw new Error((await response.json()).error);
  return response.json();
}

export async function fetchAggregateScores(
  submissionId: string
) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/aggregate-scores/${submissionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) throw new Error((await response.json()).error);
  return response.json();
}
