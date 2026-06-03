-- v31: Enable RLS on feed_comments (the last public table without RLS).
--
-- feed_comments exists in the database but is NOT referenced anywhere in the app
-- (no HTML/JS reads, writes, or embeds it; it appears only as a planned table in
-- ARCHITECTURE.md). Enabling RLS with NO policy satisfies the Supabase linter and
-- denies anon/authenticated access, which is correct while the table is unused —
-- nothing in the app breaks.
--
-- TODO: when the comments feature is built, add real policies (likely mirroring
-- feed_posts: public SELECT on non-hidden rows, author-scoped INSERT/UPDATE/DELETE).
--
-- Run in the Supabase SQL editor.

BEGIN;

ALTER TABLE IF EXISTS public.feed_comments ENABLE ROW LEVEL SECURITY;

COMMIT;
