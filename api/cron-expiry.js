const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

export default async function handler(req, res) {
  // Vercel automatically sends Authorization: Bearer {CRON_SECRET} for cron invocations
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const RESEND_KEY = process.env.RESEND_API_KEY;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!RESEND_KEY || !SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: 'Missing env vars' });
  }

  // ── Job-boost expiry sweep (runs first; quick PATCH, no email side effects) ──
  const boostStats = await clearExpiredBoosts(SERVICE_KEY);

  const now = new Date();
  // Window: jobs expiring 2–3 days from now → each job falls in this window exactly once per daily cron
  const windowStart = new Date(now.getTime() + 2 * 864e5).toISOString();
  const windowEnd = new Date(now.getTime() + 3 * 864e5).toISOString();

  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/jobs?expires_at=gt.${windowStart}&expires_at=lte.${windowEnd}&delisted=eq.false&select=id,title,company,email,expires_at`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!r.ok) return res.status(500).json({ ok: false, error: 'DB fetch failed' });

  const jobs = await r.json();
  let sent = 0;

  for (const job of jobs) {
    if (!job.email) continue;
    const daysLeft = Math.round((new Date(job.expires_at) - now) / 864e5);
    const expiryDate = new Date(job.expires_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: 'jobs@hiretrack.co.in',
        to: [job.email],
        subject: `⏳ Your job "${job.title}" expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — HireTrack`,
        html: buildReminderHtml(job.title, job.company, daysLeft, expiryDate),
      }),
    }).catch(() => null);

    if (emailRes?.ok) sent++;
  }

  console.log(`cron-expiry: ${jobs.length} expiring jobs, ${sent} emails sent`);

  // ── Plan renewal warnings ──
  const planWindowStart = new Date(now.getTime() + 3 * 864e5).toISOString();
  const planWindowEnd = new Date(now.getTime() + 4 * 864e5).toISOString();

  const pr = await fetch(
    `${SUPABASE_URL}/rest/v1/employers?plan_expires_at=gt.${planWindowStart}&plan_expires_at=lte.${planWindowEnd}&plan=neq.free&select=id,company,contact_name,email,plan,plan_expires_at`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  ).catch(() => null);

  let planSent = 0;
  if (pr?.ok) {
    const employers = await pr.json();
    for (const emp of Array.isArray(employers) ? employers : []) {
      if (!emp.email) continue;
      const expiryDate = new Date(emp.plan_expires_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: 'jobs@hiretrack.co.in',
          to: [emp.email],
          subject: `Your HireTrack ${emp.plan} plan expires in 3 days — renew to keep hiring`,
          html: buildPlanRenewalHtml(
            emp.contact_name || emp.company,
            emp.company,
            emp.plan,
            expiryDate
          ),
        }),
      }).catch(() => null);
      if (emailRes?.ok) planSent++;
    }
    console.log(`cron-expiry: ${employers.length} plans expiring, ${planSent} renewal emails sent`);
  }

  return res.status(200).json({
    ok: true,
    jobs: { total: jobs.length, sent },
    plans: { sent: planSent },
    boosts: boostStats,
  });
}

// Daily sweep: clear jobs.boosted_until once the 5-day window elapsed, and
// defensively clear boosts for employers whose plan has expired. Merged in
// from cron-boost-expiry to stay under Vercel's 12-function Hobby cap.
async function clearExpiredBoosts(SERVICE_KEY) {
  const SB_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  const nowIso = new Date().toISOString();
  const elapsedRes = await fetch(
    `${SB_URL}/rest/v1/jobs?boosted_until=lt.${encodeURIComponent(nowIso)}&select=id`,
    { method: 'PATCH', headers, body: JSON.stringify({ boosted_until: null }) }
  );
  const elapsedRows = elapsedRes.ok ? await elapsedRes.json().catch(() => []) : [];

  const stillBoostedRes = await fetch(
    `${SB_URL}/rest/v1/jobs?boosted_until=not.is.null&select=id,employer_id,employers(plan,plan_expires_at)`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const stillBoosted = stillBoostedRes.ok ? await stillBoostedRes.json().catch(() => []) : [];
  const planExpiredIds = stillBoosted
    .filter((j) => {
      const emp = j.employers || {};
      if (!emp.plan || emp.plan === 'free') return true;
      if (!emp.plan_expires_at) return true;
      return new Date(emp.plan_expires_at) <= new Date();
    })
    .map((j) => j.id);
  let planExpiredCleared = 0;
  if (planExpiredIds.length) {
    const idList = planExpiredIds.map(encodeURIComponent).join(',');
    const clrRes = await fetch(`${SB_URL}/rest/v1/jobs?id=in.(${idList})`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ boosted_until: null }),
    });
    if (clrRes.ok) planExpiredCleared = planExpiredIds.length;
  }
  return { elapsed_cleared: elapsedRows.length, plan_expired_cleared: planExpiredCleared };
}

function buildReminderHtml(jobTitle, company, daysLeft, expiryDate) {
  const urgency =
    daysLeft <= 1
      ? { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Expires Tomorrow!' }
      : { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', label: `${daysLeft} Days Left` };

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:2rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.6rem;font-weight:800;color:#fff;">Hire<span style="color:#3b82f6;">Track</span></div>
    <p style="color:#94a3b8;margin:0.4rem 0 0;font-size:0.85rem;">Job Posting Reminder</p>
  </div>

  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1rem;color:#1e293b;font-weight:700;margin:0 0 0.4rem;">⏳ Your job listing is expiring soon</p>
    <p style="font-size:0.9rem;color:#475569;margin:0 0 1.5rem;">Keep your listing active to continue receiving applications.</p>

    <div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;">
      <div style="font-size:0.7rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">Job Listing</div>
      <div style="font-size:1.05rem;font-weight:800;color:#0f172a;">${jobTitle}</div>
      <div style="font-size:0.85rem;color:#64748b;margin-top:0.2rem;">${company}</div>
    </div>

    <div style="background:${urgency.bg};border:1.5px solid ${urgency.border};border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;text-align:center;">
      <div style="font-size:0.7rem;font-weight:700;color:${urgency.color};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">${urgency.label}</div>
      <div style="font-size:0.9rem;color:${urgency.color};font-weight:600;">Expires on ${expiryDate}</div>
    </div>

    <div style="background:#f0f9ff;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;">
      <div style="font-size:0.78rem;font-weight:700;color:#0369a1;margin-bottom:0.5rem;">What you can do</div>
      <ul style="margin:0;padding-left:1.2rem;font-size:0.83rem;color:#0c4a6e;line-height:1.8;">
        <li>Review all pending applications before expiry</li>
        <li>Upgrade to Pro or Enterprise to extend your listing by 15 days</li>
        <li>Repost the job after expiry to keep it live</li>
      </ul>
    </div>

    <div style="text-align:center;margin-bottom:1.5rem;">
      <a href="https://www.hiretrack.co.in/employer-dashboard.html"
         style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;">
        Go to Dashboard →
      </a>
    </div>

    <p style="font-size:0.78rem;color:#94a3b8;text-align:center;margin:0;">
      You're receiving this because you have an active job posting on HireTrack.
    </p>
  </div>

  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;
}

function buildPlanRenewalHtml(contactName, company, plan, expiryDate) {
  const planLabel = (plan || '').charAt(0).toUpperCase() + (plan || '').slice(1);
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a5f);padding:2rem;text-align:center;border-radius:12px 12px 0 0;">
    <div style="font-size:1.6rem;font-weight:800;color:#fff;">Hire<span style="color:#3b82f6;">Track</span></div>
    <p style="color:#94a3b8;margin:0.4rem 0 0;font-size:0.85rem;">Plan Renewal Reminder</p>
  </div>

  <div style="padding:2rem;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
    <p style="font-size:1rem;color:#1e293b;font-weight:700;margin:0 0 0.35rem;">Hi ${contactName},</p>
    <p style="font-size:0.9rem;color:#475569;margin:0 0 1.5rem;">Your <strong>${planLabel} plan</strong> for <strong>${company}</strong> expires in 3 days. Renew now to avoid any disruption to your hiring.</p>

    <div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;text-align:center;">
      <div style="font-size:0.7rem;font-weight:700;color:#d97706;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">Plan Expiry</div>
      <div style="font-size:0.95rem;color:#92400e;font-weight:700;">${expiryDate}</div>
    </div>

    <div style="background:#f0fdf4;border-radius:10px;padding:1rem 1.25rem;margin-bottom:1.5rem;">
      <div style="font-size:0.78rem;font-weight:700;color:#15803d;margin-bottom:0.5rem;">What you lose if you don't renew</div>
      <ul style="margin:0;padding-left:1.2rem;font-size:0.83rem;color:#14532d;line-height:1.8;">
        <li>Your active job listings will stop accepting new applications</li>
        <li>Access to candidate pipeline and messaging</li>
        <li>Priority placement in search results</li>
      </ul>
    </div>

    <div style="text-align:center;margin-bottom:1.5rem;">
      <a href="https://www.hiretrack.co.in/pricing.html"
         style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:0.85rem 2rem;border-radius:10px;font-weight:700;font-size:0.95rem;">
        Renew My Plan →
      </a>
    </div>

    <p style="font-size:0.78rem;color:#94a3b8;text-align:center;margin:0;">
      Questions? Reply to this email or contact <a href="mailto:employers@hiretrack.co.in" style="color:#3b82f6;">employers@hiretrack.co.in</a>
    </p>
  </div>

  <div style="text-align:center;padding:1rem;font-size:0.75rem;color:#94a3b8;">
    © 2026 HireTrack · <a href="https://www.hiretrack.co.in" style="color:#3b82f6;">hiretrack.co.in</a>
  </div>
</div>`;
}
