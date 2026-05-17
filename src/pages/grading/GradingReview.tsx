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
import { Loader2, ChevronDown, ChevronRight, CheckCircle, Edit2, Save, X, RefreshCw, AlertTriangle, Trash2, Download, FileText, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { gradeSubmission, aggregateScores, regradeSingleQuestion, uploadAndStoreFeedbackPdf } from '@/integrations/api-client';
import { generateFeedbackPdfBlob } from '@/utils/feedbackPdf';
import { formatFeedback, formatStudentText } from '@/utils/helpers';
import { PageLoader } from '@/components/ui/PageLoader';
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


interface QuestionGrade {
  id: string;
  submission_id: string;
  question_id: string;
  question_label: string;
  ai_score: number;
  max_score: number;
  ai_feedback: string;
  confidence: string;
  is_counted: boolean;
  educator_override: number | null;
  extracted_text?: string;
}

interface Submission {
  id: string;
  student_name: string;
  content: string;
  ai_score: number | null;
  ai_feedback: string | null;
  final_score: number | null;
  graded_at: string | null;
  created_at: string;
  assignment_id: string;
  assignment: {
    id: string;
    title: string;
    max_score: number;
  };
  question_grades?: QuestionGrade[];
}

/** Button that downloads the stored feedback PDF or regenerates it on demand */
function FeedbackPdfButton({ sub }: { sub: Submission }) {
  const [generating, setGenerating] = useState(false);

  const feedbackUrl = (sub as any).feedback_pdf_url as string | null;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const pdfBlob = generateFeedbackPdfBlob({
        studentName: sub.student_name,
        assignmentTitle: sub.assignment.title,
        finalScore: sub.final_score ?? sub.ai_score ?? 0,
        maxScore: sub.assignment.max_score,
        gradedAt: sub.graded_at ?? '',
        questionGrades: (sub.question_grades || []).map(qg => ({
          question_label: qg.question_label,
          ai_score: qg.ai_score,
          max_score: qg.max_score,
          ai_feedback: qg.ai_feedback,
          educator_override: qg.educator_override,
          confidence: qg.confidence,
          is_counted: qg.is_counted,
        })),
      });
      const url = await uploadAndStoreFeedbackPdf(sub.id, pdfBlob);
      window.open(url, '_blank');
      toast.success('Feedback PDF stored and opened');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate feedback PDF');
    } finally {
      setGenerating(false);
    }
  };

  if (feedbackUrl) {
    return (
      <Button variant="outline" size="sm" asChild>
        <a href={feedbackUrl} target="_blank" rel="noopener noreferrer">
          <Download className="h-4 w-4 mr-2" />
          Download Feedback PDF
        </a>
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
      {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
      Generate Feedback PDF
    </Button>
  );
}

export default function GradingReview() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Specific question editing state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionEditScore, setQuestionEditScore] = useState<number>(0);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [regradingId, setRegradingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Transcript editing state
  const [editingTranscriptId, setEditingTranscriptId] = useState<string | null>(null);
  const [transcriptValue, setTranscriptValue] = useState<string>('');

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
        // Fetch question grades and submission answers for expanded detail view
        const { data: qg } = await supabase
          .from('question_grades')
          .select('*')
          .in('submission_id', subs.map(s => s.id));

        const { data: sa } = await supabase
          .from('submission_answers')
          .select('submission_id, question_id, extracted_text')
          .in('submission_id', subs.map(s => s.id));

        const submissionsWithData = subs.map(sub => {
          const subQg = (qg || []).filter(g => g.submission_id === sub.id)
            .map(g => {
              const answer = (sa || []).find(a => a.submission_id === sub.id && a.question_id === g.question_id);
              return { ...g, extracted_text: answer?.extracted_text };
            })
            // Sort numerically so Q1 < Q2 < Q10 < Q11, etc.
            .sort((a, b) => {
              const numA = parseInt(a.question_label.replace(/\D+/g, ''), 10);
              const numB = parseInt(b.question_label.replace(/\D+/g, ''), 10);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return a.question_label.localeCompare(b.question_label);
            });

          return {
            ...sub,
            assignment: assignments.find(a => a.id === sub.assignment_id) || { id: '', title: 'Unknown', max_score: 100 },
            question_grades: subQg
          };
        });
        setSubmissions(submissionsWithData);
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

  const startQuestionEditing = (qg: QuestionGrade) => {
    setEditingQuestionId(qg.id);
    setQuestionEditScore(qg.educator_override ?? qg.ai_score ?? 0);
  };

  const cancelQuestionEditing = () => {
    setEditingQuestionId(null);
    setQuestionEditScore(0);
  };

  const saveQuestionGradeOverride = async (sub: Submission, qg: QuestionGrade) => {
    setSavingId(qg.id);
    try {
      const { error } = await supabase
        .from('question_grades')
        .update({ educator_override: questionEditScore })
        .eq('id', qg.id);

      if (error) throw error;

      toast.success('Question grade updated.');

      // Re-aggregate and retrieve updated final score
      const aggRes = await aggregateScores(sub.id, sub.assignment_id);

      setSubmissions(subs => subs.map(s => {
        if (s.id === sub.id) {
          return {
            ...s,
            ai_score: aggRes.final_score,
            final_score: aggRes.final_score, // keep synchronized
            question_grades: s.question_grades?.map(g =>
              g.id === qg.id ? { ...g, educator_override: questionEditScore } : g
            ),
          };
        }
        return s;
      }));
      setEditingQuestionId(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save override');
    } finally {
      setSavingId(null);
    }
  };

  const selectOptionalQuestion = async (sub: Submission, qgId: string) => {
    setSavingId(qgId);
    try {
      // Logic for explicit toggle logic (Assuming backend logic to mark is_counted)
      await supabase.from('question_grades').update({ is_counted: true }).eq('id', qgId);
      toast.success('Optional question selected');
      await aggregateScores(sub.id, sub.assignment_id);
      await fetchSubmissions();
    } catch (err) {
      toast.error('Failed selection');
    } finally {
      setSavingId(null);
    }
  };

  const handleRegradeQuestion = async (sub: Submission, qg: QuestionGrade) => {
    setRegradingId(qg.id);
    try {
      const result = await regradeSingleQuestion(sub.id, qg.question_id, sub.assignment_id);

      toast.success(`Question ${qg.question_label} regraded successfully.`);

      // Update local state with the new grade
      setSubmissions(subs => subs.map(s => {
        if (s.id === sub.id) {
          const updatedQg = s.question_grades?.map(g =>
            g.id === qg.id ? { ...g, ...result.question_grade, extracted_text: g.extracted_text } : g
          );
          return { ...s, question_grades: updatedQg };
        }
        return s;
      }));

      // Re-aggregate total score after regrading
      const aggRes = await aggregateScores(sub.id, sub.assignment_id);
      setSubmissions(subs => subs.map(s => {
        if (s.id === sub.id) {
          return {
            ...s,
            ai_score: aggRes.final_score,
            final_score: aggRes.final_score
          };
        }
        return s;
      }));

    } catch (err) {
      console.error(err);
      toast.error('Failed to regrade question');
    } finally {
      setRegradingId(null);
    }
  };

  const startTranscriptEditing = (qg: QuestionGrade) => {
    setEditingTranscriptId(qg.id);
    setTranscriptValue(qg.extracted_text || '');
  };

  const saveTranscript = async (sub: Submission, qg: QuestionGrade) => {
    setSavingId(qg.id);
    try {
      const { error } = await supabase
        .from('submission_answers')
        .update({ extracted_text: transcriptValue })
        .eq('submission_id', sub.id)
        .eq('question_id', qg.question_id);

      if (error) throw error;

      toast.success('Transcript updated locally.');

      // Update local state
      setSubmissions(subs => subs.map(s => {
        if (s.id === sub.id) {
          return {
            ...s,
            question_grades: s.question_grades?.map(g =>
              g.id === qg.id ? { ...g, extracted_text: transcriptValue } : g
            )
          };
        }
        return s;
      }));
      setEditingTranscriptId(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save transcript');
    } finally {
      setSavingId(null);
    }
  };

  const approveGrade = async (sub: Submission) => {
    setSavingId(sub.id);
    const finalScore = sub.final_score ?? sub.ai_score;
    const gradedAt = new Date().toISOString();

    const { error } = await supabase
      .from('submissions')
      .update({
        final_score: finalScore,
        graded_at: gradedAt,
      })
      .eq('id', sub.id);

    if (error) {
      toast.error('Failed to approve grade');
      setSavingId(null);
      return;
    }

    // Generate and store individual feedback PDF in Supabase Storage
    try {
      const pdfBlob = generateFeedbackPdfBlob({
        studentName: sub.student_name,
        assignmentTitle: sub.assignment.title,
        finalScore: finalScore ?? 0,
        maxScore: sub.assignment.max_score,
        gradedAt,
        questionGrades: (sub.question_grades || []).map(qg => ({
          question_label: qg.question_label,
          ai_score: qg.ai_score,
          max_score: qg.max_score,
          ai_feedback: qg.ai_feedback,
          educator_override: qg.educator_override,
          confidence: qg.confidence,
          is_counted: qg.is_counted,
        })),
      });
      await uploadAndStoreFeedbackPdf(sub.id, pdfBlob);
      toast.success('Grade released & feedback report saved');
    } catch (pdfErr) {
      // Don't block the release if PDF generation fails
      console.error('[approveGrade] PDF generation failed:', pdfErr);
      toast.success('Grade approved and released');
      toast.warning('Feedback PDF could not be stored — download manually from Results');
    }

    setSubmissions(subs => subs.map(s =>
      s.id === sub.id ? { ...s, final_score: finalScore, graded_at: gradedAt } : s
    ));
    setSavingId(null);
  };

  const deleteSubmission = async (subId: string) => {
    setDeletingId(subId);
    try {
      const { error } = await supabase.from('submissions').delete().eq('id', subId);
      if (error) throw error;
      toast.success('Submission deleted');
      setSubmissions(subs => subs.filter(s => s.id !== subId));
    } catch (error) {
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

  if (loading || loadingData) return <PageLoader />;

  const pendingCount = submissions.filter(s => !s.graded_at).length;
  const reviewedCount = submissions.filter(s => s.graded_at).length;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl font-bold text-foreground mb-1">Grading Review</h1>
          <p className="text-muted-foreground mb-6">Review per-question grades and approve for release</p>

          <div className="flex gap-4 mb-8">
            <Card className="flex-1"><CardContent className="pt-6"><div className="text-2xl font-bold">{pendingCount}</div><p className="text-sm text-muted-foreground">Pending</p></CardContent></Card>
            <Card className="flex-1"><CardContent className="pt-6"><div className="text-2xl font-bold">{reviewedCount}</div><p className="text-sm text-muted-foreground">Released</p></CardContent></Card>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <Card>
            <CardHeader>
              <CardTitle>AI Graded Submissions</CardTitle>
            </CardHeader>
            <CardContent>
              {submissions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground"><p>No submissions to review</p></div>
              ) : (
                <div className="space-y-4">
                  {submissions.map((sub) => {
                    const status = getStatus(sub);
                    const isExpanded = expandedRows.has(sub.id);
                    const displayScore = sub.final_score ?? sub.ai_score ?? 0;
                    const hasPlaceholder = hasPlaceholderContent(sub.content);
                    const qgList = sub.question_grades || [];

                    return (
                      <Collapsible key={sub.id} open={isExpanded} onOpenChange={() => toggleRow(sub.id)}>
                        <div className={`border rounded-lg overflow-hidden ${hasPlaceholder ? 'border-yellow-500/50' : ''}`}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors bg-card">
                              <div className="flex items-center gap-4">
                                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                <div>
                                  <p className="font-medium">{sub.student_name}</p>
                                  <p className="text-sm text-muted-foreground">{sub.assignment.title}</p>
                                </div>
                                {hasPlaceholder && <Badge variant="outline" className="text-yellow-600 bg-yellow-500/10"><AlertTriangle className="h-3 w-3 mr-1" />No OCR</Badge>}
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="font-medium text-lg">{displayScore} <span className="text-sm text-muted-foreground">/ {sub.assignment.max_score}</span></p>
                                </div>
                                <Badge variant={status.variant}>{status.label}</Badge>
                              </div>
                            </div>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <div className="border-t p-6 bg-muted/10 space-y-6">
                              {/* Per Question Breakdown */}
                              {qgList.length > 0 ? (
                                <div className="space-y-4">
                                  <h3 className="font-semibold text-lg flex items-center gap-2">Question Breakdown</h3>
                                  <div className="grid gap-4">
                                    {qgList.filter(qg => {
                                      const t = (qg.extracted_text || '').trim();
                                      if (!t) return false;
                                      // Exclude sentinel values that indicate the student did not answer
                                      if (t === '[NO ANSWER FOUND]') return false;
                                      if (t === '[EXTRACTION FAILED — MANUAL REVIEW REQUIRED]') return false;
                                      return true;
                                    }).map(qg => {
                                      const isEditingThis = editingQuestionId === qg.id;
                                      const activeScore = qg.educator_override ?? qg.ai_score ?? 0;
                                      const isLowConfidence = qg.confidence === 'low' || qg.confidence === 'medium';

                                      return (
                                        <Card key={qg.id} className={`border ${isLowConfidence && !qg.educator_override ? 'border-orange-500/50 bg-orange-500/5' : ''}`}>
                                          <CardContent className="p-4 space-y-4">

                                            {/* Header */}
                                            <div className="flex justify-between items-start">
                                              <div>
                                                <h4 className="font-semibold text-lg">{qg.question_label}</h4>
                                                {!qg.is_counted && (
                                                  <Badge variant="destructive" className="mt-1">Optional conflict - requires selection</Badge>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-3">
                                                {isLowConfidence && !qg.educator_override && (
                                                  <Badge variant="outline" className="text-orange-600 border-orange-500">
                                                    Confidence: {qg.confidence}
                                                  </Badge>
                                                )}
                                                {qg.educator_override !== null && (
                                                  <Badge className="bg-blue-500 hover:bg-blue-600">Manual Override</Badge>
                                                )}
                                                <div className="text-xl font-bold">
                                                  {activeScore} <span className="text-sm text-muted-foreground font-normal">/ {qg.max_score}</span>
                                                </div>
                                              </div>
                                            </div>

                                            {/* Exact Handwriting Text extracted */}
                                            <div className="border border-blue-500/20 rounded-xl bg-blue-500/5 overflow-hidden shadow-sm relative group">
                                              <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                  <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                  <h4 className="text-sm font-semibold m-0 text-blue-900 dark:text-blue-300">Extracted Student Text</h4>
                                                </div>
                                                {!editingTranscriptId && sub.graded_at === null && (
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => startTranscriptEditing(qg)}
                                                  >
                                                    <Edit2 className="h-3 w-3 mr-1" /> Edit OCR
                                                  </Button>
                                                )}
                                              </div>

                                              {editingTranscriptId === qg.id ? (
                                                <div className="p-4 space-y-3 bg-muted/5">
                                                  <Textarea
                                                    value={transcriptValue}
                                                    onChange={(e) => setTranscriptValue(e.target.value)}
                                                    className="min-h-[120px] bg-background font-mono text-sm leading-relaxed"
                                                  />
                                                  <div className="flex justify-end gap-2">
                                                    <Button variant="ghost" size="sm" onClick={() => setEditingTranscriptId(null)}>Cancel</Button>
                                                    <Button size="sm" onClick={() => saveTranscript(sub, qg)} disabled={savingId === qg.id}>
                                                      {savingId === qg.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                                                      Save & Close
                                                    </Button>
                                                  </div>
                                                </div>
                                              ) : (
                                                <div className="p-4 text-sm max-h-[400px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-card-foreground">
                                                  {qg.extracted_text ? formatStudentText(qg.extracted_text) : <span className="text-muted-foreground italic">No text extracted for this question.</span>}
                                                </div>
                                              )}
                                            </div>

                                            {/* AI Feedback & Rubric Output */}
                                            <div className="border border-purple-500/20 rounded-xl bg-purple-500/5 overflow-hidden shadow-sm">
                                              <div className="bg-purple-500/10 border-b border-purple-500/20 px-4 py-3 flex items-center gap-2">
                                                <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                                <h4 className="text-sm font-semibold m-0 text-purple-900 dark:text-purple-300">AI Feedback</h4>
                                              </div>
                                              <div className="p-4 text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                                                {formatFeedback(qg.ai_feedback)}
                                              </div>
                                            </div>

                                            {/* Editing UI */}
                                            <div className="pt-2 border-t mt-4 flex justify-between items-center">
                                              {isEditingThis ? (
                                                <div className="flex items-center gap-3 w-full bg-muted/50 p-2 rounded-lg">
                                                  <label className="text-sm font-medium">New Score:</label>
                                                  <Input type="number" min={0} max={qg.max_score} value={questionEditScore} onChange={(e) => setQuestionEditScore(Number(e.target.value))} className="w-24 bg-background" />
                                                  <Button size="sm" onClick={() => saveQuestionGradeOverride(sub, qg)} disabled={savingId === qg.id}>
                                                    {savingId === qg.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Save
                                                  </Button>
                                                  <Button variant="ghost" size="sm" onClick={cancelQuestionEditing}><X className="h-4 w-4" /></Button>
                                                </div>
                                              ) : (
                                                <div className="flex gap-2 w-full">
                                                  <Button variant="outline" size="sm" onClick={() => startQuestionEditing(qg)} disabled={sub.graded_at !== null}>
                                                    <Edit2 className="h-4 w-4 mr-2" /> Modify Score
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleRegradeQuestion(sub, qg)}
                                                    disabled={sub.graded_at !== null || regradingId === qg.id}
                                                    className="text-accent border-accent/20 hover:bg-accent/5"
                                                  >
                                                    {regradingId === qg.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                                                    Regrade Question
                                                  </Button>
                                                  {!qg.is_counted && (
                                                    <Button variant="default" size="sm" onClick={() => selectOptionalQuestion(sub, qg.id)}>
                                                      Accept Answer
                                                    </Button>
                                                  )}
                                                </div>
                                              )}
                                            </div>

                                          </CardContent>
                                        </Card>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                // Legacy Fallback view for strictly old monolithic grades
                                <div className="space-y-6">
                                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
                                    <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-medium text-yellow-700">Legacy Monolithic Grading Format</p>
                                      <p className="text-sm text-muted-foreground mt-1">This submission lacks per-question breakdowns because it was graded with legacy versions of EvalueX. To see the new Question-Centric format, regrade from scratch.</p>
                                    </div>
                                  </div>

                                  <div className="border border-blue-500/20 rounded-xl bg-blue-500/5 overflow-hidden shadow-sm">
                                    <div className="bg-blue-500/10 border-b border-blue-500/20 px-4 py-3 flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                      <h4 className="text-sm font-semibold m-0 text-blue-900 dark:text-blue-300">Extracted Student Text</h4>
                                    </div>
                                    <div className="p-5 text-sm max-h-[600px] overflow-y-auto whitespace-pre-wrap leading-relaxed text-foreground">
                                      {sub.content ? formatStudentText(sub.content) : <span className="text-muted-foreground italic">No text extracted.</span>}
                                    </div>
                                  </div>

                                  {sub.ai_feedback && (
                                    <div className="border border-purple-500/20 rounded-xl bg-purple-500/5 overflow-hidden shadow-sm">
                                      <div className="bg-purple-500/10 border-b border-purple-500/20 px-4 py-3 flex items-center gap-2">
                                        <MessageSquare className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                        <h4 className="text-sm font-semibold m-0 text-purple-900 dark:text-purple-300">Legacy AI Feedback</h4>
                                      </div>
                                      <div className="p-5 text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                                        {formatFeedback(sub.ai_feedback)}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Footer Actions */}
                              <div className="flex justify-between items-center pt-6 border-t">
                                {!sub.graded_at ? (
                                  <>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="outline" className="text-destructive hover:bg-destructive hover:text-white"><Trash2 className="h-4 w-4 mr-2" /> Delete Submission</Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle></AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => deleteSubmission(sub.id)}>Confirm</AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>

                                    <Button onClick={() => approveGrade(sub)} disabled={savingId === sub.id} size="lg">
                                      {savingId === sub.id ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle className="h-5 w-5 mr-2" />}
                                      Finalize & Release Total Score ({displayScore}/{sub.assignment.max_score})
                                    </Button>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-3 ml-auto">
                                    <FeedbackPdfButton sub={sub} />
                                  </div>
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
