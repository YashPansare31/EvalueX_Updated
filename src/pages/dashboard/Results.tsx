import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Trash2, Download, Eye, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import { generateFeedbackPdfBlob } from '@/utils/feedbackPdf';
import { uploadAndStoreFeedbackPdf } from '@/integrations/api-client';
import { gradeLabel } from '@/utils/helpers';
import { PageLoader } from '@/components/ui/PageLoader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Submission {
  id: string;
  student_name: string;
  final_score: number | null;
  ai_score: number | null;
  graded_at: string | null;
  feedback_pdf_url: string | null;
  assignment_id: string;
  assignment: {
    title: string;
    max_score: number;
  };
}


export default function Results() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchResults();
    }
  }, [user]);

  const fetchResults = async () => {
    setLoadingData(true);
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, max_score')
      .eq('user_id', user?.id);

    if (assignments) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('id, student_name, final_score, ai_score, graded_at, assignment_id, feedback_pdf_url')
        .in('assignment_id', assignments.map(a => a.id))
        .not('final_score', 'is', null)
        .order('graded_at', { ascending: false });

      if (subs) {
        const submissionsWithAssignment = subs.map((sub: any) => ({
          ...sub,
          assignment: assignments.find(a => a.id === sub.assignment_id) || { title: 'Unknown', max_score: 100 }
        }));
        setSubmissions(submissionsWithAssignment);
      }
    }
    setLoadingData(false);
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    setDeletingId(submissionId);

    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', submissionId);

    if (error) {
      toast.error('Failed to delete submission');
    } else {
      toast.success('Submission deleted');
      setSubmissions(subs => subs.filter(s => s.id !== submissionId));
    }
    setDeletingId(null);
  };

  /**
   * Generate (or regenerate) feedback PDF for a student submission.
   * Fetches fresh question_grades from the DB (the real AI-generated feedback),
   * builds a PDF using jsPDF, uploads it to Supabase Storage via the backend
   * (which uses the service-role key), and stores the public URL in DB.
   */
  const handleGenerateFeedbackPdf = async (sub: Submission) => {
    setGeneratingPdfId(sub.id);
    try {
      // Fetch the per-question AI feedback stored in question_grades
      const { data: qg, error: qgErr } = await supabase
        .from('question_grades')
        .select('question_label, ai_score, max_score, ai_feedback, educator_override, confidence, is_counted')
        .eq('submission_id', sub.id);

      if (qgErr) throw new Error(`Failed to fetch question grades: ${qgErr.message}`);

      if (!qg || qg.length === 0) {
        toast.error('No grading data found for this submission. Make sure it has been fully graded.');
        return;
      }

      // Build the PDF using the real AI feedback that was generated during grading
      const pdfBlob = generateFeedbackPdfBlob({
        studentName: sub.student_name,
        assignmentTitle: sub.assignment.title,
        finalScore: sub.final_score ?? 0,
        maxScore: sub.assignment.max_score,
        gradedAt: sub.graded_at ?? '',
        questionGrades: qg.map(g => ({
          question_label: g.question_label,
          ai_score: g.ai_score,
          max_score: g.max_score,
          ai_feedback: g.ai_feedback,
          educator_override: g.educator_override,
          confidence: g.confidence,
          is_counted: g.is_counted,
        })),
      });

      // Upload via backend (uses service-role key → no RLS issues)
      const url = await uploadAndStoreFeedbackPdf(sub.id, pdfBlob);

      // Open immediately
      window.open(url, '_blank');

      // Update local state so the "View" button appears right away
      setSubmissions(subs =>
        subs.map(s => s.id === sub.id ? { ...s, feedback_pdf_url: url } : s)
      );

      toast.success('Feedback PDF generated and stored successfully');
    } catch (err: any) {
      console.error('[handleGenerateFeedbackPdf]', err);
      toast.error(`Failed to generate feedback PDF: ${err.message}`);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  // ── Export to CSV ────────────────────────────────────────────────────────────
  const exportToCSV = () => {
    const headers = [
      'Student Name',
      'Examination',
      'Score',
      'Max Score',
      'Percentage',
      'Grade',
      'Graded Date',
      'Feedback PDF',
    ];

    const rows = submissions.map(sub => {
      const percentage = Math.round((sub.final_score || 0) / sub.assignment.max_score * 100);
      const grade = gradeLabel(percentage);
      return [
        `"${sub.student_name.replace(/"/g, '""')}"`,
        `"${sub.assignment.title.replace(/"/g, '""')}"`,
        sub.final_score ?? '',
        sub.assignment.max_score,
        `${percentage}%`,
        grade,
        sub.graded_at ? new Date(sub.graded_at).toLocaleDateString() : '',
        sub.feedback_pdf_url ? sub.feedback_pdf_url : 'Not generated',
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  // ── Export to PDF ────────────────────────────────────────────────────────────
  const exportToPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const margin = 15;
    let yPos = 20;
    const pageW = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('EvalueX — Results Report', margin, yPos);
    yPos += 8;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(
      `Generated on ${new Date().toLocaleDateString()}  |  Total: ${submissions.length} submissions`,
      margin,
      yPos
    );
    yPos += 10;
    doc.setTextColor(0, 0, 0);

    // Column positions (landscape A4 = ~297mm wide)
    const cols = {
      student: margin,
      assignment: margin + 40,
      score: margin + 100,
      grade: margin + 125,
      date: margin + 140,
      feedback: margin + 168,
    };
    const feedbackColW = pageW - cols.feedback - margin;

    // Table header
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(59, 130, 246);
    doc.setTextColor(255, 255, 255);
    doc.rect(margin - 2, yPos - 5, pageW - margin * 2 + 4, 8, 'F');
    doc.text('Student', cols.student, yPos);
    doc.text('Examination', cols.assignment, yPos);
    doc.text('Score', cols.score, yPos);
    doc.text('Grade', cols.grade, yPos);
    doc.text('Date', cols.date, yPos);
    doc.text('Feedback PDF', cols.feedback, yPos);
    yPos += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    submissions.forEach((sub, idx) => {
      if (yPos > 185) {
        doc.addPage();
        yPos = 20;
      }

      // Zebra stripe
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin - 2, yPos - 4, pageW - margin * 2 + 4, 8, 'F');
      }

      const percentage = Math.round((sub.final_score || 0) / sub.assignment.max_score * 100);
      const grade = gradeLabel(percentage);

      doc.setFontSize(8.5);
      doc.text(sub.student_name.substring(0, 20), cols.student, yPos);
      doc.text(sub.assignment.title.substring(0, 22), cols.assignment, yPos);
      doc.text(`${sub.final_score}/${sub.assignment.max_score}`, cols.score, yPos);
      doc.text(grade, cols.grade, yPos);
      doc.text(
        sub.graded_at ? new Date(sub.graded_at).toLocaleDateString() : '-',
        cols.date,
        yPos
      );

      // Feedback URL — truncated to fit column
      if (sub.feedback_pdf_url) {
        doc.setTextColor(59, 130, 246);
        const truncatedUrl = doc.splitTextToSize(sub.feedback_pdf_url, feedbackColW)[0];
        doc.text(truncatedUrl, cols.feedback, yPos);
        doc.setTextColor(0, 0, 0);
      } else {
        doc.setTextColor(180, 180, 180);
        doc.text('Not generated', cols.feedback, yPos);
        doc.setTextColor(0, 0, 0);
      }

      yPos += 8;
    });

    // Footer
    const totalPages = (doc.internal as any).getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(
        `EvalueX Results Report  |  Page ${i} of ${totalPages}`,
        margin,
        doc.internal.pageSize.getHeight() - 8
      );
    }

    doc.save(`results-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exported successfully');
  };

  if (loading || loadingData) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-foreground mb-1">Results</h1>
          <p className="text-muted-foreground mb-8">View all graded submissions and download individual AI feedback reports</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Graded Submissions ({submissions.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchResults}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={exportToCSV} disabled={submissions.length === 0}>
                  <Download className="h-4 w-4 mr-1" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={exportToPDF} disabled={submissions.length === 0}>
                  <FileText className="h-4 w-4 mr-1" />
                  PDF
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {submissions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No graded submissions yet</p>
                  <p className="text-sm mt-1">Approve grades in Grading Review to see them here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Examination</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Graded</TableHead>
                      <TableHead>Feedback PDF</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((sub) => {
                      const percentage = Math.round((sub.final_score || 0) / sub.assignment.max_score * 100);
                      const grade = gradeLabel(percentage);
                      const isGenerating = generatingPdfId === sub.id;

                      return (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">{sub.student_name}</TableCell>
                          <TableCell>{sub.assignment.title}</TableCell>
                          <TableCell>{sub.final_score}/{sub.assignment.max_score}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                ['A+', 'A', 'B'].includes(grade)
                                  ? 'default'
                                  : ['C', 'D'].includes(grade)
                                    ? 'secondary'
                                    : 'destructive'
                              }
                            >
                              {grade}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {sub.graded_at ? new Date(sub.graded_at).toLocaleDateString() : '-'}
                          </TableCell>

                          {/* ── Feedback PDF cell ───────────────────────────── */}
                          <TableCell>
                            {sub.feedback_pdf_url ? (
                              <div className="flex gap-1 items-center">
                                {/* View existing PDF directly */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  title="View feedback PDF"
                                  asChild
                                >
                                  <a href={sub.feedback_pdf_url} target="_blank" rel="noopener noreferrer">
                                    <Eye className="h-4 w-4 mr-1" />
                                    View
                                  </a>
                                </Button>
                                {/* Re-generate button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-muted-foreground hover:text-foreground"
                                  title="Re-generate feedback PDF from grading data"
                                  onClick={() => handleGenerateFeedbackPdf(sub)}
                                  disabled={isGenerating}
                                >
                                  {isGenerating
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <RefreshCw className="h-4 w-4" />}
                                </Button>
                              </div>
                            ) : (
                              /* Generate button — no URL stored yet */
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => handleGenerateFeedbackPdf(sub)}
                                disabled={isGenerating}
                              >
                                {isGenerating
                                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                  : <FileText className="h-4 w-4 mr-1" />}
                                {isGenerating ? 'Generating…' : 'Generate PDF'}
                              </Button>
                            )}
                          </TableCell>

                          {/* ── Delete button ───────────────────────────────── */}
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Result?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete the graded submission for{' '}
                                    <strong>{sub.student_name}</strong> and its stored feedback PDF.
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteSubmission(sub.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {deletingId === sub.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : null}
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Legend */}
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Feedback PDFs are generated from the AI grading data and stored securely.
            Click <strong>Generate PDF</strong> if the column shows no link, or <strong>View</strong> to open an existing report.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
