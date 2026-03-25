-- Gmail Inbox Integration (SCRUM-145 Phase 1)

-- Emails table
CREATE TABLE emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_id TEXT NOT NULL,
  thread_id TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  from_domain TEXT,
  to_email TEXT,
  subject TEXT,
  body_preview TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  category TEXT NOT NULL DEFAULT 'unclassified',
  classification_json JSONB,
  suggested_application_id UUID REFERENCES applications(id),
  is_read BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_emails_user_gmail ON emails(user_id, gmail_id);
CREATE INDEX idx_emails_user_id ON emails(user_id);
CREATE INDEX idx_emails_from_email ON emails(from_email);
CREATE INDEX idx_emails_from_domain ON emails(from_domain);
CREATE INDEX idx_emails_category ON emails(category);
CREATE INDEX idx_emails_thread_id ON emails(thread_id);
CREATE INDEX idx_emails_received_at ON emails(received_at DESC);

ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own emails" ON emails
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER emails_updated
  BEFORE UPDATE ON emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Email-to-Application links (junction table)
CREATE TABLE email_application_links (
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_by TEXT DEFAULT 'manual',
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (email_id, application_id)
);

CREATE INDEX idx_eal_application_id ON email_application_links(application_id);

ALTER TABLE email_application_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own email links" ON email_application_links
  FOR ALL USING (auth.uid() = user_id);

-- User settings (scan state)
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_email_scan TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER user_settings_updated
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
