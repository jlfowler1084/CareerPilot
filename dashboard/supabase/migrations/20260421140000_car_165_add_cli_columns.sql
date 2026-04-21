-- CAR-165 (M2): add CLI-only columns to applications so ApplicationTracker
-- can port from SQLite to Supabase without losing behavior.
--
-- Dashboard does not use these columns. They are maintained by the CLI:
--   message_id              — Gmail source-message id for import-from-email dedup
--   external_status         — ATS portal status (Workday, Greenhouse, etc.)
--   external_status_updated — last time the ATS status was refreshed
--   portal_id               — free-text reference to the portals row in the CLI
--   withdraw_date           — when the application was withdrawn
--
-- These are all nullable. Dashboard reads that select specific columns will
-- ignore them; reads that select "*" will receive nulls for dashboard-created
-- rows, which is the intended behavior.

ALTER TABLE "public"."applications"
    ADD COLUMN IF NOT EXISTS "message_id" text DEFAULT '',
    ADD COLUMN IF NOT EXISTS "external_status" text,
    ADD COLUMN IF NOT EXISTS "external_status_updated" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "portal_id" text,
    ADD COLUMN IF NOT EXISTS "withdraw_date" timestamp with time zone;

-- Partial index on non-empty message_id for fast email-import dedup
-- (ApplicationTracker.find_application_by_message_id). Using a partial index
-- because most rows have message_id = '' (not email-sourced) and those should
-- not bloat the index.
CREATE INDEX IF NOT EXISTS "applications_message_id_idx"
    ON "public"."applications" ("user_id", "message_id")
    WHERE "message_id" IS NOT NULL AND "message_id" <> '';
