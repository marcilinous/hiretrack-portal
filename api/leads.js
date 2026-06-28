// /api/leads — B2B lead-qualification funnel intake (standard flow, 1–50 roles).
//
// The enterprise flow (50+) books via Cal.com and never hits this endpoint.
// Inserts into the RLS-protected `leads` table via the service role (the browser
// anon key cannot write it). Required env: SUPABASE_SERVICE_KEY.

import { rateLimit, clientIp } from './_rate-limit.js';

const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';

// Free/personal mailbox providers — rejected so the funnel captures corporate leads.
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

const VOLUME_TO_SEGMENT = {
  '1-10': 'standard',
  '11-50': 'standard',
  '50+': 'enterprise',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sbHeaders(extra) {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// Server-side mirror of the client Zod schema — never trust the browser.
function validate(body) {
  const name = String(body?.name || '').trim();
  const company = String(body?.company || '').trim();
  const workEmail = String(body?.workEmail || body?.work_email || '')
    .trim()
    .toLowerCase();
  const annualVolume = String(body?.annualVolume || body?.annual_volume || '').trim();

  if (name.length < 2) return { ok: false, error: 'Please enter your full name.' };
  if (company.length < 2) return { ok: false, error: 'Please enter your company name.' };
  if (!EMAIL_RE.test(workEmail)) return { ok: false, error: 'Please enter a valid work email.' };

  const domain = workEmail.split('@')[1] || '';
  if (FREE_EMAIL_DOMAINS.has(domain)) {
    return { ok: false, error: 'Please use your company email address (not a personal one).' };
  }

  const segment = VOLUME_TO_SEGMENT[annualVolume];
  if (!segment) return { ok: false, error: 'Please select how many roles you hire annually.' };
  // 50+ books via Cal.com; it should never POST here.
  if (segment !== 'standard') {
    return { ok: false, error: 'Enterprise enquiries are handled via the demo booking flow.' };
  }

  return {
    ok: true,
    data: { name, company, work_email: workEmail, annual_volume: annualVolume, segment },
  };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // 10 submissions / hour / IP — light abuse protection on a public form.
  const ip = clientIp(req);
  const limit = rateLimit('leads', ip, 10, 3600);
  if (!limit.ok) {
    return res
      .status(429)
      .json({ ok: false, error: `Too many submissions. Retry in ${limit.retryAfter}s.` });
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: 'Server not configured.' });
  }

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
      headers: sbHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ ...result.data, source: 'lead_funnel', status: 'new' }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ ok: false, error: 'Could not save your details.', detail });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
