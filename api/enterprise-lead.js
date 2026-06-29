// /api/enterprise-lead — pricing.html enterprise CTA intake.
//
// Lighter than /api/leads: only company + corporate email + name are required.
// Optional contact_pref ('callback' | 'calendar' | 'email') and callback_at
// let the sales team know how the lead wants to be reached.
//
// Rate-limited like /api/leads. Inserts into the same `leads` table with
// segment='enterprise' and source='pricing_inline'.

import { rateLimit, clientIp } from './_rate-limit.js';

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'ymail.com',
  'rediffmail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_PREF = new Set(['callback', 'calendar', 'email']);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sbHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

function validate(body) {
  const name = String(body?.name || '').trim();
  const company = String(body?.company || '').trim();
  const workEmail = String(body?.workEmail || body?.work_email || '')
    .trim()
    .toLowerCase();
  const planInterest = String(body?.planInterest || body?.plan_interest || '').trim();
  const contactPref = String(body?.contactPref || body?.contact_pref || 'email').trim();
  const callbackAtRaw = String(body?.callbackAt || body?.callback_at || '').trim();

  if (name.length < 2) return { ok: false, error: 'Please enter your full name.' };
  if (company.length < 2) return { ok: false, error: 'Please enter your company name.' };
  if (!EMAIL_RE.test(workEmail)) return { ok: false, error: 'Please enter a valid work email.' };
  const domain = workEmail.split('@')[1] || '';
  if (FREE_EMAIL_DOMAINS.has(domain))
    return { ok: false, error: 'Please use your company email address (not a personal one).' };

  if (!ALLOWED_PREF.has(contactPref)) return { ok: false, error: 'Invalid contact preference.' };

  let callbackAt = null;
  if (contactPref === 'callback' && callbackAtRaw) {
    const d = new Date(callbackAtRaw);
    if (Number.isNaN(d.getTime()))
      return { ok: false, error: 'Please choose a valid callback time.' };
    if (d.getTime() < Date.now() - 60_000)
      return { ok: false, error: 'Callback time must be in the future.' };
    callbackAt = d.toISOString();
  }

  return {
    ok: true,
    data: {
      name,
      company,
      work_email: workEmail,
      annual_volume: planInterest || '50+',
      segment: 'enterprise',
      source: 'pricing_inline',
      status: 'new',
      contact_pref: contactPref,
      callback_at: callbackAt,
    },
  };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const ip = clientIp(req);
  const limit = rateLimit('enterprise-lead', ip, 10, 3600);
  if (!limit.ok)
    return res
      .status(429)
      .json({ ok: false, error: `Too many submissions. Retry in ${limit.retryAfter}s.` });

  if (!process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ ok: false, error: 'Server not configured.' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const result = validate(body);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.error });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify(result.data),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Enterprise lead insert failed:', r.status, detail);
      return res.status(502).json({ ok: false, error: 'Could not save your details.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
