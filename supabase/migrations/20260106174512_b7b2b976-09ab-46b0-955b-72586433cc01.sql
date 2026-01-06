-- Create storage bucket for Excel files
INSERT INTO storage.buckets (id, name, public)
VALUES ('excel-files', 'excel-files', false);

-- RLS policy: Users can upload to their own folder
CREATE POLICY "Users can upload excel files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'excel-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS policy: Users can read their own files
CREATE POLICY "Users can read own excel files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'excel-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS policy: Users can delete their own files  
CREATE POLICY "Users can delete own excel files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'excel-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Add columns for storage file paths to processing_jobs
ALTER TABLE processing_jobs
ADD COLUMN IF NOT EXISTS source_file_path TEXT,
ADD COLUMN IF NOT EXISTS result_file_path TEXT;