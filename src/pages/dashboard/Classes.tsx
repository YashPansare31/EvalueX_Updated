import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Users, BookOpen, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface ClassData {
  id: string;
  title: string;
  description: string | null;
  studentCount: number;
  avgScore: number;
}

export default function Classes() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      fetchClasses();
    }
  }, [user]);

  const fetchClasses = async () => {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (assignments) {
      const classesWithStats = await Promise.all(
        assignments.map(async (a) => {
          const { data: subs } = await supabase
            .from('submissions')
            .select('student_name, final_score')
            .eq('assignment_id', a.id);

          const uniqueStudents = new Set(subs?.map(s => s.student_name) || []);
          const gradedSubs = subs?.filter(s => s.final_score !== null) || [];
          const avgScore = gradedSubs.length > 0
            ? Math.round(gradedSubs.reduce((acc, s) => acc + (s.final_score || 0), 0) / gradedSubs.length)
            : 0;

          return {
            id: a.id,
            title: a.title,
            description: a.description,
            studentCount: uniqueStudents.size,
            avgScore
          };
        })
      );
      setClasses(classesWithStats);
    }
    setLoadingData(false);
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
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Classes</h1>
            <p className="text-muted-foreground">Manage your classes and assignments</p>
          </div>
          <Button variant="hero" onClick={() => navigate('/dashboard')}>
            <Plus className="h-4 w-4 mr-2" />
            New Class
          </Button>
        </motion.div>

        {classes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No classes yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create your first class to get started</p>
              <Button variant="hero" onClick={() => navigate('/dashboard')}>
                <Plus className="h-4 w-4 mr-2" />
                Create Class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls, index) => (
              <motion.div
                key={cls.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
              >
                <Card 
                  className="cursor-pointer hover:border-accent/50 hover:shadow-md transition-all"
                  onClick={() => navigate(`/assignment/${cls.id}`)}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{cls.title}</CardTitle>
                    {cls.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{cls.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {cls.studentCount} students
                      </div>
                      {cls.avgScore > 0 && (
                        <div className="px-2 py-1 bg-accent/10 rounded-md">
                          <span className="text-sm font-semibold text-accent">{cls.avgScore}%</span>
                        </div>
                      )}
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
