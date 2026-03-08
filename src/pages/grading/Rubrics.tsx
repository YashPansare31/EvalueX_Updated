import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, BookOpen, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Rubrics() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  if (loading) {
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
            <h1 className="text-3xl font-bold text-foreground mb-1">Rubrics</h1>
            <p className="text-muted-foreground">Create and manage grading rubrics</p>
          </div>
          <Button variant="hero">
            <Plus className="h-4 w-4 mr-2" />
            New Rubric
          </Button>
        </motion.div>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No rubrics yet</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
              Create grading rubrics to define criteria for AI-powered assessments
            </p>
            <Button variant="hero">
              <Plus className="h-4 w-4 mr-2" />
              Create Rubric
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
