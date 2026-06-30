#!/usr/bin/env node
// Build richer city landing pages for the 6 top Indian cities.
// Overwrites /jobs/<city>.html using a single template so every page has the
// same structure (intro, search CTA, category breakdown, salary table, FAQ,
// interlinks to the other 5 cities).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'jobs');

const BASE = 'https://www.hiretrack.co.in';

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CITIES = [
  {
    slug: 'bengaluru',
    name: 'Bengaluru',
    displayName: 'Bengaluru',
    headerColor: '#0f172a,#1e3a5f',
    intro:
      "Bengaluru remains India's leading job market in 2026 — the country's technology capital and a fast-growing hub for SaaS, fintech, analytics and product startups. Beyond IT, the city has strong demand for MIS Executives, HR professionals, sales and marketing talent, and operations staff across its thousands of SMEs.",
    cityFilter: 'bengaluru',
    industries: 'IT/SaaS, fintech, analytics, e-commerce, deep-tech, biotech, manufacturing',
    salaries: [
      ['Data Analyst', '₹6.5–9 LPA'],
      ['MIS Executive', '₹5–7.5 LPA'],
      ['HR Executive', '₹5.5–7.5 LPA'],
      ['Sales Executive', '₹6–8.5 LPA'],
      ['Full Stack Developer', '₹14–22 LPA'],
    ],
  },
  {
    slug: 'hyderabad',
    name: 'Hyderabad',
    displayName: 'Hyderabad',
    headerColor: '#7e22ce,#1e293b',
    intro:
      "Hyderabad is India's fastest-growing IT and life-sciences hub in 2026, with deep hiring in tech, pharma, banking and BPO. The city's lower cost of living relative to Bengaluru is pulling in more SaaS and product engineering roles every quarter.",
    cityFilter: 'hyderabad',
    industries: 'IT services, SaaS, pharma, banking, BPO/KPO, semiconductor',
    salaries: [
      ['Data Analyst', '₹5.5–7.5 LPA'],
      ['MIS Executive', '₹4.5–6.5 LPA'],
      ['HR Executive', '₹5–6.8 LPA'],
      ['Sales Executive', '₹5.2–7.5 LPA'],
      ['Full Stack Developer', '₹13–20 LPA'],
    ],
  },
  {
    slug: 'mumbai',
    name: 'Mumbai',
    displayName: 'Mumbai',
    headerColor: '#0369a1,#0c4a6e',
    intro:
      'Mumbai is the financial capital of India and a major hub for media, advertising, BFSI and e-commerce in 2026. Strong demand for sales, finance, marketing and customer-experience talent makes it one of the best-paying job markets in the country.',
    cityFilter: 'mumbai',
    industries: 'BFSI, media, advertising, e-commerce, real estate, manufacturing',
    salaries: [
      ['Data Analyst', '₹6–8.5 LPA'],
      ['MIS Executive', '₹5–7.5 LPA'],
      ['HR Executive', '₹5.5–7.5 LPA'],
      ['Sales Executive', '₹6–8.5 LPA'],
      ['Full Stack Developer', '₹14–22 LPA'],
    ],
  },
  {
    slug: 'delhi',
    name: 'Delhi NCR',
    displayName: 'Delhi NCR',
    headerColor: '#c2410c,#1e293b',
    intro:
      'Delhi NCR — covering Gurugram, Noida and the wider National Capital Region — is one of the largest job markets in India in 2026, with strong demand across e-commerce, fintech, SaaS, consulting and consumer brands.',
    cityFilter: 'delhi',
    industries: 'consulting, e-commerce, fintech, consumer brands, media, government',
    salaries: [
      ['Data Analyst', '₹5.5–8 LPA'],
      ['MIS Executive', '₹4.8–7 LPA'],
      ['HR Executive', '₹5–7 LPA'],
      ['Sales Executive', '₹5.5–8 LPA'],
      ['Full Stack Developer', '₹14–20 LPA'],
    ],
  },
  {
    slug: 'pune',
    name: 'Pune',
    displayName: 'Pune',
    headerColor: '#166534,#0f172a',
    intro:
      "Pune is one of India's most balanced job markets in 2026 — a major IT services hub, automotive engineering belt and a growing centre for analytics and edtech. Costs of living are lower than Bengaluru, while pay bands have caught up rapidly.",
    cityFilter: 'pune',
    industries: 'IT services, automotive, analytics, edtech, manufacturing',
    salaries: [
      ['Data Analyst', '₹5–7.5 LPA'],
      ['MIS Executive', '₹4.5–6.5 LPA'],
      ['HR Executive', '₹4.8–6.5 LPA'],
      ['Sales Executive', '₹5–7 LPA'],
      ['Full Stack Developer', '₹12–18 LPA'],
    ],
  },
  {
    slug: 'chennai',
    name: 'Chennai',
    displayName: 'Chennai',
    headerColor: '#1e3a8a,#0f172a',
    intro:
      "Chennai is the largest auto and electronics manufacturing hub in India in 2026, with strong demand in IT services, BFSI and SaaS. The city's tier-1 talent pipeline keeps tech salaries competitive with Bengaluru and Hyderabad.",
    cityFilter: 'chennai',
    industries: 'IT services, SaaS, BFSI, automotive, manufacturing, healthtech',
    salaries: [
      ['Data Analyst', '₹5.5–7.8 LPA'],
      ['MIS Executive', '₹4.5–6.5 LPA'],
      ['HR Executive', '₹4.8–6.8 LPA'],
      ['Sales Executive', '₹5–7 LPA'],
      ['Full Stack Developer', '₹12–18 LPA'],
    ],
  },
];

function buildPage(c) {
  const url = `${BASE}/jobs/${c.slug}.html`;
  const title = `Jobs in ${c.displayName} 2026 | IT, MIS, HR, Sales | HireTrack`;
  const desc = `Browse latest jobs in ${c.displayName} 2026. IT, MIS Executive, HR, Sales, Marketing roles at top SMEs and startups. Apply free on HireTrack.`;

  const faqs = [
    [
      `How many jobs are available in ${c.displayName} on HireTrack?`,
      `HireTrack lists active openings in ${c.displayName} across IT, MIS, HR, Sales, marketing, customer support and operations roles. New jobs are added daily — check the search results above for the live count.`,
    ],
    [
      `What is the average salary in ${c.displayName} in 2026?`,
      `Mid-level professionals in ${c.displayName} typically earn ₹5L–₹12L per year in 2026. Tech and product roles run higher (₹14L–₹25L+), while entry-level roles start at ₹2.5L–₹4L per year.`,
    ],
    [
      `Which industries are hiring most in ${c.displayName}?`,
      `${c.industries.charAt(0).toUpperCase() + c.industries.slice(1)} are the dominant hiring sectors in ${c.displayName} in 2026.`,
    ],
    [
      `How do I apply for jobs in ${c.displayName} on HireTrack?`,
      `Create a free HireTrack account, browse the latest ${c.displayName} jobs, and apply directly. Many roles support one-tap WhatsApp apply. Set up job alerts to be notified about new ${c.displayName} openings.`,
    ],
  ];

  const others = CITIES.filter((x) => x.slug !== c.slug);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Browse Jobs', item: `${BASE}/jobs.html` },
      { '@type': 'ListItem', position: 3, name: `Jobs in ${c.displayName}`, item: url },
    ],
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="jobs in ${c.displayName.toLowerCase()}, ${c.displayName.toLowerCase()} jobs 2026, IT jobs ${c.displayName.toLowerCase()}, MIS jobs ${c.displayName.toLowerCase()}, HR jobs ${c.displayName.toLowerCase()}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${BASE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${BASE}/og-image.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#2563eb">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../mobile.css">
<style>
body{padding-top:64px;}
.city-hero{background:linear-gradient(135deg,${c.headerColor});padding:3rem 1.5rem 2.5rem;color:#fff;text-align:center;}
.city-hero h1{font-size:2rem;font-weight:800;margin:0 auto 0.6rem;max-width:760px;line-height:1.3;}
.city-hero p{color:#cbd5e1;font-size:0.98rem;max-width:620px;margin:0 auto 1.4rem;line-height:1.7;}
.city-cta{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:0.8rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;}
.city-cta:hover{background:#2563eb;}
.city-wrap{max-width:880px;margin:2.5rem auto;padding:0 1.5rem;}
.city-wrap h2{font-size:1.3rem;font-weight:800;color:#0f172a;margin:2rem 0 1rem;padding-bottom:0.5rem;border-bottom:2px solid #e2e8f0;}
.city-wrap p{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:1rem;}
.cat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:1rem 0 0.5rem;}
.cat-card{background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;padding:1.1rem 1rem;text-decoration:none;display:block;transition:all 0.2s;}
.cat-card:hover{border-color:#3b82f6;transform:translateY(-3px);box-shadow:0 8px 20px rgba(0,0,0,0.06);}
.cat-card .cat-icon{font-size:1.6rem;}
.cat-card .cat-name{font-size:0.9rem;font-weight:700;color:#0f172a;margin:0.4rem 0 0.2rem;}
.cat-card .cat-sub{font-size:0.75rem;color:#64748b;}
.city-table{width:100%;border-collapse:collapse;margin:1rem 0 1.5rem;font-size:0.88rem;}
.city-table th{background:#0f172a;color:#fff;padding:0.75rem 1rem;text-align:left;font-size:0.78rem;}
.city-table td{padding:0.7rem 1rem;border-bottom:1px solid #e2e8f0;color:#334155;}
.city-table tr:nth-child(even) td{background:#f8fafc;}
.city-faq h3{font-size:1.05rem;font-weight:700;color:#0f172a;margin:1.5rem 0 0.4rem;}
.city-faq p{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:1rem;}
.city-back{display:inline-block;margin-top:1rem;color:#3b82f6;text-decoration:none;font-weight:600;font-size:0.9rem;}
.other-cities{display:grid;grid-template-columns:repeat(5,1fr);gap:0.65rem;margin-top:0.5rem;}
.other-cities a{background:#f1f5f9;color:#1d4ed8;border-radius:8px;padding:0.6rem 0.8rem;font-size:0.85rem;font-weight:600;text-align:center;text-decoration:none;transition:background 0.15s;}
.other-cities a:hover{background:#e0e7ff;}
@media(max-width:768px){.cat-grid{grid-template-columns:repeat(2,1fr);}.other-cities{grid-template-columns:repeat(2,1fr);}.city-hero h1{font-size:1.5rem;}body{padding-top:56px;}}
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-76H5XQV27B"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-76H5XQV27B');</script>
<script type="application/ld+json">${JSON.stringify([breadcrumbLd, faqLd])}</script>
</head>
<body>
<div id="navbar"></div>

<header class="city-hero">
  <h1>Jobs in ${esc(c.displayName)} 2026</h1>
  <p>${esc(desc)}</p>
  <a class="city-cta" href="/jobs.html?city=${esc(c.cityFilter)}">Browse All ${esc(c.displayName)} Jobs →</a>
</header>

<main class="city-wrap">
  <h2>The ${esc(c.displayName)} Job Market in 2026</h2>
  <p>${esc(c.intro)} Hybrid and remote-friendly roles are widely available, and salaries here are competitive with the rest of India's metros.</p>

  <h2>Popular Job Categories in ${esc(c.displayName)}</h2>
  <div class="cat-grid">
    <a class="cat-card" href="/jobs.html?city=${c.cityFilter}&amp;search=MIS"><div class="cat-icon">📊</div><div class="cat-name">MIS Executive</div><div class="cat-sub">Reporting &amp; analytics</div></a>
    <a class="cat-card" href="/jobs.html?city=${c.cityFilter}&amp;search=IT"><div class="cat-icon">💻</div><div class="cat-name">IT Support</div><div class="cat-sub">Software &amp; systems</div></a>
    <a class="cat-card" href="/jobs.html?city=${c.cityFilter}&amp;search=HR"><div class="cat-icon">🧑‍💼</div><div class="cat-name">HR</div><div class="cat-sub">Recruitment &amp; ops</div></a>
    <a class="cat-card" href="/jobs.html?city=${c.cityFilter}&amp;search=Sales"><div class="cat-icon">📈</div><div class="cat-name">Sales</div><div class="cat-sub">B2B &amp; field sales</div></a>
  </div>

  <h2>Top Salaries in ${esc(c.displayName)} (3 yrs experience)</h2>
  <table class="city-table">
    <thead><tr><th>Role</th><th>Salary range (2026)</th></tr></thead>
    <tbody>
    ${c.salaries.map(([r, s]) => `<tr><td>${esc(r)}</td><td>${esc(s)}</td></tr>`).join('\n    ')}
    </tbody>
  </table>

  <h2>Frequently Asked Questions</h2>
  <div class="city-faq">
    ${faqs.map(([q, a]) => `<h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join('\n    ')}
  </div>

  <h2>Jobs in Other Cities</h2>
  <div class="other-cities">
    ${others.map((o) => `<a href="/jobs/${esc(o.slug)}.html">${esc(o.displayName)}</a>`).join('\n    ')}
  </div>

  <p style="margin-top:1.5rem;"><a class="city-back" href="/jobs.html">← Browse all jobs across India</a></p>
</main>

<footer class="ht-footer">
  <div class="ht-footer-top">
    <nav class="ht-nav-links">
      <a href="/jobs.html">Browse Jobs</a><span class="ht-sep">·</span>
      ${others
        .slice(0, 4)
        .map((o) => `<a href="/jobs/${esc(o.slug)}.html">Jobs in ${esc(o.displayName)}</a><span class="ht-sep">·</span>`)
        .join('\n      ')}
      <a href="/blog.html">Blog</a><span class="ht-sep">·</span>
      <a href="/about.html">About</a><span class="ht-sep">·</span>
      <a href="/privacy.html">Privacy Policy</a>
    </nav>
  </div>
  <div class="ht-footer-bottom">
    <p class="ht-address" style="font-size:0.78rem;color:rgba(255,255,255,0.55);margin:0 0 0.35rem;">📍 Bengaluru, Karnataka, India</p>
    <p>© <span id="copy-year">2026</span> <span>HireTrack</span> — Find Jobs Across India. Built with ❤️ in Bengaluru.</p>
  </div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/sb-rest-shim.js"></script>
<script src="../app.js"></script>
<script>
  document.getElementById('navbar').innerHTML = renderNavbar('jobs');
  var _cy = document.getElementById('copy-year'); if (_cy) _cy.textContent = new Date().getFullYear();
</script>
</body>
</html>
`;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  for (const c of CITIES) {
    await fs.writeFile(path.join(outDir, `${c.slug}.html`), buildPage(c), 'utf8');
    console.log(`wrote jobs/${c.slug}.html`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
