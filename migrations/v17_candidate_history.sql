-- v17: Add work_history and education JSONB columns to candidates
-- Safe to re-run (ADD COLUMN IF NOT EXISTS).

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS work_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS education    jsonb NOT NULL DEFAULT '[]'::jsonb;
