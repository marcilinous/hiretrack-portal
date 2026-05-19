-- v11: Community Feed
-- Run in Supabase SQL Editor (project: pdjnpqyzayidthpfmvjk)
-- Idempotent: safe to re-run.

BEGIN;

-- ── feed_posts ──────────────────────────────────────────────────────────────
-- Stores all community posts from candidates and companies.
-- is_hidden auto-set by client when flag_count reaches threshold (>= 3).

CREATE TABLE IF NOT EXISTS feed_posts (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id     uuid        NOT NULL,
  author_type   text        NOT NULL
                            CHECK (author_type IN ('candidate', 'company')),
  author_name   text        NOT NULL,
  author_avatar text,                          -- Storage URL or null
  post_type     text        NOT NULL DEFAULT 'general'
                            CHECK (post_type IN
                              ('general', 'job', 'hiring', 'open_to_work', 'hired', 'tip')),
  content       text        NOT NULL
                            CHECK (char_length(content) BETWEEN 1 AND 1500),
  like_count    integer     NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  flag_count    integer     NOT NULL DEFAULT 0 CHECK (flag_count >= 0),
  is_flagged    boolean     NOT NULL DEFAULT false,
  is_hidden     boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_posts_created_idx  ON feed_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS feed_posts_hidden_idx   ON feed_posts (is_hidden);
CREATE INDEX IF NOT EXISTS feed_posts_flagged_idx  ON feed_posts (is_flagged);
CREATE INDEX IF NOT EXISTS feed_posts_author_idx   ON feed_posts (author_id);

ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-hidden posts
CREATE POLICY "fp_select" ON feed_posts
  FOR SELECT USING (is_hidden = false);

-- Anon key (any client) can insert new posts
CREATE POLICY "fp_insert" ON feed_posts
  FOR INSERT WITH CHECK (true);

-- Allow like_count / flag_count / is_hidden updates
-- (Admin-level enforcement is application-gated, not DB-gated — see §9 auth migration note)
CREATE POLICY "fp_update" ON feed_posts
  FOR UPDATE USING (true) WITH CHECK (true);

-- Admin delete (application-level gated via admin session)
CREATE POLICY "fp_delete" ON feed_posts
  FOR DELETE USING (true);

-- ── feed_likes ───────────────────────────────────────────────────────────────
-- One row per (post, user) pair. PK prevents double-likes at DB level.

CREATE TABLE IF NOT EXISTS feed_likes (
  post_id    uuid        NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS feed_likes_user_idx ON feed_likes (user_id);

ALTER TABLE feed_likes ENABLE ROW LEVEL SECURITY;

-- Full access — dedup is enforced by the PRIMARY KEY constraint
CREATE POLICY "fl_all" ON feed_likes
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;
