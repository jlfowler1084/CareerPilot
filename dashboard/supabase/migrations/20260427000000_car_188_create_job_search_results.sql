-- CAR-188: Create job_search_results table for the CLI-engine + dashboard-reader inversion.
--
-- Architecture: workstation CLI writes (service-role; bypasses RLS); dashboard reads as
-- the authenticated user (RLS enforces user_id scoping). Pattern mirrors the applications
-- table introduced in CAR-117.
--
-- See: docs/plans/2026-04-27-001-feat-careerpilot-job-search-cli-v1-plan.md (Unit 1)

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_search_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Source identity (composite unique key with user_id)
    source TEXT NOT NULL CHECK (source IN ('indeed', 'dice')),
    source_id TEXT NOT NULL,
    url TEXT NOT NULL,

    -- Listing-level fields (populated at search time, no LLM)
    title TEXT,
    company TEXT,
    location TEXT,
    salary TEXT,
    job_type TEXT,
    posted_date TEXT,
    easy_apply BOOLEAN NOT NULL DEFAULT FALSE,

    -- Profile attribution
    profile_id UUID REFERENCES public.search_profiles(id) ON DELETE SET NULL,
    profile_label TEXT,

    -- Detail-level fields (populated lazily-or-eagerly by enrichment; nullable until then)
    description TEXT,
    requirements JSONB,
    nice_to_haves JSONB,

    -- Timestamps
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_enriched_at TIMESTAMPTZ,

    -- Lifecycle
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'viewed', 'tracked', 'dismissed', 'stale')),
    application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite uniqueness: a (user, source, source_id) triple identifies a single listing.
-- Re-runs of the engine upsert on this key.
CREATE UNIQUE INDEX IF NOT EXISTS job_search_results_user_source_id_unique
    ON public.job_search_results (user_id, source, source_id);

-- Primary read pattern: dashboard fetches user's results ordered by recency.
CREATE INDEX IF NOT EXISTS job_search_results_user_last_seen_idx
    ON public.job_search_results (user_id, last_seen_at DESC);

-- Profile-filter pattern (dashboard filter dropdown).
CREATE INDEX IF NOT EXISTS job_search_results_user_profile_idx
    ON public.job_search_results (user_id, profile_id)
    WHERE profile_id IS NOT NULL;

-- Status-filter pattern (badge counts `status='new'`).
CREATE INDEX IF NOT EXISTS job_search_results_user_status_idx
    ON public.job_search_results (user_id, status);

-- updated_at maintenance trigger
CREATE OR REPLACE FUNCTION public.set_job_search_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_search_results_updated_at ON public.job_search_results;
CREATE TRIGGER job_search_results_updated_at
    BEFORE UPDATE ON public.job_search_results
    FOR EACH ROW
    EXECUTE FUNCTION public.set_job_search_results_updated_at();

-- Row-Level Security: dashboard authenticates as the user; CLI uses service-role (bypasses RLS).
-- The (SELECT auth.uid()) form is up to 100x faster than bare auth.uid() on hot reads
-- (per INFRA-90 review finding 15-17).
ALTER TABLE public.job_search_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own search results"
    ON public.job_search_results
    FOR ALL
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- Comment for future readers
COMMENT ON TABLE public.job_search_results IS
    'CAR-188: Job listings discovered by the workstation CLI search engine. '
    'CLI writes via service-role; dashboard reads via RLS. '
    'Composite key (user_id, source, source_id) is the upsert key for re-runs.';

COMMIT;
