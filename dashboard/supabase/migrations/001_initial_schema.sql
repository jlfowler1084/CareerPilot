-- CareerPilot v2.0 Dashboard Schema
-- Designed for column-level compatibility with Python CLI's SQLite applications table

-- Applications table
CREATE TABLE applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  url TEXT,
  source TEXT,
  salary_range TEXT,
  status TEXT NOT NULL DEFAULT 'found',
  job_type TEXT,
  posted_date TEXT,
  date_found TIMESTAMPTZ DEFAULT NOW(),
  date_applied TIMESTAMPTZ,
  date_response TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  profile_id TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log
CREATE TABLE activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search results cache
CREATE TABLE search_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL,
  results JSONB NOT NULL,
  result_count INTEGER DEFAULT 0,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own applications" ON applications
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own activity" ON activity_log
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own cache" ON search_cache
  FOR ALL USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX idx_apps_user ON applications(user_id);
CREATE INDEX idx_apps_status ON applications(status);
CREATE INDEX idx_apps_date ON applications(date_found DESC);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_cache_user ON search_cache(user_id, searched_at DESC);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER applications_updated
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
