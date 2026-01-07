-- Add 'paused' to job_status enum
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'paused';

-- Add new columns for pause/resume functionality
ALTER TABLE processing_jobs 
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS resume_from_index INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS partial_result_path TEXT;