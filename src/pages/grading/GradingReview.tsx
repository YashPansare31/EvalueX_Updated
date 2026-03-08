import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Loader2, ChevronDown, ChevronRight, CheckCircle, Edit2, Save, X, RefreshCw, AlertTriangle, Trash2, Download, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { gradeSubmission } from '@/integrations/api-client';
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
  content: string;
  ai_score: number | null;
  ai_feedback: string | null;
  final_score: number | null;
  graded_at: string | null;
  created_at: string;
  assignment: {
    id: string;
    title: string;
    max_score: number;
  };
}

export default function GradingReview() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editScore, setEditScore] = useState<number>(0);
  const [editFeedback, setEditFeedback] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [regradingId, setRegradingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchSubmissions();
    }
  }, [user]);

  const fetchSubmissions = async () => {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, max_score')
      .eq('user_id', user?.id);

    if (assignments && assignments.length > 0) {
      const { data: subs } = await supabase
        .from('submissions')
        .select('*')
        .in('assignment_id', assignments.map(a => a.id))
        .not('ai_score', 'is', null)
        .order('created_at', { ascending: false });

      if (subs) {
        const submissionsWithAssignment = subs.map(sub => ({
          ...sub,
          assignment: assignments.find(a => a.id === sub.assignment_id) || { id: '', title: 'Unknown', max_score: 100 }
        }));
        setSubmissions(submissionsWithAssignment);
      }
    }
    setLoadingData(false);
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const startEditing = (sub: Submission) => {
    setEditingRow(sub.id);
    setEditScore(sub.final_score ?? sub.ai_score ?? 0);
    setEditFeedback(sub.ai_feedback ?? '');
  };

  const cancelEditing = () => {
    setEditingRow(null);
    setEditScore(0);
    setEditFeedback('');
  };

  const saveChanges = async (subId: string) => {
    setSavingId(subId);
    const { error } = await supabase
      .from('submissions')
      .update({
        final_score: editScore,
        ai_feedback: editFeedback,
      })
      .eq('id', subId);

    if (error) {
      toast.error('Failed to save changes');
    } else {
      toast.success('Changes saved');
      setSubmissions(subs => subs.map(s => 
        s.id === subId ? { ...s, final_score: editScore, ai_feedback: editFeedback } : s
      ));
      setEditingRow(null);
    }
    setSavingId(null);
  };

  const approveGrade = async (sub: Submission) => {
    setSavingId(sub.id);
    const finalScore = sub.final_score ?? sub.ai_score;
    
    const { error } = await supabase
      .from('submissions')
      .update({
        final_score: finalScore,
        graded_at: new Date().toISOString(),
      })
      .eq('id', sub.id);

    if (error) {
      toast.error('Failed to approve grade');
    } else {
      toast.success('Grade approved and released');
      setSubmissions(subs => subs.map(s => 
        s.id === sub.id ? { ...s, final_score: finalScore, graded_at: new Date().toISOString() } : s
      ));
    }
    setSavingId(null);
  };

  const regradeSubmission = async (sub: Submission) => {
    // Check if content has actual text (not placeholder)
    if (sub.content.includes('[Note: For actual grading') || sub.content.includes('[Text extraction failed')) {
      toast.error('This submission has placeholder content. Please delete and re-upload the file to extract text with OCR.');
      return;
    }

    setRegradingId(sub.id);
    try {
      const data = await gradeSubmission(
        sub.id,
        sub.content,
        sub.assignment.title,
        null,
        sub.assignment.max_score,
        sub.assignment.id
      );

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success('Re-grading complete!');
      // Refresh the submission
      await fetchSubmissions();
    } catch (error) {
      console.error('Regrade error:', error);
      toast.error('Failed to re-grade submission');
    } finally {
      setRegradingId(null);
    }
  };

  const deleteSubmission = async (subId: string) => {
    setDeletingId(subId);
    try {
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', subId);

      if (error) throw error;

      toast.success('Submission deleted');
      setSubmissions(subs => subs.filter(s => s.id !== subId));
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete submission');
    } finally {
      setDeletingId(null);
    }
  };

  const hasPlaceholderContent = (content: string) => {
    return content.includes('[Note: For actual grading') || 
           content.includes('[Text extraction failed') ||
           content.includes('Uploaded file:');
  };

  const getStatus = (sub: Submission) => {
    if (sub.graded_at) return { label: 'Released', variant: 'default' as const };
    if (sub.final_score !== null) return { label: 'Reviewed', variant: 'secondary' as const };
    return { label: 'Pending Review', variant: 'outline' as const };
  };

  // Format markdown text to plain text
  const formatFeedback = (text: string | null): string => {
    if (!text) return 'No feedback available';
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold **text**
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic *text*
      .replace(/#{1,6}\s*/g, '') // Remove # headings
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, (match) => match.replace(/```/g, '')) // Remove code blocks
      .replace(/^\s*[-*+]\s+/gm, '- ') // Normalize list items
      .replace(/^\s*\d+\.\s+/gm, (match) => match) // Keep numbered lists
      .trim();
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Student Name', 'Assignment', 'AI Score', 'Final Score', 'Max Score', 'Status', 'Graded Date', 'Feedback'];
    const rows = submissions.map(sub => {
      const status = getStatus(sub);
      const feedback = formatFeedback(sub.ai_feedback).replace(/"/g, '""'); // Escape quotes
      return [
        sub.student_name,
        sub.assignment.title,
        sub.ai_score ?? '',
        sub.final_score ?? sub.ai_score ?? '',
        sub.assignment.max_score,
        status.label,
        sub.graded_at ? new Date(sub.graded_at).toLocaleDateString() : '',
        `"${feedback}"`
      ].join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `grading-review-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported successfully');
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxWidth = pageWidth - 2 * margin;
    let yPos = 20;

    // Title
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Grading Review Report', margin, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, margin, yPos);
    yPos += 15;

    submissions.forEach((sub, index) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      const status = getStatus(sub);
      const displayScore = sub.final_score ?? sub.ai_score ?? 0;

      // Student header
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`${index + 1}. ${sub.student_name}`, margin, yPos);
      yPos += 6;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Assignment: ${sub.assignment.title}`, margin, yPos);
      yPos += 5;
      doc.text(`Score: ${displayScore}/${sub.assignment.max_score} | Status: ${status.label}`, margin, yPos);
      yPos += 5;
      if (sub.graded_at) {
        doc.text(`Graded: ${new Date(sub.graded_at).toLocaleDateString()}`, margin, yPos);
        yPos += 5;
      }

      // Feedback
      if (sub.ai_feedback) {
        yPos += 3;
        doc.setFont('helvetica', 'bold');
        doc.text('Feedback:', margin, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        
        const feedback = formatFeedback(sub.ai_feedback);
        const lines = doc.splitTextToSize(feedback, maxWidth);
        
        lines.forEach((line: string) => {
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, margin, yPos);
          yPos += 4;
        });
      }

      yPos += 10;
    });

    doc.save(`grading-review-${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success('PDF exported successfully');
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  const pendingCount = submissions.filter(s => !s.graded_at).length;
  const reviewedCount = submissions.filter(s => s.graded_at).length;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-foreground mb-1">Grading Review</h1>
          <p className="text-muted-foreground mb-6">Review AI-generated grades and approve for release</p>
          
          <div className="flex gap-4 mb-8">
            <Card className="flex-1">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-foreground">{pendingCount}</div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-foreground">{reviewedCount}</div>
                <p className="text-sm text-muted-foreground">Released</p>
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardContent className="pt-6 flex flex-col gap-2">
                <p className="text-sm text-muted-foreground mb-1">Export Results</p>
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
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>AI Graded Submissions</CardTitle>
              <CardDescription>
                Submissions marked with "No OCR" were uploaded before text extraction was enabled. Delete and re-upload them for accurate grading.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submissions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No AI-graded submissions to review</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {submissions.map((sub) => {
                    const status = getStatus(sub);
                    const isExpanded = expandedRows.has(sub.id);
                    const isEditing = editingRow === sub.id;
                    const displayScore = sub.final_score ?? sub.ai_score ?? 0;
                    const hasPlaceholder = hasPlaceholderContent(sub.content);
                    
                    return (
                      <Collapsible key={sub.id} open={isExpanded} onOpenChange={() => toggleRow(sub.id)}>
                        <div className={`border rounded-lg overflow-hidden ${hasPlaceholder ? 'border-yellow-500/50' : ''}`}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-4">
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <div className="flex items-center gap-2">
                                  <div>
                                    <p className="font-medium">{sub.student_name}</p>
                                    <p className="text-sm text-muted-foreground">{sub.assignment.title}</p>
                                  </div>
                                  {hasPlaceholder && (
                                    <Badge variant="outline" className="text-yellow-600 border-yellow-500 bg-yellow-500/10">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      No OCR
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="font-medium">{displayScore}/{sub.assignment.max_score}</p>
                                  <p className="text-xs text-muted-foreground">
                                    AI: {sub.ai_score}/{sub.assignment.max_score}
                                  </p>
                                </div>
                                <Badge variant={status.variant}>{status.label}</Badge>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="border-t p-4 bg-muted/30">
                              <div className="grid gap-4">
                                {hasPlaceholder && (
                                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
                                    <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-medium text-yellow-700 dark:text-yellow-500">Text extraction failed or file was uploaded before OCR was enabled</p>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        The AI couldn't read the actual content and gave a default score. Please delete this submission and re-upload the file to enable proper OCR text extraction.
                                      </p>
                                    </div>
                                  </div>
                                )}
                                
                                <div>
                                  <h4 className="text-sm font-medium mb-2">Student Submission</h4>
                                  <div className="bg-background p-3 rounded border text-sm max-h-40 overflow-y-auto">
                                    {sub.content}
                                  </div>
                                </div>
                                
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-medium">AI Feedback</h4>
                                    {!isEditing && !sub.graded_at && (
                                      <Button variant="ghost" size="sm" onClick={() => startEditing(sub)}>
                                        <Edit2 className="h-4 w-4 mr-1" />
                                        Edit
                                      </Button>
                                    )}
                                  </div>
                                  
                                  {isEditing ? (
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-2">
                                        <label className="text-sm">Score:</label>
                                        <Input
                                          type="number"
                                          min={0}
                                          max={sub.assignment.max_score}
                                          value={editScore}
                                          onChange={(e) => setEditScore(Number(e.target.value))}
                                          className="w-24"
                                        />
                                        <span className="text-sm text-muted-foreground">/ {sub.assignment.max_score}</span>
                                      </div>
                                      <Textarea
                                        value={editFeedback}
                                        onChange={(e) => setEditFeedback(e.target.value)}
                                        rows={6}
                                        className="font-mono text-sm"
                                      />
                                      <div className="flex gap-2">
                                        <Button 
                                          size="sm" 
                                          onClick={() => saveChanges(sub.id)}
                                          disabled={savingId === sub.id}
                                        >
                                          {savingId === sub.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                          ) : (
                                            <Save className="h-4 w-4 mr-1" />
                                          )}
                                          Save
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={cancelEditing}>
                                          <X className="h-4 w-4 mr-1" />
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="bg-background p-3 rounded border text-sm whitespace-pre-wrap">
                                      {formatFeedback(sub.ai_feedback)}
                                    </div>
                                  )}
                                </div>
                                
                                {!sub.graded_at && !isEditing && (
                                  <div className="flex justify-between items-center pt-2">
                                    <div className="flex gap-2">
                                      {!hasPlaceholder && (
                                        <Button 
                                          variant="outline"
                                          size="sm"
                                          onClick={() => regradeSubmission(sub)}
                                          disabled={regradingId === sub.id}
                                        >
                                          {regradingId === sub.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                          ) : (
                                            <RefreshCw className="h-4 w-4 mr-2" />
                                          )}
                                          Re-grade with AI
                                        </Button>
                                      )}
                                      
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button 
                                            variant="outline" 
                                            size="sm"
                                            className="text-destructive hover:text-destructive"
                                          >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Delete
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Delete Submission?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This will permanently delete the submission for "{sub.student_name}". 
                                              You can then re-upload the file to get proper OCR text extraction.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction 
                                              onClick={() => deleteSubmission(sub.id)}
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
                                    </div>
                                    
                                    <Button 
                                      onClick={() => approveGrade(sub)}
                                      disabled={savingId === sub.id || hasPlaceholder}
                                    >
                                      {savingId === sub.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      ) : (
                                        <CheckCircle className="h-4 w-4 mr-2" />
                                      )}
                                      Approve & Release
                                    </Button>
                                  </div>
                                )}
                                
                                {sub.graded_at && (
                                  <p className="text-sm text-muted-foreground text-right">
                                    Released on {new Date(sub.graded_at).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
