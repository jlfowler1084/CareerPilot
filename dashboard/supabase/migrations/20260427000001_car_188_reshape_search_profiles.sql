-- CAR-188: Add contract_only column to search_profiles + backfill 'dice_contract' rows.
--
-- The plan (Unit 1) originally proposed dropping 'both' and 'dice_contract' from the
-- source enum. After auditing live data (4 of 8 existing rows use 'both'), the migration
-- was reduced to strictly additive changes to avoid splitting rows and the resulting
-- dashboard UX confusion. The engine (Unit 4) treats source='both' as "run both Indeed
-- and Dice for this profile" — a small piece of dispatch logic, not a schema change.
--
-- Net change: add `contract_only` column; convert 'dice_contract' rows to ('dice' +
-- contract_only=TRUE); drop 'dice_contract' from the CHECK constraint (now redundant).
-- 'both' stays valid.
--
-- See: docs/plans/2026-04-27-001-feat-careerpilot-job-search-cli-v1-plan.md (Unit 1)

BEGIN;

-- 1. Add contract_only column (additive; defaults to FALSE for existing rows).
ALTER TABLE public.search_profiles
    ADD COLUMN IF NOT EXISTS contract_only BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill: rows previously marked source='dice_contract' now have source='dice' and contract_only=TRUE.
UPDATE public.search_profiles
    SET source = 'dice', contract_only = TRUE
    WHERE source = 'dice_contract';

-- 3. Update CHECK constraint to drop the now-redundant 'dice_contract' value.
--    'both' remains valid because the engine handles it as a dispatch directive.
ALTER TABLE public.search_profiles
    DROP CONSTRAINT IF EXISTS search_profiles_source_check;

ALTER TABLE public.search_profiles
    ADD CONSTRAINT search_profiles_source_check
    CHECK (source = ANY (ARRAY['dice'::text, 'indeed'::text, 'both'::text]));

-- Comment for future readers
COMMENT ON COLUMN public.search_profiles.contract_only IS
    'CAR-188: When TRUE, restrict the search to contract employment types. '
    'Replaces the legacy ''dice_contract'' source enum value.';

COMMIT;
