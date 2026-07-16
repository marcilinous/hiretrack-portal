import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BASE = 'https://www.hiretrack.co.in';

const STATIC_PAGES = [
  { loc: '/', priority: '1.0', changefreq: 'daily' },
  { loc: '/jobs.html', priority: '0.9', changefreq: 'hourly' },
  { loc: '/for-employers.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/companies.html', priority: '0.7', changefreq: 'weekly' },
  { loc: '/jobs/bengaluru.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/jobs/hyderabad.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/jobs/mumbai.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/jobs/delhi.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/jobs/pune.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/jobs/chennai.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/jobs/walk-in-jobs-india.html', priority: '0.7', changefreq: 'weekly' },
  { loc: '/jobs/sql-jobs-india.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/jobs/excel-jobs-india.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/jobs/python-jobs-india.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/jobs/digital-marketing-jobs-india.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/jobs/data-entry-jobs-india.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/jobs/remote-jobs-india.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/jobs/fresher-jobs-india.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/jobs/work-from-home-jobs.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/pricing.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/pricing-candidate.html', priority: '0.8', changefreq: 'weekly' },
  { loc: '/post-job.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/interview-tips.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/job-alerts.html', priority: '0.7', changefreq: 'weekly' },
  { loc: '/about.html', priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog.html', priority: '0.6', changefreq: 'weekly' },
  { loc: '/blog/best-free-job-portals-india-2025.html', priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/data-analyst-interview-preparation.html', priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/fresher-resume-india-2025.html', priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/how-to-post-job-free-india.html', priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/hr-jobs-india-salary-skills-2025.html', priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/it-jobs-bengaluru-2025.html', priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/mis-executive-salary-india-2025.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog/mis-executive-salary-india-2026.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog/postman-jobs-india-salary-2026.html', priority: '0.7', changefreq: 'monthly' },
  {
    loc: '/blog/remote-product-manager-jobs-india-2026.html',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    loc: '/blog/whatsapp-apply-future-job-applications-india.html',
    priority: '0.6',
    changefreq: 'monthly',
  },
  // Salary guides (2026 batch — Phase 2.3)
  { loc: '/blog/hr-executive-salary-india-2026.html', priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog/sales-executive-salary-india-2026.html', priority: '0.7', changefreq: 'monthly' },
  {
    loc: '/blog/data-entry-operator-salary-india-2026.html',
    priority: '0.7',
    changefreq: 'monthly',
  },
  { loc: '/blog/business-analyst-salary-india-2026.html', priority: '0.7', changefreq: 'monthly' },
  {
    loc: '/blog/digital-marketing-executive-salary-india-2026.html',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    loc: '/blog/accounts-executive-salary-india-2026.html',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    loc: '/blog/customer-support-executive-salary-india-2026.html',
    priority: '0.7',
    changefreq: 'monthly',
  },
  {
    loc: '/blog/operations-executive-salary-india-2026.html',
    priority: '0.7',
    changefreq: 'monthly',
  },
  { loc: '/blog/content-writer-salary-india-2026.html', priority: '0.7', changefreq: 'monthly' },
  {
    loc: '/blog/full-stack-developer-salary-india-2026.html',
    priority: '0.7',
    changefreq: 'monthly',
  },
  // Interview question guides (Phase 5.1)
  {
    loc: '/blog/mis-executive-interview-questions-2026.html',
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    loc: '/blog/hr-executive-interview-questions-2026.html',
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    loc: '/blog/sales-executive-interview-questions-2026.html',
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    loc: '/blog/data-analyst-interview-questions-sql-2026.html',
    priority: '0.6',
    changefreq: 'monthly',
  },
  {
    loc: '/blog/digital-marketing-interview-questions-2026.html',
    priority: '0.6',
    changefreq: 'monthly',
  },
  { loc: '/contact.html', priority: '0.5', changefreq: 'monthly' },
  { loc: '/terms.html', priority: '0.4', changefreq: 'yearly' },
  { loc: '/privacy.html', priority: '0.4', changefreq: 'yearly' },
  { loc: '/refund.html', priority: '0.4', changefreq: 'yearly' },
];

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toW3CDate(dateStr) {
  try {
    return new Date(dateStr).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const today = new Date().toISOString().split('T')[0];

  // Slugify helper — must stay in lockstep with scripts/generate-job-pages.js
  // so the URLs the sitemap emits are the same ones the SSG produces.
  function slugify(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }
  function shortId(id) {
    return String(id || '')
      .replace(/-/g, '')
      .slice(0, 8);
  }

  let jobUrls = '';
  try {
    const sb = createClient(SB_URL, SB_SERVICE_KEY);
    const { data: jobs } = await sb
      .from('jobs')
      .select('id, title, company, location, created_at, updated_at, expires_at')
      .eq('delisted', false)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (jobs && jobs.length > 0) {
      jobUrls = jobs
        .filter((j) => !j.expires_at || new Date() < new Date(j.expires_at))
        .map((j) => {
          const lastmod = toW3CDate(j.updated_at || j.created_at);
          const slugParts = [j.title, j.company, j.location]
            .filter(Boolean)
            .map(slugify)
            .filter(Boolean);
          const slug = (slugParts.join('-') || 'job') + '-' + shortId(j.id);
          // Emit the clean static-HTML URL (generated by scripts/generate-job-pages.js).
          // Both /job.html?id=X and /jobs/<slug>.html resolve to the same job; we
          // only list the canonical clean URL to avoid duplicate-content signals.
          return `  <url>\n    <loc>${BASE}/jobs/${esc(slug)}.html</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`;
        })
        .join('\n');
    }
  } catch (e) {
    // Sitemap still works without job URLs if DB is unreachable
    console.error('sitemap DB error:', e.message);
  }

  // Company profile pages — emit /companies/<slug>.html for each employer
  // that has at least one active job. Slug must match scripts/generate-company-pages.js.
  let companyUrls = '';
  try {
    const sb = createClient(SB_URL, SB_SERVICE_KEY);
    const { data: jobs } = await sb
      .from('jobs')
      .select('company, updated_at')
      .eq('delisted', false)
      .limit(10000);
    if (jobs && jobs.length > 0) {
      const seen = new Map();
      for (const j of jobs) {
        if (!j.company) continue;
        const s = slugify(j.company);
        if (!s) continue;
        const prev = seen.get(s);
        const dt = j.updated_at || new Date().toISOString();
        if (!prev || new Date(dt) > new Date(prev)) seen.set(s, dt);
      }
      companyUrls = Array.from(seen.entries())
        .map(
          ([slug, ts]) =>
            `  <url>\n    <loc>${BASE}/companies/${esc(slug)}.html</loc>\n    <lastmod>${toW3CDate(ts)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`
        )
        .join('\n');
    }
  } catch (e) {
    console.error('sitemap company error:', e.message);
  }

  // Auto-published blog posts (seo-blog-autopublish logs each into blog_posts) —
  // emitted dynamically so new posts are crawled without editing this file.
  let blogUrls = '';
  try {
    const sb = createClient(SB_URL, SB_SERVICE_KEY);
    const { data: posts } = await sb
      .from('blog_posts')
      .select('url, published_at')
      .order('published_at', { ascending: false })
      .limit(2000);

    if (posts && posts.length > 0) {
      blogUrls = posts
        .map((p) => {
          const loc = String(p.url).startsWith('http') ? p.url : `${BASE}${p.url}`;
          return `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${toW3CDate(p.published_at)}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`;
        })
        .join('\n');
    }
  } catch (e) {
    console.error('sitemap blog error:', e.message);
  }

  const staticUrls = STATIC_PAGES.map(
    (p) =>
      `  <url>\n    <loc>${BASE}${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${jobUrls}
${companyUrls}
${blogUrls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
