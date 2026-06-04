const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY   = process.env.RESEND_API_KEY;
  if (!SUPABASE_KEY || !RESEND_KEY) return res.status(500).json({ ok: false, error: 'Missing env vars' });

  const sb = (path, params = '') =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}${params}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    }).then(r => r.json());

  const now = Date.now();

  // Day 2 window: candidates created 48–72 h ago
  const d2End   = new Date(now - 48 * 3600 * 1000).toISOString();
  const d2Start = new Date(now - 72 * 3600 * 1000).toISOString();

  // Day 7 window: candidates created 168–192 h ago
  const d7End   = new Date(now - 168 * 3600 * 1000).toISOString();
  const d7Start = new Date(now - 192 * 3600 * 1000).toISOString();

  let d2Sent = 0, d7Sent = 0;

  // ── Day 2: profile completion nudge ───────────────────────────────────────
  const d2Candidates = await sb(
    'candidates',
    `?select=id,name,email,city,skills,jobtitle&created_at=gt.${d2Start}&created_at=lte.${d2End}`
  );

  for (const c of Array.isArray(d2Candidates) ? d2Candidates : []) {
    if (!c.email) continue;
    const skillsArr = Array.isArray(c.skills) ? c.skills : [];
    const missingProfile = skillsArr.length < 3 || !c.jobtitle;
    if (!missingProfile) continue; // profile already good — skip

    await sendEmail(RESEND_KEY, {
      to: c.email,
      subject: `${(c.name || 'there').split(' ')[0]}, your HireTrack profile needs one more step`,
      html: buildNudgeHtml((c.name || '').split(' ')[0], c.city, skillsArr, c.jobtitle),
    });
    d2Sent++;
  }

  // ── Day 7: personalised job picks ─────────────────────────────────────────
  const d7Candidates = await sb(
    'candidates',
    `?select=id,name,email,city,skills,jobtitle&created_at=gt.${d7Start}&created_at=lte.${d7End}`
  );

  // Fetch active jobs once (capped at 200 for matching)
  const activeJobs = await sb(
    'jobs',
    '?select=id,title,company,location,salary,type,skills&status=eq.active&order=created_at.desc&limit=200'
  );
  const jobsList = Array.isArray(activeJobs) ? activeJobs : [];

  for (const c of Array.isArray(d7Candidates) ? d7Candidates : []) {
    if (!c.email) continue;
    const candidateSkills = (Array.isArray(c.skills) ? c.skills : []).map(s => s.toLowerCase());
    if (!candidateSkills.length) continue;

    // Score jobs by skill overlap
    const scored = jobsList
      .map(j => {
        const jSkills = (Array.isArray(j.skills) ? j.skills : []).map(s => s.toLowerCase());
        const overlap = candidateSkills.filter(s => jSkills.includes(s)).length;
        return { ...j, overlap };
      })
      .filter(j => j.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 3);

    if (!scored.length) continue;

    await sendEmail(RESEND_KEY, {
      to: c.email,
      subject: `${scored.length} jobs matched to your skills on HireTrack`,
      html: buildJobPicksHtml((c.name || '').split(' ')[0], scored),
    });
    d7Sent++;
  }

  return res.json({ ok: true, day2: { sent: d2Sent }, day7: { sent: d7Sent } });
}

async function sendEmail(key, { to, subject, html }) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ from: 'jobs@hiretrack.co.in', to: [to], subject, html }),
  });
}

// ── Day 2 email ────────────────────────────────────────────────────────────
function buildNudgeHtml(firstName, city, skills, jobtitle) {
  const missing = [];
  if (!jobtitle)        missing.push({ icon: '💼', text: 'Add your current job title' });
  if (skills.length < 3) missing.push({ icon: '🎯', text: `Add ${3 - skills.length} more skill${3 - skills.length > 1 ? 's' : ''} (you have ${skills.length})` });
  // Always suggest photo & resume as bonus items
  missing.push({ icon: '📸', text: 'Upload a profile photo' });
  missing.push({ icon: '📄', text: 'Upload your resume (AI auto-fills your profile)' });

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:2rem 2rem 1.5rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.6rem;font-weight:800;color:#fff;">Hire<span style="color:#93c5fd;">Track</span></div>
  </div>
  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1rem;font-weight:700;color:#0f172a;margin:0 0 0.5rem;">Hi ${firstName}! 👋</p>
    <p style="font-size:0.88rem;color:#475569;margin:0 0 1.5rem;line-height:1.6;">
      Your HireTrack profile is almost there! Completing a few more steps will make you visible to more employers${city ? ` in ${city}` : ''} and boost your match score.
    </p>

    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:1.1rem 1.25rem;margin-bottom:1.5rem;">
      <div style="font-size:0.72rem;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.85rem;">Finish your profile</div>
      ${missing.slice(0, 4).map(m => `
      <div style="display:flex;gap:0.75rem;align-items:center;margin-bottom:0.6rem;">
        <span style="font-size:1.1rem;">${m.icon}</span>
        <span style="font-size:0.85rem;color:#1e293b;">${m.text}</span>
      </div>`).join('')}
    </div>

    <div style="text-align:center;margin-bottom:1.5rem;">
      <a href="https://www.hiretrack.co.in/profile.html"
         style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:0.8rem 2rem;border-radius:10px;font-weight:700;font-size:0.92rem;">
        Complete My Profile →
      </a>
    </div>

    ${skills.length ? `
    <p style="font-size:0.8rem;color:#64748b;margin:0;">
      You already have <strong>${skills.length} skill${skills.length > 1 ? 's' : ''}</strong> — nice start! Adding ${Math.max(0, 5 - skills.length)} more will unlock more job matches.
    </p>` : ''}
  </div>
  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;
}

// ── Day 7 email ────────────────────────────────────────────────────────────
function buildJobPicksHtml(firstName, jobs) {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:2rem 2rem 1.5rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.6rem;font-weight:800;color:#fff;">Hire<span style="color:#93c5fd;">Track</span></div>
    <p style="color:#bfdbfe;margin:0.25rem 0 0;font-size:0.88rem;">Jobs picked for you</p>
  </div>
  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1rem;font-weight:700;color:#0f172a;margin:0 0 0.4rem;">Hi ${firstName}! 👋</p>
    <p style="font-size:0.88rem;color:#475569;margin:0 0 1.5rem;line-height:1.6;">
      It's been a week since you joined HireTrack. We found <strong>${jobs.length} job${jobs.length > 1 ? 's' : ''}</strong> that match your skills — have a look!
    </p>

    ${jobs.map(j => `
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:1rem 1.1rem;margin-bottom:0.85rem;">
      <div style="font-size:0.92rem;font-weight:700;color:#0f172a;margin-bottom:2px;">${j.title}</div>
      <div style="font-size:0.8rem;color:#64748b;margin-bottom:0.5rem;">${j.company}${j.location ? ' · ' + j.location : ''}${j.salary ? ' · ' + j.salary : ''}</div>
      ${j.overlap > 1 ? `<div style="font-size:0.72rem;background:#eff6ff;color:#1d4ed8;display:inline-block;padding:2px 9px;border-radius:20px;font-weight:600;">${j.overlap} skills match</div>` : ''}
      <div style="margin-top:0.6rem;">
        <a href="https://www.hiretrack.co.in/job.html?id=${j.id}"
           style="font-size:0.8rem;color:#2563eb;font-weight:600;text-decoration:none;">View & Apply →</a>
      </div>
    </div>`).join('')}

    <div style="text-align:center;margin-top:1.25rem;">
      <a href="https://www.hiretrack.co.in/jobs.html"
         style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:0.8rem 2rem;border-radius:10px;font-weight:700;font-size:0.92rem;">
        See All Jobs →
      </a>
    </div>
  </div>
  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
    · <a href="https://www.hiretrack.co.in/job-alerts.html" style="color:#94a3b8;">Manage alerts</a>
  </div>
</div>`;
}
