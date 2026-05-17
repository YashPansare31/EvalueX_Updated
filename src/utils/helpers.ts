/**
 * Shared frontend utilities for EvalueX.
 *
 * Houses small helper functions that were copy-pasted across multiple page components.
 */

/**
 * Strips markdown formatting from AI feedback text for plain-text display.
 * Used in GradingReview.tsx — extracted here so it can be shared if needed elsewhere.
 */
export function formatFeedback(text: string | null | undefined): string {
  if (!text) return 'No feedback available';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, ''))
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/^\s*\d+\.\s+/gm, (match) => match)
    .trim();
}

/**
 * Formats unstructured / OCR-extracted student answer text into a more readable layout.
 * Removes college boilerplate, normalises line-breaks, and indents list items.
 */
export function formatStudentText(text: string | null | undefined): string {
  if (!text) return '';

  // 1. Remove unwanted college boilerplate
  let formatted = text.replace(
    /AISSMS\s+INSTITUTE\s+OF[\s\S]*?Pune\s+University\s*\d*/gi,
    ''
  );

  // 2. Collapse single newlines from OCR bounding boxes; preserve paragraph breaks
  formatted = formatted.replace(/([^\n])\n(?!\n)/g, '$1 ');

  // 3. Force distinct paragraphs for new 'Question N' markers
  formatted = formatted.replace(
    /(Q\.\s*\d+(?:\s*[A-Z])?|Question\s*\d+|Q\s*\d+)/gi,
    '\n\n$1'
  );

  // 4. Indent roman numerals and standard list items
  formatted = formatted.replace(
    /(\s+)([ivx]{1,4}[.)]|[a-z]\)|\d+[.)])/gi,
    '\n  $2'
  );

  return formatted.trim();
}

/**
 * Returns a grade letter for a percentage score.
 * Matches the scale used in Results.tsx.
 */
export function gradeLabel(pct: number): string {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 50) return 'D';
  if (pct >= 35) return 'E';
  return 'F';
}

/**
 * Human-readable file size string.
 * Used in UploadAnswers.tsx.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
