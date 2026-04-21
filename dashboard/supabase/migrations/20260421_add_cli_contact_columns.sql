-- CAR-171 (CAR-168 M5a): Extend contacts table with CLI-side fields.
-- These columns back the recruiter-workflow surface of the CLI
-- (contact_type, tags, follow-ups, relationship status).
-- The dashboard UI may adopt them later; for now they are CLI-primary.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS contact_type        TEXT NOT NULL DEFAULT 'recruiter',
  ADD COLUMN IF NOT EXISTS linkedin_url        TEXT,
  ADD COLUMN IF NOT EXISTS specialization      TEXT,
  ADD COLUMN IF NOT EXISTS contact_method      TEXT,
  ADD COLUMN IF NOT EXISTS next_followup       DATE,
  ADD COLUMN IF NOT EXISTS relationship_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS tags                TEXT[]  DEFAULT '{}';

-- Index for followups-due queries (next_followup <= today AND IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_contacts_next_followup
  ON public.contacts(user_id, next_followup)
  WHERE next_followup IS NOT NULL;

-- Index for by-type / relationship filters
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type
  ON public.contacts(user_id, contact_type);
