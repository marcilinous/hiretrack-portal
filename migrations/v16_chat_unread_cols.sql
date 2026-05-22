-- v16: Add missing unread-count columns to conversations table
-- Safe to re-run (IF NOT EXISTS / DO NOTHING pattern).

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS candidate_unread integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employer_unread  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_message     text,
  ADD COLUMN IF NOT EXISTS last_message_at  timestamptz;
