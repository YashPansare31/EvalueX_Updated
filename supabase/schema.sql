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
-- 7. INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON public.assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_created_at ON public.assignments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON public.submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_final_score ON public.submissions(final_score) WHERE final_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submissions_graded_at ON public.submissions(graded_at DESC) WHERE graded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exam_questions_assignment_id ON public.exam_questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_order ON public.exam_questions(assignment_id, question_order);
CREATE INDEX IF NOT EXISTS idx_exam_rubrics_assignment_id ON public.exam_rubrics(assignment_id);

-- ============================================================
-- DONE! Your EvalueX database schema is now ready.
-- ============================================================
