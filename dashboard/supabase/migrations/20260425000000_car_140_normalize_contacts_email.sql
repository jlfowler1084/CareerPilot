-- CAR-140: fold case-variant duplicate contacts, normalize emails to lowercase,
-- and replace the case-sensitive btree index with a functional lower(email) unique index.

BEGIN;

-- Step 1: Fold existing case-variant duplicates.
-- For each (user_id, lower(email)) group with more than one row, keep the oldest
-- row (smallest created_at) as the winner. Re-point contact_application_links from
-- loser rows to the winner, COALESCE loser non-null fields into winner null fields,
-- then delete the losers.
DO $$
DECLARE
  r RECORD;
  winner_id UUID;
BEGIN
  FOR r IN
    SELECT user_id, lower(email) AS norm_email
    FROM public.contacts
    WHERE email IS NOT NULL
    GROUP BY user_id, lower(email)
    HAVING count(*) > 1
  LOOP
    -- Identify the winner (oldest row)
    SELECT id INTO winner_id
    FROM public.contacts
    WHERE user_id = r.user_id
      AND lower(email) = r.norm_email
    ORDER BY created_at ASC
    LIMIT 1;

    -- Coalesce non-null fields from losers into winner where winner has nulls
    UPDATE public.contacts w
    SET
      name = COALESCE(w.name, (SELECT name FROM public.contacts l WHERE l.user_id = r.user_id AND lower(l.email) = r.norm_email AND l.id != winner_id AND l.name IS NOT NULL LIMIT 1)),
      company = COALESCE(w.company, (SELECT company FROM public.contacts l WHERE l.user_id = r.user_id AND lower(l.email) = r.norm_email AND l.id != winner_id AND l.company IS NOT NULL LIMIT 1)),
      title = COALESCE(w.title, (SELECT title FROM public.contacts l WHERE l.user_id = r.user_id AND lower(l.email) = r.norm_email AND l.id != winner_id AND l.title IS NOT NULL LIMIT 1)),
      phone = COALESCE(w.phone, (SELECT phone FROM public.contacts l WHERE l.user_id = r.user_id AND lower(l.email) = r.norm_email AND l.id != winner_id AND l.phone IS NOT NULL LIMIT 1)),
      linkedin_url = COALESCE(w.linkedin_url, (SELECT linkedin_url FROM public.contacts l WHERE l.user_id = r.user_id AND lower(l.email) = r.norm_email AND l.id != winner_id AND l.linkedin_url IS NOT NULL LIMIT 1)),
      notes = COALESCE(w.notes, (SELECT notes FROM public.contacts l WHERE l.user_id = r.user_id AND lower(l.email) = r.norm_email AND l.id != winner_id AND l.notes IS NOT NULL LIMIT 1))
    WHERE w.id = winner_id;

    -- Re-point contact_application_links from losers to winner (ignore duplicates)
    UPDATE public.contact_application_links
    SET contact_id = winner_id
    WHERE contact_id IN (
      SELECT id FROM public.contacts
      WHERE user_id = r.user_id
        AND lower(email) = r.norm_email
        AND id != winner_id
    )
    ON CONFLICT DO NOTHING;

    -- Delete the loser rows
    DELETE FROM public.contacts
    WHERE user_id = r.user_id
      AND lower(email) = r.norm_email
      AND id != winner_id;
  END LOOP;
END $$;

-- Step 2: Normalize all emails to lowercase
UPDATE public.contacts
SET email = lower(email)
WHERE email IS NOT NULL AND email != lower(email);

-- Step 3: Replace the case-sensitive index with a functional lower(email) index
DROP INDEX IF EXISTS idx_contacts_user_email;

CREATE UNIQUE INDEX idx_contacts_user_email_lower
  ON public.contacts(user_id, lower(email))
  WHERE email IS NOT NULL;

COMMIT;
