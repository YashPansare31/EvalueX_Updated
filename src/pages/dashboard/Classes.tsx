import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Users, BookOpen, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { PageLoader } from '@/components/ui/PageLoader';

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
  const [createOpen, setCreateOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDesc, setNewClassDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);

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
    try {
      const { data: classesData, error } = await supabase
        .from('classes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (classesData) {
        const classesWithStats = await Promise.all(
          classesData.map(async (c) => {
            // Get assignments for this class
            const { data: linkedAssignments } = await supabase
              .from('assignment_classes')
              .select('assignment_id')
              .eq('class_id', c.id);
            
            const assignmentIds = linkedAssignments?.map(a => a.assignment_id) || [];
            
            let studentCount = 0;
            let avgScore = 0;

            if (assignmentIds.length > 0) {
              const { data: subs } = await supabase
                .from('submissions')
                .select('student_name, final_score')
                .in('assignment_id', assignmentIds);

              const uniqueStudents = new Set(subs?.map(s => s.student_name) || []);
              studentCount = uniqueStudents.size;
              
              const gradedSubs = subs?.filter(s => s.final_score !== null) || [];
              avgScore = gradedSubs.length > 0
                ? Math.round(gradedSubs.reduce((acc, s) => acc + (s.final_score || 0), 0) / gradedSubs.length)
                : 0;
            }

            return {
              id: c.id,
              title: c.name,
              description: c.description,
              studentCount,
              avgScore
            };
          })
        );
        setClasses(classesWithStats);
      }
    } catch (err) {
      console.error('Error fetching classes:', err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !user) return;

    setIsCreating(true);
    try {
      const { error } = await supabase.from('classes').insert({
        name: newClassName,
        description: newClassDesc,
        user_id: user.id
      });

      if (error) throw error;

      setNewClassName('');
      setNewClassDesc('');
      setCreateOpen(false);
      toast.success('Class created successfully!');
      fetchClasses();
    } catch (err: any) {
      console.error('Error creating class:', err);
      toast.error(err.message || 'Failed to create class. Make sure database tables exist.');
    } finally {
      setIsCreating(false);
    }
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
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1">Classes</h1>
            <p className="text-muted-foreground">Manage your classes and assignments</p>
          </div>
          <Button variant="hero" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Class
          </Button>
        </motion.div>

        {classes.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No classes yet</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Create classes like "TY BTech B" to organize your exams and students.
              </p>
              <Button variant="hero" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Class
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
                  onClick={() => navigate(`/classes/${cls.id}`)}
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

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Class</DialogTitle>
              <DialogDescription>
                Add a new class to organize your exams (e.g., TY BTech A).
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateClass} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="className">Class Name</Label>
                <Input
                  id="className"
                  placeholder="e.g., TY BTech B (AIDS)"
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="classDesc">Description (optional)</Label>
                <Textarea
                  id="classDesc"
                  placeholder="Additional details about the class..."
                  value={newClassDesc}
                  onChange={(e) => setNewClassDesc(e.target.value)}
                />
              </div>
              <Button type="submit" variant="hero" className="w-full" disabled={isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Class'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
