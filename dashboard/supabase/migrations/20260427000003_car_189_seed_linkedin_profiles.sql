-- CAR-189: Seed LinkedIn search profiles from config/search_profiles.py
--
-- User ID comes from settings.CAREERPILOT_USER_ID.
-- sort_order starts at 10 (after highest existing Dice/Indeed profile at 9).
-- Use ON CONFLICT DO NOTHING for idempotency.
--
-- Source: config/search_profiles.py::LINKEDIN_SEARCH_PROFILES (6 profiles)
-- See: docs/plans/2026-04-27-003-feat-job-search-v2-bundle-plan.md (Unit 3)

BEGIN;

INSERT INTO public.search_profiles (user_id, name, keyword, location, source, contract_only, icon, is_default, sort_order)
VALUES
  ('9763a77a-7cae-4242-8e65-2b5d844d63eb', 'syseng_indy',       'Systems Engineer',                     'Indianapolis, Indiana, United States', 'linkedin', false, '🔗', false, 10),
  ('9763a77a-7cae-4242-8e65-2b5d844d63eb', 'infra_remote',      'Infrastructure Engineer Windows VMware', 'United States',                       'linkedin', false, '🔗', false, 11),
  ('9763a77a-7cae-4242-8e65-2b5d844d63eb', 'devops_indy',       'DevOps Engineer Azure',                 'Indianapolis, Indiana, United States', 'linkedin', false, '🔗', false, 12),
  ('9763a77a-7cae-4242-8e65-2b5d844d63eb', 'it_eng_indy',       'IT Engineer',                           'Indianapolis, Indiana, United States', 'linkedin', false, '🔗', false, 13),
  ('9763a77a-7cae-4242-8e65-2b5d844d63eb', 'sysadmin_indy',     'Systems Administrator',                 'Indianapolis, Indiana, United States', 'linkedin', false, '🔗', false, 14),
  ('9763a77a-7cae-4242-8e65-2b5d844d63eb', 'powershell_remote', 'PowerShell Automation Engineer',        'United States',                       'linkedin', false, '🔗', false, 15)
ON CONFLICT DO NOTHING;

COMMIT;
