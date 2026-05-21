const STATUS_CONFIG = {
  Shortlisted: {
    emoji: '🌟',
    subject: (job, company) => `🌟 You've been shortlisted for ${job} at ${company}!`,
    headline: 'Great news — you\'ve been shortlisted!',
    body: (job, company) => `Your application for <strong>${job}</strong> at <strong>${company}</strong> has been reviewed and you've been shortlisted. This is a great step forward!`,
    color: '#d97706', bg: '#fffbeb', cta: 'Check your notifications →'
  },
  Interview: {
    emoji: '📅',
    subject: (job, company) => `📅 Interview invite for ${job} at ${company}`,
    headline: 'You\'ve been selected for an interview!',
    body: (job, company) => `Congratulations! The employer at <strong>${company}</strong> wants to interview you for <strong>${job}</strong>. Check your messages on HireTrack for details.`,
    color: '#0891b2', bg: '#ecfeff', cta: 'View your messages →'
  },
  Hired: {
    emoji: '🎉',
    subject: (job, company) => `🎉 Congratulations! You've been hired at ${company}!`,
    headline: 'Congratulations — you\'ve been hired!',
    body: (job, company) => `Amazing news! You've been selected for <strong>${job}</strong> at <strong>${company}</strong>. Your hard work paid off — well done!`,
    color: '#16a34a', bg: '#f0fdf4', cta: 'View your profile →'
  },
  Rejected: {
    emoji: '📩',
    subject: (job, company) => `Your application update for ${job} at ${company}`,
    headline: 'Application update',
    body: (job, company) => `Thank you for applying for <strong>${job}</strong> at <strong>${company}</strong>. After careful review, they've decided to move forward with other candidates this time. Keep applying — the right opportunity is out there.`,
    color: '#64748b', bg: '#f8fafc', cta: 'Browse more jobs →'
  }
};

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
  const { candidateEmail, candidateName, jobTitle, company, status } = body || {};

  if (!candidateEmail || !jobTitle || !company || !status) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  const cfg = STATUS_CONFIG[status];
  if (!cfg) return res.status(200).json({ ok: false, error: 'No email for this status' });

  const firstName = (candidateName || 'there').split(' ')[0];
  const ctaUrl = status === 'Interview'
    ? 'https://www.hiretrack.co.in/profile.html#chat'
    : status === 'Rejected'
    ? 'https://www.hiretrack.co.in/jobs.html'
    : 'https://www.hiretrack.co.in/profile.html';

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:2rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.6rem;font-weight:800;color:#fff;">Hire<span style="color:#3b82f6;">Track</span></div>
    <p style="color:#94a3b8;margin:0.4rem 0 0;font-size:0.85rem;">Application Update</p>
  </div>
  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1rem;color:#1e293b;margin:0 0 1rem;">Hi ${firstName},</p>

    <div style="background:${cfg.bg};border-left:4px solid ${cfg.color};border-radius:8px;padding:1.25rem 1.5rem;margin-bottom:1.5rem;">
      <div style="font-size:1.4rem;margin-bottom:0.4rem;">${cfg.emoji}</div>
      <div style="font-size:1rem;font-weight:800;color:#0f172a;margin-bottom:0.5rem;">${cfg.headline}</div>
      <p style="font-size:0.88rem;color:#334155;margin:0;line-height:1.6;">${cfg.body(jobTitle, company)}</p>
    </div>

    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;">
      <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">Job</div>
      <div style="font-size:0.95rem;font-weight:700;color:#0f172a;">${jobTitle}</div>
      <div style="font-size:0.82rem;color:#64748b;">${company}</div>
    </div>

    <div style="text-align:center;margin-bottom:1.5rem;">
      <a href="${ctaUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;">${cfg.cta}</a>
    </div>

    <p style="font-size:0.8rem;color:#94a3b8;text-align:center;margin:0;">
      You're receiving this because you applied for a job on HireTrack.<br>
      <a href="https://www.hiretrack.co.in/profile.html" style="color:#3b82f6;">Manage your applications</a>
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
        to: [candidateEmail],
        subject: cfg.subject(jobTitle, company),
        html
      })
    });
    const data = await r.json();
    if (r.ok && data.id) return res.status(200).json({ ok: true });
    return res.status(200).json({ ok: false, error: data.message });
  } catch(e) {
    console.error('notify-candidate-status error:', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
}
