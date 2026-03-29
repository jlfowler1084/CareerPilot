-- Auto-apply action log for debugging and audit trail
-- Part of CAR-18 Phase 3: Auto-Apply Session Tracking

CREATE TABLE IF NOT EXISTS auto_apply_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_id UUID REFERENCES auto_apply_queue(id) ON DELETE SET NULL,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE auto_apply_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own logs"
  ON auto_apply_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_auto_apply_log_queue ON auto_apply_log(queue_id);
CREATE INDEX idx_auto_apply_log_created ON auto_apply_log(created_at DESC);
