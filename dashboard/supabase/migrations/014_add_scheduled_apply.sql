-- Add scheduled auto-apply polling settings
-- Part of CAR-18: Scheduled Auto-Apply

ALTER TABLE auto_apply_settings
  ADD COLUMN IF NOT EXISTS scheduled_apply_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_apply_interval INTEGER DEFAULT 30;
