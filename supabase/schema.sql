-- ============================================================
-- EvalueX Complete Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- This is idempotent - safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. UTILITY FUNCTIONS
-- ============================================================

-- Function to auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 2. PROFILES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  school_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger for auto-updating timestamps
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. ASSIGNMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  max_score INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assignments' AND policyname = 'Users can view their own assignments'
  ) THEN
    CREATE POLICY "Users can view their own assignments"
    ON public.assignments FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assignments' AND policyname = 'Users can create their own assignments'
  ) THEN
    CREATE POLICY "Users can create their own assignments"
    ON public.assignments FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assignments' AND policyname = 'Users can update their own assignments'
  ) THEN
    CREATE POLICY "Users can update their own assignments"
    ON public.assignments FOR UPDATE
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'assignments' AND policyname = 'Users can delete their own assignments'
  ) THEN
    CREATE POLICY "Users can delete their own assignments"
    ON public.assignments FOR DELETE
    USING (auth.uid() = user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_assignments_updated_at ON public.assignments;
CREATE TRIGGER update_assignments_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. SUBMISSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  content TEXT NOT NULL,
  ai_feedback TEXT,
  ai_score INTEGER,
  final_score INTEGER,
  graded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'submissions' AND policyname = 'Users can view submissions for their assignments'
  ) THEN
    CREATE POLICY "Users can view submissions for their assignments"
    ON public.submissions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = submissions.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'submissions' AND policyname = 'Users can create submissions for their assignments'
  ) THEN
    CREATE POLICY "Users can create submissions for their assignments"
    ON public.submissions FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = submissions.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'submissions' AND policyname = 'Users can update submissions for their assignments'
  ) THEN
    CREATE POLICY "Users can update submissions for their assignments"
    ON public.submissions FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = submissions.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'submissions' AND policyname = 'Users can delete submissions for their assignments'
  ) THEN
    CREATE POLICY "Users can delete submissions for their assignments"
    ON public.submissions FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = submissions.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- ============================================================
-- 5. EXAM QUESTIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  model_answer TEXT,
  question_order INTEGER NOT NULL DEFAULT 0,
  optional_group TEXT,
  question_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_questions' AND policyname = 'Users can view questions for their assignments'
  ) THEN
    CREATE POLICY "Users can view questions for their assignments"
    ON public.exam_questions FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = exam_questions.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_questions' AND policyname = 'Users can create questions for their assignments'
  ) THEN
    CREATE POLICY "Users can create questions for their assignments"
    ON public.exam_questions FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = exam_questions.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_questions' AND policyname = 'Users can update questions for their assignments'
  ) THEN
    CREATE POLICY "Users can update questions for their assignments"
    ON public.exam_questions FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = exam_questions.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_questions' AND policyname = 'Users can delete questions for their assignments'
  ) THEN
    CREATE POLICY "Users can delete questions for their assignments"
    ON public.exam_questions FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = exam_questions.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_exam_questions_updated_at ON public.exam_questions;
CREATE TRIGGER update_exam_questions_updated_at
  BEFORE UPDATE ON public.exam_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6. EXAM RUBRICS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exam_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  rubric_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_rubrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_rubrics' AND policyname = 'Users can view rubrics for their assignments'
  ) THEN
    CREATE POLICY "Users can view rubrics for their assignments"
    ON public.exam_rubrics FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = exam_rubrics.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_rubrics' AND policyname = 'Users can create rubrics for their assignments'
  ) THEN
    CREATE POLICY "Users can create rubrics for their assignments"
    ON public.exam_rubrics FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = exam_rubrics.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_rubrics' AND policyname = 'Users can update rubrics for their assignments'
  ) THEN
    CREATE POLICY "Users can update rubrics for their assignments"
    ON public.exam_rubrics FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = exam_rubrics.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'exam_rubrics' AND policyname = 'Users can delete rubrics for their assignments'
  ) THEN
    CREATE POLICY "Users can delete rubrics for their assignments"
    ON public.exam_rubrics FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.assignments
        WHERE assignments.id = exam_rubrics.assignment_id
        AND assignments.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_exam_rubrics_updated_at ON public.exam_rubrics;
CREATE TRIGGER update_exam_rubrics_updated_at
  BEFORE UPDATE ON public.exam_rubrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6b. MISSING COLUMNS (required by backend QCP pipeline)
-- ============================================================

-- Add optional_question_policy to assignments
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS optional_question_policy TEXT DEFAULT 'educator_choice';

-- Add grading_status and answer_map to submissions
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS grading_status TEXT DEFAULT 'pending';
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS answer_map JSONB;

-- Add feedback_pdf_url to submissions (stores Supabase Storage public URL)
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS feedback_pdf_url TEXT;

-- optional_group and question_label are now in the CREATE TABLE above.
-- These ALTER TABLEs are kept as no-ops (IF NOT EXISTS) for existing deployments
-- that were created before these columns were added to CREATE TABLE.
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS optional_group TEXT;
ALTER TABLE public.exam_questions ADD COLUMN IF NOT EXISTS question_label TEXT;

-- ============================================================
-- 6c. STORAGE BUCKET — feedback-reports
-- Run these in Supabase Dashboard > SQL Editor
-- ============================================================

-- Create the feedback-reports storage bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-reports', 'feedback-reports', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload feedback PDFs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload feedback PDFs'
  ) THEN
    CREATE POLICY "Authenticated users can upload feedback PDFs"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'feedback-reports' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Allow authenticated users to update (upsert) feedback PDFs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated users can update feedback PDFs'
  ) THEN
    CREATE POLICY "Authenticated users can update feedback PDFs"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'feedback-reports' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Allow public read access to feedback PDFs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Feedback PDFs are publicly readable'
  ) THEN
    CREATE POLICY "Feedback PDFs are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'feedback-reports');
  END IF;
END $$;

-- ============================================================
-- 7. SUBMISSION ANSWERS TABLE (QCP pipeline)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.submission_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  question_label TEXT,
  extracted_text TEXT,
  confidence NUMERIC,
  page_numbers INTEGER[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(submission_id, question_id)
);

ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'submission_answers' AND policyname = 'Service role full access to submission_answers'
  ) THEN
    CREATE POLICY "Service role full access to submission_answers"
    ON public.submission_answers FOR ALL
    USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 8. QUESTION GRADES TABLE (QCP pipeline)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.question_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  question_label TEXT,
  ai_score INTEGER DEFAULT 0,
  max_score INTEGER DEFAULT 0,
  ai_feedback TEXT,
  rubric_breakdown JSONB DEFAULT '[]'::jsonb,
  confidence TEXT DEFAULT 'medium',
  is_counted BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(submission_id, question_id)
);

ALTER TABLE public.question_grades ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'question_grades' AND policyname = 'Service role full access to question_grades'
  ) THEN
    CREATE POLICY "Service role full access to question_grades"
    ON public.question_grades FOR ALL
    USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_question_grades_updated_at ON public.question_grades;
CREATE TRIGGER update_question_grades_updated_at
  BEFORE UPDATE ON public.question_grades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 9. MODEL ANSWERS TABLE (QCP pipeline)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.model_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.exam_questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, question_id)
);

ALTER TABLE public.model_answers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'model_answers' AND policyname = 'Service role full access to model_answers'
  ) THEN
    CREATE POLICY "Service role full access to model_answers"
    ON public.model_answers FOR ALL
    USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_model_answers_updated_at ON public.model_answers;
CREATE TRIGGER update_model_answers_updated_at
  BEFORE UPDATE ON public.model_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 10. INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON public.assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_created_at ON public.assignments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_final_score ON public.submissions(final_score) WHERE final_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_graded_at ON public.submissions(graded_at DESC) WHERE graded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_grading_status ON public.submissions(grading_status);
CREATE INDEX IF NOT EXISTS idx_exam_questions_assignment_id ON public.exam_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_order ON public.exam_questions(assignment_id, question_order);

-- Unique constraint so upsert onConflict:'assignment_id,question_order' works correctly
-- Without this, every re-parse creates duplicate rows instead of updating existing ones
ALTER TABLE public.exam_questions
  ADD CONSTRAINT IF NOT EXISTS exam_questions_assignment_order_unique
  UNIQUE (assignment_id, question_order);
CREATE INDEX IF NOT EXISTS idx_exam_rubrics_assignment_id ON public.exam_rubrics(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submission_answers_submission_id ON public.submission_answers(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_answers_question_id ON public.submission_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_question_grades_submission_id ON public.question_grades(submission_id);
CREATE INDEX IF NOT EXISTS idx_question_grades_question_id ON public.question_grades(question_id);
CREATE INDEX IF NOT EXISTS idx_model_answers_assignment_id ON public.model_answers(assignment_id);
CREATE INDEX IF NOT EXISTS idx_model_answers_question_id ON public.model_answers(question_id);

-- ============================================================
-- DONE! Your EvalueX database schema is now ready.
-- ============================================================
