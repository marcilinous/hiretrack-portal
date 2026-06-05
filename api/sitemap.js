import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const BASE = 'https://www.hiretrack.co.in';

const STATIC_PAGES = [
  { loc: '/',                          priority: '1.0', changefreq: 'daily'   },
  { loc: '/jobs.html',                 priority: '0.9', changefreq: 'hourly'  },
  { loc: '/jobs/bengaluru.html',       priority: '0.8', changefreq: 'weekly'  },
  { loc: '/jobs/hyderabad.html',       priority: '0.8', changefreq: 'weekly'  },
  { loc: '/jobs/mumbai.html',          priority: '0.8', changefreq: 'weekly'  },
  { loc: '/pricing.html',              priority: '0.8', changefreq: 'weekly'  },
  { loc: '/pricing-candidate.html',    priority: '0.8', changefreq: 'weekly'  },
  { loc: '/post-job.html',             priority: '0.7', changefreq: 'monthly' },
  { loc: '/interview-tips.html',       priority: '0.7', changefreq: 'monthly' },
  { loc: '/job-alerts.html',           priority: '0.7', changefreq: 'weekly'  },
  { loc: '/about.html',                priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog.html',                 priority: '0.6', changefreq: 'weekly'  },
  { loc: '/blog/best-free-job-portals-india-2025.html',              priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/data-analyst-interview-preparation.html',            priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/fresher-resume-india-2025.html',                     priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/how-to-post-job-free-india.html',                    priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/hr-jobs-india-salary-skills-2025.html',              priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/it-jobs-bengaluru-2025.html',                        priority: '0.6', changefreq: 'monthly' },
  { loc: '/blog/mis-executive-salary-india-2025.html',               priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog/mis-executive-salary-india-2026.html',               priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog/postman-jobs-india-salary-2026.html',                priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog/remote-product-manager-jobs-india-2026.html',        priority: '0.7', changefreq: 'monthly' },
  { loc: '/blog/whatsapp-apply-future-job-applications-india.html',  priority: '0.6', changefreq: 'monthly' },
  { loc: '/careers.html',              priority: '0.5', changefreq: 'monthly' },
  { loc: '/culture.html',              priority: '0.5', changefreq: 'monthly' },
  { loc: '/contact.html',              priority: '0.5', changefreq: 'monthly' },
  { loc: '/terms.html',                priority: '0.4', changefreq: 'yearly'  },
  { loc: '/privacy.html',              priority: '0.4', changefreq: 'yearly'  },
  { loc: '/refund.html',               priority: '0.4', changefreq: 'yearly'  },
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

  let jobUrls = '';
  try {
    const sb = createClient(SB_URL, SB_SERVICE_KEY);
    const { data: jobs } = await sb
      .from('jobs')
      .select('id, created_at, expires_at')
      .eq('delisted', false)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (jobs && jobs.length > 0) {
      jobUrls = jobs
        .filter(j => !j.expires_at || new Date() < new Date(j.expires_at))
        .map(j => {
          const lastmod = toW3CDate(j.created_at);
          return `  <url>\n    <loc>${BASE}/job.html?id=${esc(j.id)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
        })
        .join('\n');
    }
  } catch (e) {
    // Sitemap still works without job URLs if DB is unreachable
    console.error('sitemap DB error:', e.message);
  }

  const staticUrls = STATIC_PAGES.map(p =>
    `  <url>\n    <loc>${BASE}${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${jobUrls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
