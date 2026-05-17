import jsPDF from 'jspdf';

export interface QuestionGradeData {
  question_label: string;
  ai_score: number;
  max_score: number;
  ai_feedback: string;
  educator_override: number | null;
  confidence: string;
  is_counted: boolean;
}

export interface FeedbackPdfData {
  studentName: string;
  assignmentTitle: string;
  finalScore: number;
  maxScore: number;
  gradedAt: string;
  questionGrades: QuestionGradeData[];
}

function getGradeLabel(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 60) return 'C';
  if (percentage >= 50) return 'D';
  if (percentage >= 35) return 'E';
  return 'F';
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
    .trim();
}

/**
 * Generates a jsPDF feedback report blob for a single student submission.
 */
export function generateFeedbackPdfBlob(data: FeedbackPdfData): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = 20;

  const checkPage = (neededHeight = 12) => {
    if (y + neededHeight > 275) {
      doc.addPage();
      y = 20;
    }
  };

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFillColor(59, 130, 246); // blue-500
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('EvalueX  —  AI Feedback Report', margin, 9.5);
  doc.setTextColor(0, 0, 0);
  y = 24;

  // ── Student Info ───────────────────────────────────────────────────────────
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.studentName, margin, y);
  y += 7;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Examination: ${data.assignmentTitle}`, margin, y);
  y += 5.5;
  doc.text(
    `Date: ${data.gradedAt ? new Date(data.gradedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}`,
    margin,
    y
  );
  y += 9;
  doc.setTextColor(0, 0, 0);

  // ── Score Summary Box ──────────────────────────────────────────────────────
  const pct = Math.round((data.finalScore / data.maxScore) * 100);
  const grade = getGradeLabel(pct);

  doc.setFillColor(240, 249, 255); // light blue bg
  doc.setDrawColor(147, 197, 253); // blue-300
  doc.roundedRect(margin, y, contentW, 18, 3, 3, 'FD');

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 64, 175); // blue-800
  doc.text(`${data.finalScore} / ${data.maxScore}`, margin + 6, y + 11.5);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`${pct}%  •  Grade: ${grade}`, margin + 6, y + 16.5);

  y += 25;
  doc.setTextColor(0, 0, 0);

  // ── Question Breakdown ─────────────────────────────────────────────────────
  const counted = data.questionGrades.filter((qg) => qg.is_counted);
  if (counted.length === 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150, 150, 150);
    doc.text('No per-question breakdown available for this submission.', margin, y);
  } else {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Question-by-Question Feedback', margin, y);
    y += 2;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y + 1, pageW - margin, y + 1);
    y += 7;

    for (const qg of counted) {
      checkPage(30);

      const score = qg.educator_override ?? qg.ai_score;
      const feedbackText = stripMarkdown(qg.ai_feedback || 'No feedback available.');

      // Question label + score bar
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentW, 8, 1.5, 1.5, 'FD');

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(qg.question_label, margin + 3, y + 5.5);

      const scoreStr = `${score} / ${qg.max_score}${qg.educator_override !== null ? '  (Manual)' : ''}`;
      const scoreW = doc.getTextWidth(scoreStr);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(scoreStr, margin + contentW - scoreW - 3, y + 5.5);

      y += 11;

      // Feedback text (wrapped)
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(feedbackText, contentW - 4);
      for (const line of lines) {
        checkPage(6);
        doc.text(line, margin + 2, y);
        y += 5.5;
      }

      y += 4;
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(
      `Generated by EvalueX  |  Page ${i} of ${totalPages}`,
      margin,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  return doc.output('blob') as Blob;
}
