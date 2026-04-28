-- CAR-189: Widen source CHECK constraints on job_search_results and search_profiles
-- to accept 'linkedin' alongside the existing 'indeed' and 'dice' values.
--
-- This freeze migration runs before any LinkedIn-integration stream subagent spawns.
-- It is the precondition for Unit 3 (S4 — LinkedIn email-parser pipeline).
--
-- job_search_results.source: inline CHECK auto-named job_search_results_source_check
-- search_profiles.source: named search_profiles_source_check (established in CAR-188)
--
-- Idempotent: DROP CONSTRAINT IF EXISTS makes re-application a no-op.
-- See: docs/plans/2026-04-27-003-feat-job-search-v2-bundle-plan.md (Unit 0)

BEGIN;

-- 1. Widen job_search_results source CHECK
ALTER TABLE public.job_search_results
    DROP CONSTRAINT IF EXISTS job_search_results_source_check;

ALTER TABLE public.job_search_results
    ADD CONSTRAINT job_search_results_source_check
    CHECK (source = ANY (ARRAY['indeed'::text, 'dice'::text, 'linkedin'::text]));

-- 2. Widen search_profiles source CHECK (was established in CAR-188 migration 20260427000001)
ALTER TABLE public.search_profiles
    DROP CONSTRAINT IF EXISTS search_profiles_source_check;

ALTER TABLE public.search_profiles
    ADD CONSTRAINT search_profiles_source_check
    CHECK (source = ANY (ARRAY['dice'::text, 'indeed'::text, 'linkedin'::text, 'both'::text]));

COMMIT;
