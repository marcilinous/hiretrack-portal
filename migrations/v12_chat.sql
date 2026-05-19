-- v12: Chat — RLS policies, indexes, and Realtime for messaging
-- conversations (9 cols) and messages (15 cols) already exist.
-- Idempotent: safe to re-run.

BEGIN;

-- ── conversations ─────────────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cv_select" ON conversations;
DROP POLICY IF EXISTS "cv_insert" ON conversations;
DROP POLICY IF EXISTS "cv_update" ON conversations;

-- Any authenticated or anon client can read/write (app-layer enforces access)
CREATE POLICY "cv_select" ON conversations FOR SELECT USING (true);
CREATE POLICY "cv_insert" ON conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "cv_update" ON conversations FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS cv_candidate_idx    ON conversations (candidate_id);
CREATE INDEX IF NOT EXISTS cv_employer_idx     ON conversations (employer_id);
CREATE INDEX IF NOT EXISTS cv_last_msg_idx     ON conversations (last_message_at DESC);

-- ── messages ──────────────────────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msg_select" ON messages;
DROP POLICY IF EXISTS "msg_insert" ON messages;
DROP POLICY IF EXISTS "msg_update" ON messages;

CREATE POLICY "msg_select" ON messages FOR SELECT USING (true);
CREATE POLICY "msg_insert" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "msg_update" ON messages FOR UPDATE USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS msg_conv_idx    ON messages (conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS msg_sender_idx  ON messages (sender_id);

-- ── Enable Realtime for live message delivery ─────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

COMMIT;
