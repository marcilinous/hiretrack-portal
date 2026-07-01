// /api/index-job — Notify Google's Indexing API about new / updated / deleted
// HireTrack URLs. Built specifically for JobPosting URLs (where Indexing API
// is officially supported), but accepts any URL.
//
// Auth: Google Cloud service-account credentials, JSON, in
//   process.env.GOOGLE_INDEXING_API_KEY (the full JSON, not a path).
// The service account must be added as an "Owner" of the property in Google
// Search Console.
//
// POST  /api/index-job
//   Body: { "url": "https://www.hiretrack.co.in/jobs/...", "type": "URL_UPDATED" }
//   Or:   { "urls": [{ "url": "...", "type": "URL_UPDATED" }, ...] }
//
// type ∈ {"URL_UPDATED", "URL_DELETED"}. Defaults to URL_UPDATED.

import crypto from 'node:crypto';

const INDEXING_API = 'https://indexing.googleapis.com/v3/urlNotifications:publish';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/indexing';

let _cachedToken = null; // { value, expiresAt }

function parseKey() {
  const raw = process.env.GOOGLE_INDEXING_API_KEY;
  if (!raw) throw new Error('GOOGLE_INDEXING_API_KEY env var is not set.');
  let key;
  try {
    key = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      'GOOGLE_INDEXING_API_KEY must be a JSON string of the service-account credentials.'
    );
  }
  if (!key.client_email || !key.private_key) {
    throw new Error('Service-account JSON is missing client_email or private_key.');
  }
  return key;
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken() {
  if (_cachedToken && _cachedToken.expiresAt > Date.now() + 30_000) {
    return _cachedToken.value;
  }
  const key = parseKey();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = {
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const claimsB64 = base64url(JSON.stringify(claims));
  const toSign = `${header}.${claimsB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  const sig = signer
    .sign(key.private_key)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${toSign}.${sig}`;

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Token fetch failed: ${r.status} ${detail}`);
  }
  const data = await r.json();
  _cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function publish({ url, type }) {
  const token = await getAccessToken();
  const r = await fetch(INDEXING_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, type: type || 'URL_UPDATED' }),
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, body };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  // Internal-use endpoint — gate with a shared admin token.
  const adminToken = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
  if (process.env.HIRETRACK_ADMIN_TOKEN && adminToken !== process.env.HIRETRACK_ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const urls = Array.isArray(body?.urls)
    ? body.urls
    : body?.url
      ? [{ url: body.url, type: body.type || 'URL_UPDATED' }]
      : null;
  if (!urls?.length) {
    return res.status(400).json({ ok: false, error: 'Missing url or urls in body.' });
  }
  try {
    const results = [];
    for (const u of urls) {
      results.push({ url: u.url, ...(await publish(u)) });
    }
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
