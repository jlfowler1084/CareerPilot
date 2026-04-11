# [CAR-117] Contacts Hub — Schema Migration (Worker A)
# Model: SONNET
# Justification: Single-file SQL migration following established patterns

## Tickets
- **Primary:** CAR-117 — Contacts schema, RLS, and indexes
- **Relates to:** CAR-116 (epic), docs/plans/2026-04-11-001-feat-contacts-communications-hub-plan.md

## Estimated Scope
Single file: `supabase/migrations/016_add_contacts.sql`

---

## Phase 0 — Branch Setup

**Branch:** `feat/CAR-116-contacts-hub`
**Base:** `feature/dashboard-v2`

1. `git fetch origin feature/dashboard-v2`
2. `git worktree add .worktrees/contacts-hub origin/feature/dashboard-v2 -b feat/CAR-116-contacts-hub`
3. `cd .worktrees/contacts-hub`
4. Confirm branch: `git branch --show-current`

---

## Context

Read the full plan at `docs/plans/2026-04-11-001-feat-contacts-communications-hub-plan.md`, Unit 1.

Key patterns to follow:
- `supabase/migrations/015_fix_rls_subquery_pattern.sql` — RLS uses `(SELECT auth.uid())` subquery, NEVER bare `auth.uid()`
- `supabase/migrations/005_gmail_inbox.sql` — join table pattern: `email_application_links` has own `user_id` for RLS, composite PK, metadata columns
- `supabase/migrations/001_*.sql` — table creation: UUID PK via `gen_random_uuid()`, `user_id` FK to `auth.users ON DELETE CASCADE`, `created_at`/`updated_at` with `update_updated_at()` trigger

---

## What NOT To Do

- Do NOT drop the existing `applications.contact_name`/`contact_email`/`contact_phone`/`contact_role` columns — they stay as deprecated fields. A future `017_*.sql` handles removal
- Do NOT use bare `auth.uid()` in any RLS policy — always `(SELECT auth.uid())`
- Do NOT create tables without enabling RLS immediately

---

## Phase 1 — Audit (READ-ONLY)

1. Read `supabase/migrations/005_gmail_inbox.sql` to confirm join table pattern (email_application_links)
2. Read `supabase/migrations/015_fix_rls_subquery_pattern.sql` to confirm RLS subquery pattern
3. Read `supabase/migrations/010_add_cover_letter_and_events.sql` to see existing `contact_*` columns on applications
4. Count non-null contact_email rows: note this for the migration's DO block

**STOP.** Report patterns confirmed before writing migration.

---

## Phase 2 — Write Migration

Create `supabase/migrations/016_add_contacts.sql` with:

### contacts table
- `id UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL`
- `name TEXT NOT NULL`
- `email TEXT` (nullable — manual contacts may lack email)
- `phone TEXT`
- `company TEXT`
- `title TEXT`
- `source TEXT NOT NULL DEFAULT 'manual'`
- `notes TEXT`
- `last_contact_date TIMESTAMPTZ`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `updated_at TIMESTAMPTZ DEFAULT NOW()`
- `update_updated_at()` trigger
- Unique partial index: `CREATE UNIQUE INDEX idx_contacts_user_email ON contacts(user_id, email) WHERE email IS NOT NULL`
- Performance indexes: `contacts(user_id)`, `contacts(last_contact_date DESC)`
- RLS enabled with `(SELECT auth.uid())` USING + WITH CHECK

### contact_application_links table
- `contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL`
- `application_id UUID REFERENCES applications(id) ON DELETE CASCADE NOT NULL`
- `user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL`
- `role TEXT NOT NULL DEFAULT 'recruiter'`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- `PRIMARY KEY (contact_id, application_id)`
- Indexes: `(application_id)`, `(contact_id)`
- RLS enabled with `(SELECT auth.uid())` USING + WITH CHECK

### Data migration
- `INSERT INTO contacts ... SELECT DISTINCT ON (contact_email) ... FROM applications WHERE contact_email IS NOT NULL`
- Set `source = 'migration'` for migrated contacts
- `INSERT INTO contact_application_links` from the same source rows
- Wrap in DO block with row count logging via `RAISE NOTICE`

**Success criteria:**
- Migration file is syntactically correct SQL
- RLS uses `(SELECT auth.uid())` pattern throughout
- Unique partial index prevents duplicate emails per user
- Data migration handles NULL contact_email gracefully (skips them)

---

## Phase 3 — Verify

1. Run `supabase db reset` in the dashboard directory — migration must apply cleanly
2. Verify tables exist with correct columns: `\d contacts` and `\d contact_application_links`
3. Verify RLS is enabled: `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('contacts', 'contact_application_links')`
4. Verify indexes exist

---

## Phase 4 — Commit and Push

**STOP before committing.** Report all findings.

After approval:
1. `git add supabase/migrations/016_add_contacts.sql`
2. `git commit -m "feat(CAR-117): add contacts and contact_application_links tables with RLS"`
3. `git push -u origin feat/CAR-116-contacts-hub`

---

## Invocation

```
claude --model sonnet --prompt-file prompts/CAR-117-worker-A-schema-migration.md
```
