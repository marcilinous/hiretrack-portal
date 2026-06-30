#!/usr/bin/env node
// scripts/generate-company-pages.js
//
// Generates /companies/<slug>.html for every company that has at least one
// active HireTrack job, plus a top-level /companies.html index page.
//
// Each company page lists active openings, embeds Organization + ItemList
// JSON-LD, and links back to /jobs/ + the company's job pages.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/generate-company-pages.js

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'companies');

const SB_URL = process.env.SUPABASE_URL || 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const BASE = process.env.SITE_BASE_URL || 'https://www.hiretrack.co.in';

if (!SB_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY env var is required.');
  process.exit(1);
}

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function shortId(id) {
  return String(id || '').replace(/-/g, '').slice(0, 8);
}

function jobSlug(job) {
  const parts = [job.title, job.company, job.city || job.location]
    .filter(Boolean)
    .map(slugify)
    .filter(Boolean);
  return (parts.join('-') || 'job') + '-' + shortId(job.id);
}

async function fetchJobs() {
  const url = `${SB_URL}/rest/v1/jobs?select=id,title,company,location,city,salary,job_type,posted_at,expires_at,delisted&delisted=eq.false&limit=10000`;
  const r = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase REST ${r.status}: ${await r.text()}`);
  const all = await r.json();
  const now = Date.now();
  return all.filter((j) => !j.expires_at || new Date(j.expires_at).getTime() > now);
}

function buildCompanyPage(company, jobs) {
  const slug = slugify(company);
  const url = `${BASE}/companies/${slug}.html`;
  const cities = Array.from(
    new Set(jobs.map((j) => j.city || (j.location || '').split(',')[0].trim()).filter(Boolean))
  );
  const titleH1 = `${company} Careers & Open Jobs`;
  const titleTag = `${company} Careers & Jobs | HireTrack`;
  const desc = `Find jobs at ${company}. ${jobs.length} open ${jobs.length === 1 ? 'position' : 'positions'}${cities.length ? ' in ' + cities.slice(0, 3).join(', ') : ''}. Apply now on HireTrack.`;

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company,
    url,
    sameAs: [],
  };
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: jobs.slice(0, 50).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE}/jobs/${jobSlug(j)}.html`,
      name: j.title,
    })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Companies', item: `${BASE}/companies.html` },
      { '@type': 'ListItem', position: 3, name: company, item: url },
    ],
  };

  const jobCards = jobs
    .slice(0, 50)
    .map(
      (j) => `
      <a class="cp-job-card" href="/jobs/${esc(jobSlug(j))}.html">
        <div class="cp-job-title">${esc(j.title)}</div>
        <div class="cp-job-meta">
          ${j.location ? `<span>📍 ${esc(j.location)}</span>` : ''}
          ${j.salary ? `<span>💰 ${esc(j.salary)}</span>` : ''}
          ${j.job_type ? `<span>${esc(j.job_type)}</span>` : ''}
        </div>
      </a>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titleTag)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(titleH1)} | HireTrack">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${BASE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleH1)} | HireTrack">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${BASE}/og-image.png">
<script type="application/ld+json">${JSON.stringify([orgLd, itemListLd, breadcrumbLd])}</script>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#2563eb">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/mobile.css">
<style>
body{padding-top:64px;background:#f8fafc;}
.cp-wrap{max-width:880px;margin:0 auto;padding:2rem 1.5rem 4rem;}
.cp-bc{font-size:0.8rem;color:#94a3b8;margin-bottom:1rem;}
.cp-bc a{color:#3b82f6;text-decoration:none;}
.cp-head{background:#fff;border:1.5px solid #e2e8f0;border-radius:16px;padding:1.75rem;margin-bottom:1.5rem;}
.cp-head h1{font-size:1.65rem;font-weight:800;color:#0f172a;margin:0 0 0.4rem;}
.cp-head p{font-size:0.95rem;color:#475569;margin:0 0 1rem;line-height:1.6;}
.cp-stats{display:flex;gap:1rem;flex-wrap:wrap;font-size:0.85rem;color:#64748b;}
.cp-stats span{background:#f1f5f9;padding:6px 12px;border-radius:20px;}
.cp-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.85rem;}
.cp-job-card{display:block;background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:1.1rem;text-decoration:none;color:#0f172a;transition:border-color 0.15s, box-shadow 0.15s;}
.cp-job-card:hover{border-color:#3b82f6;box-shadow:0 4px 14px rgba(59,130,246,0.1);}
.cp-job-title{font-size:0.95rem;font-weight:700;margin-bottom:0.35rem;}
.cp-job-meta{font-size:0.78rem;color:#64748b;display:flex;flex-wrap:wrap;gap:0.5rem 0.85rem;}
.cp-cta{background:linear-gradient(135deg,#1e3a5f,#0f172a);border-radius:14px;padding:1.5rem;text-align:center;color:#fff;margin-top:2rem;}
.cp-cta h2{font-size:1.1rem;font-weight:800;margin:0 0 0.4rem;}
.cp-cta p{color:#cbd5e1;font-size:0.85rem;margin:0 0 1rem;}
.cp-cta a{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:0.7rem 1.5rem;border-radius:8px;font-weight:700;font-size:0.88rem;}
@media (max-width:640px){.cp-grid{grid-template-columns:1fr;}}
</style>
</head>
<body>
<div id="navbar"></div>
<div class="cp-wrap">
  <nav class="cp-bc" aria-label="Breadcrumb">
    <a href="/index.html">Home</a> › <a href="/companies.html">Companies</a> › ${esc(company)}
  </nav>
  <div class="cp-head">
    <h1>${esc(titleH1)}</h1>
    <p>${esc(jobs.length)} active ${jobs.length === 1 ? 'opening' : 'openings'} at ${esc(company)}${cities.length ? ' across ' + cities.slice(0, 3).join(', ') : ''}. All listings verified by HireTrack.</p>
    <div class="cp-stats">
      <span>📂 ${esc(jobs.length)} ${jobs.length === 1 ? 'job' : 'jobs'}</span>
      ${cities.length ? `<span>📍 ${esc(cities.slice(0, 3).join(' · '))}</span>` : ''}
    </div>
  </div>
  <h2 style="font-size:1.1rem;font-weight:800;color:#0f172a;margin:0 0 1rem;">Open Roles at ${esc(company)}</h2>
  <div class="cp-grid">
    ${jobCards || '<p style="grid-column:1/-1;color:#94a3b8;text-align:center;padding:2rem 0;">No active openings right now — check back soon.</p>'}
  </div>
  <div class="cp-cta">
    <h2>About HireTrack</h2>
    <p>HireTrack helps India's SMEs hire faster and helps job seekers find roles at growing companies.</p>
    <a href="/jobs.html">Browse all jobs →</a>
  </div>
</div>
<footer class="ht-footer">
  <div class="ht-footer-bottom">
    <p class="ht-address" style="font-size:0.78rem;color:rgba(255,255,255,0.55);margin:0 0 0.35rem;">📍 Bengaluru, Karnataka, India</p>
    <p>© <span id="copy-year">2026</span> <span>HireTrack</span> — Find Jobs Across India. Built with ❤️ in Bengaluru.</p>
  </div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/sb-rest-shim.js"></script>
<script src="/app.js?v=6"></script>
<script>
  document.getElementById('navbar').innerHTML = renderNavbar('');
  (function(){var c=document.getElementById('copy-year');if(c)c.textContent=new Date().getFullYear();})();
</script>
</body>
</html>
`;
}

function buildIndexPage(companies) {
  const sorted = companies.slice().sort((a, b) => a.name.localeCompare(b.name));
  const rows = sorted
    .map(
      (c) =>
        `<li><a href="/companies/${esc(slugify(c.name))}.html">${esc(c.name)}</a> <span style="color:#94a3b8;font-size:0.82rem;">— ${esc(c.count)} ${c.count === 1 ? 'job' : 'jobs'}</span></li>`
    )
    .join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Companies Hiring on HireTrack | India SMEs &amp; Growth Companies</title>
<meta name="description" content="Browse all companies actively hiring on HireTrack — Indian SMEs, growth companies, and startups across every major city.">
<link rel="canonical" href="${BASE}/companies.html">
<meta name="robots" content="index, follow">
<meta property="og:title" content="Companies Hiring on HireTrack">
<meta property="og:description" content="Browse all companies actively hiring on HireTrack.">
<meta property="og:url" content="${BASE}/companies.html">
<meta property="og:image" content="${BASE}/og-image.png">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/mobile.css">
<style>
body{padding-top:64px;background:#f8fafc;}
.cl-wrap{max-width:900px;margin:0 auto;padding:2.5rem 1.5rem 4rem;}
.cl-wrap h1{font-size:1.85rem;font-weight:800;color:#0f172a;margin-bottom:0.5rem;}
.cl-wrap p.lead{color:#64748b;font-size:0.95rem;margin-bottom:1.5rem;}
.cl-list{columns:2;column-gap:1.5rem;padding:0;list-style:none;}
.cl-list li{padding:0.5rem 0;border-bottom:1px solid #e2e8f0;break-inside:avoid;font-size:0.92rem;}
.cl-list a{color:#1d4ed8;text-decoration:none;font-weight:600;}
.cl-list a:hover{text-decoration:underline;}
@media(max-width:640px){.cl-list{columns:1;}}
</style>
</head>
<body>
<div id="navbar"></div>
<div class="cl-wrap">
  <h1>Companies Hiring on HireTrack</h1>
  <p class="lead">${sorted.length} ${sorted.length === 1 ? 'company is' : 'companies are'} hiring on HireTrack right now. Pick one to see open roles.</p>
  <ol class="cl-list">
  ${rows || '<li style="list-style:none;color:#94a3b8;">No companies hiring right now — check back soon.</li>'}
  </ol>
</div>
<footer class="ht-footer">
  <div class="ht-footer-bottom">
    <p class="ht-address" style="font-size:0.78rem;color:rgba(255,255,255,0.55);margin:0 0 0.35rem;">📍 Bengaluru, Karnataka, India</p>
    <p>© <span id="copy-year">2026</span> <span>HireTrack</span> — Find Jobs Across India. Built with ❤️ in Bengaluru.</p>
  </div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/sb-rest-shim.js"></script>
<script src="/app.js?v=6"></script>
<script>
  document.getElementById('navbar').innerHTML = renderNavbar('');
  (function(){var c=document.getElementById('copy-year');if(c)c.textContent=new Date().getFullYear();})();
</script>
</body>
</html>
`;
}

async function main() {
  console.log('[generate-company-pages] Fetching jobs …');
  const jobs = await fetchJobs();
  // Group by company.
  const groups = new Map();
  for (const j of jobs) {
    if (!j.company) continue;
    if (!groups.has(j.company)) groups.set(j.company, []);
    groups.get(j.company).push(j);
  }
  await fs.mkdir(outDir, { recursive: true });
  for (const [company, list] of groups) {
    const html = buildCompanyPage(company, list);
    const slug = slugify(company);
    if (!slug) continue;
    await fs.writeFile(path.join(outDir, `${slug}.html`), html, 'utf8');
  }
  const companiesList = Array.from(groups.entries()).map(([name, list]) => ({
    name,
    count: list.length,
  }));
  await fs.writeFile(path.join(repoRoot, 'companies.html'), buildIndexPage(companiesList), 'utf8');
  console.log(
    `[generate-company-pages] Wrote ${groups.size} company page(s) + companies.html.`
  );
}

main().catch((e) => {
  console.error('[generate-company-pages] FAILED:', e);
  process.exit(1);
});
