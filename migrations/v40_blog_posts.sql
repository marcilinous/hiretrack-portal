-- v40: blog_posts registry for the autonomous SEO/GEO blog pipeline.
--
-- The seo-blog-autopublish Edge Function writes one row per published post (via
-- the service role). Two readers consume it:
--   * api/sitemap.js  — emits <url> entries so posts are crawled (no orphans).
--   * blog.html       — dynamically renders the latest posts as cards (internal
--                       linking + discovery).
--
-- Public SELECT (blog metadata is public); writes are service-role only.
-- Idempotent. Run in the Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug          text UNIQUE NOT NULL,          -- e.g. post-2026-06-28
  url           text NOT NULL,                 -- e.g. /blog/post-2026-06-28.html
  title         text NOT NULL,
  description   text,
  category      text,
  published_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_published_idx ON public.blog_posts (published_at DESC);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Public read (anon/authenticated); inserts/updates happen via the service key.
DROP POLICY IF EXISTS blog_posts_select ON public.blog_posts;
CREATE POLICY blog_posts_select ON public.blog_posts FOR SELECT USING (true);

COMMIT;

-- Verify:
--   select slug, title, published_at from public.blog_posts order by published_at desc limit 5;
