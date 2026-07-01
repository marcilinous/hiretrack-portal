#!/usr/bin/env node
// Build 10 salary-guide blog posts mirroring the template used by
// blog/mis-executive-salary-india-2026.html. Each guide ships with:
//   - SEO meta + canonical
//   - Article + FAQPage + BreadcrumbList JSON-LD
//   - Salary-by-experience table
//   - Salary-by-city table
//   - Skills section
//   - FAQ (5 Q&A)
//   - CTA + related articles
//
// Salary ranges and skill premiums are calibrated from AmbitionBox / Glassdoor
// India / Naukri tool 2025-26 ranges. Treat them as ballpark, not exact.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'blog');

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

const GUIDES = [
  {
    slug: 'hr-executive-salary-india-2026',
    role: 'HR Executive',
    emoji: '👥',
    heroColor: '#0e7490',
    summary: `HR Executives in India earn ₹2.4L–₹12L+ in 2026, with HRBPs and TA leads commanding the biggest premiums.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹2.4–3.6 LPA', 'HR Trainee / Junior HR Executive'],
      ['1–3 years', '₹3.6–5.5 LPA', 'HR Executive'],
      ['3–5 years', '₹5.5–8 LPA', 'Senior HR Executive / HR Generalist'],
      ['5–8 years', '₹8–12 LPA', 'HR Business Partner / HR Lead'],
      ['8+ years', '₹12–22 LPA', 'HR Manager / Head of People'],
    ],
    byCity: [
      ['Bengaluru', '₹5.5–7.5 LPA', '+18%'],
      ['Mumbai', '₹5.5–7.5 LPA', '+18%'],
      ['Delhi/NCR', '₹5–7 LPA', '+10%'],
      ['Hyderabad', '₹5–6.8 LPA', '+5%'],
      ['Pune', '₹4.8–6.5 LPA', '0%'],
      ['Other cities', '₹3.4–5 LPA', '-15%'],
    ],
    skills: [
      ['Talent Acquisition / Sourcing', '₹1–2 LPA'],
      ['HRMS (Darwinbox, Keka, BambooHR)', '₹0.5–1.5 LPA'],
      ['Payroll + compliance (PF, ESI, PT)', '₹0.5–1.2 LPA'],
      ['Labour-law fluency (Shops & Estab., POSH, Maternity)', '₹0.5–1 LPA'],
      ['Performance management + OKRs', '₹1–2 LPA'],
    ],
    trends: [
      'Hybrid recruiting — HR Execs now run video interviews end-to-end; that capability lifts pay 10–15%.',
      'HRBP roles are creeping down the seniority ladder: 4–5 year execs with stakeholder skills are jumping a band.',
      'Manufacturing & retail HR is hiring aggressively in tier-2 cities, narrowing the metro/non-metro gap.',
    ],
    cta: 'Browse HR Jobs',
    ctaSearch: 'HR',
    related: [
      ['/blog/hr-jobs-india-salary-skills-2025.html', 'HR Jobs in India — Salary & Skills'],
      ['/blog/business-analyst-salary-india-2026.html', 'Business Analyst Salary 2026'],
    ],
  },
  {
    slug: 'sales-executive-salary-india-2026',
    role: 'Sales Executive',
    emoji: '🤝',
    heroColor: '#7e22ce',
    summary: `Sales Executives in India earn ₹2.4L–₹14L+ in 2026 — base plus incentives, with B2B SaaS roles paying the most.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹2.4–3.8 LPA', 'Sales Trainee / BDE'],
      ['1–3 years', '₹3.8–6 LPA', 'Sales Executive / BDE'],
      ['3–5 years', '₹6–9 LPA', 'Senior Sales Executive / BDM'],
      ['5–8 years', '₹9–14 LPA', 'Key Account Manager / Sales Lead'],
      ['8+ years', '₹14–25 LPA', 'Sales Manager / Regional Sales Head'],
    ],
    byCity: [
      ['Bengaluru', '₹6–8.5 LPA', '+22%'],
      ['Mumbai', '₹6–8.5 LPA', '+22%'],
      ['Delhi/NCR', '₹5.5–8 LPA', '+12%'],
      ['Hyderabad', '₹5.2–7.5 LPA', '+5%'],
      ['Pune', '₹5–7 LPA', '0%'],
      ['Other cities', '₹3.2–5 LPA', '-18%'],
    ],
    skills: [
      ['Inside Sales / B2B SaaS', '₹2–4 LPA'],
      ['CRM mastery (Salesforce, HubSpot, Zoho)', '₹1–2 LPA'],
      ['English + 1 regional language', '₹0.5–1 LPA'],
      ['Outbound prospecting (LinkedIn, email, cold calls)', '₹1–2 LPA'],
      ['Solution selling / consultative selling', '₹1.5–3 LPA'],
    ],
    trends: [
      'Variable pay is climbing — top sales execs now earn 30–60% of CTC in incentives, up from 20–40%.',
      'Inside-sales B2B SaaS roles in Bengaluru/Hyderabad routinely pay 20–30% more than field sales at the same band.',
      'Companies are paying a premium for sales execs who can demo software themselves rather than relying on a sales engineer.',
    ],
    cta: 'Browse Sales Jobs',
    ctaSearch: 'Sales',
    related: [
      ['/blog/business-analyst-salary-india-2026.html', 'Business Analyst Salary 2026'],
      ['/blog/digital-marketing-executive-salary-india-2026.html', 'Digital Marketing Salary 2026'],
    ],
  },
  {
    slug: 'data-entry-operator-salary-india-2026',
    role: 'Data Entry Operator',
    emoji: '⌨️',
    heroColor: '#0f766e',
    summary: `Data Entry Operators in India earn ₹1.6L–₹4.5L in 2026 — typing speed and Excel fluency are the biggest pay levers.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹1.6–2.3 LPA', 'Data Entry Trainee'],
      ['1–3 years', '₹2.3–3 LPA', 'Data Entry Operator'],
      ['3–5 years', '₹3–4 LPA', 'Senior Data Entry Operator'],
      ['5–8 years', '₹4–5.5 LPA', 'Back-office Lead / Process Associate'],
      ['8+ years', '₹5.5–7.5 LPA', 'Data Operations Supervisor'],
    ],
    byCity: [
      ['Bengaluru', '₹2.4–3.4 LPA', '+15%'],
      ['Mumbai', '₹2.4–3.4 LPA', '+15%'],
      ['Delhi/NCR', '₹2.3–3.2 LPA', '+10%'],
      ['Hyderabad', '₹2.2–3 LPA', '+5%'],
      ['Pune', '₹2.1–3 LPA', '0%'],
      ['Other cities', '₹1.6–2.4 LPA', '-15%'],
    ],
    skills: [
      ['Typing speed (40+ WPM)', '₹0.2–0.5 LPA'],
      ['Advanced Excel (VLOOKUP, pivot tables)', '₹0.4–0.8 LPA'],
      ['Tally / accounting basics', '₹0.3–0.6 LPA'],
      ['English drafting + email writing', '₹0.2–0.5 LPA'],
      ['Data extraction tools / OCR', '₹0.3–0.6 LPA'],
    ],
    trends: [
      'Pure data-entry roles are being squeezed by OCR + AI — operators who layer in basic Excel/SQL are protecting their pay.',
      'BPO / KPO firms in Bengaluru, Pune and Coimbatore are the largest employers; in-house roles in SMEs are shrinking.',
      'Night-shift roles for US/UK clients add 20–30% allowance over comparable day roles.',
    ],
    cta: 'Browse Data Entry Jobs',
    ctaSearch: 'Data+Entry',
    related: [
      ['/blog/business-analyst-salary-india-2026.html', 'Business Analyst Salary 2026'],
      ['/blog/accounts-executive-salary-india-2026.html', 'Accounts Executive Salary 2026'],
    ],
  },
  {
    slug: 'business-analyst-salary-india-2026',
    role: 'Business Analyst',
    emoji: '📊',
    heroColor: '#1e40af',
    summary: `Business Analysts in India earn ₹4L–₹22L+ in 2026; SQL + product BAs in Bengaluru lead the pack.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹4–6 LPA', 'Junior Business Analyst'],
      ['1–3 years', '₹6–9.5 LPA', 'Business Analyst'],
      ['3–5 years', '₹9.5–14 LPA', 'Senior Business Analyst'],
      ['5–8 years', '₹14–20 LPA', 'Lead BA / Product BA'],
      ['8+ years', '₹20–32 LPA', 'BA Manager / Product Owner'],
    ],
    byCity: [
      ['Bengaluru', '₹10–14 LPA', '+25%'],
      ['Mumbai', '₹9.5–13 LPA', '+18%'],
      ['Delhi/NCR', '₹9–12 LPA', '+12%'],
      ['Hyderabad', '₹8.5–11.5 LPA', '+8%'],
      ['Pune', '₹8–11 LPA', '0%'],
      ['Other cities', '₹6–8.5 LPA', '-15%'],
    ],
    skills: [
      ['SQL + data wrangling', '₹1.5–3 LPA'],
      ['Power BI / Tableau / Looker', '₹1–2.5 LPA'],
      ['Product BA (stakeholder + roadmap)', '₹2–4 LPA'],
      ['Domain depth (banking, e-commerce, healthtech)', '₹1.5–3 LPA'],
      ['Python (pandas) / R basics', '₹1–2 LPA'],
    ],
    trends: [
      'The line between BA and Product Manager has thinned — BAs who own outcomes (not just docs) earn PM-level pay.',
      'SaaS + fintech are the highest-paying domains for BAs in 2026.',
      'Companies are explicitly hiring "AI BAs" — analysts who can scope and ship AI features.',
    ],
    cta: 'Browse Business Analyst Jobs',
    ctaSearch: 'Business+Analyst',
    related: [
      ['/blog/mis-executive-salary-india-2026.html', 'MIS Executive Salary 2026'],
      ['/blog/full-stack-developer-salary-india-2026.html', 'Full Stack Developer Salary 2026'],
    ],
  },
  {
    slug: 'digital-marketing-executive-salary-india-2026',
    role: 'Digital Marketing Executive',
    emoji: '📣',
    heroColor: '#c2410c',
    summary: `Digital Marketing Executives earn ₹2.4L–₹14L in 2026; paid-ads + SEO specialists outpace generalists by 30%.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹2.4–4 LPA', 'Digital Marketing Trainee'],
      ['1–3 years', '₹4–6.5 LPA', 'Digital Marketing Executive'],
      ['3–5 years', '₹6.5–10 LPA', 'Senior Digital Marketing Exec'],
      ['5–8 years', '₹10–14 LPA', 'Digital Marketing Lead'],
      ['8+ years', '₹14–22 LPA', 'Digital Marketing Manager / Head'],
    ],
    byCity: [
      ['Bengaluru', '₹6.5–9 LPA', '+22%'],
      ['Mumbai', '₹6.5–9 LPA', '+22%'],
      ['Delhi/NCR', '₹6–8.5 LPA', '+15%'],
      ['Hyderabad', '₹5.5–7.5 LPA', '+5%'],
      ['Pune', '₹5–7 LPA', '0%'],
      ['Other cities', '₹3.5–5 LPA', '-18%'],
    ],
    skills: [
      ['Performance marketing (Google + Meta Ads)', '₹1.5–3 LPA'],
      ['SEO + content strategy', '₹1–2.5 LPA'],
      ['Analytics (GA4, Looker Studio)', '₹0.8–1.5 LPA'],
      ['CRM + lifecycle (Mailchimp, MoEngage, Clevertap)', '₹1–2 LPA'],
      ['Conversion-rate optimisation', '₹1–2 LPA'],
    ],
    trends: [
      'Paid-ads specialists command a 25–35% premium over generalist marketers.',
      'Brands are paying more for SEO talent that can ship with AI tooling, not less.',
      'E-commerce & D2C brands are the highest-paying sector for digital marketers.',
    ],
    cta: 'Browse Digital Marketing Jobs',
    ctaSearch: 'Digital+Marketing',
    related: [
      ['/blog/content-writer-salary-india-2026.html', 'Content Writer Salary 2026'],
      ['/blog/sales-executive-salary-india-2026.html', 'Sales Executive Salary 2026'],
    ],
  },
  {
    slug: 'accounts-executive-salary-india-2026',
    role: 'Accounts Executive',
    emoji: '💰',
    heroColor: '#166534',
    summary: `Accounts Executives in India earn ₹2.2L–₹11L+ in 2026; GST/Tally + audit experience drive the premium.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹2.2–3.2 LPA', 'Junior Accounts Executive'],
      ['1–3 years', '₹3.2–5 LPA', 'Accounts Executive'],
      ['3–5 years', '₹5–7.5 LPA', 'Senior Accounts Executive'],
      ['5–8 years', '₹7.5–11 LPA', 'Accounts Manager'],
      ['8+ years', '₹11–18 LPA', 'Finance Manager / Controller'],
    ],
    byCity: [
      ['Bengaluru', '₹4.8–6.5 LPA', '+15%'],
      ['Mumbai', '₹5–7 LPA', '+18%'],
      ['Delhi/NCR', '₹4.5–6.2 LPA', '+10%'],
      ['Hyderabad', '₹4.3–6 LPA', '+5%'],
      ['Pune', '₹4–5.8 LPA', '0%'],
      ['Other cities', '₹3–4.5 LPA', '-15%'],
    ],
    skills: [
      ['Tally + Zoho Books', '₹0.5–1.2 LPA'],
      ['GST returns + reconciliation', '₹0.8–1.5 LPA'],
      ['TDS, PT, PF compliance', '₹0.5–1 LPA'],
      ['Audit support (statutory + internal)', '₹1–2 LPA'],
      ['Advanced Excel + power query', '₹0.5–1 LPA'],
    ],
    trends: [
      'GST + automation have made compliance the most billable accounts skill.',
      'Cloud-first firms (Zoho/QuickBooks) pay a 10–15% premium over Tally-only roles.',
      'CA Inter / CMA Inter candidates in accounts roles see the highest pay jumps.',
    ],
    cta: 'Browse Accounts Jobs',
    ctaSearch: 'Accounts',
    related: [
      ['/blog/data-entry-operator-salary-india-2026.html', 'Data Entry Operator Salary 2026'],
      ['/blog/operations-executive-salary-india-2026.html', 'Operations Executive Salary 2026'],
    ],
  },
  {
    slug: 'customer-support-executive-salary-india-2026',
    role: 'Customer Support Executive',
    emoji: '🎧',
    heroColor: '#0369a1',
    summary: `Customer Support Executives in India earn ₹2.2L–₹9.5L in 2026; SaaS support and CX leads outpace voice-only roles.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹2.2–3.4 LPA', 'Customer Support Trainee'],
      ['1–3 years', '₹3.4–5 LPA', 'Customer Support Executive'],
      ['3–5 years', '₹5–7 LPA', 'Senior CSE / Team Lead'],
      ['5–8 years', '₹7–9.5 LPA', 'CX Lead / Support Manager'],
      ['8+ years', '₹9.5–14 LPA', 'CX Head / Operations Manager'],
    ],
    byCity: [
      ['Bengaluru', '₹4.5–6 LPA', '+18%'],
      ['Mumbai', '₹4.3–5.8 LPA', '+15%'],
      ['Delhi/NCR', '₹4–5.5 LPA', '+10%'],
      ['Hyderabad', '₹3.8–5.3 LPA', '+5%'],
      ['Pune', '₹3.6–5 LPA', '0%'],
      ['Other cities', '₹2.5–3.8 LPA', '-18%'],
    ],
    skills: [
      ['SaaS product knowledge', '₹1–2 LPA'],
      ['Help-desk tooling (Zendesk, Freshdesk, Intercom)', '₹0.5–1.2 LPA'],
      ['Written English / chat support', '₹0.3–0.8 LPA'],
      ['Escalation + retention handling', '₹0.8–1.5 LPA'],
      ['Spoken English + 1 regional language', '₹0.3–0.6 LPA'],
    ],
    trends: [
      'Chat-first SaaS support is paying 15–25% more than voice BPO at the same experience.',
      'Night-shift US support adds 20–30% on top of base — but burns out fast.',
      'Promotions from CSE to CX Manager are happening 1–2 years earlier than 5 years ago.',
    ],
    cta: 'Browse Customer Support Jobs',
    ctaSearch: 'Customer+Support',
    related: [
      ['/blog/sales-executive-salary-india-2026.html', 'Sales Executive Salary 2026'],
      ['/blog/operations-executive-salary-india-2026.html', 'Operations Executive Salary 2026'],
    ],
  },
  {
    slug: 'operations-executive-salary-india-2026',
    role: 'Operations Executive',
    emoji: '⚙️',
    heroColor: '#1e293b',
    summary: `Operations Executives in India earn ₹2.6L–₹13L+ in 2026, with logistics & e-commerce ops paying the highest.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹2.6–3.8 LPA', 'Operations Trainee'],
      ['1–3 years', '₹3.8–5.8 LPA', 'Operations Executive'],
      ['3–5 years', '₹5.8–8.5 LPA', 'Senior Ops Exec / Team Lead'],
      ['5–8 years', '₹8.5–13 LPA', 'Operations Manager'],
      ['8+ years', '₹13–22 LPA', 'Head of Operations / GM'],
    ],
    byCity: [
      ['Bengaluru', '₹6–8.2 LPA', '+18%'],
      ['Mumbai', '₹6–8.2 LPA', '+18%'],
      ['Delhi/NCR', '₹5.5–7.8 LPA', '+12%'],
      ['Hyderabad', '₹5.2–7 LPA', '+5%'],
      ['Pune', '₹5–6.8 LPA', '0%'],
      ['Other cities', '₹3.4–5 LPA', '-18%'],
    ],
    skills: [
      ['Excel + ops dashboards', '₹0.8–1.5 LPA'],
      ['SOP design + process automation', '₹1–2 LPA'],
      ['Vendor + stakeholder management', '₹1–1.8 LPA'],
      ['Inventory / supply-chain basics', '₹1–2 LPA'],
      ['Lean / Six Sigma (Green Belt+)', '₹1.5–3 LPA'],
    ],
    trends: [
      'E-commerce ops (Flipkart, Meesho, quick-commerce) pays 20–30% more than offline retail.',
      'Companies are paying premium for ops execs who automate manual work with no-code tools.',
      'Hybrid ops (warehouse + dashboards) is the fastest-growing band.',
    ],
    cta: 'Browse Operations Jobs',
    ctaSearch: 'Operations',
    related: [
      ['/blog/mis-executive-salary-india-2026.html', 'MIS Executive Salary 2026'],
      ['/blog/business-analyst-salary-india-2026.html', 'Business Analyst Salary 2026'],
    ],
  },
  {
    slug: 'content-writer-salary-india-2026',
    role: 'Content Writer',
    emoji: '✍️',
    heroColor: '#a16207',
    summary: `Content Writers in India earn ₹2.4L–₹14L in 2026; SEO + product writers in SaaS lead the pack.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹2.4–3.6 LPA', 'Junior Content Writer'],
      ['1–3 years', '₹3.6–6 LPA', 'Content Writer'],
      ['3–5 years', '₹6–9 LPA', 'Senior Content Writer'],
      ['5–8 years', '₹9–14 LPA', 'Content Lead / Editor'],
      ['8+ years', '₹14–22 LPA', 'Content Manager / Head of Content'],
    ],
    byCity: [
      ['Bengaluru', '₹6.5–9 LPA', '+25%'],
      ['Mumbai', '₹6–8.5 LPA', '+20%'],
      ['Delhi/NCR', '₹5.8–8 LPA', '+15%'],
      ['Hyderabad', '₹5–7 LPA', '+5%'],
      ['Pune', '₹4.8–6.8 LPA', '0%'],
      ['Other cities', '₹3.2–5 LPA', '-18%'],
    ],
    skills: [
      ['SEO writing + on-page', '₹1–2 LPA'],
      ['B2B / SaaS thought leadership', '₹1.5–3 LPA'],
      ['Editorial calendar + CMS (WordPress, Webflow)', '₹0.5–1 LPA'],
      ['Brand voice + style guides', '₹0.8–1.5 LPA'],
      ['Editing AI-generated drafts (LLM-assisted writing)', '₹1–2 LPA'],
    ],
    trends: [
      'Pure long-form writers face pressure from AI — writers who edit, fact-check and add expertise are paid 30–50% more.',
      'B2B SaaS thought leadership is the highest-paying sub-niche.',
      'Content writers who also brief designers / video editors are getting promoted into content-strategy roles faster.',
    ],
    cta: 'Browse Content Writing Jobs',
    ctaSearch: 'Content+Writer',
    related: [
      ['/blog/digital-marketing-executive-salary-india-2026.html', 'Digital Marketing Salary 2026'],
      ['/blog/business-analyst-salary-india-2026.html', 'Business Analyst Salary 2026'],
    ],
  },
  {
    slug: 'full-stack-developer-salary-india-2026',
    role: 'Full Stack Developer',
    emoji: '💻',
    heroColor: '#1e3a8a',
    summary: `Full Stack Developers in India earn ₹5L–₹35L+ in 2026; product-engineering roles in Bengaluru lead the market.`,
    byExperience: [
      ['Fresher (0–1 years)', '₹5–8 LPA', 'Junior Full Stack Developer'],
      ['1–3 years', '₹8–14 LPA', 'Full Stack Developer'],
      ['3–5 years', '₹14–22 LPA', 'Senior Full Stack Developer'],
      ['5–8 years', '₹22–35 LPA', 'Lead / Staff Engineer'],
      ['8+ years', '₹35–60 LPA', 'Engineering Manager / Principal'],
    ],
    byCity: [
      ['Bengaluru', '₹16–24 LPA', '+30%'],
      ['Mumbai', '₹14–22 LPA', '+22%'],
      ['Delhi/NCR', '₹14–20 LPA', '+18%'],
      ['Hyderabad', '₹13–20 LPA', '+15%'],
      ['Pune', '₹12–18 LPA', '+8%'],
      ['Other cities', '₹8–14 LPA', '-15%'],
    ],
    skills: [
      ['React + TypeScript', '₹2–4 LPA'],
      ['Node.js / NestJS', '₹2–4 LPA'],
      ['AWS / GCP / Cloud', '₹3–5 LPA'],
      ['Postgres + Redis at scale', '₹2–3 LPA'],
      ['System design (services, queues, observability)', '₹3–5 LPA'],
    ],
    trends: [
      'Product engineering roles at Indian SaaS unicorns now pay close to FAANG-India bands.',
      'Engineers who can ship with LLMs (RAG, agents, fine-tuning) earn a 25–40% premium.',
      'Remote-first companies are paying Bengaluru-level salaries to engineers in tier-2 cities.',
    ],
    cta: 'Browse Developer Jobs',
    ctaSearch: 'Full+Stack+Developer',
    related: [
      ['/blog/business-analyst-salary-india-2026.html', 'Business Analyst Salary 2026'],
      ['/blog/remote-product-manager-jobs-india-2026.html', 'Remote PM Jobs 2026'],
    ],
  },
];

function buildPage(g) {
  const url = `${BASE}/blog/${g.slug}.html`;
  const titleH1 = `${g.role} Salary in India 2026`;
  const titleTag = `${titleH1}: Complete Guide | HireTrack Blog`;
  const meta = `${g.role} salary in India 2026 — updated figures by experience and city, salary trends, and the skills that raise pay. Includes salary tables and FAQs.`;
  const faqs = [
    [
      `What is ${g.role} salary in India in 2026?`,
      `${g.summary} Most mid-level ${g.role}s sit in the ₹${g.byExperience[1][1].replace('LPA', 'L').replace(/\s/g, '')} band, roughly 5–8% higher than 2025.`,
    ],
    [
      `What is ${g.role} salary per month in 2026?`,
      `A fresher ${g.role} earns roughly ₹${Math.round((parseFloat(g.byExperience[0][1].split('–')[0].replace('₹', '')) * 100000) / 12 / 1000)}k–₹${Math.round((parseFloat(g.byExperience[0][1].split('–')[1].split(' ')[0]) * 100000) / 12 / 1000)}k per month in 2026, and senior ${g.role}s earn ₹${Math.round((parseFloat(g.byExperience[3][1].split('–')[0].replace('₹', '')) * 100000) / 12 / 1000)}k or more per month depending on city and skills.`,
    ],
    [
      `Which city pays ${g.role}s the most in India?`,
      `In 2026, Bengaluru and Mumbai consistently pay ${g.role}s 15–25% more than the national average, followed by Delhi NCR and Hyderabad.`,
    ],
    [
      `Which skills raise ${g.role} salary in 2026?`,
      `The biggest pay levers in 2026 are: ${g.skills
        .slice(0, 3)
        .map((s) => s[0])
        .join(', ')} — each of which typically adds the ranges shown in the skills section above.`,
    ],
    [
      `Is ${g.role} a good career in India in 2026?`,
      `Yes — ${g.role} demand remains strong across SMEs and enterprises in India. With the skills called out above, the role offers clear paths into senior, lead and manager bands within 5–7 years.`,
    ],
  ];

  const today = new Date().toISOString().slice(0, 10);

  const expTable = g.byExperience
    .map(([exp, sal, role]) => `<tr><td>${esc(exp)}</td><td>${esc(sal)}</td><td>${esc(role)}</td></tr>`)
    .join('\n    ');
  const cityTable = g.byCity
    .map(([city, sal, vs]) => `<tr><td>${esc(city)}</td><td>${esc(sal)}</td><td>${esc(vs)}</td></tr>`)
    .join('\n    ');
  const skillsList = g.skills
    .map(([s, p]) => `<li><strong>${esc(s)}</strong> — adds ${esc(p)}</li>`)
    .join('\n      ');
  const trendsList = g.trends.map((t) => `<li>${t}</li>`).join('\n    ');
  const faqsHtml = faqs.map(([q, a]) => `<h3>${esc(q)}</h3>\n    <p>${esc(a)}</p>`).join('\n    ');
  const relatedHtml = g.related
    .map(([href, label]) => `<li><a href="${esc(href)}">${esc(label)}</a></li>`)
    .join('\n      ');

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${titleH1}: Complete Guide`,
    author: { '@type': 'Organization', name: 'HireTrack' },
    publisher: { '@type': 'Organization', name: 'HireTrack', url: BASE },
    datePublished: today,
    dateModified: today,
    mainEntityOfPage: url,
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
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${BASE}/blog.html` },
      { '@type': 'ListItem', position: 3, name: titleH1, item: url },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titleTag)}</title>
<meta name="description" content="${esc(meta)}">
<meta name="keywords" content="${esc(g.role.toLowerCase())} salary india 2026, ${esc(g.role.toLowerCase())} salary per month, ${esc(g.role.toLowerCase())} salary bengaluru mumbai">
<meta name="robots" content="index, follow">
<meta property="og:title" content="${esc(titleH1)}: Complete Guide">
<meta property="og:description" content="${esc(meta)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:image" content="${BASE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titleH1)}: Complete Guide">
<meta name="twitter:description" content="${esc(meta)}">
<meta name="twitter:image" content="${BASE}/og-image.png">
<link rel="canonical" href="${esc(url)}">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../mobile.css">
<style>
body{padding-top:64px;}
.article-hero{background:linear-gradient(135deg,${g.heroColor},#1e293b);padding:3rem 1.5rem;color:#fff;text-align:center;}
.article-hero .art-cat{display:inline-block;background:rgba(255,255,255,0.2);color:#fff;font-size:0.75rem;font-weight:700;padding:4px 12px;border-radius:20px;margin-bottom:1rem;text-transform:uppercase;}
.article-hero h1{font-size:2rem;font-weight:800;max-width:760px;margin:0 auto 1rem;line-height:1.3;}
.article-hero .art-meta{color:rgba(255,255,255,0.75);font-size:0.85rem;}
.article-wrap{max-width:760px;margin:2.5rem auto;padding:0 1.5rem;}
.article-emoji{font-size:5rem;text-align:center;margin-bottom:2rem;}
.article-wrap h2{font-size:1.3rem;font-weight:800;color:#0f172a;margin:2rem 0 0.75rem;padding-bottom:0.5rem;border-bottom:2px solid #e2e8f0;}
.article-wrap h3{font-size:1.05rem;font-weight:700;color:#1e293b;margin:1.5rem 0 0.5rem;}
.article-wrap p{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:1rem;}
.article-wrap ul,.article-wrap ol{padding-left:1.5rem;margin-bottom:1rem;}
.article-wrap li{font-size:0.95rem;line-height:1.8;color:#334155;margin-bottom:0.4rem;}
.article-wrap strong{color:#0f172a;}
.art-highlight{background:#eff6ff;border-left:4px solid #3b82f6;padding:1rem 1.2rem;border-radius:0 8px 8px 0;margin:1.5rem 0;font-size:0.92rem;color:#1e40af;line-height:1.7;}
.art-box{background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:1.2rem 1.5rem;margin:1.5rem 0;}
.art-box h4{font-size:0.9rem;font-weight:700;margin:0 0 0.5rem;color:#0f172a;}
.art-table{width:100%;border-collapse:collapse;margin:1.5rem 0;font-size:0.88rem;}
.art-table th{background:#0f172a;color:#fff;padding:0.75rem 1rem;text-align:left;font-size:0.8rem;}
.art-table td{padding:0.75rem 1rem;border-bottom:1px solid #e2e8f0;color:#334155;}
.art-table tr:nth-child(even) td{background:#f8fafc;}
.art-cta{background:linear-gradient(135deg,#1e3a5f,#1e293b);border-radius:14px;padding:2rem;text-align:center;margin:2.5rem 0;color:#fff;}
.art-cta h3{font-size:1.2rem;font-weight:800;margin:0 0 0.5rem;}
.art-cta p{color:#94a3b8;font-size:0.88rem;margin:0 0 1.2rem;}
.art-cta a{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:0.75rem 2rem;border-radius:8px;font-weight:700;font-size:0.92rem;}
.art-cta a:hover{background:#2563eb;}
.art-related{background:#f8fafc;border-radius:12px;padding:1.2rem 1.5rem;margin:2rem 0;}
.art-related h4{margin:0 0 0.6rem;font-size:0.9rem;font-weight:700;color:#0f172a;}
.art-related ul{margin:0;padding-left:1.25rem;}
.breadcrumb{font-size:0.8rem;color:#94a3b8;text-align:center;padding:1rem 0 0;}
.breadcrumb a{color:#3b82f6;text-decoration:none;}
@media(max-width:768px){.article-hero h1{font-size:1.4rem;}.article-wrap{padding:0 0.75rem;}body{padding-top:56px;}}
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-76H5XQV27B"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-76H5XQV27B');</script>
<script type="application/ld+json">${JSON.stringify([articleLd, faqLd, breadcrumbLd])}</script>
</head>
<body>
<div id="navbar"></div>
<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="../index.html">Home</a> › <a href="../blog.html">Blog</a> › ${esc(titleH1)}
</nav>
<div class="article-hero">
  <span class="art-cat">Salary Guide</span>
  <h1>${esc(titleH1)}: Complete Guide</h1>
  <div class="art-meta">📅 ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} &nbsp;·&nbsp; ⏱ 8 min read &nbsp;·&nbsp; ✍️ HireTrack Team</div>
</div>
<article class="article-wrap">
  <div class="article-emoji" aria-hidden="true">${g.emoji}</div>
  <p>${esc(g.summary)} As companies in India keep investing in modern talent, pay for ${g.role}s has nudged 5–8% higher than 2025. Here is the complete, updated breakdown by experience, city and skills.</p>

  <h2>${esc(g.role)} Salary by Experience (2026)</h2>
  <table class="art-table">
    <thead><tr><th>Experience</th><th>Salary Range (2026)</th><th>Typical Role</th></tr></thead>
    <tbody>
    ${expTable}
    </tbody>
  </table>

  <h2>${esc(g.role)} Salary by City (2026)</h2>
  <table class="art-table">
    <thead><tr><th>City</th><th>Average Salary (3 yrs exp)</th><th>vs National Avg</th></tr></thead>
    <tbody>
    ${cityTable}
    </tbody>
  </table>

  <h2>2026 Trends Shaping ${esc(g.role)} Pay</h2>
  <ul>
    ${trendsList}
  </ul>

  <h2>Skills That Boost ${esc(g.role)} Salary</h2>
  <div class="art-box">
    <h4>High-value skills in 2026:</h4>
    <ul style="margin:0;">
      ${skillsList}
    </ul>
  </div>
  <div class="art-highlight">Stack 2–3 of these and you typically jump a salary band 12–18 months faster than peers who don't.</div>

  <p>Looking for ${esc(g.role)} jobs? <a href="/jobs.html?search=${g.ctaSearch}"><strong>Browse open positions on HireTrack →</strong></a></p>

  <h2>Frequently Asked Questions</h2>
  <div class="art-faq">
    ${faqsHtml}
  </div>

  <div class="art-related">
    <h4>Related guides</h4>
    <ul>
      ${relatedHtml}
      <li><a href="/jobs.html">Browse all open jobs</a></li>
    </ul>
  </div>

  <div class="art-cta">
    <h3>Find ${esc(g.role)} Jobs Near You</h3>
    <p>HireTrack lists verified ${esc(g.role)} openings across India. Free to apply.</p>
    <a href="/jobs.html?search=${g.ctaSearch}">${esc(g.cta)} →</a>
  </div>
</article>
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
      <a href="../blog.html">Blog</a><span class="ht-sep">·</span>
      <a href="../about.html">About</a><span class="ht-sep">·</span>
      <a href="../contact.html">Contact Us</a><span class="ht-sep">·</span>
      <a href="../pricing.html">Pricing</a><span class="ht-sep">·</span>
      <a href="../privacy.html">Privacy Policy</a><span class="ht-sep">·</span>
      <a href="../terms.html">Terms of Use</a>
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
  document.getElementById('navbar').innerHTML = renderNavbar('blog');
  var _cy = document.getElementById('copy-year'); if (_cy) _cy.textContent = new Date().getFullYear();
</script>
</body>
</html>
`;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  for (const g of GUIDES) {
    const html = buildPage(g);
    const target = path.join(outDir, `${g.slug}.html`);
    await fs.writeFile(target, html, 'utf8');
    console.log(`wrote ${path.relative(repoRoot, target)}`);
  }
  console.log(`\n${GUIDES.length} salary guide(s) written.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
