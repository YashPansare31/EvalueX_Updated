import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { Loader2, BookOpen, Plus, FileText, Upload, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PageLoader } from '@/components/ui/PageLoader';

export default function Rubrics() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [rubrics, setRubrics] = useState<any[]>([]);
  const [fetching, setFetching] = useState(true);
  
  const [isOpen, setIsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    } else if (user) {
      fetchRubrics();
    }
  }, [user, loading, navigate]);

  const fetchRubrics = async () => {
    try {
      setFetching(true);
      // Fetches from the upcoming 'rubrics' table
      const { data, error } = await supabase
        .from('rubrics')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setRubrics(data || []);
    } catch (error: any) {
      console.error('Error fetching rubrics:', error);
      // We don't want to alert error right now because the table might not exist yet
    } finally {
      setFetching(false);
    }
  };

  const handleDelete = async (id: string, filePath: string) => {
    try {
      setDeleteLoading(id);
      
      const { error: storageError } = await supabase.storage
        .from('rubrics')
        .remove([filePath]);
        
      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from('rubrics')
        .delete()
        .eq('id', id);
        
      if (dbError) throw dbError;

      setRubrics(prev => prev.filter(r => r.id !== id));

      toast({
        title: "Success",
        description: "Rubric deleted successfully."
      });
      
    } catch (error: any) {
      console.error('Error deleting rubric:', error);
      toast({
        title: "Delete failed",
        description: error.message || "An error occurred while deleting.",
        variant: "destructive"
      });
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf') {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF file.",
          variant: "destructive"
        });
        e.target.value = '';
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Please enter a name for the rubric.', variant: 'destructive' });
      return;
    }
    if (!file) {
      toast({ title: 'Error', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }
    
    try {
      setUploading(true);
      
      const fileExt = file.name.split('.').pop();
      const filePath = `${user?.id}/${crypto.randomUUID()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('rubrics')
        .upload(filePath, file);
        
      if (uploadError) throw uploadError;
      
      const { data: publicUrlData } = supabase.storage
        .from('rubrics')
        .getPublicUrl(filePath);

      // Parse the PDF
      const formData = new FormData();
      formData.append('file', file);
      
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      
      let parsedText = '';
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/parse-rubric-pdf`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}` // if backend requires it in the future
          },
          body: formData
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.extractedText) {
            parsedText = data.extractedText;
          }
        }
      } catch (parseErr) {
        console.error('Failed to parse PDF text but continuing with upload:', parseErr);
      }
        
      const { error: dbError } = await supabase
        .from('rubrics')
        .insert({
          user_id: user?.id,
          name: name.trim(),
          file_url: publicUrlData.publicUrl,
          file_path: filePath,
          content: parsedText
        } as any); // using `as any` in case types.ts isn't fully synced
        
      if (dbError) throw dbError;
      
      toast({
        title: "Success",
        description: "Rubric successfully uploaded."
      });
      
      setIsOpen(false);
      setName('');
      setFile(null);
      fetchRubrics();
    } catch (error: any) {
      console.error('Error uploading rubric:', error);
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred while uploading. Ensure the DB is properly set up.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading || fetching) return <PageLoader />;

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
          
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button variant="hero">
                <Plus className="h-4 w-4 mr-2" />
                New Rubric
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload New Rubric</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Rubric Name</Label>
                  <Input 
                    id="name" 
                    placeholder="e.g. Midterm Programming Guidelines" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={uploading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="file">PDF File</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      id="file" 
                      type="file" 
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      disabled={uploading}
                    />
                  </div>
                </div>
                <Button type="submit" variant="hero" className="w-full mt-4" disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  {uploading ? 'Uploading...' : 'Save Rubric'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </motion.div>

        {rubrics.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No rubrics yet</h3>
              <p className="text-sm text-muted-foreground mb-0 text-center max-w-sm">
                Click on the "New Rubric" button at the top right to create grading criteria for AI-powered assessments.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rubrics.map((rubric) => (
              <Card key={rubric.id} className="hover:border-accent/50 transition-colors">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-accent/10 rounded-lg">
                        <FileText className="h-6 w-6 text-accent" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground line-clamp-1" title={rubric.name}>{rubric.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(rubric.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex gap-2">
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <a href={rubric.file_url} target="_blank" rel="noopener noreferrer">
                        View Document
                      </a>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive shrink-0" disabled={deleteLoading === rubric.id}>
                          {deleteLoading === rubric.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the rubric document and remove it from our servers.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDelete(rubric.id, rubric.file_path)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
