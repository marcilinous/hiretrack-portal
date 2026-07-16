#!/usr/bin/env node
// Inject a BreadcrumbList JSON-LD <script> into every legacy static blog post
// that doesn't already have one. Idempotent — skips files already covered.
//
// Title is extracted from <title>...</title>; canonical from <link rel="canonical">.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const BASE = 'https://www.hiretrack.co.in';

function esc(s) {
  return String(s == null ? '' : s).replace(/[<&]/g, (c) => ({ '<': '&lt;', '&': '&amp;' })[c]);
}

const TARGET_DIRS = [path.join(repoRoot, 'blog')];
const TARGET_ROOT_FILES = [
  'best-free-job-portals-india-2025.html',
  'data-analyst-interview-preparation.html',
  'fresher-resume-india-2025.html',
  'how-to-post-job-free-india.html',
  'hr-jobs-india-salary-skills-2025.html',
  'it-jobs-bengaluru-2025.html',
  'mis-executive-salary-india-2025.html',
  'whatsapp-apply-future-job-applications-india.html',
];

async function listHtml(dir) {
  const out = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.html')) out.push(path.join(dir, e.name));
    }
  } catch {}
  return out;
}

function inject(html, filePath) {
  if (html.includes('"@type": "BreadcrumbList"') || html.includes('"@type":"BreadcrumbList"')) {
    return null; // already has it
  }
  const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
  const canonMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (!titleMatch || !canonMatch) return null;
  const title = titleMatch[1].split('|')[0].trim();
  const url = canonMatch[1];
  const isInBlog = filePath.includes(path.sep + 'blog' + path.sep);
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: isInBlog ? 'Blog' : 'Home', item: isInBlog ? `${BASE}/blog.html` : `${BASE}/` },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  };
  const tag = `<script type="application/ld+json">${JSON.stringify(breadcrumb)}</script>`;
  return html.replace('</head>', `${tag}\n</head>`);
}

async function main() {
  const files = [];
  for (const d of TARGET_DIRS) files.push(...(await listHtml(d)));
  for (const f of TARGET_ROOT_FILES) {
    const full = path.join(repoRoot, f);
    try {
      await fs.access(full);
      files.push(full);
    } catch {}
  }

  let updated = 0;
  for (const file of files) {
    const html = await fs.readFile(file, 'utf8');
    const next = inject(html, file);
    if (next && next !== html) {
      await fs.writeFile(file, next, 'utf8');
      updated++;
      console.log('updated:', path.relative(repoRoot, file));
    }
  }
  console.log(`\n${updated} file(s) updated.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
