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
  const cols = 'id,name,company,mobile,preferred_time,message,status,created_at,assigned_to';
  const path = isSolo
    ? `callback_requests?select=${cols}&order=created_at.desc`
    : `callback_requests?select=${cols}&assigned_to=eq.${id}&order=created_at.desc`;
  const cbs = await sbGet(path);
  return res.json({ ok: true, isSolo, callbacks: Array.isArray(cbs.data) ? cbs.data : [] });
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
