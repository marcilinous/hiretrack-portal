#!/usr/bin/env node
// Remove "Careers" and "Culture" links from every shared footer nav across the
// site. The pages stay (in case we want to bring them back) — we just stop
// linking to them and let vercel.json redirect requests to /about.html.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SKIP = new Set(['node_modules', '.git', 'tests', 'scripts', 'supabase', 'admin', 'js', 'icons', 'migrations']);

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      await walk(full, acc);
    } else if (e.name.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

const PATTERNS = [
  // careers/culture footer nav entries (with surrounding sep)
  /\s*<a href="[^"]*careers\.html">[^<]*<\/a>\s*<span class="ht-sep">·<\/span>\s*/gi,
  /\s*<a href="[^"]*culture\.html">[^<]*<\/a>\s*<span class="ht-sep">·<\/span>\s*/gi,
];

async function run() {
  const files = await walk(repoRoot);
  files.push(path.join(repoRoot, 'Footer snippet · HTML'));
  let changed = 0;
  for (const f of files) {
    let html;
    try {
      html = await fs.readFile(f, 'utf8');
    } catch {
      continue;
    }
    let next = html;
    for (const re of PATTERNS) next = next.replace(re, '\n      ');
    if (next !== html) {
      await fs.writeFile(f, next, 'utf8');
      changed++;
      console.log('updated:', path.relative(repoRoot, f));
    }
  }
  console.log(`\n${changed} file(s) updated.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
