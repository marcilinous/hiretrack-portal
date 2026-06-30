#!/usr/bin/env node
// scripts/submit-all-jobs-to-google.js
//
// Bulk-submits every active HireTrack job URL to Google's Indexing API. Use
// this once after building the initial /jobs/<slug>.html SSG, then rely on
// the per-post webhook (Supabase → /api/index-job) for ongoing updates.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY  — to read active jobs
//   GOOGLE_INDEXING_API_KEY              — service-account JSON
//   SITE_BASE_URL                        — defaults to https://www.hiretrack.co.in
//
// Note: Google's Indexing API has a 200 URL/day quota by default. This script
// pages through one URL at a time with a 250ms gap so a single run typically
// completes under the quota.

import crypto from 'node:crypto';

const SB_URL = process.env.SUPABASE_URL || 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE = process.env.SITE_BASE_URL || 'https://www.hiretrack.co.in';
const SCOPE = 'https://www.googleapis.com/auth/indexing';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const INDEXING_API = 'https://indexing.googleapis.com/v3/urlNotifications:publish';

function need(name) {
  if (!process.env[name]) {
    console.error(`ERROR: ${name} env var is required.`);
    process.exit(1);
  }
}
need('SUPABASE_SERVICE_KEY');
need('GOOGLE_INDEXING_API_KEY');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function shortId(id) {
  return String(id || '').replace(/-/g, '').slice(0, 8);
}

function jobSlug(job) {
  const parts = [job.title, job.company, job.city || job.location]
    .filter(Boolean)
    .map(slugify)
    .filter(Boolean);
  return (parts.join('-') || 'job') + '-' + shortId(job.id);
}

function base64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken() {
  const key = JSON.parse(process.env.GOOGLE_INDEXING_API_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const sig = signer
    .sign(key.private_key)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const jwt = `${header}.${claims}.${sig}`;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error(`token: ${r.status} ${await r.text()}`);
  const data = await r.json();
  return data.access_token;
}

async function publish(token, url, type = 'URL_UPDATED') {
  const r = await fetch(INDEXING_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, type }),
  });
  return { ok: r.ok, status: r.status, body: await r.text() };
}

async function main() {
  console.log('[submit-jobs] Fetching active jobs …');
  const r = await fetch(
    `${SB_URL}/rest/v1/jobs?select=id,title,company,location,city,expires_at,delisted&delisted=eq.false&limit=5000`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  if (!r.ok) throw new Error(`supabase: ${r.status} ${await r.text()}`);
  const jobs = (await r.json()).filter(
    (j) => !j.expires_at || new Date(j.expires_at).getTime() > Date.now()
  );
  console.log(`[submit-jobs] ${jobs.length} job URLs to submit.`);

  const token = await getAccessToken();
  let ok = 0;
  let failed = 0;
  for (const j of jobs) {
    const url = `${BASE}/jobs/${jobSlug(j)}.html`;
    const result = await publish(token, url, 'URL_UPDATED');
    if (result.ok) ok++;
    else failed++;
    console.log(`[${result.status}] ${url}`);
    await new Promise((res) => setTimeout(res, 250));
  }
  console.log(`\nDone. ${ok} submitted, ${failed} failed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
