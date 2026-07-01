#!/usr/bin/env node
// Build skill / type landing pages under /jobs/ — used for high-volume
// queries like "Walk-in Jobs", "SQL Jobs in India", "Remote Jobs", etc.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'jobs');

const BASE = 'https://www.hiretrack.co.in';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

const PAGES = [
  {
    slug: 'walk-in-jobs-india',
    h1: 'Walk-in Interview Jobs in India',
    title: 'Walk-in Interview Jobs in India 2026 — Apply Today | HireTrack',
    desc: 'Find walk-in interview jobs across India in 2026. Same-day interviews for sales, customer support, retail, BPO, MIS and admin roles. Updated daily on HireTrack.',
    headerColor: '#16a34a,#0f172a',
    intro:
      'Walk-in interviews are still one of the fastest ways to land a job in India. Most walk-ins happen on weekdays between 10 AM and 4 PM and decisions are usually made on the same day. We list verified walk-ins for sales, customer support, retail, BPO, MIS, admin and operations roles across India.',
    searchTo: '/jobs.html?type=Walk-in',
    salaryHint: 'Typical walk-in roles in 2026 pay ₹12,000–₹30,000 per month for freshers and ₹25,000–₹55,000 for 2–5 years of experience.',
    skills: ['Spoken English', 'One regional language', 'Excel basics', 'CRM familiarity'],
    cities: ['Bengaluru', 'Hyderabad', 'Mumbai', 'Delhi NCR', 'Pune', 'Chennai'],
    faqs: [
      ['What documents should I carry to a walk-in interview?', 'Carry a printed resume (2 copies), a government-issued ID, your last salary slip (if working), educational mark-sheets, and a passport-size photograph. Reach 30 minutes before the slot.'],
      ['Are walk-in jobs only for freshers?', 'No. Many walk-ins target 0–5 years of experience for sales, customer support, BPO and back-office roles. Some senior roles also use walk-ins for high-volume hiring.'],
      ['Do I need to apply before a walk-in?', "Most walk-ins don't strictly require an application, but it helps the employer queue you up. Use the apply button on the job listing or just bring your resume on the day."],
    ],
    cta: 'See Walk-in Jobs',
  },
  {
    slug: 'sql-jobs-india',
    h1: 'SQL Jobs in India 2026',
    title: 'SQL Jobs in India 2026 — Data Analyst, BA, MIS Roles | HireTrack',
    desc: 'Find SQL jobs in India 2026 — data analyst, MIS, business analyst and backend roles that require SQL. Apply free on HireTrack.',
    headerColor: '#1d4ed8,#0f172a',
    intro:
      "SQL remains the most-demanded data skill in India in 2026. Almost every analyst, MIS, BI engineer and backend role needs solid SQL — from JOINs and window functions to query optimisation. Pay starts around ₹4L for freshers and climbs past ₹20L for senior data engineers.",
    searchTo: '/jobs.html?search=SQL',
    salaryHint: 'SQL-heavy roles in 2026 typically pay ₹4–6L for freshers, ₹6–12L for mid-level (2–5 years), and ₹15–25L+ for senior data engineers and analysts.',
    skills: ['SQL (JOINs, window functions)', 'Excel + Power BI / Tableau', 'Python (pandas) basics', 'Domain knowledge (BFSI / SaaS / e-commerce)'],
    cities: ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Remote'],
    faqs: [
      ['What level of SQL do I need for entry-level data jobs?', 'You should be comfortable with SELECT/JOINs, GROUP BY, subqueries and basic window functions. Knowing how to read EXPLAIN plans is a strong bonus for BA / analyst roles.'],
      ['Which industries hire the most SQL talent in India?', 'BFSI (banking + insurance), SaaS, e-commerce and consulting hire the largest volumes of SQL-led roles.'],
      ['Can I get a remote SQL job in India?', "Yes — many SaaS and consulting firms hire SQL-led analysts remotely across India. Use the Remote filter on HireTrack."],
    ],
    cta: 'Browse SQL Jobs',
  },
  {
    slug: 'excel-jobs-india',
    h1: 'Excel & Advanced Excel Jobs in India 2026',
    title: 'Excel & Advanced Excel Jobs in India 2026 | HireTrack',
    desc: 'Find Excel and advanced Excel jobs in India 2026 — MIS, accounts, operations, analytics roles that need pivot tables, Power Query, VBA. Apply on HireTrack.',
    headerColor: '#15803d,#0f172a',
    intro:
      "Excel is still the most-used analytical tool in Indian business. Roles in MIS, accounts, operations, sales analytics and finance routinely require Power Query, pivot tables, VLOOKUP/XLOOKUP and (for senior roles) VBA. Advanced Excel adds ₹0.5–1.5L to a typical 2026 salary.",
    searchTo: '/jobs.html?search=Excel',
    salaryHint: 'Excel-led roles in 2026 typically pay ₹2.5–4L for freshers, ₹4–8L for mid-level, and ₹8–15L for senior MIS / analytics managers.',
    skills: ['Advanced Excel (Power Query, pivot tables)', 'VLOOKUP / XLOOKUP / INDEX-MATCH', 'Excel charts + dashboards', 'VBA macros (bonus)'],
    cities: ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Chennai'],
    faqs: [
      ['Which roles still rely heavily on Excel in 2026?', 'MIS executives, accounts executives, operations analysts, business analysts and finance teams continue to rely on Excel daily.'],
      ['Is advanced Excel worth learning if AI tools can do reports?', "Yes — knowing advanced Excel makes you 3–4× faster, even when you use AI tools. Companies pay more for people who can structure data, not just generate it."],
    ],
    cta: 'Browse Excel Jobs',
  },
  {
    slug: 'python-jobs-india',
    h1: 'Python Developer Jobs in India 2026',
    title: 'Python Developer Jobs in India 2026 | HireTrack',
    desc: 'Find Python developer, data engineer and ML engineer jobs in India 2026. Backend, data, automation and AI roles. Apply on HireTrack.',
    headerColor: '#1e40af,#0f172a',
    intro:
      "Python is the language behind India's biggest growth areas in 2026 — data engineering, ML, automation and backend SaaS. Python developers command 20–30% higher pay than equivalent Java/PHP roles at most experience bands.",
    searchTo: '/jobs.html?search=Python',
    salaryHint: 'Python developer salaries in 2026 typically span ₹5–10L for 0–2 years, ₹10–20L for 3–5 years, and ₹20–40L+ for senior / ML engineers.',
    skills: ['Python + FastAPI / Django', 'pandas / NumPy', 'AWS / GCP', 'Postgres + Redis'],
    cities: ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Chennai', 'Remote'],
    faqs: [
      ['Which Python roles pay the most in India?', 'ML engineers, data engineers and senior backend developers earn the highest Python salaries in 2026.'],
      ['Is Python a good first language for fresher developers?', 'Yes — Python has the largest fresher pipeline and the most learning material; companies expect freshers to be comfortable with both Python and one frontend framework.'],
    ],
    cta: 'Browse Python Jobs',
  },
  {
    slug: 'digital-marketing-jobs-india',
    h1: 'Digital Marketing Jobs in India 2026',
    title: 'Digital Marketing Jobs in India 2026 — SEO, Ads, Content | HireTrack',
    desc: 'Find digital marketing jobs in India 2026 — performance marketing, SEO, content, social media and growth roles. Apply free on HireTrack.',
    headerColor: '#c2410c,#0f172a',
    intro:
      "Digital marketing remains one of the highest-growth job categories in India in 2026. Performance marketers, SEO specialists and growth managers are paid 20–35% above generalists. D2C and SaaS brands are the most aggressive hirers.",
    searchTo: '/jobs.html?search=Digital+Marketing',
    salaryHint: 'Digital marketers in 2026 typically earn ₹2.5–4L (fresher), ₹4–8L (1–3 yrs), ₹8–14L (3–5 yrs), and ₹14L+ for leads and managers.',
    skills: ['Google + Meta Ads', 'SEO + on-page optimisation', 'GA4 + Looker Studio', 'CRM (Mailchimp, MoEngage, Clevertap)'],
    cities: ['Bengaluru', 'Mumbai', 'Delhi NCR', 'Hyderabad', 'Pune', 'Remote'],
    faqs: [
      ['Do I need a marketing degree for digital marketing jobs?', "No — most employers care about practical skills and outcomes. A portfolio of campaigns + GA4 dashboards beats a degree for entry-level roles."],
      ['Which digital marketing niche pays the most?', "Performance marketing (paid ads) and SEO for B2B SaaS pay the most in 2026."],
    ],
    cta: 'Browse Digital Marketing Jobs',
  },
  {
    slug: 'data-entry-jobs-india',
    h1: 'Data Entry Jobs in India 2026',
    title: 'Data Entry Jobs in India 2026 — Apply Today | HireTrack',
    desc: 'Find data entry jobs in India 2026 — back office, BPO, KPO, work-from-home data entry roles. Apply free on HireTrack.',
    headerColor: '#0f766e,#0f172a',
    intro:
      "Data entry roles in India are evolving in 2026 — operators with Excel + basic SQL skills are paid 30–50% more than typing-only roles. Many companies now combine data entry with light analytics or BPO process work.",
    searchTo: '/jobs.html?search=Data+Entry',
    salaryHint: 'Data entry roles in 2026 typically pay ₹13,000–₹22,000 / month for freshers and ₹22,000–₹40,000 for experienced operators.',
    skills: ['Typing speed (40+ WPM)', 'Excel basics', 'Tally / GST entries (bonus)', 'Spoken + written English'],
    cities: ['Bengaluru', 'Hyderabad', 'Mumbai', 'Pune', 'Chennai', 'Remote'],
    faqs: [
      ['Are work-from-home data entry jobs real in 2026?', "Yes, but check the company carefully. Avoid roles that ask for a registration / training fee — those are typically scams."],
      ['What is the easiest path from data entry to higher-paying roles?', "Learn Excel + basic SQL, take on small reporting tasks, and step into MIS or operations roles within 12–24 months."],
    ],
    cta: 'Browse Data Entry Jobs',
  },
  {
    slug: 'remote-jobs-india',
    h1: 'Remote Jobs in India 2026',
    title: 'Remote Jobs in India 2026 — Work from Anywhere | HireTrack',
    desc: 'Find remote jobs in India 2026 across software, marketing, customer support, sales and design. Apply free on HireTrack.',
    headerColor: '#7e22ce,#0f172a',
    intro:
      "Remote-first hiring in India is back to a steady high in 2026, after the post-pandemic correction. Software, design, marketing, customer success and sales-development roles are the most common remote categories.",
    searchTo: '/jobs.html?type=Remote',
    salaryHint: 'Remote roles in India in 2026 typically pay 0–15% less than on-site Bengaluru bands, but 20–40% more than non-metro on-site bands at the same level.',
    skills: ['Strong written English', 'Self-management + async communication', 'Calendar + project tooling (Slack, Notion, Linear)', 'Core technical skill for your role'],
    cities: ['India (anywhere)'],
    faqs: [
      ['Which roles are easiest to land remotely from India?', 'Software engineering, design, content, customer support and SDR/BDR roles in SaaS are the easiest categories to land remotely.'],
      ['Do remote jobs in India pay in USD?', "Some — especially when working with US/EU startups. Most domestic SaaS firms still pay in INR but at competitive Bengaluru bands."],
    ],
    cta: 'Browse Remote Jobs',
  },
  {
    slug: 'fresher-jobs-india',
    h1: 'Fresher Jobs in India 2026',
    title: 'Fresher Jobs in India 2026 — 0–1 Year Experience | HireTrack',
    desc: 'Find fresher jobs in India 2026 with 0–1 year of experience. Walk-ins, training programs and trainee roles across the country. Apply free on HireTrack.',
    headerColor: '#0ea5e9,#0f172a',
    intro:
      "India hires more freshers in 2026 than any other year on record, driven by SaaS, BPO, retail and SME hiring. Most fresher roles offer training, certifications and clear next-step bands.",
    searchTo: '/jobs.html?search=Fresher',
    salaryHint: 'Fresher salaries in 2026 typically span ₹2.4–4.5L per year for non-tech roles and ₹5–10L for tech / product engineering hires.',
    skills: ['Spoken English + one regional language', 'Excel basics', 'Customer-first mindset', 'Resume + interview practice'],
    cities: ['Bengaluru', 'Hyderabad', 'Mumbai', 'Pune', 'Delhi NCR', 'Chennai'],
    faqs: [
      ['How can a fresher get noticed by employers?', "Tighten your resume, add a portfolio (GitHub / Notion / Figma) and apply with a one-line pitch in the cover note."],
      ['Do fresher jobs require an internship?', "Not always, but internships dramatically improve callback rates — especially for BA, design and engineering tracks."],
    ],
    cta: 'Browse Fresher Jobs',
  },
  {
    slug: 'work-from-home-jobs',
    h1: 'Work From Home Jobs in India 2026',
    title: 'Work From Home Jobs in India 2026 | HireTrack',
    desc: 'Find work-from-home (WFH) jobs in India 2026 — software, support, sales, content and admin roles you can do from anywhere. Apply free on HireTrack.',
    headerColor: '#1e3a8a,#0f172a',
    intro:
      "WFH roles in India in 2026 cover most office functions — software, support, sales development, content, design and admin. Most hybrid-first companies still budget for 2–3 office days a month, while fully remote SaaS firms are entirely virtual.",
    searchTo: '/jobs.html?type=Remote&search=Work+From+Home',
    salaryHint: 'WFH roles in 2026 typically pay within 10% of on-site bands at the same level, sometimes higher when the employer is US/EU-based.',
    skills: ['Reliable internet + workspace', 'Async communication', 'Time tracking + self-management', 'Calendar / Slack / Notion etiquette'],
    cities: ['India (anywhere)'],
    faqs: [
      ['Are WFH jobs only for freshers?', "No — many senior roles are remote-first in 2026, especially in SaaS, design and engineering."],
      ['Do WFH jobs require any equipment?', "Most companies provide a laptop and reimburse internet. Smaller firms may ask you to use your own."],
    ],
    cta: 'Browse Work From Home Jobs',
  },
];

function buildPage(p) {
  const url = `${BASE}/jobs/${p.slug}.html`;
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: p.faqs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Browse Jobs', item: `${BASE}/jobs.html` },
      { '@type': 'ListItem', position: 3, name: p.h1, item: url },
    ],
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${BASE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.desc)}">
<meta name="twitter:image" content="${BASE}/og-image.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#2563eb">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../mobile.css">
<style>
body{padding-top:64px;}
.lp-hero{background:linear-gradient(135deg,${p.headerColor});padding:3rem 1.5rem 2.5rem;color:#fff;text-align:center;}
.lp-hero h1{font-size:2rem;font-weight:800;margin:0 auto 0.6rem;max-width:760px;line-height:1.3;}
.lp-hero p{color:#cbd5e1;font-size:0.98rem;max-width:620px;margin:0 auto 1.4rem;line-height:1.7;}
.lp-cta{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:0.8rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;}
.lp-wrap{max-width:880px;margin:2.5rem auto;padding:0 1.5rem;}
.lp-wrap h2{font-size:1.3rem;font-weight:800;color:#0f172a;margin:2rem 0 1rem;padding-bottom:0.5rem;border-bottom:2px solid #e2e8f0;}
.lp-wrap p{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:1rem;}
.lp-list{display:grid;grid-template-columns:repeat(2,1fr);gap:0.5rem 1.25rem;}
.lp-list li{font-size:0.9rem;color:#374151;line-height:1.7;}
.lp-faq h3{font-size:1.05rem;font-weight:700;color:#0f172a;margin:1.5rem 0 0.4rem;}
.lp-faq p{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:1rem;}
.lp-cities{display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;}
.lp-cities a{background:#f1f5f9;color:#1d4ed8;border-radius:20px;padding:5px 14px;font-size:0.84rem;text-decoration:none;font-weight:600;}
@media(max-width:768px){.lp-hero h1{font-size:1.5rem;}.lp-list{grid-template-columns:1fr;}body{padding-top:56px;}}
</style>
<script type="application/ld+json">${JSON.stringify([breadcrumbLd, faqLd])}</script>
</head>
<body>
<div id="navbar"></div>
<header class="lp-hero">
  <h1>${esc(p.h1)}</h1>
  <p>${esc(p.desc)}</p>
  <a class="lp-cta" href="${esc(p.searchTo)}">${esc(p.cta)} →</a>
</header>
<main class="lp-wrap">
  <h2>${esc(p.h1)} — the 2026 picture</h2>
  <p>${esc(p.intro)}</p>
  <p><strong>Salary:</strong> ${esc(p.salaryHint)}</p>

  <h2>Skills that matter</h2>
  <ul class="lp-list">
    ${p.skills.map((s) => `<li>${esc(s)}</li>`).join('\n    ')}
  </ul>

  <h2>Top cities</h2>
  <div class="lp-cities">
    ${p.cities.map((c) => `<a href="/jobs.html?city=${esc(c.toLowerCase().split(' ')[0])}">${esc(c)}</a>`).join('\n    ')}
  </div>

  <h2>Frequently Asked Questions</h2>
  <div class="lp-faq">
    ${p.faqs.map(([q, a]) => `<h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join('\n    ')}
  </div>

  <p style="margin-top:1.5rem;"><a class="lp-cta" href="${esc(p.searchTo)}">${esc(p.cta)} →</a></p>
</main>
<footer class="ht-footer">
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
  for (const p of PAGES) {
    await fs.writeFile(path.join(outDir, `${p.slug}.html`), buildPage(p), 'utf8');
    console.log(`wrote jobs/${p.slug}.html`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
