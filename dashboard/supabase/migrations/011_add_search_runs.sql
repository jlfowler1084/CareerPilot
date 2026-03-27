-- SCRUM-189: Search Scan History
-- Tracks each search scan execution so users can review and reload past searches.

-- New table: search_runs (tracks each scan execution)
CREATE TABLE IF NOT EXISTS search_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profiles_used TEXT[] NOT NULL DEFAULT '{}',
  total_results INTEGER NOT NULL DEFAULT 0,
  indeed_count INTEGER NOT NULL DEFAULT 0,
  dice_count INTEGER NOT NULL DEFAULT 0,
  new_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE search_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own runs" ON search_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own runs" ON search_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own runs" ON search_runs FOR DELETE USING (auth.uid() = user_id);

-- Index for fast history loading
CREATE INDEX IF NOT EXISTS idx_search_runs_user_created ON search_runs(user_id, created_at DESC);

-- Add FK on search_cache to link results to their run
ALTER TABLE search_cache ADD COLUMN IF NOT EXISTS search_run_id UUID REFERENCES search_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_search_cache_run_id ON search_cache(search_run_id);
