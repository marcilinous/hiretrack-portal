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

## Notes

- Generated pages load the **Tailwind CDN** so the AI's Tailwind utility classes
  render on this otherwise no-build static site. To match the existing hand-written
  posts visually instead, swap `buildPage()` to use the site's `style.css`
  `.article-wrap` / `.article-hero` classes and have the prompt emit those.
- The post is reachable by URL + included via JSON-LD, but it is **not** auto-added
  to `blog.html` or `sitemap.xml` — wire those in if you want it in the index/sitemap.
- Re-running on the same day overwrites that day's file (idempotent via the file SHA).
