const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const MAX_ALERTS = 50;

function buildEmailHtml(firstName, jobTitle, company, location, salary, jobType) {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:2rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.6rem;font-weight:800;color:#fff;letter-spacing:-0.5px;">Hire<span style="color:#3b82f6;">Track</span></div>
    <p style="color:#94a3b8;margin:0.4rem 0 0;font-size:0.85rem;">India's Growing Job Portal</p>
  </div>
  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1rem;color:#1e293b;margin:0 0 1rem;">Hi ${firstName},</p>
    <p style="font-size:0.95rem;color:#334155;margin:0 0 1.5rem;">A new job matching your profile just went live on HireTrack. Don't miss it!</p>
    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;">
      <div style="font-size:1.1rem;font-weight:700;color:#0f172a;margin-bottom:0.4rem;">${jobTitle}</div>
      <div style="font-size:0.9rem;color:#64748b;margin-bottom:1rem;">🏢 ${company}</div>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
        <span style="background:#eff6ff;color:#1d4ed8;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">📍 ${location}</span>
        <span style="background:#f0fdf4;color:#15803d;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">💰 ${salary}</span>
        ${jobType ? `<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">⏱ ${jobType}</span>` : ''}
      </div>
    </div>
    <div style="text-align:center;margin-bottom:1.5rem;">
      <a href="https://www.hiretrack.co.in/jobs.html" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;">View &amp; Apply Now →</a>
    </div>
    <p style="font-size:0.82rem;color:#94a3b8;text-align:center;margin:0;">
      You're receiving this because you have job alerts enabled on HireTrack.<br>
      <a href="https://www.hiretrack.co.in/profile.html" style="color:#3b82f6;">Manage your alerts</a>
    </p>
  </div>
  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2025 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!RESEND_KEY || !SERVICE_KEY) return res.status(200).json({ ok: false, error: 'Not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { title, company, location, salary, jobType, skills } = body || {};
  if (!title || !company) return res.status(400).json({ ok: false, error: 'Missing job fields' });

  // Fetch all alert-enabled candidates with an email
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/candidates?job_alerts_enabled=eq.true&select=id,name,email,city,skills`,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
  );
  if (!r.ok) return res.status(500).json({ ok: false, error: 'Failed to fetch candidates' });
  const candidates = await r.json();

  // Match by city OR skill overlap
  const isRemote = /remote/i.test(location || '');
  const jobLoc = (location || '').toLowerCase();
  const jobSkills = (skills || '').toLowerCase().split(/[\s,]+/).filter(s => s.length > 1);

  const matched = candidates.filter(c => {
    if (!c.email) return false;
    if (isRemote) return true; // remote jobs go to everyone with alerts on
    const cityMatch = c.city && jobLoc.includes(c.city.toLowerCase());
    const candSkills = (c.skills || []).map(s => s.toLowerCase());
    const skillMatch = candSkills.some(s => jobSkills.includes(s));
    return cityMatch || skillMatch;
  }).slice(0, MAX_ALERTS);

  // Send emails sequentially
  let sent = 0;
  for (const c of matched) {
    try {
      const firstName = (c.name || 'there').split(' ')[0];
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: 'jobs@hiretrack.co.in',
          to: [c.email],
          subject: `🎯 New Job Alert: ${title} at ${company} — HireTrack`,
          html: buildEmailHtml(firstName, title, company, location || '', salary || 'Not specified', jobType || '')
        })
      });
      if (resp.ok) sent++;
    } catch { /* skip failed sends */ }
  }

  console.log(`Job alert: "${title}" at ${company} — ${matched.length} matched, ${sent} sent`);
  return res.status(200).json({ ok: true, matched: matched.length, sent });
}
