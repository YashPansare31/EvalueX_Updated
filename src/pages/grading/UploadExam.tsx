import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload, Loader2, FileText, X,
  Plus, Trash2, GripVertical, Save, BookOpen, Users,
  Check
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PageLoader } from '@/components/ui/PageLoader';

interface Question {
  id: string;
  text: string;
  points: number;
  modelAnswer?: string;
  question_label?: string;
}


interface Class {
  id: string;
  name: string;
}

export default function UploadExam() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { id: assignmentId } = useParams<{ id: string }>();
  const isEditMode = !!assignmentId;

  // Form state
  const [examTitle, setExamTitle] = useState('');
  const [examDescription, setExamDescription] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [questions, setQuestions] = useState<Question[]>([
    { id: '1', text: '', points: 10 }
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [isExtractingQuestions, setIsExtractingQuestions] = useState(false);
  const [isExtractingModelAnswers, setIsExtractingModelAnswers] = useState(false);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [rubricsList, setRubricsList] = useState<any[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState('');
  const [loadingRubrics, setLoadingRubrics] = useState(false);
  const [loadingExam, setLoadingExam] = useState(isEditMode);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    } else if (user) {
      fetchClasses();
      fetchRubrics();
      if (isEditMode && assignmentId) {
        fetchExamData(assignmentId);
      }
    }
  }, [user, loading, navigate]);

  const fetchExamData = async (id: string) => {
    try {
      setLoadingExam(true);

      // Fetch assignment
      const { data: assignment, error: aErr } = await supabase
        .from('assignments')
        .select('*')
        .eq('id', id)
        .single();
      if (aErr) throw aErr;

      setExamTitle(assignment.title || '');
      setExamDescription(assignment.description || '');
      setMaxScore(assignment.max_score || 100);

      // Fetch questions
      const { data: examQuestions, error: qErr } = await supabase
        .from('exam_questions')
        .select('*')
        .eq('assignment_id', id)
        .order('question_order');
      if (qErr) throw qErr;

      if (examQuestions && examQuestions.length > 0) {
        setQuestions(examQuestions.map(q => ({
          id: q.id,
          text: q.question_text || '',
          points: q.points || 10,
          modelAnswer: q.model_answer || undefined,
          question_label: q.question_label || undefined,
        })));
      }

      // Fetch assigned classes
      const { data: classLinks, error: clErr } = await supabase
        .from('assignment_classes')
        .select('class_id')
        .eq('assignment_id', id);
      if (clErr) throw clErr;
      setSelectedClassIds((classLinks || []).map(c => c.class_id));

      // Fetch rubric
      const { data: rubric, error: rErr } = await supabase
        .from('exam_rubrics')
        .select('*')
        .eq('assignment_id', id)
        .maybeSingle();
      if (!rErr && rubric) {
        // We'll set the rubric id after rubrics list loads
        // Store rubric content temporarily to match after rubricsList is ready
        setSelectedRubricId('__pending__' + rubric.rubric_content);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load exam data');
    } finally {
      setLoadingExam(false);
    }
  };

  const fetchRubrics = async () => {
    try {
      setLoadingRubrics(true);
      const { data, error } = await supabase
        .from('rubrics')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRubricsList(data || []);

      // Resolve pending rubric selection if in edit mode
      setSelectedRubricId(prev => {
        if (prev.startsWith('__pending__')) {
          const content = prev.replace('__pending__', '');
          const matched = (data || []).find(r => r.content === content);
          return matched ? matched.id : '';
        }
        return prev;
      });
    } catch (error) {
      console.error('Error fetching rubrics:', error);
    } finally {
      setLoadingRubrics(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setAllClasses(data || []);
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoadingClasses(false);
    }
  };


  // Question handlers
  const addQuestion = () => {
    setQuestions(prev => [
      ...prev,
      { id: crypto.randomUUID(), text: '', points: 10 }
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

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/extract-questions-pdf`, {
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
        // Map data to the Question type — include question_label so it gets saved to DB
        const newQuestions = data.questions.map((q: any) => ({
          id: crypto.randomUUID(),
          text: q.text || '',
          points: q.points || 10,
          question_label: q.question_label || undefined,
        }));

        // Remove empty first question if replacing it
        setQuestions(prev => {
          if (prev.length === 1 && prev[0].text === '') {
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

  const handleModelAnswersPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a valid PDF file');
      return;
    }

    if (questions.length === 0 || (questions.length === 1 && questions[0].text === '')) {
      toast.error('Please add or extract questions first');
      return;
    }

    setIsExtractingModelAnswers(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      // We pass the current questions array to Gemini so it knows what to map answers to
      formData.append('questions', JSON.stringify(questions));

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/extract-model-answers-pdf`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to extract model answers');
      }

      const data = await response.json();

      if (data.success && data.modelAnswers && data.modelAnswers.length > 0) {
        setQuestions(prev => {
          return prev.map(q => {
            // Find the model answer that matches this question's text
            const match = data.modelAnswers.find((ma: any) => ma.question_text === q.text);
            if (match && match.model_answer) {
              return { ...q, modelAnswer: match.model_answer };
            }
            return q;
          });
        });
        toast.success(`Successfully extracted model answers`);
      } else {
        toast.error('No model answers were mapped from the PDF');
      }
    } catch (error: any) {
      console.error('Extraction error:', error);
      toast.error(error.message || 'Error parsing Model Answers PDF');
    } finally {
      setIsExtractingModelAnswers(false);
      // Reset input
      if (e.target) e.target.value = '';
    }
  };

  // Save or update exam template
  const handleSave = async () => {
    if (!examTitle.trim()) {
      toast.error('Please enter an exam title');
      return;
    }

    if (!user) return;

    setIsSaving(true);
    try {
      let targetId: string;

      if (isEditMode && assignmentId) {
        // Update existing assignment
        const { error: updateError } = await supabase
          .from('assignments')
          .update({
            title: examTitle,
            description: examDescription,
            max_score: maxScore
          })
          .eq('id', assignmentId);

        if (updateError) throw updateError;
        targetId = assignmentId;

        // Remove old class mappings, questions, model_answers, and rubric then re-insert
        await supabase.from('assignment_classes').delete().eq('assignment_id', targetId);
        // Get existing question ids before deleting
        const { data: oldQuestions } = await supabase
          .from('exam_questions')
          .select('id')
          .eq('assignment_id', targetId);
        if (oldQuestions && oldQuestions.length > 0) {
          const oldIds = oldQuestions.map(q => q.id);
          await supabase.from('model_answers').delete().in('question_id', oldIds);
        }
        await supabase.from('exam_questions').delete().eq('assignment_id', targetId);
        await supabase.from('exam_rubrics').delete().eq('assignment_id', targetId);
      } else {
        // Create new assignment
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
        targetId = assignment.id;
      }

      // Attach classes
      if (selectedClassIds.length > 0) {
        const classMappings = selectedClassIds.map(classId => ({
          assignment_id: targetId,
          class_id: classId
        }));

        const { error: classMappingError } = await supabase
          .from('assignment_classes')
          .insert(classMappings);

        if (classMappingError) throw classMappingError;
      }

      // Save questions if any have content
      const validQuestions = questions.filter(q => q.text.trim());
      if (validQuestions.length > 0) {
        const questionsToInsert = validQuestions.map((q, index) => ({
          assignment_id: targetId,
          question_text: q.text,
          points: q.points,
          model_answer: q.modelAnswer || null,
          question_order: index,
          question_label: q.question_label || null,
        }));

        const { data: insertedQuestions, error: questionsError } = await supabase
          .from('exam_questions')
          .insert(questionsToInsert)
          .select();

        if (questionsError) throw questionsError;

        // Save to model_answers table for the QCP pipeline
        const modelAnswersToInsert = validQuestions.map((q, i) => {
          if (!q.modelAnswer?.trim()) return null;
          const insertedQ = insertedQuestions?.find(iq => iq.question_text === q.text && iq.question_order === i);
          if (!insertedQ) return null;
          return {
            assignment_id: targetId,
            question_id: insertedQ.id,
            answer_text: q.modelAnswer.trim()
          };
        }).filter(Boolean);

        if (modelAnswersToInsert.length > 0) {
          const { error: maError } = await supabase
            .from('model_answers')
            .insert(modelAnswersToInsert);

          if (maError) throw maError;
        }
      }

      // Save rubric link if selected
      if (selectedRubricId && !selectedRubricId.startsWith('__pending__')) {
        const selectedRubric = rubricsList.find(r => r.id === selectedRubricId);
        if (selectedRubric) {
          const { error: rubricError } = await supabase
            .from('exam_rubrics')
            .insert({
              assignment_id: targetId,
              rubric_content: selectedRubric.content || ''
            });

          if (rubricError) throw rubricError;
        }
      }

      toast.success(isEditMode ? 'Exam updated successfully!' : 'Exam template saved successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error saving exam:', error);
      toast.error(error.message || 'Failed to save exam template');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleClass = (classId: string) => {
    setSelectedClassIds(prev => 
      prev.includes(classId) 
        ? prev.filter(id => id !== classId)
        : [...prev, classId]
    );
  };




  if (loading || loadingExam) return <PageLoader />;

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
            <h1 className="text-3xl font-bold text-foreground mb-1">
              {isEditMode ? 'Edit Exam' : 'Exam Setup'}
            </h1>
            <p className="text-muted-foreground">
              {isEditMode ? 'Update exam details, questions and rubric' : 'Create exam templates with questions and rubrics'}
            </p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEditMode ? 'Update Exam' : 'Save Template'}
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
                          type="number"
                          id="maxScore"
                          placeholder="100"
                          value={maxScore || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMaxScore(val === '' ? 0 : parseInt(val));
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <Users className="h-4 w-4 text-accent" />
                        Attach to Classes
                      </Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {loadingClasses ? (
                          <div className="col-span-full flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : allClasses.length > 0 ? (
                          allClasses.map((cls) => (
                            <div
                              key={cls.id}
                              onClick={() => toggleClass(cls.id)}
                              className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                selectedClassIds.includes(cls.id)
                                  ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                                  : 'border-border hover:border-accent/40 bg-card'
                              }`}
                            >
                              <Checkbox
                                id={`class-${cls.id}`}
                                checked={selectedClassIds.includes(cls.id)}
                                onCheckedChange={() => toggleClass(cls.id)}
                                className="border-accent data-[state=checked]:bg-accent"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <Label
                                htmlFor={`class-${cls.id}`}
                                className="flex-1 font-medium cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {cls.name}
                              </Label>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-full p-4 rounded-lg border border-dashed text-center">
                            <p className="text-sm text-muted-foreground mb-2">No classes found</p>
                            <Button
                              variant="link"
                              size="sm"
                              className="text-accent underline"
                              onClick={() => navigate('/classes')}
                            >
                              Create your first class in the Classes tab
                            </Button>
                          </div>
                        )}
                      </div>
                      {selectedClassIds.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="text-xs text-muted-foreground w-full">Selected:</span>
                          {selectedClassIds.map(id => {
                            const cls = allClasses.find(c => c.id === id);
                            return cls ? (
                              <Badge key={id} variant="secondary" className="bg-accent/10 text-accent border-accent/20">
                                {cls.name}
                                <X 
                                  className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleClass(id);
                                  }} 
                                />
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      )}
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
                  <CardDescription>Add questions with point values</CardDescription>
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
                                  placeholder="10"
                                  value={question.points || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    updateQuestion(question.id, 'points', val === '' ? 0 : parseInt(val));
                                  }}
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Model Answer (Optional)</Label>
                              <Textarea
                                placeholder="Enter the expected model answer..."
                                value={question.modelAnswer || ''}
                                onChange={(e) => updateQuestion(question.id, 'modelAnswer', e.target.value)}
                                rows={2}
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <input
                        id="questions-pdf-upload"
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handleQuestionsPdfUpload}
                      />
                      <Button variant="outline" onClick={() => document.getElementById('questions-pdf-upload')?.click()} disabled={isExtractingQuestions || isExtractingModelAnswers} className="w-full gap-2">
                        {isExtractingQuestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {isExtractingQuestions ? 'Extracting...' : 'Upload Questions (PDF)'}
                      </Button>
                    </div>
                    <div>
                      <input
                        id="model-answers-pdf-upload"
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handleModelAnswersPdfUpload}
                      />
                      <Button variant="outline" onClick={() => document.getElementById('model-answers-pdf-upload')?.click()} disabled={isExtractingModelAnswers || isExtractingQuestions} className="w-full gap-2">
                        {isExtractingModelAnswers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {isExtractingModelAnswers ? 'Extracting...' : 'Upload Model Answers (PDF)'}
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
                  <CardDescription>Select a grading rubric from your previously uploaded rubrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Label>Select Rubric</Label>
                    {loadingRubrics ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading rubrics...
                      </div>
                    ) : rubricsList.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rubricsList.map((rubric) => (
                          <div
                            key={rubric.id}
                            onClick={() => setSelectedRubricId(rubric.id)}
                            className={`flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-all ${
                              selectedRubricId === rubric.id
                                ? 'border-accent bg-accent/5 ring-1 ring-accent/20'
                                : 'border-border hover:border-accent/40 bg-card'
                            }`}
                          >
                            <Checkbox
                              id={`rubric-${rubric.id}`}
                              checked={selectedRubricId === rubric.id}
                              onCheckedChange={() => setSelectedRubricId(rubric.id)}
                              className="border-accent data-[state=checked]:bg-accent mt-0.5"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1">
                              <Label
                                htmlFor={`rubric-${rubric.id}`}
                                className="font-medium cursor-pointer block"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {rubric.name}
                              </Label>
                              <a 
                                href={rubric.file_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-accent hover:underline mt-1 inline-block"
                                onClick={e => e.stopPropagation()}
                              >
                                View PDF
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 border border-dashed rounded-lg bg-muted/20 text-center">
                        <p className="text-sm text-muted-foreground mb-2">No rubrics found</p>
                        <Button variant="link" onClick={() => navigate('/grading/rubrics')} className="text-accent h-auto p-0">
                          Go to Rubrics tab to upload one
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        </motion.div>
      </main>
    </div>
  );
}
