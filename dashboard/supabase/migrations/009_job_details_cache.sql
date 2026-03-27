-- Job details cache for search result previews
CREATE TABLE IF NOT EXISTS job_details_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_url TEXT NOT NULL,
  source TEXT NOT NULL,
  job_id TEXT,
  details JSONB NOT NULL,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_url)
);

ALTER TABLE job_details_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own cache"
  ON job_details_cache FOR ALL
  USING (auth.uid() = user_id);
