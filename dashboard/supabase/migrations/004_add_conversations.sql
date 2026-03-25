-- Conversation log for tracking calls, interviews, and interactions
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  conversation_type TEXT NOT NULL,
  title TEXT,
  people JSONB DEFAULT '[]',
  date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  questions_asked JSONB DEFAULT '[]',
  questions_you_asked JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  topics TEXT[] DEFAULT '{}',
  sentiment INTEGER CHECK (sentiment BETWEEN 1 AND 5),
  transcript_url TEXT,
  ai_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_conversations_application ON conversations(application_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_date ON conversations(date DESC);
CREATE INDEX idx_conversations_type ON conversations(conversation_type);

-- Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own conversations" ON conversations
  FOR ALL USING (auth.uid() = user_id);

-- Auto-update timestamp trigger
CREATE TRIGGER conversations_updated
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
