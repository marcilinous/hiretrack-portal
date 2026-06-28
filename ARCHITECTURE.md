# HireTrack — Architecture & Development Guide

> **Single source of truth for architecture, code standards, and the path to market-ready production.** Read this end-to-end before making changes. Claude Code: this is your standing instructions; follow it for every task.

---

## 1. Product

HireTrack ([hiretrack.co.in](https://hiretrack.co.in)) is a jobs-first professional network for India's SME hiring market. Two user types — candidates and employers — share a single platform. The product undercuts WorkIndia / Naukri / Indeed on price while serving a defined SME niche.

**Pricing:** Candidates free / ₹49/mo Pro. Employers ₹199/post or ₹499 / ₹999 / ₹2,499 monthly plans. Executive secret unlocks free trials.

---

## 2. Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla JavaScript + HTML + CSS, no build step, no framework |
| Database | Supabase Postgres (project `pdjnpqyzayidthpfmvjk`) |
| Storage | Supabase Storage (`profile-photos`, `resumes` buckets, public with anon INSERT) |
| Hosting | Vercel (`hiretrack-portal` project, auto-deploys from `main`) |
| Auth | Supabase Auth (GoTrue) — email+password and email OTP. Credentials live in `auth.users` (bcrypt); a `handle_new_user()` trigger syncs new signups into `candidates`/`employers`. Migrated from custom auth in v20. |
| AI | Groq LLaMA via `api/ai.js` proxy (JSON mode for quizzes, chat mode for career assistant) |
| Payments | Razorpay (currently in test mode) |
| Email | Resend (pending integration) |
| Repo | github.com/marcilinous/hiretrack-portal |

**No build step.** All JS is plain ES2020+ that browsers run directly. No bundler, no transpiler, no npm dependencies in the frontend. CDN-loaded libraries are loaded via `<script>` tags.

---

## 3. Repository Structure

Target structure (Claude Code: reorganize incrementally as you touch files; don't do a big-bang move):

```
hiretrack-portal/
├── ARCHITECTURE.md             ← This file
├── README.md                   ← Quick start, see §11
├── CHANGELOG.md                ← User-facing changes per release
│
├── index.html                  ← Public landing page
├── jobs.html                   ← Public browse jobs (logged-out users)
├── profile.html                ← Candidate app shell (drawer + hash routes)
├── employer-dashboard.html     ← Employer app (Kanban, jobs, candidates)
├── login.html                  ← Auth pages
├── signup.html
├── employer-signup.html
│
├── admin/                      ← Admin tools (executive-secret gated)
│   ├── dashboard.html
│   └── callbacks.html
│
├── js/                         ← Shared JavaScript modules
│   ├── app.js                  ← Supabase client init, session helpers, globals
│   ├── browse-jobs.js          ← Browse jobs module (Phase B, shared)
│   ├── apply-modal.js          ← Unified apply modal (Phase E, shared)
│   ├── auth.js                 ← Custom auth helpers
│   ├── toast.js                ← showToast() and toast UI
│   └── utils.js                ← escapeHtml(), timeAgo(), debounce(), etc.
│
├── css/
│   ├── tokens.css              ← Design tokens: colors, spacing, fonts, shadows
│   ├── base.css                ← Reset, typography, base elements
│   ├── components.css          ← Reusable components: cards, buttons, badges, modals
│   ├── pages/                  ← Page-specific overrides (one file per page)
│   │   ├── profile.css
│   │   ├── jobs.css
│   │   └── employer-dashboard.css
│   └── mobile.css              ← Single file for all mobile breakpoints
│
├── api/                        ← Vercel serverless functions
│   └── ai.js                   ← Groq proxy
│
├── migrations/                 ← SQL migrations, applied in order
│   ├── v1_init.sql
│   ├── ...
│   └── v9_skill_match_fix.sql
│
└── docs/                       ← Extended documentation
    ├── DEPLOYMENT.md
    ├── SECURITY.md
    └── DECISIONS.md            ← Architecture decision records (ADRs)
```

---

## 4. Code Standards

### JavaScript

- **Vanilla ES2020+.** No frameworks. No JSX. No TypeScript.
- **Async/await** over `.then()`. Always wrap awaited calls in try/catch where failure is recoverable.
- **Modules via globals.** Until/unless we adopt ES modules, scripts expose their API on a single `window.X` namespace (e.g., `window.BrowseJobs`, `window.Toast`). Never pollute `window` with bare function names.
- **Const-first.** Use `const` unless reassignment is needed; then `let`. Never `var`.
- **No `==`.** Always strict equality `===`.
- **Naming:**
  - `camelCase` for variables and functions
  - `PascalCase` for constructors and module namespaces (`BrowseJobs`)
  - `UPPER_SNAKE_CASE` for module-level constants
  - `_underscorePrefix` for module-internal helpers not exposed on the namespace
- **DOM queries cached.** If you query the same element more than once in a function, store the result in a const at the top. Don't re-query inside loops.
- **Event delegation** for dynamic lists (job cards, applications, etc.). Don't attach individual listeners.
- **Error handling:**
  - Every Supabase call must check `.error` and handle it (toast + log + safe fallback)
  - Every `fetch()` must have a try/catch and a timeout (use AbortController, 10s default)
  - Never let an exception bubble up into a blank UI

### CSS

- **Design tokens in `tokens.css`** as CSS custom properties. Reference them everywhere — never hardcode colors, font sizes, or spacing values outside this file.

  ```css
  :root {
    --color-primary: #2563eb;
    --color-text: #1f2937;
    --color-bg: #ffffff;
    --space-1: 4px;  --space-2: 8px;  --space-3: 16px;  --space-4: 24px;
    --radius-sm: 4px;  --radius-md: 8px;  --radius-lg: 16px;
    --font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.1);
  }
  ```

- **Component classes use BEM-like naming.** `.job-card`, `.job-card__title`, `.job-card--featured`. Avoid deep nesting and overly generic class names like `.title`.
- **No inline styles in HTML** except for one-off positional adjustments. Move repeated patterns into a class.
- **Mobile-first.** Default styles are mobile; use `@media (min-width: 768px)` for desktop overrides.
- **Accessibility:** every interactive element gets visible focus styles. Don't `outline: none` without providing an alternative.

### HTML

- **Semantic elements.** `<nav>`, `<main>`, `<article>`, `<section>` — not `<div>` for everything.
- **Forms:** every `<input>` has a `<label>`. Use `type="email"`, `type="tel"`, `type="number"` correctly.
- **Images:** always `alt` attribute. Decorative images get `alt=""`. User-uploaded photos get descriptive alt text.
- **Buttons vs links:** `<button>` for actions, `<a>` for navigation. Don't style links as buttons unless they navigate.
- **ARIA only when semantic HTML isn't enough.** Don't slap `role="button"` on a `<div>`.

### SQL & Database

- **Migrations are numbered and immutable.** Once committed, never edit. Add new migration to fix mistakes.
- **All migrations idempotent.** Use `IF NOT EXISTS`, `IF EXISTS`, `CREATE OR REPLACE`. Safe to re-run.
- **Always wrap in `BEGIN` / `COMMIT`.** Migrations that touch multiple tables must be atomic.
- **Comments explain intent.** Especially policies — what threat model they address, what trust assumption is in play.
- **Indexes:** index any column used in `WHERE`, `JOIN`, or `ORDER BY` that scans more than a few hundred rows. Run `EXPLAIN ANALYZE` on suspect queries.

### Git

- **Commit messages:** imperative present tense, scope-prefixed.
  - `feat(jobs): add skill match filter to browse page`
  - `fix(profile): correct upload path collision on resume replacement`
  - `chore(deps): bump supabase-js to 2.45.0`
  - `docs(architecture): clarify CSS token usage`
- **One logical change per commit.** Don't bundle unrelated fixes.
- **Push to `main`.** No feature branches yet (solo dev). Once a second developer joins, switch to PR-based workflow.

---

## 5. Quality Bar — What "Market Ready" Means

Every feature / page must pass all of these before merge:

### Functional
- [ ] Happy path works end-to-end
- [ ] Empty states designed and rendered ("No jobs match your filters", "No applications yet")
- [ ] Error states designed ("Failed to load. Retry.")
- [ ] Loading states (spinner or skeleton, no blank screens)
- [ ] Form validation: client-side (immediate feedback) + server-side (trust nothing from the browser)

### Responsive
- [ ] Looks correct at 360px, 768px, 1024px, 1440px viewports
- [ ] Touch targets ≥ 44px tall on mobile
- [ ] No horizontal scroll on any viewport
- [ ] Tested on real mobile (Chrome DevTools device mode is not enough — test on actual phone)

### Performance
- [ ] First contentful paint < 2s on 4G simulated network
- [ ] No render-blocking scripts in `<head>` (defer or move to bottom)
- [ ] Images use `loading="lazy"` below the fold
- [ ] Debounce search inputs (300ms)
- [ ] Cache repeated Supabase queries within a session where appropriate (5 min TTL default)
- [ ] No N+1 queries — batch with `.in()` clauses

### Accessibility
- [ ] All interactive elements keyboard-accessible (Tab, Enter, Esc)
- [ ] Visible focus indicators
- [ ] Color contrast ≥ 4.5:1 for normal text, 3:1 for large text
- [ ] Form errors announced (use `aria-live="polite"` regions)
- [ ] Modal traps focus when open, restores on close

### Security
- [ ] No user input rendered without `escapeHtml()` — XSS protection
- [ ] No secrets in client code (only the Supabase **anon** key, never service role)
- [ ] No `eval()` or `new Function()` ever
- [ ] CSP-friendly: no inline event handlers (`onclick=""`), no inline styles where avoidable
- [ ] Files uploaded validated by MIME and size before sending to Storage

### SEO (public pages only — index.html, jobs.html, blog pages)
- [ ] `<title>` tag descriptive and unique per page
- [ ] `<meta name="description">` 150-160 chars
- [ ] Open Graph tags for sharing
- [ ] Semantic heading hierarchy (one `<h1>`, then `<h2>` etc.)
- [ ] Canonical URL set if duplicates exist

### Documentation
- [ ] New shared modules have a header comment explaining purpose and API
- [ ] Non-obvious logic has inline comments explaining the *why*, not the *what*
- [ ] Public-facing changes appear in `CHANGELOG.md`

---

## 6. Claude Code Working Agreement

When working autonomously on this codebase, follow these rules:

### Commit autonomously when
- Bug fixes that don't change behavior beyond the fix
- Style / lint / typo / comment fixes
- Adding tests
- Documentation updates
- Implementing a fully-specced phase from this document

After autonomous commits: run smoke tests (see §7), then `git push`. Report the commit hash and a one-line summary.

### Stop and ask before committing when
- The spec is genuinely ambiguous (don't invent product decisions)
- A change requires a database migration
- A change affects auth, payments, or admin tooling
- A change requires a new environment variable or external service
- A change deletes user data or significantly alters existing rows
- Performance impact is non-trivial (e.g., adding a query inside a render loop)

### Always
- Read the existing code before writing new code; match style, naming, and patterns
- Prefer extending an existing module to creating a new one
- Run `git diff` before committing and re-read it as if you were reviewing someone else's PR
- Use `git log -p <file>` to understand a file's history before significantly modifying it
- If you change a shared module (`js/app.js`, `js/browse-jobs.js`, `css/tokens.css`), check every page that uses it for regressions

### Never
- Commit a file you haven't tested
- Push to `main` directly with broken state (smoke test first)
- Add a dependency without a clear justification
- Disable a check (eslint rule, test, validation) to make code pass — fix the code instead
- Touch `migrations/` files that already exist — add a new numbered migration instead

---

## 7. Smoke Tests

Run these before pushing any change. No automated test framework yet (planned for v2); these are manual checks Claude Code performs.

### Per-page smoke tests

**index.html** — Loads in <2s, hero renders, 6-card job preview shows, "Find Jobs" CTA navigates to jobs.html.

**jobs.html (logged-out, incognito)** — 20 cards initial load, filter bar visible, all filters work (try keyword + location + recency), "Sign in to apply" redirects to login, infinite scroll triggers for remaining jobs.

**profile.html (logged-in candidate)** — Drawer opens via hamburger, bell shows notifications popover, `#jobs` route shows personalized scored jobs, `#profile` shows editable profile with photo upload working, `#applications` shows applied jobs, `#pro` shows interview prep + resume builder sub-tabs.

**employer-dashboard.html (logged-in employer)** — Job list loads, Kanban pipeline renders with candidates in correct columns, candidate modal opens with photo + resume, bulk WhatsApp message works.

**admin/dashboard.html (executive secret)** — All admin tables load, search works, no Supabase JS CSP errors (uses REST API directly per `js/app.js` pattern).

### Cross-cutting smoke tests
- Hard-refresh in incognito on each public page — no console errors
- DevTools → Network → no 4xx/5xx on initial load (other than expected unauthenticated checks)
- Mobile viewport (360px wide) — no horizontal scroll on any page

---

## 8. Remaining Roadmap

### Phase 1 (DONE)
Storage migration for resumes and photos. Buckets created, RLS policies set, base64 → Storage migration completed for 30 candidates. Display logic falls back to base64 for any unmigrated rows.

**Cleanup task (do once stable for 2 weeks):** drop `candidates.profile_photo` and `candidates.resume_data` base64 columns via `migrations/v10_drop_base64.sql`. Reclaims significant DB space.

### Phase 2 (DONE)
Skill match RPC `match_jobs_for_candidate(p_candidate_id UUID)` deployed and verified. Returns scored jobs filtered by `delisted=false AND status='active'`. Score caps at 100% (counts job skills satisfied by user, divided by total job skills).

### Phase 3 — Candidate page restructure (IN PROGRESS)

**A. Drawer + bell shell** (DONE) — profile.html top bar with hamburger + bell, left drawer overlay, hash routing (`#jobs`, `#profile`, `#applications`, `#pro`, `#pro/interview-prep`, `#pro/resume-builder`).

**B. BrowseJobs shared module** (DONE) — `js/browse-jobs.js` with `fetchForGuest`, `fetchForCandidate`, `fetchApplicationStatuses`, `applyClientFilters`, `render`, `setupInfiniteScroll`. Used by jobs.html and profile.html.

**C. BrowseJobs in jobs.html** (DONE) — public browse page uses the shared module, new filter bar, infinite scroll, "Sign in to apply" CTA for logged-out users.

**D. BrowseJobs in profile.html `#jobs` route** (DONE — commit 560c459) — `BrowseJobs.fetchForCandidate` + `fetchApplicationStatuses` run in parallel. Filter bar with keyword, location chips, job type, experience, salary, recency, match-score dropdown ("Any", "50%+", "70%+", "90%+"), and sort (Best Match / Most Recent). `loadInlineJobs`/`inlineJobsLoaded` deleted.

**E. Unified apply modal** (DONE — commit ed4365f) — `js/apply-modal.js` shared between jobs.html and profile.html. Shows job description, skills, salary, experience, location, job_type. "Apply Now" + "WhatsApp" CTAs; logged-out users see "Sign in to apply" redirect. Per-page modal code deleted.

**F. Mobile pass + polish** (DONE — commit 3c35519) — Filter bar collapses to bottom sheet (`pjf-sh-bd`) at ≤768px. Drawer full-width at ≤400px. Bell popover polished.

### Phase 3 complete. Next: Phase 4.

### Phase 4 — Feed (NOT STARTED)

Jobs-first professional social network. Candidates post updates (text, image, link), follow other candidates and companies, like and comment. Surface in a feed on profile.html as a new `#feed` route in the drawer.

**Architecture sketch** (refine when starting):
- New tables: `feed_posts` (12 cols already exist), `feed_likes`, `feed_comments`, `follows`
- Realtime updates via Supabase Realtime channels (subscribe to insertions on `feed_posts` for followed entities)
- Post composer: text + optional image (upload to `feed-media` bucket, new) + optional URL preview
- Surface algorithm: chronological for v1; engagement-weighted ranking in a later iteration
- Pro features: longer posts, multiple images, analytics on post reach

**Open decisions to discuss when this phase starts:**
- Are companies first-class feed participants, or only individual employer accounts?
- How does the feed interact with job postings? (Should a new job auto-post?)
- Moderation strategy — auto-flag, manual review, or community-flag?

### Phase 5 — Chat (NOT STARTED)

Direct messaging between candidates and employers (in lieu of WhatsApp for Pro users). Tables `conversations` (9 cols) and `messages` (15 cols) already exist. Realtime via Supabase Realtime. Architecture details deferred until Phase 4 lands.

### Phase 6 — Employer app separation (NOT STARTED)

Split into two repos: `hiretrack-candidate` (this repo, candidate-facing) and `hiretrack-employer` (employer-facing). Both deploy to `hiretrack.co.in` via a single Vercel project with rewrites. Shared modules (Supabase client init, design tokens) extracted into a third repo or NPM package.

Justification: codebases are diverging; separation lets each iterate independently and reduces accidental coupling. Defer until both surfaces are stable.

---

## 9. Future Work (post-roadmap)

### Supabase Auth migration (DONE)

Completed across v20–v35. The app no longer uses custom table-stored passwords:
1. **v20** — migrated all existing candidates/employers into `auth.users` (bcrypt), added the `handle_new_user()` trigger that syncs new GoTrue signups into the profile tables, and enabled RLS with `auth.uid()` policies.
2. Frontend uses GoTrue end-to-end (`app.js`: `signUp`, `signInWithPassword`, `signInWithOtp`, `verifyOtp`, `resetPasswordForEmail`, `updateUser`).
3. **v22** dropped `NOT NULL` on the legacy `password` columns; **v29** scrubbed them to NULL.
4. **v26 / v30 / v31** consolidated RLS policies (candidates, employers, jobs, applications, notifications, saved_jobs, conversations, messages, feed_*). Service-role-only CRM tables (`executives`, `callback_requests`, …) are RLS-on / no-policy, accessed via the service key in `api/*.js`.
5. **v35** dropped the dead `password` columns entirely.

**Remaining hardening (in progress):** the `candidates`/`employers` `SELECT` policies were `USING (true)` (full public read of PII). Being tightened to owner + relationship reads, with public-safe views (`candidates_public`, `employers_public`) and a `search_talent` RPC that gates candidate mobile behind a paid employer plan or an existing application. See v36/v37.

### Orphan storage cleanup

With UUID-based file paths in Storage, every upload creates a new object and old ones become orphans. Weekly cron (Vercel cron or GitHub Actions) that:
1. Lists all files in `profile-photos` and `resumes`
2. Cross-references against `candidates.photo_url` and `candidates.resume_url`
3. Deletes any file with no DB reference older than 7 days

Negligible cost today (~30 candidates, kilobytes of orphans). Schedule when user base hits 1k.

### CI/CD

Add `.github/workflows/ci.yml`:
- HTML validation (W3C validator action)
- ESLint on JS files (after writing `.eslintrc`)
- Stylelint on CSS files
- Lighthouse CI on key pages (jobs.html, profile.html)
- Block PRs that fail any check

### Observability

- Vercel Analytics (free tier) for traffic
- Sentry (free tier) for client-side errors
- Supabase dashboard for DB / Storage monitoring
- A simple `/health` endpoint reporting DB connectivity

### Testing

Currently zero automated tests. Add when v2 of the codebase stabilizes:
1. Unit tests for `js/utils.js` (escapeHtml, timeAgo, debounce) using a lightweight runner (Mocha or Vitest)
2. Integration tests for key Supabase queries (jobs visibility filter, skill match RPC scoring)
3. E2E tests for critical flows (signup → upload resume → apply to job) using Playwright

Don't add testing infrastructure mid-feature; ship Phases 3–6 first, then build the test harness against a stable surface.

---

## 10. Decisions Log

Major architecture decisions and their rationale. New decisions appended to `docs/DECISIONS.md`.

| Date | Decision | Rationale |
|---|---|---|
| 2025 | Vanilla JS, no framework | Solo dev, faster iteration, no build complexity |
| 2025 | Custom auth (not Supabase Auth) | Speed to market; defer auth complexity until scale demands |
| 2026 | Storage with UUID paths | Sidesteps RLS upsert complications; orphan cleanup is cheap |
| 2026 | Single canonical visibility filter `delisted=false AND status='active'` | Eliminates the dual-column inconsistency that caused profile.html and jobs.html to show different job sets |
| 2026 | Match score counts job skills satisfied (capped at 100%) | Semantically correct: % of job's required skills the candidate has |
| 2026 | Migrated to Supabase Auth + RLS (v20–v35) | Custom table-stored passwords were unscalable and unsafe; GoTrue + `auth.uid()` RLS scopes data access to the logged-in user |
| 2026 | Candidate/employer PII served via public-safe views + gated RPC, base tables owner+relationship only | `USING (true)` exposed every email/mobile to any anon-key holder; views expose only safe columns, `search_talent` reveals mobile only to paid/applied employers |

---

## 11. README.md (rewrite when reorganizing)

The repo's `README.md` should be a developer-facing quick start, NOT a marketing page:

```markdown
# HireTrack Portal

Jobs-first professional network for India's SME hiring market.
Production: https://hiretrack.co.in

## Quick start (developer)

This is a no-build vanilla JS app. To work on it:

1. Clone the repo
2. Open `index.html` in a browser (or run `python3 -m http.server` from the repo root)
3. To connect to the production Supabase: anon key is already in `js/app.js`
4. To deploy: push to `main`, Vercel auto-deploys

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full guide.

## Code standards

See [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-code-standards).

## Roadmap

See [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-remaining-roadmap).
```

---

## 12. Standing Instructions for Claude Code (TL;DR)

1. **Read this entire document** at the start of each new session before doing anything else.
2. **Match existing patterns** — read neighboring code before writing new code.
3. **Run §7 smoke tests** before pushing.
4. **Commit autonomously** within the rules in §6; otherwise stop and ask.
5. **Follow §5 quality bar** — every change has empty/loading/error states, is responsive, escapes user input, has visible focus on interactive elements.
6. **Reference §3 repo structure** when creating new files. Don't dump files at the root.
7. **Update this document** when major architecture decisions are made — append to §10 Decisions Log.
8. **Phase order:** complete the TODO phases in §8 in order (D → E → F → 4 → 5 → 6). Don't skip ahead.
9. **When stuck**, summarize what you tried, what failed, and what you'd try next — then stop and ask the human. Don't spin on a bug for more than 3 attempts.

---

*End of document. Last updated: 2026-05. Maintained by Sachin + Claude (architecture) + Claude Code (implementation).*
