#!/usr/bin/env node
// scripts/generate-homepage-data.js
//
// Bakes a snapshot of category counts + the top hiring companies into
// homepage-data.json. The homepage JS loads this synchronously so the
// "Browse by Category" cards and "Companies Hiring Now" strip render
// with real numbers before any Supabase round-trip.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/generate-homepage-data.js

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SB_URL = process.env.SUPABASE_URL || 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SB_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY env var is required.');
  process.exit(1);
}

const CAT_RULES = [
  { key: 'data', label: 'Data Analyst', kw: ['data analyst', 'data analysis', 'analytics', 'business analyst', 'data scientist', 'bi analyst', 'power bi', 'tableau', 'mis'] },
  { key: 'sales', label: 'Sales', kw: ['sales', 'business development', 'bde', 'bdm', 'account manager', 'key account', 'inside sales'] },
  { key: 'marketing', label: 'Marketing', kw: ['marketing', 'digital marketing', 'seo', 'social media', 'content', 'brand', 'growth', 'performance'] },
  { key: 'it', label: 'IT & Software', kw: ['software', 'developer', 'engineer', 'it support', 'backend', 'frontend', 'full stack', 'devops', 'python', 'java', 'react', 'node', 'cloud', 'cyber'] },
  { key: 'finance', label: 'Finance & Accounts', kw: ['finance', 'accounts', 'accountant', 'ca ', 'chartered', 'taxation', 'audit', 'tally', 'gst', 'bookkeeping', 'payroll'] },
  { key: 'ops', label: 'Operations', kw: ['operations', 'ops', 'coordinator', 'mis executive', 'supply chain', 'process', 'back office', 'admin'] },
  { key: 'hr', label: 'HR & Recruitment', kw: ['hr ', 'human resources', 'recruitment', 'talent acquisition', 'hrbp', 'hr executive', 'hr manager'] },
  { key: 'logistics', label: 'Logistics', kw: ['logistics', 'warehouse', 'dispatch', 'procurement', 'inventory', 'transport', 'fleet'] },
];

async function fetchJobs() {
  const url = `${SB_URL}/rest/v1/jobs?select=title,company,skills,description,expires_at,delisted&delisted=eq.false&limit=10000`;
  const r = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase REST ${r.status}: ${await r.text()}`);
  const all = await r.json();
  const now = Date.now();
  return all.filter((j) => !j.expires_at || new Date(j.expires_at).getTime() > now);
}

function categoryCounts(jobs) {
  const out = {};
  for (const rule of CAT_RULES) {
    out[rule.key] = jobs.filter((j) => {
      const hay = ((j.title || '') + ' ' + (j.skills || '') + ' ' + (j.description || '')).toLowerCase();
      return rule.kw.some((k) => hay.includes(k));
    }).length;
  }
  return out;
}

function companyCounts(jobs) {
  const counts = new Map();
  for (const j of jobs) {
    if (!j.company) continue;
    counts.set(j.company, (counts.get(j.company) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));
}

async function main() {
  console.log('[generate-homepage-data] Fetching jobs …');
  const jobs = await fetchJobs();
  const data = {
    generated_at: new Date().toISOString(),
    total_jobs: jobs.length,
    categories: categoryCounts(jobs),
    companies: companyCounts(jobs),
  };
  const target = path.join(repoRoot, 'homepage-data.json');
  await fs.writeFile(target, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[generate-homepage-data] Wrote ${target}.`);
  console.log(`  Total active jobs: ${data.total_jobs}`);
  console.log(`  Companies: ${data.companies.length}`);
}

main().catch((e) => {
  console.error('[generate-homepage-data] FAILED:', e);
  process.exit(1);
});
