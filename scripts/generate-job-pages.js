#!/usr/bin/env node
// scripts/generate-job-pages.js
//
// Build-time SSG for HireTrack job pages.
//
// Queries Supabase for every active job and emits a complete, indexable
// HTML file per job at /jobs/<slug>-<shortid>.html. Each file ships with:
//   • unique <title>, meta description, canonical URL, og/twitter tags
//   • JSON-LD JobPosting + BreadcrumbList
//   • the job details rendered in static HTML (apply CTA, description,
//     chips, skills) so Googlebot and no-JS users see the full content
//   • a small client script that hydrates the page once on load (view
//     counter, application status, save/apply buttons, similar jobs)
//
// Run locally:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/generate-job-pages.js
//
// In Vercel: the build hook (vercel.json buildCommand or a GitHub Action)
// runs the same command on each deploy; a Supabase webhook on jobs INSERT
// can also POST to a deploy hook to trigger a fresh build.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'jobs');

const SB_URL = process.env.SUPABASE_URL || 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const BASE = process.env.SITE_BASE_URL || 'https://www.hiretrack.co.in';
const DRY_RUN = process.argv.includes('--dry-run');

if (!SB_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) env var is required.');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────
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

function empType(t) {
  if (!t) return 'FULL_TIME';
  const m = {
    'Full Time': 'FULL_TIME',
    'Part Time': 'PART_TIME',
    Contract: 'CONTRACTOR',
    Remote: 'FULL_TIME',
    Hybrid: 'FULL_TIME',
    'Walk-in': 'OTHER',
  };
  return m[t] || 'FULL_TIME';
}

function parseSalary(salaryStr) {
  if (!salaryStr) return null;
  const s = String(salaryStr).replace(/[₹,\s]/g, '');
  const range = s.match(/^(\d+(?:\.\d+)?)[Ll]?(?:PA)?[-–](\d+(?:\.\d+)?)[Ll]?(?:PA)?$/i);
  if (range) return { min: parseFloat(range[1]) * 100000, max: parseFloat(range[2]) * 100000 };
  const single = s.match(/^(\d+(?:\.\d+)?)[Ll](?:PA)?$/i);
  if (single) return { value: parseFloat(single[1]) * 100000 };
  return null;
}

function parseExpMonths(expStr) {
  if (!expStr) return undefined;
  const s = expStr.toLowerCase();
  if (s.includes('fresher') || /^0(\s|$|-)/.test(s)) return 0;
  const m = s.match(/(\d+)\s*[-–+]?\s*(\d+)?\s*year/);
  if (m) return parseInt(m[1], 10) * 12;
  const mo = s.match(/(\d+)\s*month/);
  if (mo) return parseInt(mo[1], 10);
  return undefined;
}

function w3cDate(d) {
  try {
    return new Date(d).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function skillsArray(job) {
  if (Array.isArray(job.skills_arr) && job.skills_arr.length) return job.skills_arr;
  if (Array.isArray(job.skills)) return job.skills;
  if (typeof job.skills === 'string') {
    return job.skills
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// ── HTML template ────────────────────────────────────────────────────────
function buildPage(job) {
  const slug = jobSlug(job);
  const pageUrl = `${BASE}/jobs/${slug}.html`;
  const city = job.city || (job.location || '').split(',')[0].trim() || 'India';
  const title = `${job.title} at ${job.company} — ${city} | HireTrack`;
  const salaryPart = job.salary ? `Salary: ${job.salary}. ` : '';
  const desc = `${job.title} role at ${job.company} in ${city}. ${salaryPart}Apply now on HireTrack.`.slice(0, 300);
  const skills = skillsArray(job);
  const jobType = job.job_type || 'Full Time';

  // JSON-LD JobPosting + BreadcrumbList
  const descriptionFull =
    job.description ||
    [
      `${job.title} position at ${job.company}`,
      job.location ? `located in ${job.location}` : '',
      job.experience ? `Required experience: ${job.experience}` : '',
      job.salary ? `Salary: ${job.salary}` : '',
      skills.length ? `Key skills: ${skills.join(', ')}` : '',
      "Apply on HireTrack — India's growing job portal.",
    ]
      .filter(Boolean)
      .join('. ') + '.';

  const jobLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: descriptionFull,
    identifier: { '@type': 'PropertyValue', name: 'HireTrack', value: String(job.id) },
    datePosted: w3cDate(job.posted_at || new Date()),
    employmentType: empType(jobType),
    directApply: true,
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      sameAs: job.employer_id ? `${BASE}/employer.html?id=${job.employer_id}` : BASE,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: city,
        addressRegion: '',
        addressCountry: 'IN',
        postalCode: job.pincode || undefined,
      },
    },
    url: pageUrl,
  };
  if (job.expires_at) jobLd.validThrough = w3cDate(job.expires_at);
  else jobLd.validThrough = w3cDate(new Date(Date.now() + 30 * 86400 * 1000));
  if ((jobType || '').toLowerCase() === 'remote') jobLd.jobLocationType = 'TELECOMMUTE';
  if (job.experience) {
    const months = parseExpMonths(job.experience);
    if (months != null)
      jobLd.experienceRequirements = {
        '@type': 'OccupationalExperienceRequirements',
        monthsOfExperience: months,
      };
  }
  if (skills.length) jobLd.skills = skills.join(', ');
  const salary = parseSalary(job.salary);
  if (salary) {
    const qv = { '@type': 'QuantitativeValue', unitText: 'YEAR' };
    if (salary.min != null) {
      qv.minValue = salary.min;
      qv.maxValue = salary.max;
    } else {
      qv.value = salary.value;
    }
    jobLd.baseSalary = { '@type': 'MonetaryAmount', currency: 'INR', value: qv };
  }

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Browse Jobs', item: `${BASE}/jobs.html` },
      { '@type': 'ListItem', position: 3, name: job.title, item: pageUrl },
    ],
  };

  const chipsHtml = [
    job.location ? `<span class="job-chip">📍 ${esc(job.location)}</span>` : '',
    job.salary ? `<span class="job-chip">💰 ${esc(job.salary)}</span>` : '',
    job.experience ? `<span class="job-chip">🎯 ${esc(job.experience)}</span>` : '',
    jobType ? `<span class="job-chip">${esc(jobType)}</span>` : '',
  ].join('');

  const skillsHtml = skills.length
    ? `<div class="job-skills-row">${skills
        .map((s) => `<span class="job-skill-tag">${esc(s)}</span>`)
        .join('')}</div>`
    : '';

  const descBlock = job.description
    ? `<div class="job-section-label">Job Description</div><pre class="job-description" style="white-space:pre-wrap;font-family:inherit;">${esc(job.description)}</pre>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(pageUrl)}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="HireTrack">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${BASE}/og-image.png">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${BASE}/og-image.png">

<script type="application/ld+json">${JSON.stringify([jobLd, breadcrumbLd])}</script>

<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#2563eb">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/mobile.css">
<style>
body { padding-top: 64px; background: #f8fafc; }
.job-page-wrap { max-width: 780px; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
.job-breadcrumb { font-size: 0.8rem; color: #94a3b8; margin-bottom: 1.5rem; display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
.job-breadcrumb a { color: #3b82f6; text-decoration: none; }
.job-card-main { background: #fff; border-radius: 16px; border: 1.5px solid #e2e8f0; padding: 2rem; margin-bottom: 1.5rem; }
.job-title-main { font-size: 1.5rem; font-weight: 800; color: #0f172a; line-height: 1.3; margin: 0 0 0.5rem; }
.job-company-row { font-size: 1rem; color: #64748b; font-weight: 600; margin-bottom: 1rem; }
.job-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; }
.job-chip { background: #f1f5f9; border-radius: 20px; padding: 0.3rem 0.85rem; font-size: 0.8rem; font-weight: 500; color: #374151; }
.job-skills-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 1.5rem; }
.job-skill-tag { background: #eff6ff; color: #1d4ed8; border-radius: 20px; padding: 0.25rem 0.75rem; font-size: 0.78rem; font-weight: 600; }
.job-section-label { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem; }
.job-description { font-size: 0.95rem; line-height: 1.8; color: #334155; border-top: 1.5px solid #e2e8f0; padding-top: 1.25rem; margin: 0; }
.job-actions-sticky { background: #fff; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 1.5rem; position: sticky; bottom: 1rem; }
.job-actions-row { display: flex; gap: 0.75rem; }
.btn-apply { flex: 1; padding: 0.85rem; border-radius: 10px; border: none; font-size: 0.95rem; font-weight: 700; background: #2563eb; color: #fff; cursor: pointer; font-family: inherit; }
.btn-apply.applied { background: #10b981; }
.btn-apply.expired-btn { background: #94a3b8; cursor: not-allowed; }
.btn-whatsapp { padding: 0.85rem 1.25rem; border-radius: 10px; border: 1.5px solid #16a34a; background: #f0fdf4; color: #16a34a; font-size: 0.9rem; font-weight: 700; cursor: pointer; font-family: inherit; }
@media (max-width: 640px) {
  .job-page-wrap { padding: 1.5rem 1rem 5rem; }
  .job-title-main { font-size: 1.2rem; }
  .job-card-main { padding: 1.25rem; }
  .job-actions-sticky { border-radius: 0; border-left: none; border-right: none; border-bottom: none; position: fixed; bottom: 0; left: 0; right: 0; }
}
</style>
</head>
<body>
<div id="navbar"></div>

<div class="job-page-wrap">
  <nav class="job-breadcrumb" aria-label="Breadcrumb">
    <a href="/index.html">Home</a><span>›</span>
    <a href="/jobs.html">Browse Jobs</a><span>›</span>
    <span>${esc(job.title)}</span>
  </nav>

  <article class="job-card-main" itemscope itemtype="https://schema.org/JobPosting">
    <h1 class="job-title-main" itemprop="title">${esc(job.title)}</h1>
    <div class="job-company-row">🏢 <span itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization"><span itemprop="name">${esc(job.company)}</span></span></div>
    <div class="job-chips">${chipsHtml}</div>
    ${skillsHtml}
    ${descBlock}
  </article>

  <div class="job-actions-sticky" id="job-actions">
    <div class="job-actions-row">
      <a class="btn-apply" id="apply-link" href="/job.html?id=${esc(job.id)}#apply">Apply Now</a>
      ${job.phone ? `<a class="btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/91${esc(String(job.phone))}?text=${encodeURIComponent(`Hi, I found your job posting for ${job.title} at ${job.company} on HireTrack. I would like to apply.`)}">WhatsApp</a>` : ''}
    </div>
    <p style="font-size:0.75rem;color:#94a3b8;margin:0.6rem 0 0;text-align:center;">
      Posted on <a href="${BASE}" style="color:#3b82f6;">HireTrack</a>
    </p>
  </div>
</div>

<footer class="ht-footer">
  <div class="ht-footer-top">
    <div class="ht-socials">
      <a class="ht-social" href="https://www.linkedin.com/company/hiretrack-india/" target="_blank" rel="noopener" title="LinkedIn" aria-label="HireTrack on LinkedIn">
        <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      </a>
      <a class="ht-social" href="https://x.com/hiretrack_in" target="_blank" rel="noopener" title="Twitter / X" aria-label="HireTrack on X">
        <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>
    </div>
    <nav class="ht-nav-links">
      <a href="/about.html">About</a><span class="ht-sep">·</span>
      <a href="/jobs.html">Browse Jobs</a><span class="ht-sep">·</span>
      <a href="/blog.html">Blog</a><span class="ht-sep">·</span>
      <a href="/contact.html">Contact</a><span class="ht-sep">·</span>
      <a href="/pricing.html">For Employers</a><span class="ht-sep">·</span>
      <a href="/privacy.html">Privacy</a><span class="ht-sep">·</span>
      <a href="/terms.html">Terms</a>
    </nav>
  </div>
  <div class="ht-footer-bottom">
    <p class="ht-address" style="font-size:0.78rem;color:rgba(255,255,255,0.55);margin:0 0 0.35rem;">📍 Bengaluru, Karnataka, India</p>
    <p>© <span id="copy-year">2026</span> <span>HireTrack</span> — Find Jobs Across India. Built with ❤️ in Bengaluru.</p>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/sb-rest-shim.js"></script>
<script src="/app.js?v=6"></script>
<script>
// Hydrate: render navbar, wire apply CTA to the existing job.html flow which
// already handles auth + application insert + view counting + similar jobs.
document.getElementById('navbar').innerHTML = renderNavbar('jobs');
(function(){var c=document.getElementById('copy-year');if(c)c.textContent=new Date().getFullYear();})();

// View counter (fire-and-forget) so the SSG pages still feed analytics.
(async function(){
  try {
    const job = { id: ${JSON.stringify(String(job.id))}, employer_id: ${JSON.stringify(job.employer_id || '')} };
    if (job.employer_id) {
      sb.from('jobs').update({ views: (await sb.from('jobs').select('views').eq('id', job.id).maybeSingle()).data?.views + 1 || 1 }).eq('id', job.id).then(()=>{});
      sb.from('job_views').insert([{ job_id: String(job.id), employer_id: String(job.employer_id) }]).then(()=>{});
    }
  } catch (_) {}
})();
</script>
</body>
</html>
`;
}

// ── Supabase REST fetch ──────────────────────────────────────────────────
async function fetchActiveJobs() {
  const url = `${SB_URL}/rest/v1/jobs?select=id,employer_id,title,company,location,city,subcity,pincode,job_type,salary,experience,skills,skills_arr,description,phone,email,posted_at,expires_at,delisted,status&delisted=eq.false&order=posted_at.desc&limit=5000`;
  const r = await fetch(url, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`Supabase REST ${r.status}: ${await r.text()}`);
  const jobs = await r.json();
  const now = Date.now();
  return jobs.filter((j) => !j.expires_at || new Date(j.expires_at).getTime() > now);
}

async function main() {
  console.log(`[generate-job-pages] Fetching jobs from ${SB_URL} …`);
  const jobs = await fetchActiveJobs();
  console.log(`[generate-job-pages] ${jobs.length} active job(s) to generate.`);

  if (!DRY_RUN) await fs.mkdir(outDir, { recursive: true });

  const redirectMap = {};
  let written = 0;
  for (const job of jobs) {
    const slug = jobSlug(job);
    redirectMap[String(job.id)] = `/jobs/${slug}.html`;
    if (DRY_RUN) {
      console.log(`  [dry] /jobs/${slug}.html  (${job.title} @ ${job.company})`);
      continue;
    }
    const html = buildPage(job);
    const target = path.join(outDir, `${slug}.html`);
    await fs.writeFile(target, html, 'utf8');
    written++;
  }

  // Write a redirect map so /job-redirect.html can map legacy ?id= URLs
  // to their static counterparts without an extra DB round-trip.
  if (!DRY_RUN) {
    const mapPath = path.join(repoRoot, 'jobs-redirect-map.json');
    await fs.writeFile(mapPath, JSON.stringify(redirectMap, null, 2), 'utf8');
    console.log(`[generate-job-pages] Wrote ${written} pages + jobs-redirect-map.json.`);
  } else {
    console.log(`[generate-job-pages] Dry-run complete. ${Object.keys(redirectMap).length} pages would be written.`);
  }
}

main().catch((e) => {
  console.error('[generate-job-pages] FAILED:', e);
  process.exit(1);
});
