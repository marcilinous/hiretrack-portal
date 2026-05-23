-- v18: Create conversations and messages tables if not present,
--      and add any missing columns. Safe to re-run.

-- ── conversations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  text NOT NULL,
  employer_id   text NOT NULL,
  job_id        text,
  candidate_unread integer NOT NULL DEFAULT 0,
  employer_unread  integer NOT NULL DEFAULT 0,
  last_message     text,
  last_message_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Add missing columns on existing table (idempotent)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS candidate_unread integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_unread  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_message     text,
  ADD COLUMN IF NOT EXISTS last_message_at  timestamptz,
  ADD COLUMN IF NOT EXISTS job_id           text;

CREATE INDEX IF NOT EXISTS cv_candidate_idx  ON conversations (candidate_id);
CREATE INDEX IF NOT EXISTS cv_employer_idx   ON conversations (employer_id);
CREATE INDEX IF NOT EXISTS cv_last_msg_idx   ON conversations (last_message_at DESC NULLS LAST);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cv_select" ON conversations;
DROP POLICY IF EXISTS "cv_insert" ON conversations;
DROP POLICY IF EXISTS "cv_update" ON conversations;
CREATE POLICY "cv_select" ON conversations FOR SELECT USING (true);
CREATE POLICY "cv_insert" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "cv_update" ON conversations FOR UPDATE USING (true) WITH CHECK (true);

-- ── messages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       text NOT NULL,
  sender_type     text NOT NULL CHECK (sender_type IN ('candidate','employer')),
  content         text NOT NULL,
  message_type    text NOT NULL DEFAULT 'text',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Add missing columns on existing table (idempotent)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_type  text,
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';

CREATE INDEX IF NOT EXISTS msg_conv_idx   ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS msg_sender_idx ON messages (sender_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "msg_select" ON messages;
DROP POLICY IF EXISTS "msg_insert" ON messages;
DROP POLICY IF EXISTS "msg_update" ON messages;
CREATE POLICY "msg_select" ON messages FOR SELECT USING (true);
CREATE POLICY "msg_insert" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "msg_update" ON messages FOR UPDATE USING (true) WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
