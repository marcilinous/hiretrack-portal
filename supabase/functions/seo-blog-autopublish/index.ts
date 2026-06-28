// supabase/functions/seo-blog-autopublish/index.ts
//
// Autonomous SEO/GEO blog automation for hiretrack.co.in.
//
// Pipeline (runs daily via pg_cron — see cron.sql):
//   1. Pick a HireTrack-relevant topic (rotates by date).
//   2. Generate a ~600-word, answer-first SEO/GEO post via Groq (raw HTML body,
//      Tailwind classes, with a data <table> and a bulleted <ul>).
//   3. Wrap it in a complete, SEO-optimised HTML document (canonical, Open Graph,
//      JSON-LD Article schema, Tailwind CDN so the utility classes render on this
//      no-build static site).
//   4. Commit it to blog/post-YYYY-MM-DD.html via the GitHub REST API (Base64).
//      Vercel auto-deploys main, so the post goes live.
//
// Required secrets (supabase secrets set ...):
//   GROQ_API_KEY     - Groq API key
//   GITHUB_TOKEN     - fine-grained PAT, Contents: Read and write on the repo
//   CRON_SECRET      - shared secret; the invoker must send it as x-cron-secret
// Optional (have sensible defaults):
//   GITHUB_OWNER  (default "marcilinous")
//   GITHUB_REPO   (default "hiretrack-portal")
//   GITHUB_BRANCH (default "main")
//   SITE_ORIGIN   (default "https://www.hiretrack.co.in")

interface Topic {
  category: string;
  angle: string;
}

interface GroqResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

interface GithubContent {
  sha?: string;
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile"; // matches api/ai.js

// HireTrack-relevant topic pool (hyper-local SME hiring + Data/MIS job market,
// Bengaluru/Karnataka focus). Rotated by day so consecutive posts stay distinct.
const TOPICS: Topic[] = [
  { category: "Hiring Trends", angle: "Hyper-local SME hiring trends in Bengaluru this quarter" },
  { category: "Data Careers", angle: "Data Analyst job market and salaries in Bengaluru" },
  { category: "MIS Careers", angle: "MIS Executive demand and skills in Karnataka SMEs" },
  { category: "SME Hiring", angle: "How Bengaluru SMEs hire faster and cheaper than big job boards" },
  { category: "Salary Insights", angle: "Entry-level vs mid-level Data/MIS salaries across Bengaluru" },
  { category: "Skills", angle: "Excel, SQL and Power BI skills employers want in Bengaluru" },
  { category: "Local Markets", angle: "Hiring hotspots: Whitefield, Electronic City and Koramangala SMEs" },
];

function logError(stage: string, err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(`[seo-blog-autopublish] ${stage}: ${msg}`);
}

// YYYY-MM-DD in Asia/Kolkata (so the filename matches the 8 AM IST run).
function istDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function istDayOfYear(): number {
  const parts = istDate().split("-").map(Number);
  const start = Date.UTC(parts[0], 0, 0);
  const now = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  return Math.floor((now - start) / 86400000);
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

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function generateArticle(apiKey: string, topic: Topic, prettyDate: string): Promise<string> {
  const system = [
    "You are an expert SEO and GEO (Generative Engine Optimization) content writer for HireTrack",
    "(hiretrack.co.in), a jobs-first platform for India's SME hiring market, focused on Bengaluru/Karnataka",
    "and Data Analyst / MIS roles.",
    "",
    "Write a blog post of about 600 words. STRICT OUTPUT RULES:",
    "- Output RAW, VALID HTML ONLY. No markdown, no code fences, no commentary, no <html>/<head>/<body> wrapper.",
    "- Start with a single <h1> headline, then a first <p> that DIRECTLY answers/summarises the topic in 2-3",
    "  sentences (answer-first, for AI/GEO snippets).",
    "- Include at least one structured HTML <table> with real, plausible data (e.g. role, salary range, demand).",
    "- Include at least one bulleted <ul> list.",
    "- Use <h2> section headings.",
    "- Style every element with standard Tailwind CSS utility classes (e.g. text-2xl font-bold mb-4,",
    "  list-disc pl-6, w-full text-left border-collapse, etc.). The table must use Tailwind classes on",
    "  table/thead/th/td.",
    "- Be specific to Bengaluru/Karnataka SMEs and the Data/MIS job market. Naturally mention HireTrack once or twice.",
    "- Do not invent fake statistics as if official; frame numbers as typical/estimated ranges.",
  ].join("\n");

  const user = `Topic category: ${topic.category}\nTopic angle: ${topic.angle}\nToday: ${prettyDate}\nWrite the HTML article now.`;

  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.7,
      max_tokens: 2400,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = (await resp.json()) as GroqResponse;
  if (!resp.ok) {
    throw new Error(`Groq ${resp.status}: ${data.error?.message ?? JSON.stringify(data)}`);
  }
  let html = data.choices?.[0]?.message?.content?.trim();
  if (!html) throw new Error("Groq returned empty content");

  // Defensive: strip accidental markdown code fences.
  html = html.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!/<h1[\s>]/i.test(html)) throw new Error("Generated content missing <h1> (invalid format)");
  return html;
}

// Wrap the AI article body in a complete, SEO/GEO-ready HTML document.
function buildPage(args: {
  articleHtml: string;
  title: string;
  description: string;
  canonical: string;
  category: string;
  prettyDate: string;
  isoDate: string;
  origin: string;
}): string {
  const { articleHtml, title, description, canonical, category, prettyDate, isoDate, origin } = args;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} | HireTrack</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="HireTrack">
<meta property="og:image" content="${origin}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<link rel="icon" href="/favicon.ico">
<script src="https://cdn.tailwindcss.com"></script>
<script type="application/ld+json">${jsonLd}</script>
</head>
<body class="bg-slate-50 text-slate-800 antialiased">
  <header class="bg-slate-900 text-white">
    <div class="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
      <a href="${origin}" class="font-extrabold tracking-tight text-lg">HireTrack</a>
      <a href="${origin}/blog.html" class="text-sm text-blue-300 hover:text-blue-200">← All articles</a>
    </div>
  </header>
  <main class="max-w-3xl mx-auto px-6 py-10">
    <p class="text-xs font-bold uppercase tracking-wide text-blue-600 mb-2">${escapeHtml(category)}</p>
    <p class="text-xs text-slate-400 mb-6">Published ${escapeHtml(prettyDate)} · HireTrack</p>
    <article class="prose max-w-none">
${articleHtml}
    </article>
    <div class="mt-12 rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <h2 class="text-xl font-bold mb-2">Hiring in Bengaluru?</h2>
      <p class="text-slate-600 mb-4">Post a job free and reach Data/MIS talent across Karnataka on HireTrack.</p>
      <a href="${origin}/employer-auth.html" class="inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">Post a Job →</a>
    </div>
  </main>
  <footer class="border-t border-slate-200 py-8 text-center text-xs text-slate-400">
    © ${new Date().getFullYear()} HireTrack — Built in Bengaluru.
  </footer>
</body>
</html>`;
}

async function githubGetSha(
  owner: string,
  repo: string,
  path: string,
  branch: string,
  token: string,
): Promise<string | undefined> {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hiretrack-seo-bot",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (resp.status === 404) return undefined;
  if (!resp.ok) throw new Error(`GitHub GET ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as GithubContent;
  return data.sha;
}

async function githubPutFile(args: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
  contentBase64: string;
  message: string;
  sha?: string;
}): Promise<string> {
  const { owner, repo, path, branch, token, contentBase64, message, sha } = args;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const resp = await fetch(url, {
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
  return data.content?.html_url ?? `${path}`;
}

Deno.serve(async (req: Request) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  // Authorize: only callers presenting the shared secret may publish.
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
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const topic = pickTopic();
  const path = `blog/post-${isoDate}.html`;
  const canonical = `${origin}/${path}`;

  // 1 + 2. Generate the article.
  let articleHtml: string;
  try {
    articleHtml = await generateArticle(groqKey, topic, prettyDate);
  } catch (err) {
    logError("groq", err);
    return json(502, { ok: false, error: "AI generation failed" });
  }

  // Derive title + meta description from the generated HTML.
  const h1 = articleHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const firstP = articleHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const title = h1 ? stripTags(h1[1]) : topic.angle;
  const description = (firstP ? stripTags(firstP[1]) : topic.angle).slice(0, 158);

  // 3. Wrap into a full SEO/GEO page.
  const page = buildPage({
    articleHtml,
    title,
    description,
    canonical,
    category: topic.category,
    prettyDate,
    isoDate,
    origin,
  });

  // 4. Commit to GitHub.
  try {
    const sha = await githubGetSha(owner, repo, path, branch, githubToken);
    const htmlUrl = await githubPutFile({
      owner,
      repo,
      path,
      branch,
      token: githubToken,
      contentBase64: toBase64(page),
      message: `chore(blog): auto-publish ${isoDate} — ${title}`,
      sha,
    });
    console.log(`[seo-blog-autopublish] published ${path} (${sha ? "updated" : "created"})`);
    return json(200, { ok: true, path, title, canonical, commit: htmlUrl, updated: Boolean(sha) });
  } catch (err) {
    logError("github", err);
    return json(502, { ok: false, error: "GitHub publish failed" });
  }
});
