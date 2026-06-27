import { rateLimit, clientIp } from './_rate-limit.js';

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
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const action = req.query.action || body?.action;

  // Auth check — only the login action skips it
  if (action !== 'login' && !authOk(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    switch (action) {
      case 'login':
        return await doLogin(req, res, body);
      case 'stats':
        return await getStats(req, res);
      case 'jobs':
        return await getJobs(req, res, body);
      case 'employers':
        return await getEmployers(req, res, body);
      case 'candidates':
        return await getCandidates(req, res, body);
      case 'delist':
        return await delistJob(req, res, body);
      case 'relist':
        return await relistJob(req, res, body);
      case 'applications':
        return await getApplicationsList(req, res);
      case 'application-update':
        return await updateApplicationRow(req, res, body);
      case 'executives':
        return await getExecutives(req, res);
      case 'callbacks':
        return await getCallbacks(req, res);
      case 'callback-update':
        return await updateCallbackRow(req, res, body);
      case 'executive-update':
        return await updateExecutiveRow(req, res, body);
      case 'executive-delete':
        return await deleteExecutiveRow(req, res, body);
      default:
        return res.status(400).json({ ok: false, error: 'Unknown action' });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function doLogin(req, res, body) {
  // 5 attempts per 15 minutes per IP to prevent brute-force on the admin password
  const ip = clientIp(req);
  const limit = rateLimit('admin-login', ip, 5, 900);
  if (!limit.ok)
    return res
      .status(429)
      .json({ ok: false, error: `Too many login attempts. Retry in ${limit.retryAfter}s.` });

  const { password } = body || {};
  if (!password || password !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ ok: false, error: 'Invalid password' });
  }
  return res.json({ ok: true, token: process.env.ADMIN_SECRET });
}

async function getStats(req, res) {
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
      candidates: Array.isArray(cands) ? cands.length : 0,
      employers: Array.isArray(emps) ? emps.length : 0,
      activeJobs: Array.isArray(js) ? js.length : 0,
      applications: Array.isArray(aps) ? aps.length : 0,
      paidEmployers: Array.isArray(paid) ? paid.length : 0,
      newCands7d: Array.isArray(newCands) ? newCands.length : 0,
      newEmps7d: Array.isArray(newEmps) ? newEmps.length : 0,
    },
  });
}

async function getJobs(req, res, body) {
  const { page = 0, filter = 'all' } = body || {};
  const limit = 30;
  const offset = page * limit;

  let qs = `jobs?select=id,title,company,location,job_type,posted_at,expires_at,delisted,employer_id,views&order=posted_at.desc&limit=${limit}&offset=${offset}`;
  if (filter === 'active') qs += '&delisted=eq.false';
  if (filter === 'delisted') qs += '&delisted=eq.true';

  const jobs = await sbQuery(qs);

  // Attach application counts
  const ids = Array.isArray(jobs) ? jobs.map((j) => j.id) : [];
  const appCounts = {};
  if (ids.length) {
    const apps = await sbQuery(`applications?select=job_id&job_id=in.(${ids.join(',')})`);
    if (Array.isArray(apps)) {
      apps.forEach((a) => {
        appCounts[a.job_id] = (appCounts[a.job_id] || 0) + 1;
      });
    }
  }

  return res.json({
    ok: true,
    jobs: (Array.isArray(jobs) ? jobs : []).map((j) => ({
      ...j,
      application_count: appCounts[j.id] || 0,
    })),
  });
}

async function getEmployers(req, res, body) {
  const { page = 0, filter = 'all', limit = 200 } = body || {};
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const offset = page * lim;

  let qs = `employers?select=id,company,contact_name,email,city,plan,plan_expires_at,created_at&order=created_at.desc&limit=${lim}&offset=${offset}`;
  if (filter === 'paid') qs += '&plan=neq.free';
  if (filter === 'free') qs += '&plan=eq.free';

  const employers = await sbQuery(qs);

  // Job counts per employer
  const ids = Array.isArray(employers) ? employers.map((e) => e.id) : [];
  const jobCounts = {};
  if (ids.length) {
    const jobs = await sbQuery(
      `jobs?select=employer_id&employer_id=in.(${ids.join(',')})&delisted=eq.false`
    );
    if (Array.isArray(jobs)) {
      jobs.forEach((j) => {
        jobCounts[j.employer_id] = (jobCounts[j.employer_id] || 0) + 1;
      });
    }
  }

  return res.json({
    ok: true,
    employers: (Array.isArray(employers) ? employers : []).map((e) => ({
      ...e,
      job_count: jobCounts[e.id] || 0,
    })),
  });
}

async function getCandidates(req, res, body) {
  const { page = 0, limit = 200 } = body || {};
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 500);
  const offset = page * lim;

  // Service key → admin may see contact PII (email). The browser anon key cannot
  // read these columns once v37 RLS lands; admin reads must go through this API.
  const candidates = await sbQuery(
    `candidates?select=id,name,email,city,jobtitle,experience,skills,created_at,boosted_until,pro_expires_at&order=created_at.desc&limit=${lim}&offset=${offset}`
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

// ── Applications (RLS-protected once enforced — read/write via service role) ──

async function getApplicationsList(req, res) {
  const apps = await sbQuery(
    'applications?select=id,candidate_id,job_id,status,applied_at&order=applied_at.desc&limit=300'
  );
  const list = Array.isArray(apps) ? apps : [];
  if (!list.length) return res.json({ ok: true, applications: [] });

  // job_id is text and may hold non-UUID demo ids (e.g. "static-1"); only query
  // real UUIDs so the `in` filter doesn't 400.
  const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const candIds = [
    ...new Set(list.map((a) => a.candidate_id).filter((id) => id && uuidRe.test(id))),
  ];
  const jobIds = [...new Set(list.map((a) => a.job_id).filter((id) => id && uuidRe.test(id)))];

  const [cands, jobs] = await Promise.all([
    candIds.length ? sbQuery(`candidates?select=id,name,email&id=in.(${candIds.join(',')})`) : [],
    jobIds.length ? sbQuery(`jobs?select=id,title,company&id=in.(${jobIds.join(',')})`) : [],
  ]);
  const candMap = {};
  (Array.isArray(cands) ? cands : []).forEach((c) => {
    candMap[String(c.id)] = c;
  });
  const jobMap = {};
  (Array.isArray(jobs) ? jobs : []).forEach((j) => {
    jobMap[String(j.id)] = j;
  });

  return res.json({
    ok: true,
    applications: list.map((a) => ({
      ...a,
      candidates: candMap[String(a.candidate_id)] || null,
      jobs: jobMap[String(a.job_id)] || null,
    })),
  });
}

async function updateApplicationRow(req, res, body) {
  const { id, status } = body || {};
  if (!id || !status) return res.status(400).json({ ok: false, error: 'id and status required' });
  const ALLOWED = ['Applied', 'Viewed', 'Shortlisted', 'Interview', 'Hired', 'Rejected'];
  if (!ALLOWED.includes(status))
    return res.status(400).json({ ok: false, error: 'invalid status' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/applications?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({ status, status_updated_at: new Date().toISOString() }),
  });
  return res.json({ ok: r.ok });
}

// ── Executives & Callbacks (RLS-protected — must use the service role) ──

async function getExecutives(req, res) {
  const executives = await sbQuery('executives?select=*&order=created_at.desc');
  const list = Array.isArray(executives) ? executives : [];
  let referrals = [],
    callbacks = [],
    jobs = [];
  const ids = list.map((e) => e.id).filter(Boolean);
  if (ids.length) {
    const inList = `(${ids.join(',')})`;
    [referrals, callbacks, jobs] = await Promise.all([
      sbQuery(`employers?select=referred_by&referred_by=in.${inList}`),
      sbQuery(`callback_requests?select=assigned_to&assigned_to=in.${inList}`),
      sbQuery(`jobs?select=posted_by_executive&posted_by_executive=in.${inList}`),
    ]);
  }
  const countBy = (arr, key, id) =>
    Array.isArray(arr) ? arr.filter((x) => x[key] === id).length : 0;
  return res.json({
    ok: true,
    executives: list.map((e) => ({
      ...e,
      referral_count: countBy(referrals, 'referred_by', e.id),
      callback_count: countBy(callbacks, 'assigned_to', e.id),
      job_count: countBy(jobs, 'posted_by_executive', e.id),
    })),
  });
}

async function getCallbacks(req, res) {
  const [callbacks, executives] = await Promise.all([
    sbQuery('callback_requests?select=*&order=created_at.desc'),
    sbQuery('executives?select=id,name&order=created_at.asc'),
  ]);
  return res.json({
    ok: true,
    callbacks: Array.isArray(callbacks) ? callbacks : [],
    executives: Array.isArray(executives) ? executives : [],
  });
}

async function updateCallbackRow(req, res, body) {
  const { id, patch } = body || {};
  if (!id || !patch) return res.status(400).json({ ok: false, error: 'id and patch required' });
  const allowed = {};
  ['assigned_to', 'assigned_at', 'status'].forEach((k) => {
    if (k in patch) allowed[k] = patch[k];
  });
  if (!Object.keys(allowed).length)
    return res.status(400).json({ ok: false, error: 'no allowed fields' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/callback_requests?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(allowed),
  });
  return res.json({ ok: r.ok });
}

async function updateExecutiveRow(req, res, body) {
  const { id, patch } = body || {};
  if (!id || !patch) return res.status(400).json({ ok: false, error: 'id and patch required' });
  const allowed = {};
  ['is_active'].forEach((k) => {
    if (k in patch) allowed[k] = patch[k];
  });
  if (!Object.keys(allowed).length)
    return res.status(400).json({ ok: false, error: 'no allowed fields' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/executives?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify(allowed),
  });
  return res.json({ ok: r.ok });
}

async function deleteExecutiveRow(req, res, body) {
  const { id } = body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/executives?id=eq.${id}`, {
    method: 'DELETE',
    headers: sbHeaders(),
  });
  return res.json({ ok: r.ok });
}
