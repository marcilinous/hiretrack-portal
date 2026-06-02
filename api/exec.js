// Executive CRM auth + API — service-role backed (the executives table is
// RLS-protected and holds credentials, so it must never be touched with the
// browser anon key). Phase 1: login + register.
//
// Auth model: on login/register the server issues a signed bearer token
// (HMAC-SHA256 over {exec_id, exp} with EXEC_JWT_SECRET). The dashboard sends it
// as `x-exec-token`; the server verifies it and scopes every query to that exec.
//
// Required env: SUPABASE_SERVICE_KEY, EXEC_JWT_SECRET.
// Optional env: EXEC_SIGNUP_CODE (defaults to the legacy 'HIRETRACK2025').

import crypto from 'node:crypto';

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const CORS = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-exec-token');
};

function sbHeaders(extra) {
  return Object.assign({
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  const text = await r.text();
  let data = null; if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { ok: r.ok, status: r.status, data };
}

// ── password hashing (scrypt; legacy plaintext auto-upgrades on login) ──
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function isLegacy(stored) { return stored && !String(stored).startsWith('scrypt$'); }
function verifyPassword(pw, stored) {
  if (!stored) return false;
  if (String(stored).startsWith('scrypt$')) {
    const [, saltHex, hashHex] = stored.split('$');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
  return stored === pw; // legacy plaintext
}

// ── signed bearer token ──
function signToken(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.EXEC_JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyExecToken(token) {
  try {
    const secret = process.env.EXEC_JWT_SECRET;
    if (!secret || !token || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!obj.exp || Date.now() > obj.exp) return null;
    return obj;
  } catch { return null; }
}
function execToken(exec) {
  return signToken({ exec_id: exec.id, email: exec.email, name: exec.name, exp: Date.now() + TOKEN_TTL });
}
function stripExec(e) { if (!e) return null; const { password, secret_code, ...safe } = e; return safe; }

export default async function handler(req, res) {
  CORS(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!process.env.SUPABASE_SERVICE_KEY || !process.env.EXEC_JWT_SECRET) {
    return res.status(500).json({ ok: false, error: 'Executive API not configured (missing server env).' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const action = req.query.action || body?.action;

  try {
    switch (action) {
      case 'login':    return await doLogin(req, res, body);
      case 'register': return await doRegister(req, res, body);
      case 'summary':   return await getSummary(req, res);
      case 'callbacks': return await getCallbacks(req, res);
      case 'referrals': return await getReferrals(req, res);
      case 'callback-status':  return await updateCallbackStatusRow(req, res, body);
      case 'callback-convert': return await convertCallback(req, res, body);
      case 'reminders':        return await getReminders(req, res);
      case 'reminder-done':    return await markReminderDone(req, res, body);
      case 'pipeline':            return await getPipeline(req, res);
      case 'payment-link-create': return await createPaymentLink(req, res, body);
      case 'referral-mark-paid':  return await markReferralPaid(req, res, body);
      case 'referral-post-job':   return await postJobForReferral(req, res, body);
      case 'post-job':         return await postJob(req, res, body);
      default:         return res.status(400).json({ ok: false, error: 'Unknown action' });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

async function doLogin(req, res, body) {
  const email = (body?.email || '').trim();
  const password = body?.password || '';
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Email and password required.' });

  // Case-insensitive email match (ilike with no wildcards = exact, case-insensitive)
  const { data } = await sbGet(`executives?select=*&email=ilike.${encodeURIComponent(email)}&limit=1`);
  const exec = Array.isArray(data) ? data[0] : null;
  if (!exec || !verifyPassword(password, exec.password)) {
    return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
  }
  if (exec.is_active === false) {
    return res.status(403).json({ ok: false, error: 'Your account is inactive. Contact admin.' });
  }
  // Upgrade a legacy plaintext password to a hash on first successful login
  if (isLegacy(exec.password)) {
    await fetch(`${SUPABASE_URL}/rest/v1/executives?id=eq.${exec.id}`, {
      method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ password: hashPassword(password) }),
    }).catch(() => {});
  }
  return res.json({ ok: true, token: execToken(exec), executive: stripExec(exec) });
}

async function doRegister(req, res, body) {
  const name = (body?.name || '').trim();
  const mobile = (body?.mobile || '').trim();
  const email = (body?.email || '').trim();
  const password = body?.password || '';
  const secret = (body?.secret || '').trim();

  if (!name || !mobile || !email || !password) return res.status(400).json({ ok: false, error: 'All fields are required.' });
  if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ ok: false, error: 'Enter a valid 10-digit mobile.' });
  if (password.length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });

  const expected = process.env.EXEC_SIGNUP_CODE || 'HIRETRACK2025';
  if (secret.toUpperCase() !== expected.toUpperCase()) {
    return res.status(403).json({ ok: false, error: 'Invalid secret code. Contact admin.' });
  }

  const { data: existing } = await sbGet(`executives?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`);
  if (Array.isArray(existing) && existing.length) {
    return res.status(409).json({ ok: false, error: 'Email already registered.' });
  }

  const row = { name, email, mobile, password: hashPassword(password), secret_code: secret, is_active: true };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/executives`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(row),
  });
  const text = await r.text();
  let data = null; if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!r.ok) return res.status(500).json({ ok: false, error: (data && data.message) || 'Registration failed.' });
  const exec = Array.isArray(data) ? data[0] : data;
  return res.json({ ok: true, token: execToken(exec), executive: stripExec(exec) });
}

// ── Dashboard reads (scoped to the exec id from the verified token) ──

function authExec(req) {
  const token = req.headers['x-exec-token'] || (req.body && req.body.token);
  return verifyExecToken(token); // { exec_id, email, name, exp } or null
}

async function getSummary(req, res) {
  const auth = authExec(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const id = auth.exec_id;
  const [refs, cbs, jobs] = await Promise.all([
    sbGet(`employers?select=id,plan&referred_by=eq.${id}`),
    sbGet(`callback_requests?select=id,status&assigned_to=eq.${id}`),
    sbGet(`jobs?select=id&posted_by_executive=eq.${id}`),
  ]);
  const refList = Array.isArray(refs.data) ? refs.data : [];
  return res.json({
    ok: true,
    referrals:   refList.length,
    conversions: refList.filter(r => r.plan && r.plan !== 'free').length,
    callbacks:   Array.isArray(cbs.data) ? cbs.data.length : 0,
    jobs:        Array.isArray(jobs.data) ? jobs.data.length : 0,
  });
}

async function getCallbacks(req, res) {
  const auth = authExec(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const id = auth.exec_id;
  // Solo executive sees all callbacks (assigned + unassigned); otherwise only own.
  const active = await sbGet('executives?select=id&is_active=eq.true');
  const isSolo = Array.isArray(active.data) && active.data.length === 1;
  const cols = 'id,name,company,mobile,preferred_time,message,status,notes,called_at,converted_referral_id,created_at,assigned_to';
  const path = isSolo
    ? `callback_requests?select=${cols}&order=created_at.desc`
    : `callback_requests?select=${cols}&assigned_to=eq.${id}&order=created_at.desc`;
  const cbs = await sbGet(path);
  const list = (Array.isArray(cbs.data) ? cbs.data : []).map(c => ({ ...c, status: normalizeCbStatus(c.status) }));
  return res.json({ ok: true, isSolo, callbacks: list });
}

// Map any legacy callback status to the new vocabulary.
function normalizeCbStatus(s) {
  if (s === 'Pending' || !s) return 'yet_to_call';
  if (s === 'Called') return 'called';
  if (s === 'Converted') return 'converted';
  return s;
}

async function getReferrals(req, res) {
  const auth = authExec(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const id = auth.exec_id;
  // Explicit columns — never return the employer password hash.
  const cols = 'id,company,contact_name,email,mobile,city,plan,is_free_trial,created_at';
  const refs = await sbGet(`employers?select=${cols}&referred_by=eq.${id}&order=created_at.desc`);
  return res.json({ ok: true, referrals: Array.isArray(refs.data) ? refs.data : [] });
}

// ── Dashboard writes (service role; authorized + scoped to the token's exec) ──

// Fetch a callback + verify the caller may act on it (own, or solo exec).
async function authCallback(req, id) {
  const auth = authExec(req);
  if (!auth) return { error: 401 };
  const cbRes = await sbGet(`callback_requests?select=*&id=eq.${id}&limit=1`);
  const cb = Array.isArray(cbRes.data) ? cbRes.data[0] : null;
  if (!cb) return { error: 404 };
  const active = await sbGet('executives?select=id&is_active=eq.true');
  const isSolo = Array.isArray(active.data) && active.data.length === 1;
  if (!isSolo && cb.assigned_to !== auth.exec_id) return { error: 403 };
  return { auth, cb };
}

async function createReminder(execId, type, message, dueDate, relatedId) {
  return fetch(`${SUPABASE_URL}/rest/v1/executive_reminders`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ executive_id: execId, type, message, due_date: dueDate, related_id: relatedId || null }),
  }).catch(() => {});
}

async function updateCallbackStatusRow(req, res, body) {
  const { id, status, notes } = body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const ALLOWED = ['yet_to_call', 'called', 'interested', 'not_interested', 'converted'];
  if (status && !ALLOWED.includes(status)) return res.status(400).json({ ok: false, error: 'invalid status' });

  const a = await authCallback(req, id);
  if (a.error) return res.status(a.error).json({ ok: false, error: a.error === 403 ? 'Not your callback.' : 'Unauthorized' });

  const patch = {};
  if (status) patch.status = status;
  if (notes !== undefined) patch.notes = notes;
  if (status === 'called') patch.called_at = new Date().toISOString();
  if (Object.keys(patch).length) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/callback_requests?id=eq.${id}`, {
      method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(patch),
    });
    if (!r.ok) return res.json({ ok: false, error: 'Update failed.' });
  }
  // "Interested" → schedule a 2-day follow-up reminder.
  if (status === 'interested') {
    const due = new Date(); due.setDate(due.getDate() + 2);
    const who = a.cb.name || a.cb.company || 'lead';
    await createReminder(a.auth.exec_id, 'callback_followup', `Follow up with ${who} — interested lead`, due.toISOString(), id);
  }
  return res.json({ ok: true });
}

async function convertCallback(req, res, body) {
  const { id } = body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const a = await authCallback(req, id);
  if (a.error) return res.status(a.error).json({ ok: false, error: a.error === 403 ? 'Not your callback.' : 'Unauthorized' });
  const { auth, cb } = a;

  if (cb.converted_referral_id) {
    await fetch(`${SUPABASE_URL}/rest/v1/callback_requests?id=eq.${id}`, {
      method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ status: 'converted' }),
    }).catch(() => {});
    return res.json({ ok: true, referral_id: cb.converted_referral_id, alreadyConverted: true });
  }

  const er = await fetch(`${SUPABASE_URL}/rest/v1/employer_referrals`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ executive_id: auth.exec_id, name: cb.name, company: cb.company, phone: cb.mobile, status: 'lead', source_callback_id: id }),
  });
  const et = await er.text(); let ed = null; try { ed = JSON.parse(et); } catch {}
  if (!er.ok) return res.status(500).json({ ok: false, error: (ed && ed.message) || 'Failed to create pipeline entry.' });
  const referral = Array.isArray(ed) ? ed[0] : ed;

  await fetch(`${SUPABASE_URL}/rest/v1/callback_requests?id=eq.${id}`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ status: 'converted', converted_referral_id: referral.id }),
  }).catch(() => {});
  return res.json({ ok: true, referral_id: referral.id });
}

async function getReminders(req, res) {
  const auth = authExec(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const r = await sbGet(`executive_reminders?select=*&executive_id=eq.${auth.exec_id}&is_done=eq.false&order=due_date.asc`);
  return res.json({ ok: true, reminders: Array.isArray(r.data) ? r.data : [] });
}

async function markReminderDone(req, res, body) {
  const auth = authExec(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const { id } = body || {};
  if (!id) return res.status(400).json({ ok: false, error: 'id required' });
  const r = await fetch(`${SUPABASE_URL}/rest/v1/executive_reminders?id=eq.${id}&executive_id=eq.${auth.exec_id}`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ is_done: true }),
  });
  return res.json({ ok: r.ok });
}

// ── Pipeline (Workflow 1): payment links, mark-paid, post-job-for-referral ──

// Load + verify a referral belongs to the caller.
async function ownReferral(req, referralId) {
  const auth = authExec(req);
  if (!auth) return { error: 401 };
  const r = await sbGet(`employer_referrals?select=*&id=eq.${referralId}&limit=1`);
  const ref = Array.isArray(r.data) ? r.data[0] : null;
  if (!ref) return { error: 404 };
  if (ref.executive_id !== auth.exec_id) return { error: 403 };
  return { auth, ref };
}

async function getPipeline(req, res) {
  const auth = authExec(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const r = await sbGet(`employer_referrals?select=*&executive_id=eq.${auth.exec_id}&order=created_at.desc`);
  return res.json({ ok: true, pipeline: Array.isArray(r.data) ? r.data : [] });
}

async function createPaymentLink(req, res, body) {
  const { referral_id, amount, validity_days } = body || {};
  if (!referral_id || amount == null || validity_days == null) return res.status(400).json({ ok: false, error: 'referral, amount and validity required' });
  const amt = Number(amount), days = Number(validity_days);
  if (!(amt > 0)) return res.status(400).json({ ok: false, error: 'Enter a valid amount.' });
  if (![7, 15, 30, 60, 90].includes(days)) return res.status(400).json({ ok: false, error: 'Invalid validity.' });

  const o = await ownReferral(req, referral_id);
  if (o.error) return res.status(o.error).json({ ok: false, error: o.error === 403 ? 'Not your referral.' : 'Unauthorized' });

  const slug = crypto.randomBytes(9).toString('base64url');
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/payment_links`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ slug, executive_id: o.auth.exec_id, referral_id, amount: amt, validity_days: days }),
  });
  if (!pr.ok) { const t = await pr.text(); let d = null; try { d = JSON.parse(t); } catch {} return res.status(500).json({ ok: false, error: (d && d.message) || 'Could not create link.' }); }

  // Remember the quoted amount/validity on the referral for Mark-as-Paid.
  await fetch(`${SUPABASE_URL}/rest/v1/employer_referrals?id=eq.${referral_id}`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ amount: amt, validity_days: days }),
  }).catch(() => {});

  return res.json({ ok: true, slug, url: `https://hiretrack.co.in/pay/${slug}` });
}

async function markReferralPaid(req, res, body) {
  const { referral_id } = body || {};
  if (!referral_id) return res.status(400).json({ ok: false, error: 'referral_id required' });
  const o = await ownReferral(req, referral_id);
  if (o.error) return res.status(o.error).json({ ok: false, error: o.error === 403 ? 'Not your referral.' : 'Unauthorized' });
  const { auth, ref } = o;

  const days = Number(body.validity_days) || ref.validity_days || 30;
  const start = new Date();
  const end = new Date(); end.setDate(end.getDate() + days);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/employer_referrals?id=eq.${referral_id}`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ is_paid: true, status: 'plan_active', plan_start: start.toISOString(), plan_end: end.toISOString(), validity_days: days }),
  });
  if (!r.ok) return res.json({ ok: false, error: 'Update failed.' });

  // Plan-expiry follow-up reminder, 2 days before expiry.
  const remind = new Date(end); remind.setDate(remind.getDate() - 2);
  const who = ref.company || ref.name || 'employer';
  await createReminder(auth.exec_id, 'plan_expiry', `Follow up with ${who} — plan expires in 2 days`, remind.toISOString(), referral_id);
  // Settle any open payment links for this referral.
  await fetch(`${SUPABASE_URL}/rest/v1/payment_links?referral_id=eq.${referral_id}&is_paid=eq.false`, {
    method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ is_paid: true, paid_at: new Date().toISOString() }),
  }).catch(() => {});

  return res.json({ ok: true, plan_end: end.toISOString() });
}

// Create (or find) a real employer auth account — used when posting a job for a
// referral that has no linked employer yet. Mirrors postJob's account creation.
async function ensureEmployerAccount({ email, mobile, company, contact, city, execId }) {
  const found = await sbGet(`employers?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`);
  if (Array.isArray(found.data) && found.data.length) return { id: found.data[0].id };

  const au = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: mobile, email_confirm: true, user_metadata: { role: 'employer', company, contact_name: contact, mobile, city: city || '', industry: 'Other' } }),
  });
  const at = await au.text(); let ad = null; try { ad = JSON.parse(at); } catch {}
  if (!au.ok) {
    const msg = (ad && (ad.msg || ad.message || ad.error_description || ad.error)) || 'Could not create employer account.';
    const taken = /already|registered|exists/i.test(msg);
    return { error: taken ? 'An account with this email already exists — ask them to log in, or use a different email.' : msg, status: taken ? 409 : 500 };
  }
  const uid = ad.id || (ad.user && ad.user.id);
  if (!uid) return { error: 'Account creation returned no id.', status: 500 };

  const trial = new Date(); trial.setDate(trial.getDate() + 7);
  const fields = { company, contact_name: contact, mobile, city: city || '', industry: 'Other', plan: 'free', job_limit: 1, day_limit: 7, referred_by: execId, is_free_trial: true, free_trial_expires_at: trial.toISOString() };
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/employers?id=eq.${uid}`, { method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(fields) });
  let pd = null; { const t = await pr.text(); try { pd = JSON.parse(t); } catch {} }
  if (pr.ok && !(Array.isArray(pd) ? pd[0] : pd)) {
    await fetch(`${SUPABASE_URL}/rest/v1/employers`, { method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ id: uid, email, ...fields }) }).catch(() => {});
  }
  return { id: uid };
}

async function postJobForReferral(req, res, body) {
  const b = body || {};
  if (!b.referral_id) return res.status(400).json({ ok: false, error: 'referral_id required' });
  const o = await ownReferral(req, b.referral_id);
  if (o.error) return res.status(o.error).json({ ok: false, error: o.error === 403 ? 'Not your referral.' : 'Unauthorized' });
  const { auth, ref } = o;

  const f = (k) => (b[k] || '').trim();
  const title = f('title'), location = f('location'), salary = f('salary'), description = f('description');
  const jobType = f('jobType') || 'Full Time', skills = f('skills');
  const company = ref.company || f('company') || '';
  const mobile = ref.phone || f('mobile') || '';
  const phone = f('phone') || mobile;
  const email = (f('email') || ref.email || '').trim();
  const contact = f('contact') || ref.name || 'Employer';

  if (!title || !location || !description) return res.status(400).json({ ok: false, error: 'Job title, location and description are required.' });

  let employerId = ref.employer_id;
  if (!employerId) {
    if (!email) return res.status(400).json({ ok: false, error: 'Employer email is required to create their account.' });
    if (!/^\d{10}$/.test(mobile)) return res.status(400).json({ ok: false, error: 'A valid 10-digit employer mobile is required.' });
    const acct = await ensureEmployerAccount({ email, mobile, company, contact, execId: auth.exec_id });
    if (acct.error) return res.status(acct.status || 500).json({ ok: false, error: acct.error });
    employerId = acct.id;
    await fetch(`${SUPABASE_URL}/rest/v1/employer_referrals?id=eq.${b.referral_id}`, {
      method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ employer_id: employerId, email }),
    }).catch(() => {});
  }

  // Job runs to the plan end if the plan is active, else a 7-day trial.
  const expiry = (ref.plan_end && new Date(ref.plan_end) > new Date()) ? new Date(ref.plan_end) : (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d; })();
  const jr = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ employer_id: employerId, title, company, location, job_type: jobType, salary, skills, phone, description, email, expires_at: expiry.toISOString(), posted_by_executive: auth.exec_id, pincode: f('pincode') || null, city: f('city') || null, subcity: f('subcity') || null }),
  });
  if (!jr.ok) { const t = await jr.text(); let d = null; try { d = JSON.parse(t); } catch {} return res.status(500).json({ ok: false, error: (d && d.message) || 'Failed to post job.' }); }
  return res.json({ ok: true });
}

async function postJob(req, res, body) {
  const auth = authExec(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const id = auth.exec_id;
  const b = body || {};
  const f = (k) => (b[k] || '').trim();
  const company = f('company'), contact = f('contact'), email = f('email'), mobile = f('mobile'), city = f('city');
  const title = f('title'), location = f('location'), jobType = f('jobType'), salary = f('salary');
  const skills = f('skills'), phone = f('phone'), description = f('description');

  if (!company || !contact || !email || !mobile || !city || !title || !location || !phone || !description) {
    return res.status(400).json({ ok: false, error: 'Please fill all required fields.' });
  }
  if (!/^\d{10}$/.test(mobile) || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ ok: false, error: 'Enter valid 10-digit mobile numbers.' });
  }

  // Find or create the employer (referred by this exec, 7-day free trial)
  let employer = null;
  const found = await sbGet(`employers?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`);
  const existed = Array.isArray(found.data) && found.data.length > 0;
  if (existed) {
    employer = found.data[0];
  } else {
    // Create a REAL Supabase Auth account so the employer can log into the portal
    // (password = their mobile, matching the credentials email). The
    // on_auth_user_created trigger then creates the public.employers row (id =
    // auth uid); we stamp the exec/trial fields onto it.
    const au = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email, password: mobile, email_confirm: true,
        user_metadata: { role: 'employer', company, contact_name: contact, mobile, city, industry: 'Other' },
      }),
    });
    const at = await au.text(); let ad = null; try { ad = JSON.parse(at); } catch {}
    if (!au.ok) {
      const msg = (ad && (ad.msg || ad.message || ad.error_description || ad.error)) || 'Could not create employer account.';
      const taken = /already|registered|exists/i.test(msg);
      return res.status(taken ? 409 : 500).json({
        ok: false,
        error: taken ? 'An account with this email already exists — ask them to log in, or use a different email.' : msg,
      });
    }
    const uid = ad.id || (ad.user && ad.user.id);
    if (!uid) return res.status(500).json({ ok: false, error: 'Employer account creation returned no id.' });

    const trial = new Date(); trial.setDate(trial.getDate() + 7);
    const fields = {
      company, contact_name: contact, mobile, city, industry: 'Other',
      plan: 'free', job_limit: 1, day_limit: 7,
      referred_by: id, is_free_trial: true, free_trial_expires_at: trial.toISOString(),
    };
    // Stamp the trigger-created row; if the trigger didn't create it, insert explicitly.
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/employers?id=eq.${uid}`, {
      method: 'PATCH', headers: sbHeaders({ Prefer: 'return=representation' }), body: JSON.stringify(fields),
    });
    let pd = null; { const t = await pr.text(); try { pd = JSON.parse(t); } catch {} }
    let row = Array.isArray(pd) ? pd[0] : pd;
    if (pr.ok && !row) {
      const ir = await fetch(`${SUPABASE_URL}/rest/v1/employers`, {
        method: 'POST', headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ id: uid, email, ...fields }),
      });
      const it = await ir.text(); let idd = null; try { idd = JSON.parse(it); } catch {}
      row = Array.isArray(idd) ? idd[0] : idd;
    }
    employer = row || { id: uid };
  }

  // Post the job (7-day trial)
  const expiry = new Date(); expiry.setDate(expiry.getDate() + 7);
  const jobRow = {
    employer_id: employer.id, title, company, location, job_type: jobType, salary,
    skills, phone, description, email, expires_at: expiry.toISOString(),
    posted_by_executive: id, is_free_trial: true,
    pincode: f('pincode') || null, city: city || null, subcity: f('subcity') || null,
  };
  const jr = await fetch(`${SUPABASE_URL}/rest/v1/jobs`, {
    method: 'POST', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(jobRow),
  });
  if (!jr.ok) {
    const jt = await jr.text(); let jd = null; try { jd = JSON.parse(jt); } catch {}
    return res.status(500).json({ ok: false, error: (jd && jd.message) || 'Failed to post job.' });
  }
  return res.json({ ok: true, employerExisted: existed });
}
