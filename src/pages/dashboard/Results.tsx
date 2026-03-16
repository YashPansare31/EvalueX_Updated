import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Trash2, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
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
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, max_score')
      .eq('user_id', user?.id);

    if (assignments) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .in('assignment_id', assignments.map(a => a.id))
        .not('final_score', 'is', null)
        .order('graded_at', { ascending: false });

      if (subs) {
        const submissionsWithAssignment = subs.map(sub => ({
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

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Student Name', 'Assignment', 'Score', 'Max Score', 'Percentage', 'Grade', 'Graded Date'];
    const rows = submissions.map(sub => {
      const percentage = Math.round((sub.final_score || 0) / sub.assignment.max_score * 100);
      const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : percentage >= 35 ? 'E' : 'F';
      return [
        sub.student_name,
        sub.assignment.title,
        sub.final_score ?? '',
        sub.assignment.max_score,
        `${percentage}%`,
        grade,
        sub.graded_at ? new Date(sub.graded_at).toLocaleDateString() : ''
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

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const margin = 20;
    let yPos = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Results Report', margin, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleDateString()} | Total: ${submissions.length} submissions`, margin, yPos);
    yPos += 15;

    // Table header
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Student', margin, yPos);
    doc.text('Assignment', margin + 40, yPos);
    doc.text('Score', margin + 100, yPos);
    doc.text('Grade', margin + 130, yPos);
    doc.text('Date', margin + 150, yPos);
    yPos += 7;

    // Draw line
    doc.setLineWidth(0.5);
    doc.line(margin, yPos - 3, 190, yPos - 3);

    doc.setFont('helvetica', 'normal');
    submissions.forEach((sub) => {
      if (yPos > 280) {
        doc.addPage();
        yPos = 20;
      }

      const percentage = Math.round((sub.final_score || 0) / sub.assignment.max_score * 100);
      const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : percentage >= 35 ? 'E' : 'F';

      doc.text(sub.student_name.substring(0, 15), margin, yPos);
      doc.text(sub.assignment.title.substring(0, 25), margin + 40, yPos);
      doc.text(`${sub.final_score}/${sub.assignment.max_score}`, margin + 100, yPos);
      doc.text(grade, margin + 130, yPos);
      doc.text(sub.graded_at ? new Date(sub.graded_at).toLocaleDateString() : '-', margin + 150, yPos);
      yPos += 6;
    });

    doc.save(`results-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exported successfully');
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

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
          <p className="text-muted-foreground mb-8">View all graded submissions</p>
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
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Graded</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((sub) => {
                      const percentage = Math.round((sub.final_score || 0) / sub.assignment.max_score * 100);
                      const grade = percentage >= 90 ? 'A+' : percentage >= 80 ? 'A' : percentage >= 70 ? 'B' : percentage >= 60 ? 'C' : percentage >= 50 ? 'D' : percentage >= 35 ? 'E' : 'F';
                      return (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">{sub.student_name}</TableCell>
                          <TableCell>{sub.assignment.title}</TableCell>
                          <TableCell>{sub.final_score}/{sub.assignment.max_score}</TableCell>
                          <TableCell>
                            <Badge variant={['A+', 'A', 'B'].includes(grade) ? 'default' : ['C', 'D'].includes(grade) ? 'secondary' : 'destructive'}>
                              {grade}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {sub.graded_at ? new Date(sub.graded_at).toLocaleDateString() : '-'}
                          </TableCell>
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
                                    This will permanently delete the graded submission for {sub.student_name}. This action cannot be undone.
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
        </motion.div>
      </main>
    </div>
  );
}
