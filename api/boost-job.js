// Job boost endpoint — burns one boost from the employer's monthly allowance
// and sets jobs.boosted_until = now() + 5 days. The boost is logged in
// job_boost_log so usage is auditable and quota math is straightforward.
//
// Actions:
//   POST /api/boost-job?action=boost  { employerId, jobId }
//     → { ok, boosted_until, used_this_month, month_boost_limit, remaining }
//   POST /api/boost-job?action=status { employerId }
//     → { ok, used_this_month, month_boost_limit, remaining, plan_active }

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

function startOfMonthISO() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function loadEmployer(id) {
  const r = await sbGet(
    `employers?select=id,plan,plan_expires_at,month_boost_limit&id=eq.${id}&limit=1`
  );
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]) return null;
  return r.data[0];
}

function isActivePaidPlan(emp) {
  if (!emp || !emp.plan || emp.plan === 'free') return false;
  if (!emp.plan_expires_at) return false;
  return new Date(emp.plan_expires_at) > new Date();
}

async function countUsedThisMonth(employerId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/job_boost_log?select=id&employer_id=eq.${employerId}&boosted_at=gte.${encodeURIComponent(startOfMonthISO())}`,
    { headers: svcHeaders({ Prefer: 'count=exact', Range: '0-0' }) }
  );
  const range = r.headers.get('content-range') || '*/0';
  const total = parseInt(range.split('/')[1], 10);
  return Number.isFinite(total) ? total : 0;
}

async function boost(req, res, body) {
  if (!process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { employerId, jobId } = body || {};
  if (!employerId || !jobId)
    return res.status(400).json({ ok: false, error: 'Missing employerId or jobId' });

  const emp = await loadEmployer(employerId);
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });
  if (!isActivePaidPlan(emp))
    return res.status(402).json({ ok: false, error: 'Active paid plan required to boost jobs.' });

  // Verify job ownership before spending a boost
  const jobRes = await sbGet(`jobs?select=id,employer_id,boosted_until&id=eq.${jobId}&limit=1`);
  const job = jobRes.data && jobRes.data[0];
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });
  if (job.employer_id !== employerId)
    return res.status(403).json({ ok: false, error: 'You can only boost your own jobs.' });

  // Already boosted? Don't burn another boost; return current state
  if (job.boosted_until && new Date(job.boosted_until) > new Date()) {
    const usedNow = await countUsedThisMonth(employerId);
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
  const used = await countUsedThisMonth(employerId);
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

  await sbPost(
    'job_boost_log',
    {
      employer_id: employerId,
      job_id: jobId,
      boosted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    'return=minimal'
  ).catch(() => {});

  const usedAfter = await countUsedThisMonth(employerId);
  return res.status(200).json({
    ok: true,
    boosted_until: expiresAt.toISOString(),
    used_this_month: usedAfter,
    month_boost_limit: limit,
    remaining: Math.max(0, limit - usedAfter),
  });
}

async function status(req, res, body) {
  if (!process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { employerId } = body || {};
  if (!employerId) return res.status(400).json({ ok: false, error: 'Missing employerId' });

  const emp = await loadEmployer(employerId);
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });

  const limit = emp.month_boost_limit || 0;
  const used = await countUsedThisMonth(employerId);
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
      case 'boost':
        return await boost(req, res, body);
      case 'status':
        return await status(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[boost-job:${action}] error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
