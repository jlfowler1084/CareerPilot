-- CAR-189: Seed LinkedIn search profiles
--
-- sort_order starts at 10 (after highest existing Dice/Indeed profile at 9).
-- search_profiles has no user_id column — profiles are shared/global.
-- Use ON CONFLICT DO NOTHING for idempotency.
--
-- Applied manually via Supabase MCP (2026-04-28); file corrected to match
-- actual schema (no user_id column) after subagent generated incorrect INSERT.
-- See: docs/plans/2026-04-27-003-feat-job-search-v2-bundle-plan.md (Unit 3)

BEGIN;

INSERT INTO public.search_profiles (name, keyword, location, source, contract_only, icon, is_default, sort_order)
VALUES
  ('syseng_indy',       'Systems Engineer',                     'Indianapolis, Indiana, United States', 'linkedin', false, '🔗', false, 10),
  ('infra_remote',      'Infrastructure Engineer Windows VMware', 'United States',                     'linkedin', false, '🔗', false, 11),
  ('devops_indy',       'DevOps Engineer Azure',                 'Indianapolis, Indiana, United States', 'linkedin', false, '🔗', false, 12),
  ('it_eng_indy',       'IT Engineer',                           'Indianapolis, Indiana, United States', 'linkedin', false, '🔗', false, 13),
  ('sysadmin_indy',     'Systems Administrator',                 'Indianapolis, Indiana, United States', 'linkedin', false, '🔗', false, 14),
  ('powershell_remote', 'PowerShell Automation Engineer',        'United States',                       'linkedin', false, '🔗', false, 15)
ON CONFLICT DO NOTHING;

COMMIT;
