-- Add replied_at timestamp to track which emails have been replied to
ALTER TABLE emails ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
