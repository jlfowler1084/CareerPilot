-- SCRUM-128: Add calendar sync fields to applications table
ALTER TABLE applications ADD COLUMN interview_date TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN follow_up_date TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN calendar_event_id TEXT;
