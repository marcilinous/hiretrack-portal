#!/usr/bin/env node
// Insert a "Bengaluru, Karnataka, India" line above the copyright in every
// shared footer (idempotent — skips files that already have it).

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const SKIP = new Set([
  'node_modules',
  '.git',
  'tests',
  'scripts',
  'supabase',
  'admin',
  'js',
  'icons',
  'migrations',
]);

const ADDRESS_LINE =
  '<p class="ht-address" style="font-size:0.78rem;color:rgba(255,255,255,0.55);margin:0 0 0.35rem;">📍 Bengaluru, Karnataka, India</p>';

async function walk(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      await walk(full, acc);
    } else if (entry.name.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

const FOOTER_BOTTOM_RE =
  /(<div class="ht-footer-bottom">\s*\n?)(\s*)(<p>[\s\S]*?HireTrack)/;

async function run() {
  const files = await walk(repoRoot);
  const snippet = path.join(repoRoot, 'Footer snippet · HTML');
  try {
    await fs.access(snippet);
    files.push(snippet);
  } catch {}

  let changed = 0;
  for (const file of files) {
    let html = await fs.readFile(file, 'utf8');
    if (!html.includes('ht-footer-bottom')) continue;
    if (html.includes('class="ht-address"')) continue; // already done
    const orig = html;
    html = html.replace(FOOTER_BOTTOM_RE, (m, open, indent, copy) => {
      return open + indent + ADDRESS_LINE + '\n' + indent + copy;
    });
    if (html !== orig) {
      await fs.writeFile(file, html, 'utf8');
      changed++;
      console.log('updated:', path.relative(repoRoot, file));
    }
  }
  console.log(`\n${changed} file(s) updated.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
