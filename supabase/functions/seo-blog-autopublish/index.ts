// supabase/functions/seo-blog-autopublish/index.ts
//
// Autonomous SEO/GEO blog automation for hiretrack.co.in.
//
// Daily pipeline (pg_cron → this function; see cron.sql):
//   1. Pick a HireTrack-relevant topic (Bengaluru SME hiring across multiple domains),
//      rotated by date.
//   2. Generate the post with Groq in JSON mode → { title, metaDescription,
//      keyTakeaways[], bodyHtml, faqs[] }. GEO-first: answer-first intro, a data
//      table, a bulleted list, semantic HTML5 (no Tailwind), an FAQ set.
//   3. Render a complete page using the SITE's own CSS (style.css / .article-wrap)
//      — NO render-blocking Tailwind CDN — with a "Key Takeaways" TL;DR block on
//      top, a visible FAQ section, and BOTH BlogPosting + FAQPage JSON-LD so
//      Google AI Overviews / Perplexity / ChatGPT can cite it.
//   4. Commit blog/post-YYYY-MM-DD.html via the GitHub REST API (Base64).
//   5. Insert a row into public.blog_posts (service role) so the post is picked up
//      by the sitemap and the dynamic blog.html index — no orphan pages.
//
// Required secrets: GROQ_API_KEY, GITHUB_TOKEN (fine-grained PAT, Contents R/W),
// CRON_SECRET. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
// Optional: GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH, SITE_ORIGIN.

interface Topic {
  category: string;
  angle: string;
}

interface Faq {
  question: string;
  answer: string;
}

interface Article {
  title: string;
  metaDescription: string;
  keyTakeaways: string[];
  bodyHtml: string;
  faqs: Faq[];
}

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // matches api/ai.js

const TOPICS: Topic[] = [
  { category: "Tech & Data", angle: "In-demand software development, IT support, and Data Analyst skills for Bengaluru SMEs" },
  { category: "Sales & Marketing", angle: "How Bengaluru startups and SMEs are hiring local sales executives and digital marketing talent" },
  { category: "Operations", angle: "SME hiring trends for office administrators, customer support, and operations managers in Karnataka" },
  { category: "Hiring Strategy", angle: "How small businesses in Bengaluru can speed up recruitment without huge job board fees" },
  { category: "Salary Insights", angle: "Entry-level vs mid-level salary expectations across different industries in Bengaluru SMEs" },
  { category: "HR Advice", angle: "Best practices for screening, interviewing, and onboarding new employees quickly in a fast-paced SME" },
  { category: "Local Markets", angle: "Top hiring hotspots: Whitefield, Electronic City, and Koramangala SME business growth trends" },
];

function logError(stage: string, err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(`[seo-blog-autopublish] ${stage}: ${msg}`);
}

function istDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function istDayOfYear(): number {
  const [y, m, d] = istDate().split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

function pickTopic(): Topic {
  return TOPICS[istDayOfYear() % TOPICS.length];
}

// UTF-8 safe Base64 (GitHub requires Base64-encoded content).
function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function generateArticle(apiKey: string, topic: Topic, prettyDate: string): Promise<Article> {
  const system = [
    "You are an expert SEO + GEO (Generative Engine Optimization) writer for HireTrack",
    "(hiretrack.co.in), a jobs-first platform for India's SME hiring market, focused on",
    "Bengaluru/Karnataka across multiple business domains like Tech, Sales, Operations, HR, and Administration.",
    "",
    "Return a single JSON object (no markdown, no commentary) with EXACTLY these keys:",
    '  "title": string (<= 60 chars, compelling, keyword-rich)',
    '  "metaDescription": string (<= 158 chars, answer-first)',
    '  "keyTakeaways": string[] (3-5 short, factual TL;DR bullets)',
    '  "bodyHtml": string (the article body as semantic HTML5)',
    '  "faqs": [{ "question": string, "answer": string }] (4-6 entries)',
    "",
    "bodyHtml RULES:",
    "- Semantic HTML5 ONLY: <p>, <h2>, <h3>, <ul>/<li>, <table><thead><tbody><th><td>, <strong>.",
    "- NO Tailwind / utility classes, NO inline styles, NO <h1>, NO <html>/<head>/<body>, NO markdown.",
    "- The FIRST element must be a <p> that directly answers the topic in 2-3 sentences (for AI snippets).",
    "- Include at least one <table> with realistic data (e.g. role, salary range, demand) and one <ul>.",
    "- ~550-650 words. Specific to Bengaluru/Karnataka SMEs and the specified topic category. Mention HireTrack once or twice.",
    "- Frame numbers as typical/estimated ranges, not official statistics.",
    "faqs: real questions a hiring manager or job seeker would ask, with concise factual answers.",
  ].join("\n");

  const user = `Topic category: ${topic.category}\nTopic angle: ${topic.angle}\nToday: ${prettyDate}\nReturn the JSON now.`;

  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.7,
      max_tokens: 2600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = (await resp.json()) as GroqResponse;
  if (!resp.ok) throw new Error(`Groq ${resp.status}: ${data.error?.message ?? JSON.stringify(data)}`);

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Groq returned empty content");

  let parsed: Partial<Article>;
  try {
    parsed = JSON.parse(raw) as Partial<Article>;
  } catch {
    throw new Error("Groq did not return valid JSON");
  }

  const article: Article = {
    title: String(parsed.title ?? topic.angle).trim(),
    metaDescription: String(parsed.metaDescription ?? topic.angle).trim().slice(0, 158),
    keyTakeaways: Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways.map(String) : [],
    bodyHtml: String(parsed.bodyHtml ?? "").trim(),
    faqs: Array.isArray(parsed.faqs)
      ? parsed.faqs
          .filter((f) => f && f.question && f.answer)
          .map((f) => ({ question: String(f.question), answer: String(f.answer) }))
      : [],
  };

  if (!article.bodyHtml || !/<p[\s>]/i.test(article.bodyHtml)) {
    throw new Error("Generated bodyHtml missing/invalid");
  }
  return article;
}

// Build the FAQPage JSON-LD from the AI's Q&A (we build it so it is always valid).
function faqJsonLd(faqs: Faq[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  });
}

function blogPostingJsonLd(a: Article, canonical: string, isoDate: string, category: string, origin: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    description: a.metaDescription,
    datePublished: isoDate,
    dateModified: isoDate,
    articleSection: category,
    author: { "@type": "Organization", name: "HireTrack" },
    publisher: {
      "@type": "Organization",
      name: "HireTrack",
      logo: { "@type": "ImageObject", url: `${origin}/og-image.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
  });
}

// Renders a complete page using the SITE's CSS (../style.css) + per-post article
// styles (mirrors the hand-written posts in /blog) — no Tailwind CDN.
function buildPage(args: {
  article: Article;
  canonical: string;
  category: string;
  prettyDate: string;
  isoDate: string;
  origin: string;
}): string {
  const { article, canonical, category, prettyDate, isoDate, origin } = args;

  const takeaways = article.keyTakeaways.length
    ? `<div class="ht-tldr"><h2>Key Takeaways</h2><ul>${article.keyTakeaways
        .map((t) => `<li>${escapeHtml(t)}</li>`)
        .join("")}</ul></div>`
    : "";

  const faqSection = article.faqs.length
    ? `<section class="ht-faq"><h2>Frequently Asked Questions</h2>${article.faqs
        .map(
          (f) =>
            `<details><summary>${escapeHtml(f.question)}</summary><p>${escapeHtml(f.answer)}</p></details>`,
        )
        .join("")}</section>`
    : "";

  const faqLd = article.faqs.length
    ? `<script type="application/ld+json">${faqJsonLd(article.faqs)}</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(article.title)} | HireTrack Blog</title>
<meta name="description" content="${escapeHtml(article.metaDescription)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(article.title)}">
<meta property="og:description" content="${escapeHtml(article.metaDescription)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="HireTrack">
<meta property="og:image" content="${origin}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(article.title)}">
<meta name="twitter:description" content="${escapeHtml(article.metaDescription)}">
<link rel="icon" href="/favicon.ico">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../mobile.css">
<style>
.article-hero{background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:3rem 1.5rem;color:#fff;text-align:center;}
.article-hero .art-cat{display:inline-block;background:rgba(59,130,246,0.3);color:#93c5fd;font-size:0.75rem;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:1rem;text-transform:uppercase;}
.article-hero h1{font-size:2rem;font-weight:800;max-width:750px;margin:0 auto 1rem;line-height:1.3;}
.article-hero .art-meta{color:#94a3b8;font-size:0.85rem;}
.article-wrap{max-width:760px;margin:2.5rem auto;padding:0 1.5rem;}
.article-wrap h2{font-size:1.3rem;font-weight:800;color:#0f172a;margin:2rem 0 0.75rem;padding-bottom:0.5rem;border-bottom:2px solid #e2e8f0;}
.article-wrap h3{font-size:1.05rem;font-weight:700;color:#1e293b;margin:1.5rem 0 0.5rem;}
.article-wrap p{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:1rem;}
.article-wrap ul,.article-wrap ol{padding-left:1.5rem;margin-bottom:1rem;}
.article-wrap li{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:0.4rem;}
.article-wrap strong{color:#0f172a;}
.article-wrap table{width:100%;border-collapse:collapse;margin:1.25rem 0;font-size:0.9rem;}
.article-wrap th,.article-wrap td{border:1px solid #e2e8f0;padding:0.6rem 0.75rem;text-align:left;}
.article-wrap th{background:#f8fafc;font-weight:700;color:#0f172a;}
.ht-tldr{background:#eff6ff;border:1px solid #dbeafe;border-radius:14px;padding:1.25rem 1.5rem;margin-bottom:1.75rem;}
.ht-tldr h2{border:none;margin:0 0 0.5rem;padding:0;font-size:1.05rem;color:#1d4ed8;}
.ht-tldr ul{margin:0;}
.ht-faq{margin-top:2.5rem;}
.ht-faq details{border:1px solid #e2e8f0;border-radius:10px;padding:0.85rem 1.1rem;margin-bottom:0.6rem;background:#fff;}
.ht-faq summary{font-weight:700;color:#0f172a;cursor:pointer;}
.ht-faq details p{margin:0.6rem 0 0;}
.ht-cta{margin:2.5rem 0 0;border:1.5px solid #e2e8f0;border-radius:16px;padding:1.5rem;text-align:center;background:#fff;}
.ht-cta a{display:inline-block;background:#2563eb;color:#fff;font-weight:700;border-radius:10px;padding:0.7rem 1.4rem;text-decoration:none;}
</style>
<script type="application/ld+json">${blogPostingJsonLd(article, canonical, isoDate, category, origin)}</script>
${faqLd}
<script async src="https://www.googletagmanager.com/gtag/js?id=G-76H5XQV27B"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-76H5XQV27B');</script>
</head>
<body>

<div id="navbar"></div>

<div class="article-hero">
  <span class="art-cat">${escapeHtml(category)}</span>
  <h1>${escapeHtml(article.title)}</h1>
  <div class="art-meta">Published ${escapeHtml(prettyDate)} · HireTrack</div>
</div>

<div class="article-wrap">
${takeaways}
${article.bodyHtml}
${faqSection}
  <div class="ht-cta">
    <h2 style="border:none;margin:0 0 0.5rem;">Hiring in Bengaluru?</h2>
    <p>Post a job free and reach top talent across Karnataka on HireTrack.</p>
    <a href="/employer-auth.html">Post a Job →</a>
  </div>
</div>

<footer class="ht-footer">
  <div class="ht-footer-bottom" style="text-align:center;padding:1.5rem;">
    <nav style="margin-bottom:0.75rem;">
      <a href="/jobs.html">Browse Jobs</a> ·
      <a href="/post-job.html">Post a Job</a> ·
      <a href="/pricing.html">Pricing</a> ·
      <a href="/blog.html">Blog</a> ·
      <a href="/interview-tips.html">Interview Tips</a> ·
      <a href="/about.html">About</a> ·
      <a href="/contact.html">Contact</a>
    </nav>
    <p>© <span id="copy-year">${new Date().getFullYear()}</span> HireTrack — Find Jobs Across India. Built in Bengaluru.</p>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/sb-rest-shim.js"></script>
<script src="../app.js"></script>
<script>document.getElementById('navbar').innerHTML = renderNavbar('blog');</script>
<script>(function(){var _cy=document.getElementById("copy-year");if(_cy)_cy.textContent=new Date().getFullYear();})();</script>
</body>
</html>`;
}

async function githubGetSha(owner: string, repo: string, path: string, branch: string, token: string): Promise<string | undefined> {
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hiretrack-seo-bot",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (resp.status === 404) return undefined;
  if (!resp.ok) throw new Error(`GitHub GET ${resp.status}: ${await resp.text()}`);
  return ((await resp.json()) as { sha?: string }).sha;
}

async function githubPutFile(args: {
  owner: string; repo: string; path: string; branch: string; token: string;
  contentBase64: string; message: string; sha?: string;
}): Promise<string> {
  const { owner, repo, path, branch, token, contentBase64, message, sha } = args;
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "hiretrack-seo-bot",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ message, content: contentBase64, branch, sha }),
  });
  if (!resp.ok) throw new Error(`GitHub PUT ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { content?: { html_url?: string } };
  return data.content?.html_url ?? path;
}

// Register the post so the sitemap + dynamic blog index pick it up (no orphans).
async function logBlogPost(row: {
  slug: string; url: string; title: string; description: string; category: string; published_at: string;
}): Promise<void> {
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !serviceKey) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

  const resp = await fetch(`${sbUrl}/rest/v1/blog_posts?on_conflict=slug`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) throw new Error(`Supabase insert ${resp.status}: ${await resp.text()}`);
}

Deno.serve(async (req: Request) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const groqKey = Deno.env.get("GROQ_API_KEY");
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!groqKey || !githubToken) {
    logError("config", "Missing GROQ_API_KEY or GITHUB_TOKEN");
    return json(500, { ok: false, error: "Server not configured" });
  }

  const owner = Deno.env.get("GITHUB_OWNER") ?? "marcilinous";
  const repo = Deno.env.get("GITHUB_REPO") ?? "hiretrack-portal";
  const branch = Deno.env.get("GITHUB_BRANCH") ?? "main";
  const origin = Deno.env.get("SITE_ORIGIN") ?? "https://www.hiretrack.co.in";

  const isoDate = istDate();
  const prettyDate = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
  const topic = pickTopic();
  const slug = `post-${isoDate}`;
  const path = `blog/${slug}.html`;
  const canonical = `${origin}/${path}`;

  // 1 + 2. Generate.
  let article: Article;
  try {
    article = await generateArticle(groqKey, topic, prettyDate);
  } catch (err) {
    logError("groq", err);
    return json(502, { ok: false, error: "AI generation failed" });
  }

  // 3. Render full SEO/GEO page (site CSS, TL;DR, FAQ, dual JSON-LD).
  const page = buildPage({ article, canonical, category: topic.category, prettyDate, isoDate, origin });

  // 4. Commit to GitHub.
  let commitUrl: string;
  try {
    const sha = await githubGetSha(owner, repo, path, branch, githubToken);
    commitUrl = await githubPutFile({
      owner, repo, path, branch, token: githubToken,
      contentBase64: toBase64(page),
      message: `chore(blog): auto-publish ${isoDate} — ${article.title}`,
      sha,
    });
  } catch (err) {
    logError("github", err);
    return json(502, { ok: false, error: "GitHub publish failed" });
  }

  // 5. Register in blog_posts (sitemap + dynamic index). Non-fatal: the page is
  // already live; log loudly if this fails so it can be backfilled.
  let logged = true;
  try {
    await logBlogPost({
      slug,
      url: `/${path}`,
      title: article.title,
      description: article.metaDescription,
      category: topic.category,
      published_at: new Date().toISOString(),
    });
  } catch (err) {
    logged = false;
    logError("blog_posts", err);
  }

  console.log(`[seo-blog-autopublish] published ${path} (logged=${logged})`);
  return json(200, { ok: true, path, title: article.title, canonical, commit: commitUrl, logged });
});
