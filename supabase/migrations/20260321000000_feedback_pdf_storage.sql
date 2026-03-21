-- ============================================================
-- Migration: Ensure feedback-reports Storage Bucket and Policies
-- Run this in your Supabase Dashboard > SQL Editor
-- This is idempotent - safe to run multiple times.
-- ============================================================

-- 1. Add feedback_pdf_url column to submissions if it doesn't exist
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS feedback_pdf_url TEXT;

-- 2. Add educator_override column to question_grades if it doesn't exist
ALTER TABLE public.question_grades ADD COLUMN IF NOT EXISTS educator_override INTEGER;

-- 3. Create the feedback-reports storage bucket (public = true means files are publicly readable via URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-reports', 'feedback-reports', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. Drop existing storage policies to avoid conflicts, then recreate them cleanly

-- Allow authenticated users to upload feedback PDFs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Authenticated users can upload feedback PDFs'
  ) THEN
    CREATE POLICY "Authenticated users can upload feedback PDFs"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'feedback-reports' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Allow authenticated users to UPDATE (upsert) feedback PDFs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Authenticated users can update feedback PDFs'
  ) THEN
    CREATE POLICY "Authenticated users can update feedback PDFs"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'feedback-reports' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Allow public READ access to feedback PDFs (so direct links work without auth)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Feedback PDFs are publicly readable'
  ) THEN
    CREATE POLICY "Feedback PDFs are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'feedback-reports');
  END IF;
END $$;

-- Allow authenticated users to DELETE their own feedback PDFs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Authenticated users can delete feedback PDFs'
  ) THEN
    CREATE POLICY "Authenticated users can delete feedback PDFs"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'feedback-reports' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Done!
-- After running this migration, the feedback-reports bucket will be available
-- and the server-side upload route (/api/upload-feedback-pdf) will work correctly
-- since it uses the SUPABASE_SERVICE_KEY which bypasses RLS entirely.
