export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(200).json({ ok: false, error: 'Not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { employerEmail, company, jobTitle, candidateName, candidateCity, candidateExperience, candidateSkills } = body || {};

  if (!employerEmail || !jobTitle || !candidateName) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  const skillTags = (candidateSkills || []).slice(0, 4)
    .map(s => `<span style="background:#eff6ff;color:#1d4ed8;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;display:inline-block;margin:2px;">${s}</span>`)
    .join('');

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:2rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.6rem;font-weight:800;color:#fff;">Hire<span style="color:#3b82f6;">Track</span></div>
    <p style="color:#94a3b8;margin:0.4rem 0 0;font-size:0.85rem;">Employer Dashboard</p>
  </div>
  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1rem;color:#1e293b;margin:0 0 0.5rem;font-weight:700;">📬 New Application Received</p>
    <p style="font-size:0.92rem;color:#334155;margin:0 0 1.5rem;">Someone just applied for your job posting on HireTrack.</p>

    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;">
      <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.75rem;">Applicant</div>
      <div style="font-size:1.1rem;font-weight:800;color:#0f172a;margin-bottom:0.25rem;">${candidateName}</div>
      <div style="font-size:0.85rem;color:#64748b;margin-bottom:0.75rem;">
        ${candidateCity ? `📍 ${candidateCity}` : ''}${candidateCity && candidateExperience ? ' · ' : ''}${candidateExperience ? `🎓 ${candidateExperience}` : ''}
      </div>
      ${skillTags ? `<div style="margin-top:0.5rem;">${skillTags}</div>` : ''}
    </div>

    <div style="background:#eff6ff;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;">
      <div style="font-size:0.7rem;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">Applied for</div>
      <div style="font-size:0.95rem;font-weight:700;color:#0f172a;">${jobTitle}</div>
      <div style="font-size:0.82rem;color:#3b82f6;">${company}</div>
    </div>

    <div style="text-align:center;margin-bottom:1.5rem;">
      <a href="https://www.hiretrack.co.in/employer-dashboard.html" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;">View in Dashboard →</a>
    </div>

    <p style="font-size:0.8rem;color:#94a3b8;text-align:center;margin:0;">
      You're receiving this because you have an active job posting on HireTrack.
    </p>
  </div>
  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2025 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: 'noreply@hiretrack.co.in',
        to: [employerEmail],
        subject: `📬 New application: ${candidateName} applied for ${jobTitle}`,
        html
      })
    });
    const data = await r.json();
    if (r.ok && data.id) return res.status(200).json({ ok: true });
    return res.status(200).json({ ok: false, error: data.message });
  } catch(e) {
    console.error('notify-employer-application error:', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
