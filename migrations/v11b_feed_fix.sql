-- v11b: Feed tables fix
-- Handles case where feed_posts already exists from a prior schema (12 cols).
-- Adds any missing columns, drops and recreates RLS policies, creates feed_likes.
-- Idempotent: safe to re-run.

BEGIN;

-- ── Add missing columns to pre-existing feed_posts ──────────────────────────
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS author_avatar text;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS post_type     text    NOT NULL DEFAULT 'general';
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS like_count    integer NOT NULL DEFAULT 0;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS flag_count    integer NOT NULL DEFAULT 0;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS is_flagged    boolean NOT NULL DEFAULT false;
ALTER TABLE feed_posts ADD COLUMN IF NOT EXISTS is_hidden     boolean NOT NULL DEFAULT false;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS feed_posts_created_idx ON feed_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS feed_posts_hidden_idx  ON feed_posts (is_hidden);
CREATE INDEX IF NOT EXISTS feed_posts_flagged_idx ON feed_posts (is_flagged);
CREATE INDEX IF NOT EXISTS feed_posts_author_idx  ON feed_posts (author_id);

-- ── RLS policies (drop + recreate for idempotency) ───────────────────────────
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fp_select" ON feed_posts;
DROP POLICY IF EXISTS "fp_insert" ON feed_posts;
DROP POLICY IF EXISTS "fp_update" ON feed_posts;
DROP POLICY IF EXISTS "fp_delete" ON feed_posts;

-- Public can read only visible posts
CREATE POLICY "fp_select" ON feed_posts
  FOR SELECT USING (is_hidden = false);

-- Anon key (any client) can create posts
CREATE POLICY "fp_insert" ON feed_posts
  FOR INSERT WITH CHECK (true);

-- Allow like_count / flag_count / is_hidden updates
CREATE POLICY "fp_update" ON feed_posts
  FOR UPDATE USING (true) WITH CHECK (true);

-- Admin delete (application-level gated)
CREATE POLICY "fp_delete" ON feed_posts
  FOR DELETE USING (true);

-- ── feed_likes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_likes (
  post_id    uuid        NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS feed_likes_user_idx ON feed_likes (user_id);

ALTER TABLE feed_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fl_all" ON feed_likes;
CREATE POLICY "fl_all" ON feed_likes
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;
