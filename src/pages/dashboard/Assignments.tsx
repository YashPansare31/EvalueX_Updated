import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/ui/PageLoader';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Plus, FileText, Pencil, Trash2, Loader2,
  ArrowRight, Search
} from 'lucide-react';
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
} from '@/components/ui/alert-dialog';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  max_score: number;
  created_at: string;
  submission_count: number;
  graded_count: number;
  avg_score: number;
}

export default function Assignments() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filtered, setFiltered] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) fetchAssignments();
  }, [user]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? assignments.filter(a =>
            a.title.toLowerCase().includes(q) ||
            (a.description || '').toLowerCase().includes(q)
          )
        : assignments
    );
  }, [search, assignments]);

  const fetchAssignments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('assignments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load examinations');
      setLoading(false);
      return;
    }

    const withStats = await Promise.all(
      (data || []).map(async (a) => {
        const { data: subs } = await supabase
          .from('submissions')
          .select('final_score')
          .eq('assignment_id', a.id);

        const total = subs?.length || 0;
        const graded = subs?.filter(s => s.final_score !== null) || [];
        const avg = graded.length > 0
          ? Math.round(graded.reduce((acc, s) => acc + (s.final_score || 0), 0) / graded.length)
          : 0;

        return {
          ...a,
          submission_count: total,
          graded_count: graded.length,
          avg_score: avg,
        };
      })
    );

    setAssignments(withStats);
    setLoading(false);
  };

  const handleDelete = async (assignmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(assignmentId);
    try {
      await supabase.from('submissions').delete().eq('assignment_id', assignmentId);
      const { data: oldQs } = await supabase
        .from('exam_questions')
        .select('id')
        .eq('assignment_id', assignmentId);
      if (oldQs && oldQs.length > 0) {
        await supabase.from('model_answers').delete().in('question_id', oldQs.map(q => q.id));
      }
      await supabase.from('exam_questions').delete().eq('assignment_id', assignmentId);
      await supabase.from('exam_rubrics').delete().eq('assignment_id', assignmentId);
      const { error } = await supabase.from('assignments').delete().eq('id', assignmentId);
      if (error) throw error;
      toast.success('Examination deleted successfully');
      fetchAssignments();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete examination');
    }
    setDeletingId(null);
  };

  if (authLoading || loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8 transition-all duration-300">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Examinations</h1>
            <p className="text-muted-foreground">
              {assignments.length} examination{assignments.length !== 1 ? 's' : ''} total
            </p>
          </div>
          <Button variant="hero" onClick={() => navigate('/upload')}>
            <Plus className="h-4 w-4 mr-2" />
            New Examination
          </Button>
        </motion.div>

        {/* Search */}
        {assignments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="relative mb-6"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search examinations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </motion.div>
        )}

        {/* Empty state */}
        {assignments.length === 0 ? (
          <Card className="border-dashed">
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No examinations yet</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center">
                Create your first examination to start grading with AI.
              </p>
              <Button variant="hero" onClick={() => navigate('/upload')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Examination
              </Button>
            </div>
          </Card>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No examinations match "{search}"
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((assignment, index) => (
              <motion.div
                key={assignment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + index * 0.04 }}
              >
                <Card
                  className="cursor-pointer hover:border-accent/50 hover:shadow-md transition-all duration-200 group"
                  onClick={() => navigate(`/assignment/${assignment.id}`)}
                >
                  <CardContent className="p-5">
                    {/* Title row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0 pr-2">
                        <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1">
                          {assignment.title}
                        </h3>
                        {assignment.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                            {assignment.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          {new Date(assignment.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {assignment.avg_score > 0 && (
                          <div className="px-2 py-1 rounded-md bg-accent/10 mr-1">
                            <span className="text-sm font-bold text-accent">{assignment.avg_score}%</span>
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-accent"
                          title="Edit examination"
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/upload/${assignment.id}`);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={e => e.stopPropagation()}
                              title="Delete examination"
                            >
                              {deletingId === assignment.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />
                              }
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={e => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Examination?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete <strong>"{assignment.title}"</strong> along
                                with all its submissions, questions, grades, and rubrics.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={e => handleDelete(assignment.id, e)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center justify-between text-sm pt-3 border-t border-border/50">
                      <span className="text-muted-foreground">
                        {assignment.submission_count} submission{assignment.submission_count !== 1 ? 's' : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        {assignment.submission_count > 0 &&
                          assignment.submission_count - assignment.graded_count > 0 ? (
                          <span className="px-2 py-0.5 bg-warning/10 text-warning text-xs rounded-full font-medium">
                            {assignment.submission_count - assignment.graded_count} pending
                          </span>
                        ) : assignment.graded_count > 0 ? (
                          <span className="px-2 py-0.5 bg-success/10 text-success text-xs rounded-full font-medium">
                            All graded
                          </span>
                        ) : null}
                        <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
