const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
};

function sbHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function sbQuery(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders(), ...opts });
  return r.json();
}

function authOk(req) {
  const token = req.headers['x-admin-token'] || req.body?.token;
  return token && token === process.env.ADMIN_SECRET;
}

export default async function handler(req, res) {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const action = req.query.action || body?.action;

  // Auth check — only the login action skips it
  if (action !== 'login' && !authOk(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    switch (action) {
      case 'login':   return await doLogin(req, res, body);
      case 'stats':   return await getStats(req, res);
      case 'jobs':    return await getJobs(req, res, body);
      case 'employers': return await getEmployers(req, res, body);
      case 'candidates': return await getCandidates(req, res, body);
      case 'delist':  return await delistJob(req, res, body);
      case 'relist':  return await relistJob(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: 'Unknown action' });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function doLogin(req, res, body) {
  const { password } = body || {};
  if (!password || password !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: 'Invalid password' });
  }
  return res.json({ ok: true, token: process.env.ADMIN_SECRET });
}

async function getStats(req, res) {
  const [candidates, employers, jobs, apps, paidEmployers] = await Promise.all([
    sbQuery('candidates?select=count', { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } }),
    sbQuery('employers?select=count', { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } }),
    sbQuery('jobs?select=count&delisted=eq.false', { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } }),
    sbQuery('applications?select=count', { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } }),
    sbQuery('employers?select=count&plan=neq.free&plan=not.is.null', { headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' } }),
  ]);

  // PostgREST returns count in Content-Range header; fall back to row count
  const count = (d) => Array.isArray(d) ? d.length : 0;

  // Fetch actual counts via a simpler approach
  const [cands, emps, js, aps, paid] = await Promise.all([
    sbQuery('candidates?select=id'),
    sbQuery('employers?select=id'),
    sbQuery('jobs?select=id&delisted=eq.false'),
    sbQuery('applications?select=id'),
    sbQuery('employers?select=id&plan=neq.free'),
  ]);

  // 7-day signups
  const since7d = new Date(Date.now() - 7 * 86400000).toISOString();
  const [newCands, newEmps] = await Promise.all([
    sbQuery(`candidates?select=id&created_at=gte.${since7d}`),
    sbQuery(`employers?select=id&created_at=gte.${since7d}`),
  ]);

  return res.json({
    ok: true,
    stats: {
      candidates:    Array.isArray(cands) ? cands.length : 0,
      employers:     Array.isArray(emps)  ? emps.length  : 0,
      activeJobs:    Array.isArray(js)    ? js.length    : 0,
      applications:  Array.isArray(aps)   ? aps.length   : 0,
      paidEmployers: Array.isArray(paid)  ? paid.length  : 0,
      newCands7d:    Array.isArray(newCands) ? newCands.length : 0,
      newEmps7d:     Array.isArray(newEmps)  ? newEmps.length  : 0,
    },
  });
}

async function getJobs(req, res, body) {
  const { page = 0, search = '', filter = 'all' } = body || {};
  const limit = 30;
  const offset = page * limit;

  let qs = `jobs?select=id,title,company,location,job_type,posted_at,expires_at,delisted,employer_id,views&order=posted_at.desc&limit=${limit}&offset=${offset}`;
  if (filter === 'active')   qs += '&delisted=eq.false';
  if (filter === 'delisted') qs += '&delisted=eq.true';

  const jobs = await sbQuery(qs);

  // Attach application counts
  const ids = Array.isArray(jobs) ? jobs.map(j => j.id) : [];
  let appCounts = {};
  if (ids.length) {
    const apps = await sbQuery(`applications?select=job_id&job_id=in.(${ids.join(',')})`);
    if (Array.isArray(apps)) {
      apps.forEach(a => { appCounts[a.job_id] = (appCounts[a.job_id] || 0) + 1; });
    }
  }

  return res.json({
    ok: true,
    jobs: (Array.isArray(jobs) ? jobs : []).map(j => ({ ...j, application_count: appCounts[j.id] || 0 })),
  });
}

async function getEmployers(req, res, body) {
  const { page = 0, filter = 'all' } = body || {};
  const limit = 30;
  const offset = page * limit;

  let qs = `employers?select=id,company,contact_name,email,city,plan,plan_expires_at,created_at&order=created_at.desc&limit=${limit}&offset=${offset}`;
  if (filter === 'paid') qs += '&plan=neq.free';
  if (filter === 'free') qs += '&plan=eq.free';

  const employers = await sbQuery(qs);

  // Job counts per employer
  const ids = Array.isArray(employers) ? employers.map(e => e.id) : [];
  let jobCounts = {};
  if (ids.length) {
    const jobs = await sbQuery(`jobs?select=employer_id&employer_id=in.(${ids.join(',')})&delisted=eq.false`);
    if (Array.isArray(jobs)) {
      jobs.forEach(j => { jobCounts[j.employer_id] = (jobCounts[j.employer_id] || 0) + 1; });
    }
  }

  return res.json({
    ok: true,
    employers: (Array.isArray(employers) ? employers : []).map(e => ({ ...e, job_count: jobCounts[e.id] || 0 })),
  });
}

async function getCandidates(req, res, body) {
  const { page = 0 } = body || {};
  const limit = 30;
  const offset = page * limit;

  const candidates = await sbQuery(
    `candidates?select=id,name,city,jobtitle,experience,skills,created_at,boosted_until&order=created_at.desc&limit=${limit}&offset=${offset}`
  );

  return res.json({ ok: true, candidates: Array.isArray(candidates) ? candidates : [] });
}

async function delistJob(req, res, body) {
  const { jobId } = body || {};
  if (!jobId) return res.status(400).json({ ok: false, error: 'jobId required' });

  const r = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({ delisted: true }),
  });

  return res.json({ ok: r.ok });
}

async function relistJob(req, res, body) {
  const { jobId } = body || {};
  if (!jobId) return res.status(400).json({ ok: false, error: 'jobId required' });

  const r = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${jobId}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({ delisted: false }),
  });

  return res.json({ ok: r.ok });
}
