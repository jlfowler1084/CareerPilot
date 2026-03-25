-- 006_add_interview_prep.sql
-- Adds JSONB column for stage-specific interview prep data
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_prep JSONB DEFAULT '{}';
