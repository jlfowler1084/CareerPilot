-- 010_add_cover_letter_and_events.sql
-- Adds cover_letter column to applications and creates application_events table

-- cover_letter column (TS type already references it, but no migration created it)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter TEXT;

-- contact fields (referenced in TS type, ensure they exist)
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS contact_role TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS job_description TEXT;

-- application_events table (referenced by use-application-events.ts and use-applications.ts)
CREATE TABLE IF NOT EXISTS application_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON application_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON application_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
