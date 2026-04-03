-- CAR-111: RLS performance + coverage fixes from INFRA-90 code review
--
-- 1. Rewrite all existing RLS policies to use (SELECT auth.uid()) subquery
--    pattern (evaluated once per query instead of once per row)
-- 2. Add RLS coverage for 6 tables referenced in app code but missing
--    migration-tracked RLS: auto_apply_queue, email_job_suggestions,
--    company_briefs, interview_prep, debriefs, skill_mentions

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1: Rewrite existing policies with (SELECT auth.uid()) subquery
-- ═══════════════════════════════════════════════════════════════════════

-- ── 001_initial_schema: applications ────────────────────────────────
DROP POLICY IF EXISTS "Users own applications" ON public.applications;
CREATE POLICY "Users own applications" ON public.applications
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── 001_initial_schema: activity_log ────────────────────────────────
DROP POLICY IF EXISTS "Users own activity" ON public.activity_log;
CREATE POLICY "Users own activity" ON public.activity_log
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── 001_initial_schema: search_cache ────────────────────────────────
DROP POLICY IF EXISTS "Users own cache" ON public.search_cache;
CREATE POLICY "Users own cache" ON public.search_cache
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── 004_add_conversations: conversations ────────────────────────────
DROP POLICY IF EXISTS "Users own conversations" ON public.conversations;
CREATE POLICY "Users own conversations" ON public.conversations
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── 005_gmail_inbox: emails ─────────────────────────────────────────
DROP POLICY IF EXISTS "Users own emails" ON public.emails;
CREATE POLICY "Users own emails" ON public.emails
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── 005_gmail_inbox: email_application_links ────────────────────────
DROP POLICY IF EXISTS "Users own email links" ON public.email_application_links;
CREATE POLICY "Users own email links" ON public.email_application_links
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── 005_gmail_inbox: user_settings ──────────────────────────────────
DROP POLICY IF EXISTS "Users own settings" ON public.user_settings;
CREATE POLICY "Users own settings" ON public.user_settings
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── 008_interview_coaching: interview_coaching ──────────────────────
DROP POLICY IF EXISTS "Users can manage own coaching" ON public.interview_coaching;
CREATE POLICY "Users can manage own coaching" ON public.interview_coaching
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- ── 009_job_details_cache: job_details_cache ────────────────────────
DROP POLICY IF EXISTS "Users see own cache" ON public.job_details_cache;
CREATE POLICY "Users see own cache" ON public.job_details_cache
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- ── 010_add_cover_letter_and_events: application_events ─────────────
DROP POLICY IF EXISTS "Users can view own events" ON public.application_events;
CREATE POLICY "Users can view own events" ON public.application_events
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own events" ON public.application_events;
CREATE POLICY "Users can insert own events" ON public.application_events
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- ── 011_add_search_runs: search_runs ────────────────────────────────
DROP POLICY IF EXISTS "Users can view own runs" ON public.search_runs;
CREATE POLICY "Users can view own runs" ON public.search_runs
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own runs" ON public.search_runs;
CREATE POLICY "Users can insert own runs" ON public.search_runs
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own runs" ON public.search_runs;
CREATE POLICY "Users can delete own runs" ON public.search_runs
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ── 012_add_auto_apply_log: auto_apply_log ──────────────────────────
DROP POLICY IF EXISTS "Users can view their own logs" ON public.auto_apply_log;
CREATE POLICY "Users can view their own logs" ON public.auto_apply_log
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── 013_add_auto_apply_settings: auto_apply_settings ────────────────
DROP POLICY IF EXISTS "Users can manage their own settings" ON public.auto_apply_settings;
CREATE POLICY "Users can manage their own settings" ON public.auto_apply_settings
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════
-- PART 2: Add RLS coverage for 6 previously unverified tables
-- ═══════════════════════════════════════════════════════════════════════

-- ── auto_apply_queue ────────────────────────────────────────────────
-- Used in: use-auto-apply-queue.ts, auto-apply/generate-batch, session, stats
-- Operations: SELECT, INSERT, UPDATE, DELETE
-- RLS already enabled via dashboard; policy exists but uses bare auth.uid()
DROP POLICY IF EXISTS "Users can manage their own queue" ON public.auto_apply_queue;
CREATE POLICY "Users own queue items" ON public.auto_apply_queue
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── email_job_suggestions ───────────────────────────────────────────
-- Used in: use-suggestions.ts, suggestions/extract, suggestions/action
-- Operations: SELECT, INSERT, UPDATE
-- RLS already enabled via dashboard; existing policies use USING (true) — no enforcement.
-- Table has no user_id column; ownership chains through email_id → emails.user_id.
DROP POLICY IF EXISTS "suggestions_select" ON public.email_job_suggestions;
DROP POLICY IF EXISTS "suggestions_insert" ON public.email_job_suggestions;
DROP POLICY IF EXISTS "suggestions_update" ON public.email_job_suggestions;
DROP POLICY IF EXISTS "suggestions_delete" ON public.email_job_suggestions;
CREATE POLICY "Users own suggestions" ON public.email_job_suggestions
  FOR ALL
  USING (email_id IN (SELECT id FROM public.emails WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (email_id IN (SELECT id FROM public.emails WHERE user_id = (SELECT auth.uid())));

-- ── company_briefs ──────────────────────────────────────────────────
-- Used in: supabase-helpers.ts (getCompanyBrief, upsertCompanyBrief)
-- Operations: SELECT, INSERT, UPDATE (via UPSERT)
-- RLS already enabled via dashboard; policy exists but uses bare auth.uid()
DROP POLICY IF EXISTS "Users own company_briefs" ON public.company_briefs;
CREATE POLICY "Users own briefs" ON public.company_briefs
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── interview_prep ──────────────────────────────────────────────────
-- Used in: supabase-helpers.ts (getInterviewPrep, upsertInterviewPrep)
-- Operations: SELECT, INSERT, UPDATE (via UPSERT)
-- RLS already enabled via dashboard; policy exists but uses bare auth.uid()
DROP POLICY IF EXISTS "Users own interview_prep" ON public.interview_prep;
CREATE POLICY "Users own prep" ON public.interview_prep
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── debriefs ────────────────────────────────────────────────────────
-- Used in: supabase-helpers.ts (getDebriefs, createDebrief, updateDebrief)
-- Operations: SELECT, INSERT, UPDATE
-- RLS already enabled via dashboard; policy exists but uses bare auth.uid()
DROP POLICY IF EXISTS "Users own debriefs" ON public.debriefs;
CREATE POLICY "Users own debriefs" ON public.debriefs
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ── skill_mentions ──────────────────────────────────────────────────
-- Used in: supabase-helpers.ts (getSkillMentions, upsertSkillMention)
-- Operations: SELECT, INSERT, UPDATE (via UPSERT)
-- RLS already enabled via dashboard; policy exists but uses bare auth.uid()
DROP POLICY IF EXISTS "Users own skill_mentions" ON public.skill_mentions;
CREATE POLICY "Users own skill mentions" ON public.skill_mentions
  FOR ALL
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMIT;
