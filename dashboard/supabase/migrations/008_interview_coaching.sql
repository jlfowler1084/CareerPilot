CREATE TABLE interview_coaching (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  session_type TEXT NOT NULL CHECK (session_type IN ('debrief', 'transcript', 'practice')),
  raw_input TEXT,
  ai_analysis JSONB,
  overall_score INTEGER CHECK (overall_score BETWEEN 1 AND 10),
  strong_points JSONB,     -- string[]
  improvements JSONB,      -- { area, your_answer, coached_answer, tip }[]
  patterns_detected JSONB, -- { rambling, hedging_count, filler_words, vague_answers, missing_star, specificity_score }
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE interview_coaching ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own coaching" ON interview_coaching
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_coaching_application ON interview_coaching(application_id);
CREATE INDEX idx_coaching_user ON interview_coaching(user_id);
