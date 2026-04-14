-- CAR-117: Contacts & Communications Hub
-- Adds contacts table, contact_application_links join table, and migrates
-- existing flat contact fields from applications to the new normalized structure.
-- The deprecated contact_* columns on applications are retained for backward
-- compatibility and will be removed in a future migration.

-- ═══════════════════════════════════════════════════════════════════════
-- CONTACTS TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contacts (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name             TEXT        NOT NULL,
  email            TEXT,
  phone            TEXT,
  company          TEXT,
  title            TEXT,
  source           TEXT        NOT NULL DEFAULT 'manual',
  notes            TEXT,
  last_contact_date TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-update timestamp trigger
CREATE TRIGGER contacts_updated
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Unique partial index: one contact per (user, email) when email is present
CREATE UNIQUE INDEX idx_contacts_user_email
  ON public.contacts(user_id, email)
  WHERE email IS NOT NULL;

-- Performance indexes
CREATE INDEX idx_contacts_user_id         ON public.contacts(user_id);
CREATE INDEX idx_contacts_email           ON public.contacts(email);
CREATE INDEX idx_contacts_last_contact    ON public.contacts(last_contact_date DESC);

-- Row Level Security
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own contacts" ON public.contacts
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════
-- CONTACT_APPLICATION_LINKS JOIN TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contact_application_links (
  contact_id     UUID REFERENCES public.contacts(id)      ON DELETE CASCADE NOT NULL,
  application_id UUID REFERENCES public.applications(id)  ON DELETE CASCADE NOT NULL,
  user_id        UUID REFERENCES auth.users(id)           ON DELETE CASCADE NOT NULL,
  role           TEXT        NOT NULL DEFAULT 'recruiter',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (contact_id, application_id)
);

-- Performance indexes
CREATE INDEX idx_cal_application_id ON public.contact_application_links(application_id);
CREATE INDEX idx_cal_contact_id     ON public.contact_application_links(contact_id);

-- Row Level Security
ALTER TABLE public.contact_application_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own contact links" ON public.contact_application_links
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════
-- DATA MIGRATION: flat contact fields → contacts + links
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  migrated_count INTEGER := 0;
BEGIN
  -- Create contacts from applications with non-null contact_email
  INSERT INTO public.contacts (user_id, name, email, phone, company, source)
  SELECT DISTINCT ON (a.user_id, a.contact_email)
    a.user_id,
    COALESCE(a.contact_name, 'Unknown'),
    a.contact_email,
    a.contact_phone,
    a.company,
    'migration'
  FROM public.applications a
  WHERE a.contact_email IS NOT NULL
  ON CONFLICT (user_id, email) WHERE email IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Migrated % contacts from applications', migrated_count;

  -- Create join table entries
  INSERT INTO public.contact_application_links (contact_id, application_id, user_id, role)
  SELECT c.id, a.id, a.user_id, COALESCE(a.contact_role, 'recruiter')
  FROM public.applications a
  JOIN public.contacts c ON c.email = a.contact_email AND c.user_id = a.user_id
  WHERE a.contact_email IS NOT NULL
  ON CONFLICT (contact_id, application_id) DO NOTHING;

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'Created % contact-application links', migrated_count;
END $$;

-- NOTE: applications.contact_name, contact_email, contact_phone, contact_role
-- are intentionally retained as deprecated columns for backward compatibility.
-- Removal is deferred to a future migration.
