import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/layout/Header';
import { ArrowLeft, Plus, Sparkles, CheckCircle2, Clock, Loader2, User, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
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

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  max_score: number;
}

interface Submission {
  id: string;
  student_name: string;
  content: string;
  ai_feedback: string | null;
  ai_score: number | null;
  final_score: number | null;
  graded_at: string | null;
  created_at: string;
}

export default function AssignmentPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [grading, setGrading] = useState<string | null>(null); // kept for button disabled state
  const [studentName, setStudentName] = useState('');
  const [content, setContent] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [deletingSubmission, setDeletingSubmission] = useState<string | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) {
      fetchAssignment();
      fetchSubmissions();
    }
  }, [user, id]);

  const fetchAssignment = async () => {
    const { data, error } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      toast({
        title: 'Error',
        description: 'Examination not found.',
        variant: 'destructive',
      });
      navigate('/dashboard');
    } else {
      setAssignment(data);
    }
    setLoading(false);
  };

  const fetchSubmissions = async () => {
    const { data, error } = await supabase
      .from('submissions')
      .select('*')
      .eq('assignment_id', id)
      .order('created_at', { ascending: false });

    if (!error) {
      setSubmissions(data || []);
    }
  };

  const handleAddSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);

    const { error } = await supabase.from('submissions').insert({
      assignment_id: id,
      student_name: studentName,
      content: content,
    });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Submission added',
        description: 'Ready for AI grading.',
      });
      setAddOpen(false);
      setStudentName('');
      setContent('');
      fetchSubmissions();
    }
    setAdding(false);
  };

  const handleGradeWithAI = async (submission: Submission) => {
    // The QCP pipeline requires answer sheets to be scanned and processed via
    // Upload Answers → extract-answers → grade-submission.
    // Manual text submissions cannot be graded via this flow.
    toast({
      title: 'Use Upload Answers for AI Grading',
      description:
        'AI grading requires scanned answer sheet images. Please use the "Upload Answers" page to upload this student\'s answer sheet and run the QCP pipeline.',
      variant: 'destructive',
    });
  };

  const handleFinalizeScore = async (submissionId: string, score: number) => {
    const { error } = await supabase
      .from('submissions')
      .update({
        final_score: score,
        graded_at: new Date().toISOString(),
      })
      .eq('id', submissionId);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Score finalized',
        description: 'The grade has been saved.',
      });
      fetchSubmissions();
      setSelectedSubmission(null);
    }
  };

  const handleDeleteSubmission = async (submissionId: string) => {
    setDeletingSubmission(submissionId);
    
    const { error } = await supabase
      .from('submissions')
      .delete()
      .eq('id', submissionId);

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Submission deleted',
        description: 'The student submission has been removed.',
      });
      fetchSubmissions();
    }
    setDeletingSubmission(null);
  };

  const handleDeleteAssignment = async () => {
    setDeletingAssignment(true);
    
    try {
      // Delete all related data first
      await supabase.from('submissions').delete().eq('assignment_id', id);
      await supabase.from('exam_questions').delete().eq('assignment_id', id);
      await supabase.from('exam_rubrics').delete().eq('assignment_id', id);
      
      const { error } = await supabase.from('assignments').delete().eq('id', id);
      
      if (error) throw error;
      
      toast({
        title: 'Examination deleted',
        description: 'The examination and all related data have been removed.',
      });
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
    setDeletingAssignment(false);
  };

  if (authLoading || loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        {/* Back button and title */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Examination
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Examination?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{assignment?.title}" and all its submissions, questions, and rubrics. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAssignment}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deletingAssignment}
                  >
                    {deletingAssignment ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">{assignment?.title}</h1>
          {assignment?.description && (
            <p className="text-muted-foreground">{assignment.description}</p>
          )}
          <Badge variant="secondary" className="mt-2">
            Max Score: {assignment?.max_score} points
          </Badge>
        </div>

        {/* Add submission button */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold">Student Submissions</h2>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button variant="hero">
                <Plus className="h-4 w-4 mr-2" />
                Add Submission
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Student Submission</DialogTitle>
                <DialogDescription>
                  Enter the student's work to grade with AI assistance.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddSubmission} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="studentName">Student Name</Label>
                  <Input
                    id="studentName"
                    placeholder="John Doe"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Submission Content</Label>
                  <Textarea
                    id="content"
                    placeholder="Paste or type the student's work here..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[200px]"
                    required
                  />
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={adding}>
                  {adding ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Submission'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Submissions list */}
        {submissions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <User className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No submissions yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add student submissions to grade them with AI.
              </p>
              <Button variant="hero" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Submission
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission, index) => (
              <motion.div
                key={submission.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card className="hover:border-accent/50 transition-colors">
                  <CardHeader className="flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {submission.student_name}
                      </CardTitle>
                      <CardDescription>
                        Submitted {new Date(submission.created_at).toLocaleDateString()}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {submission.final_score !== null ? (
                        <Badge className="bg-success text-success-foreground">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {submission.final_score}/{assignment?.max_score}
                        </Badge>
                      ) : submission.ai_score !== null ? (
                        <Badge variant="secondary" className="bg-warning/10 text-warning">
                          <Clock className="h-3 w-3 mr-1" />
                          AI: {submission.ai_score} - Pending Review
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          Not graded
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {submission.content}
                    </p>

                    {submission.ai_feedback && (
                      <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 mb-4">
                        <div className="flex items-center gap-2 text-accent font-medium mb-2">
                          <Sparkles className="h-4 w-4" />
                          AI Feedback
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {submission.ai_feedback}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {submission.final_score === null && (
                        <>
                          {submission.ai_score === null ? (
                            <Button
                              variant="accent"
                              size="sm"
                              onClick={() => handleGradeWithAI(submission)}
                              disabled={grading === submission.id}
                            >
                              {grading === submission.id ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Grading...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="mr-2 h-4 w-4" />
                                  Grade with AI
                                </>
                              )}
                            </Button>
                          ) : (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="hero" size="sm">
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Finalize Score
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Finalize Score</DialogTitle>
                                  <DialogDescription>
                                    Review the AI suggestion and enter the final score.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 mt-4">
                                  <div className="flex items-center gap-4">
                                    <Label>AI Suggested Score:</Label>
                                    <Badge variant="secondary">{submission.ai_score}/{assignment?.max_score}</Badge>
                                  </div>
                                  <div className="space-y-2">
                                    <Label htmlFor="finalScore">Final Score</Label>
                                    <Input
                                      id="finalScore"
                                      type="number"
                                      defaultValue={submission.ai_score || ''}
                                      min="0"
                                      max={assignment?.max_score}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const target = e.target as HTMLInputElement;
                                          handleFinalizeScore(submission.id, parseInt(target.value));
                                        }
                                      }}
                                    />
                                  </div>
                                  <Button
                                    variant="hero"
                                    className="w-full"
                                    onClick={(e) => {
                                      const input = document.getElementById('finalScore') as HTMLInputElement;
                                      handleFinalizeScore(submission.id, parseInt(input.value));
                                    }}
                                  >
                                    Save Final Score
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSubmission(submission)}
                      >
                        View Full Submission
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Submission?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete the submission from {submission.student_name}. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteSubmission(submission.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deletingSubmission === submission.id ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Full submission dialog */}
        <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedSubmission?.student_name}'s Submission</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <Label className="text-sm text-muted-foreground">Content</Label>
                <p className="mt-2 whitespace-pre-wrap">{selectedSubmission?.content}</p>
              </div>
              {selectedSubmission?.ai_feedback && (
                <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-accent font-medium mb-2">
                    <Sparkles className="h-4 w-4" />
                    AI Feedback
                  </div>
                  <p className="whitespace-pre-wrap">{selectedSubmission.ai_feedback}</p>
                  {selectedSubmission.ai_score !== null && (
                    <div className="mt-4 pt-4 border-t border-accent/20">
                      <Badge variant="secondary">
                        AI Suggested Score: {selectedSubmission.ai_score}/{assignment?.max_score}
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
