const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const MAX_ALERTS = 50;

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

export default async function handler(req, res) {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const action = req.query.action || body?.action;

  try {
    switch (action) {
      case 'send-otp':         return await sendOtp(req, res, body);
      case 'job-alert':        return await sendJobAlert(req, res, body);
      case 'job-posted':       return await sendJobPostedConfirmation(req, res, body);
      case 'notify-employer':  return await notifyEmployer(req, res, body);
      case 'notify-candidate': return await notifyCandidate(req, res, body);
      case 'trigger-alerts':   return await triggerAlerts(req, res, body);
      case 'welcome-candidate': return await welcomeCandidate(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[email:${action}] error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ── Send OTP ───────────────────────────────────────────────────────────────
async function sendOtp(req, res, body) {
  const { destination, otp } = body || {};
  const RESEND_KEY = process.env.RESEND_API_KEY;
if (!RESEND_KEY) return res.status(500).json({ ok: false, error: 'Email service not configured' });

  if (!destination || !otp) return res.status(200).json({ ok: false, error: 'Missing fields' });

  const resendBody = {
    from: 'noreply@hiretrack.co.in',
    to: [destination],
    subject: `Your HireTrack OTP: ${otp}`,
    html: `<div style="font-family:sans-serif;padding:2rem;text-align:center;">
      <h2>Your HireTrack OTP</h2>
      <div style="background:#f0f7ff;border-radius:12px;padding:2rem;margin:1rem 0;">
        <span style="font-size:2.5rem;font-weight:800;letter-spacing:12px;color:#3b82f6;">${otp}</span>
      </div>
      <p>Valid for 2 minutes. Do not share.</p>
      <p style="color:#94a3b8;font-size:0.75rem;">— HireTrack Team</p>
    </div>`
  };

  console.log('Sending OTP to:', destination, 'with key:', RESEND_KEY.slice(0, 10) + '...');

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
    body: JSON.stringify(resendBody)
  });

  const resendText = await resendResponse.text();
  console.log('Resend OTP status:', resendResponse.status, resendText);

  let resendData;
  try { resendData = JSON.parse(resendText); } catch { resendData = { error: resendText }; }

  if (resendResponse.ok && resendData.id) return res.status(200).json({ ok: true });
  return res.status(200).json({ ok: false, error: resendData.message || resendData.error || resendText });
}

// ── Single job alert email ─────────────────────────────────────────────────
async function sendJobAlert(req, res, body) {
  const { to, candidateName, jobTitle, company, location, salary, jobType } = body || {};
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(200).json({ ok: false, error: 'API key not configured' });
  if (!to || !jobTitle || !company) return res.status(200).json({ ok: false, error: 'Missing required fields' });

  const firstName = (candidateName || 'there').split(' ')[0];
  const html = buildJobAlertHtml(firstName, jobTitle, company, location, salary, jobType);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: 'jobs@hiretrack.co.in', to: [to], subject: `🎯 New Job Alert: ${jobTitle} at ${company} — HireTrack`, html })
  });
  const data = await response.json();
  if (response.ok && data.id) return res.status(200).json({ ok: true });
  return res.status(200).json({ ok: false, error: data.message || 'Send failed' });
}

// ── Job posted confirmation to employer ───────────────────────────────────
async function sendJobPostedConfirmation(req, res, body) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(200).json({ ok: false, error: 'Not configured' });

  const { to, contactName, jobTitle, company, location, jobType, salary, dayLimit } = body || {};
  if (!to || !jobTitle) return res.status(400).json({ ok: false, error: 'Missing fields' });

  const firstName = (contactName || 'there').split(' ')[0];
  const expiryDays = dayLimit || 15;
  const expiryDate = new Date(Date.now() + expiryDays * 864e5).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:2rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.6rem;font-weight:800;color:#fff;letter-spacing:-0.5px;">Hire<span style="color:#3b82f6;">Track</span></div>
    <p style="color:#94a3b8;margin:0.4rem 0 0;font-size:0.85rem;">Employer Dashboard</p>
  </div>
  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1rem;color:#1e293b;margin:0 0 0.5rem;font-weight:700;">🎉 Your job is live!</p>
    <p style="font-size:0.92rem;color:#334155;margin:0 0 1.5rem;">Hi ${firstName}, your job posting is now live on HireTrack and visible to thousands of candidates.</p>

    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;">
      <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.75rem;">Job Details</div>
      <div style="font-size:1.05rem;font-weight:800;color:#0f172a;margin-bottom:0.25rem;">${jobTitle}</div>
      <div style="font-size:0.88rem;color:#64748b;margin-bottom:1rem;">🏢 ${company}</div>
      <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
        ${location ? `<span style="background:#eff6ff;color:#1d4ed8;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">📍 ${location}</span>` : ''}
        ${salary ? `<span style="background:#f0fdf4;color:#15803d;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">💰 ${salary}</span>` : ''}
        ${jobType ? `<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">⏱ ${jobType}</span>` : ''}
      </div>
    </div>

    <div style="background:#eff6ff;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:12px;">
      <span style="font-size:1.4rem;">📅</span>
      <div>
        <div style="font-size:0.78rem;font-weight:700;color:#1d4ed8;margin-bottom:2px;">Posting active until</div>
        <div style="font-size:0.9rem;font-weight:700;color:#0f172a;">${expiryDate} (${expiryDays} days)</div>
      </div>
    </div>

    <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;">
      <div style="font-size:0.8rem;font-weight:700;color:#15803d;margin-bottom:0.4rem;">💡 What happens next?</div>
      <div style="font-size:0.82rem;color:#374151;line-height:1.6;">
        Candidates will apply through HireTrack. You'll receive an email for every new application. Review and respond to candidates directly from your dashboard.
      </div>
    </div>

    <div style="text-align:center;margin-bottom:1.5rem;">
      <a href="https://www.hiretrack.co.in/employer-dashboard.html" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;">View Dashboard →</a>
    </div>

    <p style="font-size:0.8rem;color:#94a3b8;text-align:center;margin:0;">
      You're receiving this because you posted a job on HireTrack.<br>
      <a href="https://www.hiretrack.co.in/employer-dashboard.html" style="color:#3b82f6;">Manage your job postings</a>
    </p>
  </div>
  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({
      from: 'jobs@hiretrack.co.in',
      to: [to],
      subject: `✅ Your job "${jobTitle}" is now live on HireTrack`,
      html
    })
  });
  const data = await r.json();
  if (r.ok && data.id) return res.status(200).json({ ok: true });
  return res.status(200).json({ ok: false, error: data.message });
}

// ── Notify employer of new application ────────────────────────────────────
async function notifyEmployer(req, res, body) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(200).json({ ok: false, error: 'Not configured' });

  const { employerEmail, company, jobTitle, candidateName, candidateCity, candidateExperience, candidateSkills } = body || {};
  if (!employerEmail || !jobTitle || !candidateName) return res.status(400).json({ ok: false, error: 'Missing fields' });

  const skillsArr = Array.isArray(candidateSkills)
    ? candidateSkills
    : typeof candidateSkills === 'string'
      ? candidateSkills.split(',').map(s => s.trim()).filter(Boolean)
      : [];
  const skillTags = skillsArr.slice(0, 4)
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
    <p style="font-size:0.8rem;color:#94a3b8;text-align:center;margin:0;">You're receiving this because you have an active job posting on HireTrack.</p>
  </div>
  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: 'noreply@hiretrack.co.in', to: [employerEmail], subject: `📬 New application: ${candidateName} applied for ${jobTitle}`, html })
  });
  const data = await r.json();
  if (r.ok && data.id) return res.status(200).json({ ok: true });
  return res.status(200).json({ ok: false, error: data.message });
}

// ── Notify candidate of status change ─────────────────────────────────────
const STATUS_CONFIG = {
  Shortlisted: {
    emoji: '🌟', subject: (job, company) => `🌟 You've been shortlisted for ${job} at ${company}!`,
    headline: "Great news — you've been shortlisted!",
    body: (job, company) => `Your application for <strong>${job}</strong> at <strong>${company}</strong> has been reviewed and you've been shortlisted. This is a great step forward!`,
    color: '#d97706', bg: '#fffbeb', cta: 'Check your notifications →'
  },
  Interview: {
    emoji: '📅', subject: (job, company) => `📅 Interview invite for ${job} at ${company}`,
    headline: "You've been selected for an interview!",
    body: (job, company) => `Congratulations! The employer at <strong>${company}</strong> wants to interview you for <strong>${job}</strong>. Check your messages on HireTrack for details.`,
    color: '#0891b2', bg: '#ecfeff', cta: 'View your messages →'
  },
  Hired: {
    emoji: '🎉', subject: (job, company) => `🎉 Congratulations! You've been hired at ${company}!`,
    headline: "Congratulations — you've been hired!",
    body: (job, company) => `Amazing news! You've been selected for <strong>${job}</strong> at <strong>${company}</strong>. Your hard work paid off — well done!`,
    color: '#16a34a', bg: '#f0fdf4', cta: 'View your profile →'
  },
  Rejected: {
    emoji: '📩', subject: (job, company) => `Your application update for ${job} at ${company}`,
    headline: 'Application update',
    body: (job, company) => `Thank you for applying for <strong>${job}</strong> at <strong>${company}</strong>. After careful review, they've decided to move forward with other candidates this time. Keep applying — the right opportunity is out there.`,
    color: '#64748b', bg: '#f8fafc', cta: 'Browse more jobs →'
  }
};

async function notifyCandidate(req, res, body) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(200).json({ ok: false, error: 'Not configured' });

  const { candidateEmail, candidateName, jobTitle, company, status } = body || {};
  if (!candidateEmail || !jobTitle || !company || !status) return res.status(400).json({ ok: false, error: 'Missing fields' });

  const cfg = STATUS_CONFIG[status];
  if (!cfg) return res.status(200).json({ ok: false, error: 'No email for this status' });

  const firstName = (candidateName || 'there').split(' ')[0];
  const ctaUrl = status === 'Interview' ? 'https://www.hiretrack.co.in/profile.html#chat'
    : status === 'Rejected' ? 'https://www.hiretrack.co.in/jobs.html'
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
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: 'noreply@hiretrack.co.in', to: [candidateEmail], subject: cfg.subject(jobTitle, company), html })
  });
  const data = await r.json();
  if (r.ok && data.id) return res.status(200).json({ ok: true });
  return res.status(200).json({ ok: false, error: data.message });
}

// ── Fan-out job alerts to matched candidates ───────────────────────────────
async function triggerAlerts(req, res, body) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!RESEND_KEY || !SERVICE_KEY) return res.status(200).json({ ok: false, error: 'Not configured' });

  const { title, company, location, salary, jobType, skills, jobId } = body || {};
  if (!title || !company) return res.status(400).json({ ok: false, error: 'Missing job fields' });

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/candidates?job_alerts_enabled=eq.true&select=id,name,email,city,skills`,
    { headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` } }
  );
  if (!r.ok) return res.status(500).json({ ok: false, error: 'Failed to fetch candidates' });
  const candidates = await r.json();

  const isRemote = /remote/i.test(location || '');
  const jobLoc = (location || '').toLowerCase();
  // skills may arrive as an array or comma-string
  const jobSkillsArr = Array.isArray(skills)
    ? skills
    : (typeof skills === 'string' ? skills.split(/[\s,]+/) : []);
  const jobSkills = jobSkillsArr.map(s => s.toLowerCase()).filter(s => s.length > 1);

  const matched = candidates.filter(c => {
    if (!c.email) return false;
    if (isRemote) return true;
    const cityMatch = c.city && jobLoc.includes(c.city.toLowerCase());
    const candSkills = Array.isArray(c.skills)
      ? c.skills.map(s => s.toLowerCase())
      : (c.skills || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const skillMatch = jobSkills.length > 0 && candSkills.some(s => jobSkills.some(js => s.includes(js) || js.includes(s)));
    return cityMatch || skillMatch;
  }).slice(0, MAX_ALERTS);

  const jobUrl = jobId
    ? `https://www.hiretrack.co.in/job.html?id=${jobId}`
    : 'https://www.hiretrack.co.in/jobs.html';

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
          html: buildJobAlertHtml(firstName, title, company, location || '', salary || 'Negotiable', jobType || '', jobUrl)
        })
      });
      if (resp.ok) sent++;
    } catch { /* skip failed sends */ }
  }

  console.log(`Job alert: "${title}" at ${company} — ${matched.length} matched, ${sent} sent`);
  return res.status(200).json({ ok: true, matched: matched.length, sent });
}

// ── Shared email HTML builder ──────────────────────────────────────────────
function buildJobAlertHtml(firstName, jobTitle, company, location, salary, jobType, jobUrl) {
  const applyUrl = jobUrl || 'https://www.hiretrack.co.in/jobs.html';
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
        ${location ? `<span style="background:#eff6ff;color:#1d4ed8;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">📍 ${location}</span>` : ''}
        ${salary ? `<span style="background:#f0fdf4;color:#15803d;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">💰 ${salary}</span>` : ''}
        ${jobType ? `<span style="background:#fef3c7;color:#92400e;padding:4px 12px;border-radius:20px;font-size:0.78rem;font-weight:600;">⏱ ${jobType}</span>` : ''}
      </div>
    </div>
    <div style="text-align:center;margin-bottom:1.5rem;">
      <a href="${applyUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;">View &amp; Apply Now →</a>
    </div>
    <p style="font-size:0.82rem;color:#94a3b8;text-align:center;margin:0;">
      You're receiving this because you have job alerts enabled on HireTrack.<br>
      <a href="https://www.hiretrack.co.in/job-alerts.html" style="color:#3b82f6;">Manage your alerts</a>
    </p>
  </div>
  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;
}

// ── Day 0: Welcome email ──
async function welcomeCandidate(req, res, body) {
  const { name, email, city, skills } = body || {};
  if (!email) return res.status(400).json({ ok: false, error: 'email required' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ ok: false, error: 'Missing RESEND_API_KEY' });

  const firstName = (name || 'there').split(' ')[0];
  const skillsArr = Array.isArray(skills) ? skills : [];

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({
      from: 'jobs@hiretrack.co.in',
      to: [email],
      subject: `Welcome to HireTrack, ${firstName}! Here's how to get started`,
      html: buildWelcomeHtml(firstName, city, skillsArr),
    }),
  });

  return res.json({ ok: r.ok });
}

function buildWelcomeHtml(firstName, city, skills) {
  const steps = [
    { icon: '📸', title: 'Add a profile photo',    desc: 'Profiles with photos get 3× more views from employers.' },
    { icon: '📄', title: 'Upload your resume',      desc: 'Our AI will auto-fill your profile from your CV.' },
    { icon: '🎯', title: 'Add your top skills',     desc: 'Skills help employers find you and improve your match score.' },
    { icon: '✍️', title: 'Write a short bio',        desc: 'Tell employers who you are in 2–3 sentences.' },
  ];

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:2.5rem 2rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.8rem;font-weight:800;color:#fff;margin-bottom:0.25rem;">Hire<span style="color:#93c5fd;">Track</span></div>
    <p style="color:#bfdbfe;margin:0;font-size:0.9rem;">Your job search just got smarter</p>
  </div>

  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1.05rem;font-weight:700;color:#0f172a;margin:0 0 0.4rem;">Hi ${firstName}! 👋</p>
    <p style="font-size:0.9rem;color:#475569;margin:0 0 1.75rem;line-height:1.6;">
      Welcome to HireTrack${city ? ` — great to have you from ${city}` : ''}! Your account is ready. Here's how to set up your profile and start getting noticed by employers.
    </p>

    <div style="background:#f8fafc;border-radius:12px;padding:1.25rem;margin-bottom:1.75rem;">
      <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:1rem;">Complete these 4 steps</div>
      ${steps.map((s, i) => `
      <div style="display:flex;gap:0.9rem;align-items:flex-start;margin-bottom:${i < steps.length - 1 ? '1rem' : '0'};">
        <div style="width:36px;height:36px;background:#eff6ff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">${s.icon}</div>
        <div>
          <div style="font-size:0.88rem;font-weight:700;color:#0f172a;margin-bottom:2px;">${s.title}</div>
          <div style="font-size:0.8rem;color:#64748b;">${s.desc}</div>
        </div>
      </div>`).join('')}
    </div>

    <div style="text-align:center;margin-bottom:1.75rem;">
      <a href="https://www.hiretrack.co.in/profile.html"
         style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:0.85rem 2.25rem;border-radius:10px;font-weight:700;font-size:0.95rem;">
        Complete My Profile →
      </a>
    </div>

    ${skills.length ? `
    <div style="background:#f0fdf4;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;">
      <div style="font-size:0.78rem;font-weight:700;color:#15803d;margin-bottom:0.5rem;">✅ Skills already on your profile</div>
      <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">${skills.slice(0, 8).map(s => `<span style="background:#dcfce7;color:#15803d;padding:3px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;">${s}</span>`).join('')}</div>
    </div>` : ''}

    <div style="border-top:1px solid #f1f5f9;padding-top:1.25rem;">
      <p style="font-size:0.82rem;color:#475569;margin:0 0 0.5rem;font-weight:600;">While your profile loads up:</p>
      <ul style="margin:0;padding-left:1.2rem;font-size:0.82rem;color:#64748b;line-height:1.8;">
        <li><a href="https://www.hiretrack.co.in/jobs.html" style="color:#2563eb;">Browse the latest jobs →</a></li>
        <li><a href="https://www.hiretrack.co.in/job-alerts.html" style="color:#2563eb;">Set up job alerts →</a></li>
        <li><a href="https://www.hiretrack.co.in/profile.html#pro" style="color:#2563eb;">Try AI interview prep →</a></li>
      </ul>
    </div>
  </div>

  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
    · <a href="https://www.hiretrack.co.in/job-alerts.html" style="color:#94a3b8;">Manage alerts</a>
  </div>
</div>`;
}
