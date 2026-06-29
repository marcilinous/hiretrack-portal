// /api/quotas — consolidated endpoint for employer-side spending of
// daily contact-unlock quota and monthly job-boost quota.
//
// Actions:
//   POST /api/quotas?action=unlock-reveal  { employerId, candidateId, jobId? }
//   POST /api/quotas?action=unlock-status  { employerId }
//   POST /api/quotas?action=boost          { employerId, jobId }
//   POST /api/quotas?action=boost-status   { employerId }

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const BOOST_DAYS = 5;

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

function svcHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return Object.assign(
    { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    extra || {}
  );
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: svcHeaders() });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

async function sbPost(path, body, prefer) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: svcHeaders({ Prefer: prefer || 'return=minimal' }),
    body: JSON.stringify(body),
  });
}

async function sbPatch(path, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: svcHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
}

function startOfTodayISO() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfMonthISO() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function isActivePaidPlan(emp) {
  if (!emp || !emp.plan || emp.plan === 'free') return false;
  if (!emp.plan_expires_at) return false;
  return new Date(emp.plan_expires_at) > new Date();
}

async function loadEmployer(employerId, fields) {
  const r = await sbGet(`employers?select=${fields}&id=eq.${employerId}&limit=1`);
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]) return null;
  return r.data[0];
}

async function countSince(table, employerId, dateCol, sinceIso) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=id&employer_id=eq.${employerId}&${dateCol}=gte.${encodeURIComponent(sinceIso)}`,
    { headers: svcHeaders({ Prefer: 'count=exact', Range: '0-0' }) }
  );
  const range = r.headers.get('content-range') || '*/0';
  const total = parseInt(range.split('/')[1], 10);
  return Number.isFinite(total) ? total : 0;
}

// ── unlock-reveal ─────────────────────────────────────────────────────────
async function unlockReveal(req, res, body) {
  const { employerId, candidateId, jobId } = body || {};
  if (!employerId || !candidateId)
    return res.status(400).json({ ok: false, error: 'Missing employerId or candidateId' });

  const emp = await loadEmployer(employerId, 'id,plan,plan_expires_at,day_unlock_limit');
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });
  if (!isActivePaidPlan(emp))
    return res
      .status(402)
      .json({ ok: false, error: 'Active paid plan required to unlock candidate contacts.' });

  const limit = emp.day_unlock_limit || 0;
  const existing = await sbGet(
    `employer_unlock_log?select=id&employer_id=eq.${employerId}&candidate_id=eq.${candidateId}&limit=1`
  );
  const alreadyUnlocked = existing.ok && Array.isArray(existing.data) && existing.data.length > 0;

  if (!alreadyUnlocked) {
    const usedToday = await countSince(
      'employer_unlock_log',
      employerId,
      'unlocked_at',
      startOfTodayISO()
    );
    if (usedToday >= limit) {
      return res.status(429).json({
        ok: false,
        error: `Daily unlock limit reached (${usedToday}/${limit}). Resets at midnight UTC.`,
        used_today: usedToday,
        day_unlock_limit: limit,
        remaining: 0,
      });
    }
    const insertRes = await sbPost('employer_unlock_log', {
      employer_id: employerId,
      candidate_id: candidateId,
      job_id: jobId || null,
    });
    if (!insertRes.ok && insertRes.status !== 409) {
      const err = await insertRes.text().catch(() => '');
      console.error('Unlock log insert failed:', insertRes.status, err);
      return res.status(500).json({ ok: false, error: 'Failed to record unlock' });
    }
  }

  const candRes = await sbGet(
    `candidates?select=id,name,mobile,email&id=eq.${candidateId}&limit=1`
  );
  const candidate = candRes.data && candRes.data[0];
  if (!candidate) return res.status(404).json({ ok: false, error: 'Candidate not found' });

  const usedAfter = await countSince(
    'employer_unlock_log',
    employerId,
    'unlocked_at',
    startOfTodayISO()
  );
  return res.status(200).json({
    ok: true,
    alreadyUnlocked,
    candidate: {
      id: candidate.id,
      name: candidate.name,
      mobile: candidate.mobile,
      email: candidate.email,
    },
    used_today: usedAfter,
    day_unlock_limit: limit,
    remaining: Math.max(0, limit - usedAfter),
  });
}

async function unlockStatus(req, res, body) {
  const { employerId } = body || {};
  if (!employerId) return res.status(400).json({ ok: false, error: 'Missing employerId' });
  const emp = await loadEmployer(employerId, 'id,plan,plan_expires_at,day_unlock_limit');
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });
  const limit = emp.day_unlock_limit || 0;
  const usedToday = await countSince(
    'employer_unlock_log',
    employerId,
    'unlocked_at',
    startOfTodayISO()
  );
  return res.status(200).json({
    ok: true,
    used_today: usedToday,
    day_unlock_limit: limit,
    remaining: Math.max(0, limit - usedToday),
    plan: emp.plan,
    plan_active: isActivePaidPlan(emp),
  });
}

// ── boost ────────────────────────────────────────────────────────────────
async function boost(req, res, body) {
  const { employerId, jobId } = body || {};
  if (!employerId || !jobId)
    return res.status(400).json({ ok: false, error: 'Missing employerId or jobId' });

  const emp = await loadEmployer(employerId, 'id,plan,plan_expires_at,month_boost_limit');
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });
  if (!isActivePaidPlan(emp))
    return res.status(402).json({ ok: false, error: 'Active paid plan required to boost jobs.' });

  const jobRes = await sbGet(`jobs?select=id,employer_id,boosted_until&id=eq.${jobId}&limit=1`);
  const job = jobRes.data && jobRes.data[0];
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  if (job.employer_id !== employerId)
    return res.status(403).json({ ok: false, error: 'You can only boost your own jobs.' });

  if (job.boosted_until && new Date(job.boosted_until) > new Date()) {
    const usedNow = await countSince('job_boost_log', employerId, 'boosted_at', startOfMonthISO());
    return res.status(200).json({
      ok: true,
      alreadyBoosted: true,
      boosted_until: job.boosted_until,
      used_this_month: usedNow,
      month_boost_limit: emp.month_boost_limit || 0,
      remaining: Math.max(0, (emp.month_boost_limit || 0) - usedNow),
    });
  }

  const limit = emp.month_boost_limit || 0;
  const used = await countSince('job_boost_log', employerId, 'boosted_at', startOfMonthISO());
  if (used >= limit) {
    return res.status(429).json({
      ok: false,
      error: `Monthly boost limit reached (${used}/${limit}). Upgrade your plan for more boosts.`,
      used_this_month: used,
      month_boost_limit: limit,
      remaining: 0,
    });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + BOOST_DAYS * 24 * 60 * 60 * 1000);

  const patchRes = await sbPatch(`jobs?id=eq.${jobId}`, {
    boosted_until: expiresAt.toISOString(),
  });
  if (!patchRes.ok) {
    const err = await patchRes.text().catch(() => '');
    console.error('Job boost patch failed:', patchRes.status, err);
    return res.status(500).json({ ok: false, error: 'Failed to apply boost.' });
  }

  await sbPost('job_boost_log', {
    employer_id: employerId,
    job_id: jobId,
    boosted_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  }).catch(() => {});

  const usedAfter = await countSince('job_boost_log', employerId, 'boosted_at', startOfMonthISO());
  return res.status(200).json({
    ok: true,
    boosted_until: expiresAt.toISOString(),
    used_this_month: usedAfter,
    month_boost_limit: limit,
    remaining: Math.max(0, limit - usedAfter),
  });
}

async function boostStatus(req, res, body) {
  const { employerId } = body || {};
  if (!employerId) return res.status(400).json({ ok: false, error: 'Missing employerId' });
  const emp = await loadEmployer(employerId, 'id,plan,plan_expires_at,month_boost_limit');
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });
  const limit = emp.month_boost_limit || 0;
  const used = await countSince('job_boost_log', employerId, 'boosted_at', startOfMonthISO());
  return res.status(200).json({
    ok: true,
    used_this_month: used,
    month_boost_limit: limit,
    remaining: Math.max(0, limit - used),
    plan: emp.plan,
    plan_active: isActivePaidPlan(emp),
  });
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const action = req.query.action || body?.action;

  try {
    switch (action) {
      case 'unlock-reveal':
        return await unlockReveal(req, res, body);
      case 'unlock-status':
        return await unlockStatus(req, res, body);
      case 'boost':
        return await boost(req, res, body);
      case 'boost-status':
        return await boostStatus(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[quotas:${action}] error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
