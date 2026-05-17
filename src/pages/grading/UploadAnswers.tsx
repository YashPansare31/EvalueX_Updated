import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Upload, FileUp, Loader2, FileText, X, CheckCircle2, 
  Image as ImageIcon, File, AlertCircle, Eye, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { extractAnswers, gradeSubmission } from '@/integrations/api-client';
import { formatFileSize } from '@/utils/helpers';
import { PageLoader } from '@/components/ui/PageLoader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  status: 'pending' | 'uploading' | 'extracting' | 'processing' | 'complete' | 'error';
  progress: number;
  preview?: string;
  errorMessage?: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  max_score: number;
}

export default function UploadAnswers() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [autoGrade, setAutoGrade] = useState(false);
  const [gradingProgress, setGradingProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  // Fetch assignments
  useEffect(() => {
    if (user) {
      fetchAssignments();
    }
  }, [user]);

  const fetchAssignments = async () => {
    const { data, error } = await supabase
      .from('assignments')
      .select('id, title, description, max_score')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setAssignments(data);
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      handleFiles(files);
    }
  };

  const handleFiles = (files: File[]) => {
    const validTypes = [
      'application/pdf'
    ];
    
    const newFiles: UploadedFile[] = [];
    
    files.forEach(file => {
      if (!validTypes.includes(file.type)) {
        toast.error(`${file.name} is not a supported file type`);
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 10MB limit`);
        return;
      }

      const newFile: UploadedFile = {
        id: crypto.randomUUID(),
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'pending',
        progress: 0
      };

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setUploadedFiles(prev => 
            prev.map(f => f.id === newFile.id ? { ...f, preview: e.target?.result as string } : f)
          );
        };
        reader.readAsDataURL(file);
      }
      
      newFiles.push(newFile);
    });
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Convert a single file to an array of base64 page strings
  // For images: one page. For PDFs we treat the whole PDF as one base64 blob
  // (the backend Gemini call handles multi-page PDFs natively).
  const fileToPagesBase64 = (file: File): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data URL prefix — backend expects raw base64
        const base64 = result.split(',')[1];
        resolve([base64]);  // single-page or single-blob
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleAutoGradeSubmission = async (submissionId: string, assignmentId: string): Promise<boolean> => {
    try {
      const data = await gradeSubmission(submissionId, '', '', null, 0, assignmentId);
      if (data?.error) throw new Error(data.error);
      return true;
    } catch (error) {
      console.error('Grading error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to grade submission');
      return false;
    }
  };

  const processFiles = async () => {
    if (!selectedAssignment) {
      toast.error('Please select an examination first');
      return;
    }

    if (uploadedFiles.length === 0) {
      toast.error('Please upload some files first');
      return;
    }

    setIsProcessing(true);
    const submissionsToGrade: { id: string; assignmentId: string }[] = [];

    // Process files sequentially
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];

      // ── Step A: Mark as uploading ────────────────────────────────────────
      setUploadedFiles(prev =>
        prev.map(f => f.id === file.id ? { ...f, status: 'uploading', progress: 10 } : f)
      );

      let submissionId: string | null = null;

      try {
        // ── Step B: Save Supabase submission row ────────────────────────────
        const studentName = file.name.replace(/\.[^/.]+$/, '');

        const { data: submission, error } = await supabase.from('submissions').insert({
          assignment_id: selectedAssignment,
          student_name: studentName,
          content: '',           // content is no longer used for grading
          grading_status: 'pending',
        }).select('id').single();

        if (error || !submission) throw error || new Error('Failed to create submission row');
        submissionId = submission.id;

        setUploadedFiles(prev =>
          prev.map(f => f.id === file.id ? { ...f, progress: 30 } : f)
        );

        // ── Step C: Extract QCP answers from the answer sheet ────────────────
        setUploadedFiles(prev =>
          prev.map(f => f.id === file.id ? { ...f, status: 'extracting', progress: 40 } : f)
        );

        const pages = await fileToPagesBase64(file.file);
        const extractResult = await extractAnswers(
          submissionId,
          selectedAssignment,
          pages,
          file.type
        );

        if (extractResult?.partial_extraction) {
          toast.warning(
            `Partial extraction for ${file.name}: ${extractResult.submission_answers_count}/${extractResult.expected_count} questions extracted. Grading may be incomplete.`
          );
        }

        if (!extractResult?.submission_answers_count || extractResult.submission_answers_count === 0) {
          throw new Error(`Answer extraction returned 0 rows for ${file.name}. Cannot grade.`);
        }

        setUploadedFiles(prev =>
          prev.map(f => f.id === file.id ? { ...f, progress: 80 } : f)
        );

        // ── Step D: Mark as complete ─────────────────────────────────────────
        setUploadedFiles(prev =>
          prev.map(f => f.id === file.id ? { ...f, status: 'complete', progress: 100 } : f)
        );

        if (autoGrade) {
          submissionsToGrade.push({ id: submissionId, assignmentId: selectedAssignment });
        }

      } catch (error) {
        console.error('Error processing file:', file.name, error);
        setUploadedFiles(prev =>
          prev.map(f => f.id === file.id ? {
            ...f,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Processing failed',
          } : f)
        );
      }
    }

    const successCount = uploadedFiles.filter(f => f.status === 'complete').length;
    if (successCount > 0) {
      toast.success(`Successfully processed ${successCount} file(s) — answers extracted and ready for grading`);
    }

    // ── Auto-grade: call grade-submission sequentially ─────────────────────
    if (autoGrade && submissionsToGrade.length > 0) {
      setGradingProgress({ current: 0, total: submissionsToGrade.length });

      for (let i = 0; i < submissionsToGrade.length; i++) {
        setGradingProgress({ current: i + 1, total: submissionsToGrade.length });
        const sub = submissionsToGrade[i];
        await handleAutoGradeSubmission(sub.id, sub.assignmentId);
        // Small delay between grading requests
        if (i < submissionsToGrade.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setGradingProgress(null);
      toast.success(`AI grading complete for ${submissionsToGrade.length} submission(s)`);
    }

    setIsProcessing(false);
  };


  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon;
    if (type === 'application/pdf') return FileText;
    return File;
  };

  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'complete': return 'text-green-500';
      case 'error': return 'text-destructive';
      case 'uploading':
      case 'extracting':
      case 'processing': return 'text-accent';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusText = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'uploading': return 'Uploading...';
      case 'extracting': return 'Extracting text (OCR)...';
      case 'processing': return 'Saving...';
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      default: return status;
    }
  };

  const overallProgress = uploadedFiles.length > 0
    ? uploadedFiles.reduce((acc, f) => acc + f.progress, 0) / uploadedFiles.length
    : 0;

  const completedCount = uploadedFiles.filter(f => f.status === 'complete').length;
  const errorCount = uploadedFiles.filter(f => f.status === 'error').length;

  if (loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <main className="flex-1 ml-[260px] p-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-foreground mb-1">Upload Answers</h1>
          <p className="text-muted-foreground">Batch upload student answer sheets for AI grading</p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Upload Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="lg:col-span-2 space-y-6"
          >
            {/* Assignment Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Select Examination</CardTitle>
                <CardDescription>Choose which examination these answer sheets belong to</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an examination..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assignments.map(assignment => (
                      <SelectItem key={assignment.id} value={assignment.id}>
                        {assignment.title} (Max: {assignment.max_score} pts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignments.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    No examinations found. <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/upload')}>Create one first</Button>
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Dropzone */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Answer Sheets
                </CardTitle>
                <CardDescription>Drag and drop or click to upload PDFs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div 
                  className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
                    isDragging 
                      ? 'border-accent bg-accent/5 scale-[1.02]' 
                      : 'border-border hover:border-accent/50 hover:bg-muted/30'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('answer-file-input')?.click()}
                >
                  <input
                    id="answer-file-input"
                    type="file"
                    multiple
                    accept=".pdf"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                  <motion.div
                    animate={{ scale: isDragging ? 1.05 : 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
                      isDragging ? 'bg-accent/20' : 'bg-muted'
                    }`}>
                      <FileUp className={`h-8 w-8 ${isDragging ? 'text-accent' : 'text-muted-foreground'}`} />
                    </div>
                    <p className="text-lg font-medium text-foreground mb-2">
                      {isDragging ? 'Drop files here' : 'Drag & drop answer sheets'}
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
                    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-4 w-4" /> PDF
                      </span>
                      <span>Max 10MB each</span>
                    </div>
                  </motion.div>
                </div>

                {/* Overall Progress */}
                {uploadedFiles.length > 0 && isProcessing && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Overall Progress</span>
                      <span className="text-muted-foreground">{Math.round(overallProgress)}%</span>
                    </div>
                    <Progress value={overallProgress} className="h-2" />
                  </div>
                )}

                {/* File List with Thumbnails */}
                <AnimatePresence>
                  {uploadedFiles.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <Label>Uploaded Files ({uploadedFiles.length})</Label>
                        {completedCount > 0 && (
                          <span className="text-sm text-green-600">
                            {completedCount} completed
                          </span>
                        )}
                      </div>
                      <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
                        {uploadedFiles.map(file => {
                          const FileIcon = getFileIcon(file.type);
                          
                          return (
                            <motion.div
                              key={file.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border"
                            >
                              {/* Thumbnail or Icon */}
                              <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                                {file.preview ? (
                                  <img 
                                    src={file.preview} 
                                    alt={file.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <FileIcon className="h-6 w-6 text-accent" />
                                )}
                              </div>
                              
                              {/* File Info */}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{file.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{formatFileSize(file.size)}</span>
                                  <span>•</span>
                                  <span className={getStatusColor(file.status)}>
                                    {file.status === 'pending' && 'Ready'}
                                    {file.status === 'uploading' && 'Uploading...'}
                                    {file.status === 'extracting' && 'Extracting answers (QCP)...'}
                                    {file.status === 'processing' && 'Processing...'}
                                    {file.status === 'complete' && 'Complete'}
                                    {file.status === 'error' && file.errorMessage}
                                  </span>
                                </div>
                                {/* Individual Progress Bar */}
                                {(file.status === 'uploading' || file.status === 'extracting' || file.status === 'processing') && (
                                  <Progress value={file.progress} className="h-1 mt-2" />
                                )}
                              </div>

                              {/* Status Icon & Actions */}
                              <div className="flex items-center gap-2">
                                {file.preview && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewFile(file);
                                    }}
                                    className="h-8 w-8"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                )}
                                {file.status === 'uploading' || file.status === 'extracting' || file.status === 'processing' ? (
                                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                                ) : file.status === 'complete' ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                                ) : file.status === 'error' ? (
                                  <AlertCircle className="h-5 w-5 text-destructive" />
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeFile(file.id)}
                                  disabled={isProcessing}
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </motion.div>

          {/* Sidebar Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="space-y-6"
          >
            {/* Upload Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upload Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-foreground">{uploadedFiles.length}</p>
                    <p className="text-xs text-muted-foreground">Total Files</p>
                  </div>
                  <div className="text-center p-4 bg-green-500/10 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{completedCount}</p>
                    <p className="text-xs text-muted-foreground">Processed</p>
                  </div>
                </div>
                {errorCount > 0 && (
                  <div className="text-center p-4 bg-destructive/10 rounded-lg">
                    <p className="text-2xl font-bold text-destructive">{errorCount}</p>
                    <p className="text-xs text-muted-foreground">Errors</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                {/* Auto-grade checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="autoGrade" 
                    checked={autoGrade}
                    onCheckedChange={(checked) => setAutoGrade(checked === true)}
                    disabled={isProcessing}
                  />
                  <div className="flex-1">
                    <Label 
                      htmlFor="autoGrade" 
                      className="text-sm font-medium cursor-pointer flex items-center gap-2"
                    >
                      <Sparkles className="h-4 w-4 text-accent" />
                      Auto-grade with AI
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically grade submissions after upload
                    </p>
                  </div>
                </div>

                {/* Grading progress */}
                {gradingProgress && (
                  <div className="p-3 bg-accent/10 rounded-lg border border-accent/20">
                    <div className="flex items-center gap-2 text-sm font-medium text-accent mb-2">
                      <Sparkles className="h-4 w-4 animate-pulse" />
                      AI Grading in Progress
                    </div>
                    <Progress 
                      value={(gradingProgress.current / gradingProgress.total) * 100} 
                      className="h-2 mb-1" 
                    />
                    <p className="text-xs text-muted-foreground">
                      {gradingProgress.current} of {gradingProgress.total} submissions
                    </p>
                  </div>
                )}

                <Button 
                  className="w-full gap-2" 
                  onClick={processFiles}
                  disabled={isProcessing || uploadedFiles.length === 0 || !selectedAssignment}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {gradingProgress ? 'Grading...' : 'Processing...'}
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      {autoGrade ? 'Upload & Grade All' : 'Process All Files'}
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setUploadedFiles([])}
                  disabled={isProcessing || uploadedFiles.length === 0}
                >
                  Clear All
                </Button>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-accent">•</span>
                    Name files with student names for auto-detection
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent">•</span>
                    Exam questions must be set up before uploading answer sheets
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent">•</span>
                    Each file is mapped per-question using the QCP pipeline
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent">•</span>
                    Ensure scans are clear and well-lit for best extraction accuracy
                  </li>
                </ul>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Image Preview Dialog */}
        <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{previewFile?.name}</DialogTitle>
            </DialogHeader>
            {previewFile?.preview && (
              <div className="flex items-center justify-center">
                <img 
                  src={previewFile.preview} 
                  alt={previewFile.name}
                  className="max-h-[70vh] object-contain rounded-lg"
                />
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
