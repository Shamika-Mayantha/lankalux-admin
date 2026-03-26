-- Website chat storage for LankaLux Live Chat
-- Run in Supabase SQL editor for the admin project.

CREATE TABLE IF NOT EXISTS website_chat_sessions (
  session_id TEXT PRIMARY KEY,
  client_name TEXT,
  email TEXT,
  whatsapp TEXT,
  request_id TEXT,
  selected_vehicle TEXT,
  last_user_message TEXT,
  last_assistant_message TEXT,
  message_count INTEGER DEFAULT 0,
  messages_json JSONB,
  draft_json JSONB,
  last_event TEXT,
  handoff_requested BOOLEAN DEFAULT FALSE,
  page_url TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE website_chat_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read write website_chat_sessions" ON website_chat_sessions;
CREATE POLICY "Allow authenticated read write website_chat_sessions"
  ON website_chat_sessions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

