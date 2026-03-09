import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload, FileUp, Loader2, FileText, X, CheckCircle2,
  Plus, Trash2, GripVertical, Save, BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface Question {
  id: string;
  text: string;
  points: number;
  modelAnswer: string;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'uploading' | 'complete' | 'error';
}

export default function UploadExam() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Form state
  const [examTitle, setExamTitle] = useState('');
  const [examDescription, setExamDescription] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [rubricContent, setRubricContent] = useState('');
  const [questions, setQuestions] = useState<Question[]>([
    { id: '1', text: '', points: 10, modelAnswer: '' }
  ]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExtractingQuestions, setIsExtractingQuestions] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

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
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];

    files.forEach(file => {
      if (!validTypes.includes(file.type)) {
        toast.error(`${file.name} is not a supported file type`);
        return;
      }

      const newFile: UploadedFile = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'uploading'
      };

      setUploadedFiles(prev => [...prev, newFile]);

      // Simulate upload - in production, this would upload to storage
      setTimeout(() => {
        setUploadedFiles(prev =>
          prev.map(f => f.id === newFile.id ? { ...f, status: 'complete' } : f)
        );
      }, 1500);
    });
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Question handlers
  const addQuestion = () => {
    setQuestions(prev => [
      ...prev,
      { id: crypto.randomUUID(), text: '', points: 10, modelAnswer: '' }
    ]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length > 1) {
      setQuestions(prev => prev.filter(q => q.id !== id));
    }
  };

  const updateQuestion = (id: string, field: keyof Question, value: string | number) => {
    setQuestions(prev =>
      prev.map(q => q.id === id ? { ...q, [field]: value } : q)
    );
  };

  const handleQuestionsPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a valid PDF file');
      return;
    }

    setIsExtractingQuestions(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Get valid auth token
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch('http://localhost:3001/api/extract-questions-pdf', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to extract questions');
      }

      const data = await response.json();

      if (data.success && data.questions && data.questions.length > 0) {
        // Map data to the Question type
        const newQuestions = data.questions.map((q: any) => ({
          id: crypto.randomUUID(),
          text: q.text || '',
          points: q.points || 10,
          modelAnswer: q.modelAnswer || ''
        }));

        // Remove empty first question if replacing it
        setQuestions(prev => {
          if (prev.length === 1 && prev[0].text === '' && prev[0].modelAnswer === '') {
            return newQuestions;
          }
          return [...prev, ...newQuestions];
        });

        toast.success(`Successfully extracted ${newQuestions.length} questions`);
      } else {
        toast.error('No questions were found in the PDF');
      }
    } catch (error: any) {
      console.error('Extraction error:', error);
      toast.error(error.message || 'Error parsing PDF');
    } finally {
      setIsExtractingQuestions(false);
      // Reset input
      if (e.target) e.target.value = '';
    }
  };

  // Save exam template
  const handleSave = async () => {
    if (!examTitle.trim()) {
      toast.error('Please enter an exam title');
      return;
    }

    if (!user) return;

    setIsSaving(true);
    try {
      // First create the assignment
      const { data: assignment, error: assignmentError } = await supabase
        .from('assignments')
        .insert({
          user_id: user.id,
          title: examTitle,
          description: examDescription,
          max_score: maxScore
        })
        .select()
        .single();

      if (assignmentError) throw assignmentError;

      // Save questions if any have content
      const validQuestions = questions.filter(q => q.text.trim());
      if (validQuestions.length > 0) {
        const questionsToInsert = validQuestions.map((q, index) => ({
          assignment_id: assignment.id,
          question_text: q.text,
          points: q.points,
          model_answer: q.modelAnswer || null,
          question_order: index
        }));

        const { error: questionsError } = await supabase
          .from('exam_questions')
          .insert(questionsToInsert);

        if (questionsError) throw questionsError;
      }

      // Save rubric if content exists
      if (rubricContent.trim()) {
        const { error: rubricError } = await supabase
          .from('exam_rubrics')
          .insert({
            assignment_id: assignment.id,
            rubric_content: rubricContent
          });

        if (rubricError) throw rubricError;
      }

      toast.success('Exam template saved successfully!');
      navigate('/dashboard');
    } catch (error) {
      console.error('Error saving exam:', error);
      toast.error('Failed to save exam template');
    } finally {
      setIsSaving(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Quill editor modules
  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      [{ 'indent': '-1' }, { 'indent': '+1' }],
      ['link'],
      ['clean']
    ],
  };

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
            <h1 className="text-3xl font-bold text-foreground mb-1">Exam Setup</h1>
            <p className="text-muted-foreground">Create exam templates with questions, rubrics, and model answers</p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Template
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Tabs defaultValue="details" className="space-y-6">
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="details" className="gap-2">
                <FileText className="h-4 w-4" />
                Exam Details
              </TabsTrigger>
              <TabsTrigger value="questions" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Questions
              </TabsTrigger>
              <TabsTrigger value="rubric" className="gap-2">
                <FileText className="h-4 w-4" />
                Rubric
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-2">
                <Upload className="h-4 w-4" />
                Upload Files
              </TabsTrigger>
            </TabsList>

            {/* Exam Details Tab */}
            <TabsContent value="details" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Set up the basic details for your exam</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Exam Title *</Label>
                      <Input
                        id="title"
                        placeholder="e.g., Midterm Exam - Biology 101"
                        value={examTitle}
                        onChange={(e) => setExamTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Provide a brief description of the exam..."
                        value={examDescription}
                        onChange={(e) => setExamDescription(e.target.value)}
                        rows={4}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="maxScore">Maximum Score</Label>
                        <Input
                          id="maxScore"
                          type="number"
                          min={1}
                          value={maxScore}
                          onChange={(e) => setMaxScore(parseInt(e.target.value) || 100)}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Questions Tab */}
            <TabsContent value="questions" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Exam Questions</CardTitle>
                  <CardDescription>Add questions with point values and model answers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {questions.map((question, index) => (
                      <motion.div
                        key={question.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border border-border rounded-lg p-4 space-y-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex items-center gap-2 pt-2 text-muted-foreground">
                            <GripVertical className="h-4 w-4 cursor-grab" />
                            <span className="font-medium text-sm">Q{index + 1}</span>
                          </div>
                          <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                              <Label>Question Text</Label>
                              <Textarea
                                placeholder="Enter the question..."
                                value={question.text}
                                onChange={(e) => updateQuestion(question.id, 'text', e.target.value)}
                                rows={2}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Points</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={question.points}
                                  onChange={(e) => updateQuestion(question.id, 'points', parseInt(e.target.value) || 1)}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Model Answer</Label>
                              <Textarea
                                placeholder="Enter the expected/model answer..."
                                value={question.modelAnswer}
                                onChange={(e) => updateQuestion(question.id, 'modelAnswer', e.target.value)}
                                rows={3}
                              />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeQuestion(question.id)}
                            disabled={questions.length === 1}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input
                        id="questions-pdf-upload"
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handleQuestionsPdfUpload}
                      />
                      <Button variant="outline" onClick={() => document.getElementById('questions-pdf-upload')?.click()} disabled={isExtractingQuestions} className="w-full gap-2">
                        {isExtractingQuestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {isExtractingQuestions ? 'Extracting...' : 'Upload Questions from PDF'}
                      </Button>
                    </div>
                    <Button variant="outline" onClick={addQuestion} className="w-full gap-2">
                      <Plus className="h-4 w-4" />
                      Add Question
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Rubric Tab */}
            <TabsContent value="rubric" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Grading Rubric</CardTitle>
                  <CardDescription>Define your grading criteria using the rich text editor</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="min-h-[400px] border border-border rounded-lg overflow-hidden">
                    <ReactQuill
                      theme="snow"
                      value={rubricContent}
                      onChange={setRubricContent}
                      modules={quillModules}
                      placeholder="Create your grading rubric here...

Example:
- Excellent (90-100%): Complete and accurate answer with clear reasoning
- Good (75-89%): Mostly correct with minor errors
- Satisfactory (60-74%): Partial understanding demonstrated
- Needs Improvement (below 60%): Significant gaps in understanding"
                      className="h-[350px]"
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Upload Tab */}
            <TabsContent value="upload" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upload Exam Files</CardTitle>
                  <CardDescription>Upload exam papers, answer sheets, or supporting documents</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div
                    className={`border-2 border-dashed rounded-lg p-12 text-center transition-all cursor-pointer ${isDragging
                        ? 'border-accent bg-accent/5'
                        : 'border-border hover:border-accent/50'
                      }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <input
                      id="file-input"
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      onChange={handleFileInput}
                    />
                    <motion.div
                      animate={{ scale: isDragging ? 1.05 : 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <FileUp className={`h-12 w-12 mx-auto mb-4 ${isDragging ? 'text-accent' : 'text-muted-foreground'}`} />
                      <p className="text-lg font-medium text-foreground mb-2">
                        {isDragging ? 'Drop files here' : 'Drag & drop files here'}
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
                      <p className="text-xs text-muted-foreground">Supports PDF, DOCX, TXT files (max 10MB each)</p>
                    </motion.div>
                  </div>

                  {/* Uploaded files list */}
                  <AnimatePresence>
                    {uploadedFiles.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2"
                      >
                        <Label>Uploaded Files</Label>
                        <div className="space-y-2">
                          {uploadedFiles.map(file => (
                            <motion.div
                              key={file.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 20 }}
                              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                            >
                              <FileText className="h-8 w-8 text-accent" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                              </div>
                              {file.status === 'uploading' && (
                                <Loader2 className="h-5 w-5 animate-spin text-accent" />
                              )}
                              {file.status === 'complete' && (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFile(file.id)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
    </div>
  );
}
