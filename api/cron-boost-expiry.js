// Daily cron that NULLs jobs.boosted_until for boosts whose 5-day window has
// elapsed, AND for jobs whose employer's plan has expired since the boost was
// applied (boost is meaningless without an active plan).
//
// Schedule (vercel.json): "0 4 * * *" — 04:00 UTC, after cron-expiry/cron-drip.

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) return res.status(500).json({ ok: false, error: 'Missing env vars' });

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const nowIso = new Date().toISOString();

  // 1) Clear boosts that have naturally expired
  const elapsedRes = await fetch(
    `${SUPABASE_URL}/rest/v1/jobs?boosted_until=lt.${encodeURIComponent(nowIso)}&select=id`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ boosted_until: null }),
    }
  );
  const elapsedRows = elapsedRes.ok ? await elapsedRes.json().catch(() => []) : [];

  // 2) Clear boosts whose owner's plan has expired (or is free) — defensive cleanup
  //    Fetch boosted jobs with employer plan info, filter in code, then PATCH by id.
  const stillBoostedRes = await fetch(
    `${SUPABASE_URL}/rest/v1/jobs?boosted_until=not.is.null&select=id,employer_id,employers(plan,plan_expires_at)`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const stillBoosted = stillBoostedRes.ok ? await stillBoostedRes.json().catch(() => []) : [];
  const planExpiredJobIds = stillBoosted
    .filter((j) => {
      const emp = j.employers || {};
      if (!emp.plan || emp.plan === 'free') return true;
      if (!emp.plan_expires_at) return true;
      return new Date(emp.plan_expires_at) <= new Date();
    })
    .map((j) => j.id);

  let planExpiredCleared = 0;
  if (planExpiredJobIds.length) {
    const idList = planExpiredJobIds.map(encodeURIComponent).join(',');
    const clrRes = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=in.(${idList})`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ boosted_until: null }),
    });
    if (clrRes.ok) planExpiredCleared = planExpiredJobIds.length;
  }

  return res.status(200).json({
    ok: true,
    elapsed_cleared: elapsedRows.length,
    plan_expired_cleared: planExpiredCleared,
    ran_at: nowIso,
  });
}
