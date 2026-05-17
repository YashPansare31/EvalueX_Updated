import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, FileText, Users, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { PageLoader } from '@/components/ui/PageLoader';

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  submission_count: number;
  avg_score: number;
}

export default function ClassDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [className, setClassName] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user && id) {
      fetchClassDetails();
    }
  }, [user, id]);

  const fetchClassDetails = async () => {
    try {
      // Fetch class info
      const { data: classData } = await supabase
        .from('classes')
        .select('name')
        .eq('id', id)
        .single();
      
      if (classData) setClassName(classData.name);

      // Fetch linked assignments
      const { data: linkedAssignments } = await supabase
        .from('assignment_classes')
        .select('assignment_id')
        .eq('class_id', id);
      
      const assignmentIds = linkedAssignments?.map(a => a.assignment_id) || [];

      if (assignmentIds.length > 0) {
        const { data: assData } = await supabase
          .from('assignments')
          .select('*')
          .in('id', assignmentIds);

        if (assData) {
          const assWithStats = await Promise.all(
            assData.map(async (a) => {
              const { data: subs } = await supabase
                .from('submissions')
                .select('final_score')
                .eq('assignment_id', a.id);

              const gradedSubs = subs?.filter(s => s.final_score !== null) || [];
              const avgScore = gradedSubs.length > 0
                ? Math.round(gradedSubs.reduce((acc, s) => acc + (s.final_score || 0), 0) / gradedSubs.length)
                : 0;

              return {
                id: a.id,
                title: a.title,
                description: a.description,
                submission_count: subs?.length || 0,
                avg_score: avgScore
              };
            })
          );
          setAssignments(assWithStats);
        }
      }
    } catch (err: any) {
      console.error('Error fetching class details:', err);
      toast.error(err.message || 'Failed to load class details');
    } finally {
      setLoadingData(false);
    }
  };

  if (loading || loadingData) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-4 mb-8"
        >
          <Button variant="ghost" size="icon" onClick={() => navigate('/classes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">{className || 'Class Details'}</h1>
            <p className="text-muted-foreground">Examinations and results for this class</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Examinations</p>
                  <p className="text-2xl font-bold">{assignments.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Students</p>
                  <p className="text-2xl font-bold">
                    {assignments.length > 0 
                      ? Math.round(assignments.reduce((acc, a) => acc + a.submission_count, 0) / assignments.length) 
                      : 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Class Avg. Score</p>
                  <p className="text-2xl font-bold">
                    {assignments.some(a => a.avg_score > 0)
                      ? Math.round(assignments.filter(a => a.avg_score > 0).reduce((acc, a) => acc + a.avg_score, 0) / assignments.filter(a => a.avg_score > 0).length)
                      : 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-xl font-semibold mb-4">Examinations</h2>
        {assignments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-10 w-10 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No examinations attached to this class yet</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => navigate('/upload')}
              >
                Create New Exam
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map((assignment) => (
              <Card 
                key={assignment.id}
                className="cursor-pointer hover:border-accent/50 hover:shadow-sm transition-all"
                onClick={() => navigate(`/assignment/${assignment.id}`)}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{assignment.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{assignment.submission_count} submissions</span>
                    {assignment.avg_score > 0 && (
                      <span className="font-semibold text-accent">{assignment.avg_score}% avg</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
