-- Create table for exam questions
CREATE TABLE public.exam_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  model_answer TEXT,
  question_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for exam rubrics
CREATE TABLE public.exam_rubrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  rubric_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_rubrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for exam_questions (access through assignment ownership)
CREATE POLICY "Users can view questions for their assignments"
ON public.exam_questions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = exam_questions.assignment_id
    AND assignments.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create questions for their assignments"
ON public.exam_questions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = exam_questions.assignment_id
    AND assignments.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update questions for their assignments"
ON public.exam_questions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = exam_questions.assignment_id
    AND assignments.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete questions for their assignments"
ON public.exam_questions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = exam_questions.assignment_id
    AND assignments.user_id = auth.uid()
  )
);

-- RLS policies for exam_rubrics (access through assignment ownership)
CREATE POLICY "Users can view rubrics for their assignments"
ON public.exam_rubrics
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = exam_rubrics.assignment_id
    AND assignments.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create rubrics for their assignments"
ON public.exam_rubrics
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = exam_rubrics.assignment_id
    AND assignments.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update rubrics for their assignments"
ON public.exam_rubrics
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = exam_rubrics.assignment_id
    AND assignments.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete rubrics for their assignments"
ON public.exam_rubrics
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.assignments
    WHERE assignments.id = exam_rubrics.assignment_id
    AND assignments.user_id = auth.uid()
  )
);

-- Add update triggers for updated_at columns
CREATE TRIGGER update_exam_questions_updated_at
  BEFORE UPDATE ON public.exam_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exam_rubrics_updated_at
  BEFORE UPDATE ON public.exam_rubrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();