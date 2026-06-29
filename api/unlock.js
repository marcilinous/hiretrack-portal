// Contact unlock endpoint — enforces per-day unlock quota from the
// employer's active plan and records each unlock in employer_unlock_log.
//
// Unique (employer_id, candidate_id) constraint on the log table makes
// repeat reveals of the same candidate free (no quota consumed).
//
// Actions:
//   POST /api/unlock?action=reveal { employerId, candidateId }
//     → { ok, mobile, email, used_today, remaining, alreadyUnlocked }
//   POST /api/unlock?action=status { employerId }
//     → { ok, used_today, day_unlock_limit, remaining }

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

function svcHeaders(extra) {
  const key = process.env.SUPABASE_SERVICE_KEY;
  return Object.assign(
    {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
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
    headers: svcHeaders(prefer ? { Prefer: prefer } : { Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  });
}

function startOfTodayISO() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function loadEmployer(employerId) {
  const r = await sbGet(
    `employers?select=id,plan,plan_expires_at,day_unlock_limit&id=eq.${employerId}&limit=1`
  );
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]) return null;
  return r.data[0];
}

function isActivePaidPlan(emp) {
  if (!emp || !emp.plan || emp.plan === 'free') return false;
  if (!emp.plan_expires_at) return false;
  return new Date(emp.plan_expires_at) > new Date();
}

async function countUsedToday(employerId) {
  // Range header would also work but exact=count returns precise number.
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/employer_unlock_log?select=id&employer_id=eq.${employerId}&unlocked_at=gte.${encodeURIComponent(startOfTodayISO())}`,
    { headers: svcHeaders({ Prefer: 'count=exact', Range: '0-0' }) }
  );
  const range = r.headers.get('content-range') || '*/0';
  const total = parseInt(range.split('/')[1], 10);
  return Number.isFinite(total) ? total : 0;
}

async function isAlreadyUnlocked(employerId, candidateId) {
  const r = await sbGet(
    `employer_unlock_log?select=id&employer_id=eq.${employerId}&candidate_id=eq.${candidateId}&limit=1`
  );
  return r.ok && Array.isArray(r.data) && r.data.length > 0;
}

async function loadCandidateContact(candidateId) {
  const r = await sbGet(`candidates?select=id,name,mobile,email&id=eq.${candidateId}&limit=1`);
  if (!r.ok || !Array.isArray(r.data) || !r.data[0]) return null;
  return r.data[0];
}

async function reveal(req, res, body) {
  if (!process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { employerId, candidateId, jobId } = body || {};
  if (!employerId || !candidateId)
    return res.status(400).json({ ok: false, error: 'Missing employerId or candidateId' });

  const emp = await loadEmployer(employerId);
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });
  if (!isActivePaidPlan(emp))
    return res
      .status(402)
      .json({ ok: false, error: 'Active paid plan required to unlock candidate contacts.' });

  const limit = emp.day_unlock_limit || 0;
  const alreadyUnlocked = await isAlreadyUnlocked(employerId, candidateId);

  if (!alreadyUnlocked) {
    const usedToday = await countUsedToday(employerId);
    if (usedToday >= limit) {
      return res.status(429).json({
        ok: false,
        error: `Daily unlock limit reached (${usedToday}/${limit}). Resets at midnight UTC.`,
        used_today: usedToday,
        day_unlock_limit: limit,
        remaining: 0,
      });
    }
    // Insert the unlock — unique constraint handles races between concurrent reveals
    const insertRes = await sbPost(
      'employer_unlock_log',
      {
        employer_id: employerId,
        candidate_id: candidateId,
        job_id: jobId || null,
      },
      'return=minimal'
    );
    // 23505 = unique violation → another request unlocked the same candidate; treat as success
    if (!insertRes.ok && insertRes.status !== 409) {
      const errText = await insertRes.text().catch(() => '');
      console.error('Unlock log insert failed:', insertRes.status, errText);
      return res.status(500).json({ ok: false, error: 'Failed to record unlock' });
    }
  }

  const candidate = await loadCandidateContact(candidateId);
  if (!candidate) return res.status(404).json({ ok: false, error: 'Candidate not found' });

  const usedAfter = await countUsedToday(employerId);
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

async function status(req, res, body) {
  if (!process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured' });

  const { employerId } = body || {};
  if (!employerId) return res.status(400).json({ ok: false, error: 'Missing employerId' });

  const emp = await loadEmployer(employerId);
  if (!emp) return res.status(404).json({ ok: false, error: 'Employer not found' });

  const limit = emp.day_unlock_limit || 0;
  const usedToday = await countUsedToday(employerId);
  return res.status(200).json({
    ok: true,
    used_today: usedToday,
    day_unlock_limit: limit,
    remaining: Math.max(0, limit - usedToday),
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
      case 'reveal':
        return await reveal(req, res, body);
      case 'status':
        return await status(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[unlock:${action}] error:`, err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
