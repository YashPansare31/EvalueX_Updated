import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { PageLoader } from '@/components/ui/PageLoader';
import {
  Plus,
  FileText,
  Clock,
  Loader2,
  Users,
  TrendingUp,
  Upload,
  BarChart3,
  ArrowRight,
  ArrowUpRight,
  Trash2,
  Pencil
} from 'lucide-react';
import { motion } from 'framer-motion';
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
  created_at: string;
  submission_count?: number;
  graded_count?: number;
  avg_score?: number;
}

export default function Dashboard() {
  const { user, loading: authLoading, profile } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStudents, setTotalStudents] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const userName = profile?.full_name || user?.email?.split('@')[0] || 'User';

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchAssignments();
    }
  }, [user]);

  const fetchAssignments = async () => {
    const { data, error } = await supabase
      .from('assignments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error fetching assignments',
        description: error.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const assignmentsWithCounts = await Promise.all(
      (data || []).map(async (assignment) => {
        const { data: submissions, count: submissionCount } = await supabase
          .from('submissions')
          .select('*', { count: 'exact' })
          .eq('assignment_id', assignment.id);

        const { count: gradedCount } = await supabase
          .from('submissions')
          .select('*', { count: 'exact', head: true })
          .eq('assignment_id', assignment.id)
          .not('final_score', 'is', null);

        const gradedSubmissions = submissions?.filter(s => s.final_score !== null) || [];
        const avgScore = gradedSubmissions.length > 0
          ? Math.round(gradedSubmissions.reduce((acc, s) => acc + (s.final_score || 0), 0) / gradedSubmissions.length)
          : 0;

        return {
          ...assignment,
          submission_count: submissionCount || 0,
          graded_count: gradedCount || 0,
          avg_score: avgScore,
        };
      })
    );

    setAssignments(assignmentsWithCounts);

    // Get unique students
    const allSubmissions = await supabase
      .from('submissions')
      .select('student_name, assignment_id')
      .in('assignment_id', assignmentsWithCounts.map(a => a.id));

    if (allSubmissions.data) {
      const uniqueStudents = new Set(allSubmissions.data.map(s => s.student_name));
      setTotalStudents(uniqueStudents.size);
    }

    setLoading(false);
  };

  const handleDeleteAssignment = async (assignmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(assignmentId);
    
    try {
      // Delete all submissions first (cascade)
      await supabase.from('submissions').delete().eq('assignment_id', assignmentId);
      // Delete exam questions
      await supabase.from('exam_questions').delete().eq('assignment_id', assignmentId);
      // Delete exam rubrics
      await supabase.from('exam_rubrics').delete().eq('assignment_id', assignmentId);
      // Delete the assignment
      const { error } = await supabase.from('assignments').delete().eq('id', assignmentId);
      
      if (error) throw error;
      
      toast({
        title: 'Examination deleted',
        description: 'The examination and all related data have been removed.',
      });
      fetchAssignments();
    } catch (error: any) {
      toast({
        title: 'Error deleting examination',
        description: error.message,
        variant: 'destructive',
      });
    }
    setDeletingId(null);
  };

  const pendingCount = assignments.reduce((acc, a) => acc + (a.submission_count || 0) - (a.graded_count || 0), 0);
  const gradedCount = assignments.reduce((acc, a) => acc + (a.graded_count || 0), 0);
  const avgOverall = assignments.length > 0 && assignments.some(a => a.avg_score && a.avg_score > 0)
    ? Math.round(assignments.filter(a => a.avg_score && a.avg_score > 0).reduce((acc, a) => acc + (a.avg_score || 0), 0) / assignments.filter(a => a.avg_score && a.avg_score > 0).length)
    : 0;

  if (authLoading || loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />

      <main className="flex-1 ml-[260px] p-8 transition-all duration-300">
        {/* Welcome section */}
        <motion.div 
          className="mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-3xl font-bold text-foreground mb-1">
            Welcome back, {userName}!
          </h1>
          <p className="text-muted-foreground">
            Here's an overview of your grading activity
          </p>
        </motion.div>

        {/* Stats cards - 2x2 grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card className="bg-card hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Exams</p>
                    <p className="text-4xl font-bold text-foreground">{assignments.length}</p>
                    <p className="text-sm text-muted-foreground mt-1">{gradedCount} graded</p>
                    <p className="text-xs text-success flex items-center gap-1 mt-2">
                      <ArrowUpRight className="h-3 w-3" />
                      12% vs last month
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-accent" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <Card className="bg-card hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Total Students</p>
                    <p className="text-4xl font-bold text-foreground">{totalStudents}</p>
                    <p className="text-sm text-muted-foreground mt-1">Across {assignments.length} classes</p>
                    <p className="text-xs text-success flex items-center gap-1 mt-2">
                      <ArrowUpRight className="h-3 w-3" />
                      8% vs last month
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-accent" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card className="bg-card hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Average Score</p>
                    <p className="text-4xl font-bold text-foreground">{avgOverall > 0 ? `${avgOverall}%` : '-'}</p>
                    <p className="text-sm text-muted-foreground mt-1">Class average</p>
                    {avgOverall > 0 ? (
                      <p className="text-xs text-success flex items-center gap-1 mt-2">
                        <ArrowUpRight className="h-3 w-3" />
                        5% vs last month
                      </p>
                    ) : (
                      <p className="text-xs opacity-0 flex items-center gap-1 mt-2 select-none pointer-events-none">
                        <ArrowUpRight className="h-3 w-3" />
                        placeholder
                      </p>
                    )}
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-accent/10 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-accent" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            <Card className="bg-card hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Pending</p>
                    <p className="text-4xl font-bold text-foreground">{pendingCount}</p>
                    <p className="text-sm text-muted-foreground mt-1">Exams to grade</p>
                    <p className="text-xs opacity-0 flex items-center gap-1 mt-2 select-none pointer-events-none">
                      <ArrowUpRight className="h-3 w-3" />
                      placeholder
                    </p>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-warning/10 flex items-center justify-center">
                    <Clock className="h-6 w-6 text-warning" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-8"
        >
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <button
                onClick={() => navigate('/upload')}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="font-medium text-foreground">Upload New Exam</span>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => navigate('/results')}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="font-medium text-foreground">View Results</span>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </button>

              <button 
                onClick={() => navigate('/analytics')}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <span className="font-medium text-foreground">View Analytics</span>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Assignments */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Recent Examinations</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/assignments')}>
              View all
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          {assignments.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No examinations yet</h3>
                <p className="text-sm text-muted-foreground mb-4 text-center">
                  Create your first examination to start grading with AI.
                </p>
                <Button variant="hero" onClick={() => navigate('/upload')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Examination
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {assignments.slice(0, 6).map((assignment, index) => (
                <motion.div
                  key={assignment.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + index * 0.05 }}
                >
                  <Card
                    className="cursor-pointer hover:border-accent/50 hover:shadow-md transition-all duration-200 group relative"
                    onClick={() => navigate(`/assignment/${assignment.id}`)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1">
                            {assignment.title}
                          </h3>
                          {assignment.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                              {assignment.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(assignment.avg_score ?? 0) > 0 && (
                            <div className="px-2 py-1 rounded-md bg-accent/10">
                              <span className="text-sm font-bold text-accent">{assignment.avg_score}%</span>
                            </div>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-accent"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/upload/${assignment.id}`);
                            }}
                            title="Edit exam setup"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Examination?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{assignment.title}" and all its submissions, questions, and rubrics. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={(e) => handleDeleteAssignment(assignment.id, e)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {deletingId === assignment.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : null}
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {assignment.submission_count} submissions
                        </span>
                        {(assignment.submission_count || 0) - (assignment.graded_count || 0) > 0 ? (
                          <span className="px-2 py-0.5 bg-warning/10 text-warning text-xs rounded-full font-medium">
                            {(assignment.submission_count || 0) - (assignment.graded_count || 0)} pending
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-success/10 text-success text-xs rounded-full font-medium">
                            Complete
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
