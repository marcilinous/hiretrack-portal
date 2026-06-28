# seo-blog-autopublish

Autonomous daily SEO/GEO blog automation: Groq generates a ~600-word Bengaluru
SME / Data-MIS post → committed to `blog/post-YYYY-MM-DD.html` via the GitHub REST
API → Vercel auto-deploys `main` → the post is live.

## 1. Set secrets

```bash
supabase secrets set \
  GROQ_API_KEY=...      \   # Groq API key
  GITHUB_TOKEN=...      \   # fine-grained PAT, Contents: Read and write on marcilinous/hiretrack-portal
  CRON_SECRET=...           # any long random string; the cron job must send it
# Optional overrides: GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, SITE_ORIGIN
```

## 2. Deploy

```bash
supabase functions deploy seo-blog-autopublish
```

The function authorizes on the `x-cron-secret` header (the Supabase gateway still
requires a valid JWT, satisfied by the anon key the cron job sends as `Authorization`).

## 3. Schedule (8:00 AM IST daily)

Run `cron.sql` in the Supabase SQL editor after filling in `<SUPABASE_ANON_KEY>`
and `<CRON_SECRET>`. 8:00 AM IST = 02:30 UTC (`30 2 * * *`).

## Manual test

```bash
curl -i -X POST \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "x-cron-secret: <CRON_SECRET>" \
  https://pdjnpqyzayidthpfmvjk.supabase.co/functions/v1/seo-blog-autopublish
```

## Prerequisite migration

Apply `migrations/v40_blog_posts.sql` (creates `public.blog_posts`, public-read /
service-role-write). The function logs each post there; the sitemap and the blog
index read from it.

## SEO / GEO design

- **No orphan pages.** After committing to GitHub, the function inserts the post
  into `blog_posts`. `api/sitemap.js` emits a `<url>` for every row, and
  `blog.html` renders the latest posts as cards — so each post is crawlable and
  internally linked automatically.
- **GEO-first content.** The Groq prompt runs in JSON mode and returns a title,
  meta description, a **Key Takeaways** TL;DR, semantic-HTML body (answer-first
  intro, data table, bulleted list) and an FAQ set. The page renders a visible FAQ
  plus **BlogPosting + FAQPage JSON-LD** so AI engines (Google AI Overviews,
  Perplexity, ChatGPT) can cite it.
- **Site-native styling.** Pages use the site's `../style.css` + the standard
  `.article-hero` / `.article-wrap` classes (no render-blocking Tailwind CDN), so
  they match the hand-written posts and keep Core Web Vitals clean.
- Re-running on the same day overwrites that day's file (file-SHA idempotent) and
  upserts the `blog_posts` row (`on_conflict=slug`).
