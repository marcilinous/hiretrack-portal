#!/usr/bin/env node
// Replace the entire .ht-socials block across every HTML page so only LinkedIn
// and Twitter/X remain with real URLs, drop Facebook/YouTube/Instagram, and
// downgrade the "Follow Us" heading to hide if there's nothing to follow.

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

const LI_URL = 'https://www.linkedin.com/company/hiretrack-india/';
const X_URL = 'https://x.com/hiretrack_in';

const REPLACEMENT = `    <div class="ht-socials">
      <a class="ht-social" href="${LI_URL}" target="_blank" rel="noopener" title="LinkedIn" aria-label="HireTrack on LinkedIn">
        <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      </a>
      <a class="ht-social" href="${X_URL}" target="_blank" rel="noopener" title="Twitter / X" aria-label="HireTrack on X">
        <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.7)"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </a>
    </div>`;

// Match the entire socials block.
const SOCIALS_RE = /(?:[ \t]*<p class="ht-follow-label">Follow Us<\/p>\s*<div class="ht-underline"><\/div>\s*)?[ \t]*<div class="ht-socials">[\s\S]*?<\/div>\s*\n?/g;

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

const FOLLOW_LABEL_RE = /[ \t]*<p class="ht-follow-label">Follow Us<\/p>\s*\n[ \t]*<div class="ht-underline"><\/div>\s*\n/;

async function run() {
  const files = await walk(repoRoot);
  // Also include the snippet file (without .html extension).
  const snippet = path.join(repoRoot, 'Footer snippet · HTML');
  try {
    await fs.access(snippet);
    files.push(snippet);
  } catch {}

  let changed = 0;
  for (const file of files) {
    let html = await fs.readFile(file, 'utf8');
    if (!html.includes('ht-socials')) continue;
    const orig = html;

    // 1) Replace the whole socials block (and any preceding "Follow Us" header).
    html = html.replace(/[ \t]*<p class="ht-follow-label">Follow Us<\/p>\s*\n[ \t]*<div class="ht-underline"><\/div>\s*\n[ \t]*<div class="ht-socials">[\s\S]*?<\/div>\s*\n/,
      REPLACEMENT + '\n');

    // 2) If only the standalone <div class="ht-socials"> existed (no label), still swap.
    html = html.replace(/[ \t]*<div class="ht-socials">[\s\S]*?<\/div>\s*\n/, (m) => {
      if (m.includes(LI_URL)) return m;
      return REPLACEMENT + '\n';
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
