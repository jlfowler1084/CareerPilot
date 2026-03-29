-- Auto-apply settings for autonomous mode configuration
-- Part of CAR-18 Phase 5: Autonomous Mode

CREATE TABLE IF NOT EXISTS auto_apply_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT false,
  auto_approve_threshold INTEGER DEFAULT 85 CHECK (auto_approve_threshold >= 50 AND auto_approve_threshold <= 100),
  manual_review_threshold INTEGER DEFAULT 60 CHECK (manual_review_threshold >= 30 AND manual_review_threshold <= 100),
  max_daily_applications INTEGER DEFAULT 10 CHECK (max_daily_applications >= 1 AND max_daily_applications <= 50),
  max_batch_size INTEGER DEFAULT 5 CHECK (max_batch_size >= 1 AND max_batch_size <= 20),
  easy_apply_only BOOLEAN DEFAULT true,
  preferred_sources TEXT[] DEFAULT ARRAY['indeed', 'dice'],
  excluded_companies TEXT[] DEFAULT '{}',
  min_salary INTEGER DEFAULT 0,
  require_cover_letter BOOLEAN DEFAULT true,
  auto_generate_materials BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE auto_apply_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
  ON auto_apply_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
