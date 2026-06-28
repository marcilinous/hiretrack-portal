/**
 * lead-funnel.js — B2B Lead Qualification Funnel (vanilla equivalent of the
 * requested LeadQualificationFunnel.tsx).
 *
 * HireTrack is a no-build, vanilla-JS app (see ARCHITECTURE.md §4: no React, no
 * TypeScript, no bundler), so the React/RHF/Zod/@calcom/embed-react spec is
 * implemented with the same architecture using plain DOM + a small validation
 * schema + Cal.com's official *vanilla* inline embed (the non-React twin of
 * getCalApi()/<Cal/>). Behaviour matches the spec exactly:
 *
 *   Step 1  — Volume filter: 1-10 / 11-50 / 50+ roles annually.
 *   Step 2A — Standard flow (1–50): Full Name, Company, Work Email → /api/leads.
 *   Step 2B — Enterprise fast-track (50+): bypass the form, render the Cal.com
 *             inline embed for calLink "hiretrack-enterprise/demo".
 *
 * Usage:  <div id="lead-funnel"></div>
 *         LeadFunnel.mount('#lead-funnel');
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  const CAL_LINK = 'hiretrack-enterprise/demo';
  const CAL_NAMESPACE = 'demo';
  const LEADS_ENDPOINT = '/api/leads';

  /** @typedef {{ id:string, title:string, sub:string, icon:string, segment:'standard'|'enterprise', badge?:string }} VolumeOption */
  /** @type {VolumeOption[]} */
  const VOLUME_OPTIONS = [
    { id: '1-10', title: '1–10 Roles', sub: 'Local Shop', icon: '🏪', segment: 'standard' },
    { id: '11-50', title: '11–50 Roles', sub: 'Growth', icon: '📈', segment: 'standard' },
    {
      id: '50+',
      title: '50+ Roles',
      sub: 'Enterprise / BPO',
      icon: '🏢',
      segment: 'enterprise',
      badge: 'Priority',
    },
  ];

  // Free/personal mailboxes are rejected — the funnel exists to capture corporate
  // intent, so a gmail/yahoo address fails the "work email" check.
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

  // ── Validation schema (Zod-equivalent) ───────────────────────────────────────
  // Each validator returns null when valid, or an error string. Centralised so the
  // rules read like a schema and stay in lockstep with the server (api/leads.js).
  const schema = {
    name(v) {
      const s = (v || '').trim();
      if (s.length < 2) return 'Please enter your full name.';
      return null;
    },
    company(v) {
      const s = (v || '').trim();
      if (s.length < 2) return 'Please enter your company name.';
      return null;
    },
    workEmail(v) {
      const s = (v || '').trim().toLowerCase();
      if (!EMAIL_RE.test(s)) return 'Please enter a valid work email.';
      const domain = s.split('@')[1] || '';
      if (FREE_EMAIL_DOMAINS.has(domain))
        return 'Please use your company email (not a personal one).';
      return null;
    },
  };

  // ── State ────────────────────────────────────────────────────────────────────
  const state = {
    root: null,
    step: 1,
    /** @type {VolumeOption|null} */
    selected: null,
    submitting: false,
    calLoaded: false,
  };

  // ── Styles (scoped under .lqf-*) ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('lqf-styles')) return;
    const css = `
.lqf-wrap{--lqf-blue:#2563eb;--lqf-ink:#0f172a;--lqf-muted:#64748b;--lqf-line:#e5e7eb;--lqf-bg:#ffffff;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;color:var(--lqf-ink);
  max-width:560px;margin:0 auto;}
.lqf-card{background:var(--lqf-bg);border:1px solid var(--lqf-line);border-radius:20px;
  padding:2.5rem;box-shadow:0 1px 2px rgba(15,23,42,.04),0 12px 32px rgba(15,23,42,.06);}
.lqf-steps{display:flex;align-items:center;gap:8px;margin-bottom:1.75rem;}
.lqf-dot{height:6px;border-radius:999px;background:var(--lqf-line);flex:1;transition:background .25s;}
.lqf-dot.is-active{background:var(--lqf-blue);}
.lqf-eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--lqf-blue);margin-bottom:.6rem;}
.lqf-title{font-size:1.5rem;line-height:1.25;font-weight:800;letter-spacing:-.01em;margin:0 0 .5rem;}
.lqf-sub{font-size:.95rem;color:var(--lqf-muted);margin:0 0 1.75rem;line-height:1.5;}
.lqf-options{display:flex;flex-direction:column;gap:.85rem;}
.lqf-option{display:flex;align-items:center;gap:1rem;width:100%;text-align:left;cursor:pointer;
  background:#fff;border:1.5px solid var(--lqf-line);border-radius:14px;padding:1.1rem 1.25rem;
  transition:border-color .18s,box-shadow .18s,transform .18s;font-family:inherit;}
.lqf-option:hover{border-color:var(--lqf-blue);box-shadow:0 6px 18px rgba(37,99,235,.12);transform:translateY(-1px);}
.lqf-option:focus-visible{outline:none;border-color:var(--lqf-blue);box-shadow:0 0 0 3px rgba(37,99,235,.25);}
.lqf-opt-ic{font-size:1.6rem;width:48px;height:48px;flex:0 0 48px;display:flex;align-items:center;
  justify-content:center;background:#f1f5f9;border-radius:12px;}
.lqf-opt-body{flex:1;min-width:0;}
.lqf-opt-title{font-size:1rem;font-weight:700;display:flex;align-items:center;gap:.5rem;}
.lqf-opt-sub{font-size:.84rem;color:var(--lqf-muted);margin-top:2px;}
.lqf-opt-arrow{color:#cbd5e1;font-size:1.25rem;transition:color .18s,transform .18s;}
.lqf-option:hover .lqf-opt-arrow{color:var(--lqf-blue);transform:translateX(3px);}
.lqf-badge{font-size:.62rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#fff;
  background:linear-gradient(135deg,#2563eb,#7c3aed);padding:3px 8px;border-radius:999px;}
.lqf-field{margin-bottom:1.15rem;}
.lqf-label{display:block;font-size:.82rem;font-weight:600;margin-bottom:.4rem;}
.lqf-input{width:100%;box-sizing:border-box;border:1.5px solid var(--lqf-line);border-radius:10px;
  padding:.8rem .9rem;font-size:.95rem;font-family:inherit;color:var(--lqf-ink);transition:border-color .15s,box-shadow .15s;}
.lqf-input::placeholder{color:#94a3b8;}
.lqf-input:focus{outline:none;border-color:var(--lqf-blue);box-shadow:0 0 0 3px rgba(37,99,235,.18);}
.lqf-input.has-error{border-color:#dc2626;}
.lqf-input.has-error:focus{box-shadow:0 0 0 3px rgba(220,38,38,.18);}
.lqf-hint{font-size:.76rem;color:var(--lqf-muted);margin-top:.35rem;}
.lqf-err{font-size:.78rem;color:#dc2626;margin-top:.35rem;min-height:1em;}
.lqf-btn{width:100%;border:none;border-radius:10px;background:var(--lqf-blue);color:#fff;
  font-size:.98rem;font-weight:700;font-family:inherit;padding:.9rem 1rem;cursor:pointer;
  transition:background .15s,opacity .15s;margin-top:.5rem;}
.lqf-btn:hover{background:#1d4ed8;}
.lqf-btn:disabled{opacity:.6;cursor:not-allowed;}
.lqf-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;cursor:pointer;
  color:var(--lqf-muted);font-size:.85rem;font-weight:600;font-family:inherit;padding:0;margin-bottom:1.1rem;}
.lqf-back:hover{color:var(--lqf-ink);}
.lqf-formerr{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;
  padding:.7rem .9rem;font-size:.85rem;margin-bottom:1.1rem;}
.lqf-trust{display:flex;align-items:center;gap:.5rem;justify-content:center;margin-top:1.25rem;
  font-size:.78rem;color:var(--lqf-muted);}
.lqf-cal{width:100%;height:640px;overflow:scroll;border:1px solid var(--lqf-line);border-radius:14px;}
.lqf-success{text-align:center;padding:1rem 0;}
.lqf-success .lqf-check{width:64px;height:64px;border-radius:50%;background:#ecfdf5;color:#059669;
  font-size:2rem;display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;}
.lqf-pill{display:inline-block;font-size:.72rem;font-weight:700;color:#475569;background:#f1f5f9;
  border-radius:999px;padding:4px 12px;margin-bottom:1rem;}
@media (max-width:560px){ .lqf-card{padding:1.6rem;border-radius:16px;} .lqf-title{font-size:1.3rem;} }
`;
    const el = document.createElement('style');
    el.id = 'lqf-styles';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ── Small DOM helpers ────────────────────────────────────────────────────────
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function stepDots(active) {
    return h('div', { class: 'lqf-steps' }, [
      h('span', { class: 'lqf-dot is-active' }),
      h('span', { class: 'lqf-dot' + (active >= 2 ? ' is-active' : '') }),
    ]);
  }

  function render() {
    const card = h('div', { class: 'lqf-card' }, [
      state.step === 1 ? renderStep1() : null,
      state.step === 2 && state.selected && state.selected.segment === 'standard'
        ? renderStandard()
        : null,
      state.step === 2 && state.selected && state.selected.segment === 'enterprise'
        ? renderEnterprise()
        : null,
    ]);
    state.root.innerHTML = '';
    state.root.appendChild(h('div', { class: 'lqf-wrap' }, [card]));
  }

  // ── Step 1: Volume filter ────────────────────────────────────────────────────
  function renderStep1() {
    const opts = VOLUME_OPTIONS.map((opt) =>
      h('button', { class: 'lqf-option', type: 'button', onClick: () => selectVolume(opt) }, [
        h('span', { class: 'lqf-opt-ic', text: opt.icon }),
        h('span', { class: 'lqf-opt-body' }, [
          h('span', { class: 'lqf-opt-title' }, [
            opt.title,
            opt.badge ? h('span', { class: 'lqf-badge', text: opt.badge }) : null,
          ]),
          h('span', { class: 'lqf-opt-sub', text: opt.sub }),
        ]),
        h('span', { class: 'lqf-opt-arrow', text: '→' }),
      ])
    );

    return h('div', null, [
      stepDots(1),
      h('div', { class: 'lqf-eyebrow', text: "Let's route you to the right team" }),
      h('h2', { class: 'lqf-title', text: 'How many roles are you looking to fill annually?' }),
      h('p', {
        class: 'lqf-sub',
        text: 'Pick a range — it tailors the next step to your hiring volume.',
      }),
      h('div', { class: 'lqf-options' }, opts),
    ]);
  }

  function selectVolume(opt) {
    state.selected = opt;
    state.step = 2;
    render();
  }

  function goBack() {
    state.step = 1;
    state.selected = null;
    render();
  }

  // ── Step 2A: Standard flow ───────────────────────────────────────────────────
  function renderStandard() {
    const field = (id, label, type, placeholder, hint) =>
      h('div', { class: 'lqf-field' }, [
        h('label', { class: 'lqf-label', for: 'lqf-' + id, text: label }),
        h('input', { class: 'lqf-input', id: 'lqf-' + id, type, placeholder, autocomplete: 'on' }),
        hint ? h('div', { class: 'lqf-hint', text: hint }) : null,
        h('div', { class: 'lqf-err', id: 'lqf-err-' + id }),
      ]);

    const form = h(
      'form',
      { class: 'lqf-form', novalidate: 'novalidate', onSubmit: onStandardSubmit },
      [
        h('div', { class: 'lqf-formerr', id: 'lqf-formerr', style: 'display:none' }),
        field('name', 'Full name', 'text', 'Priya Sharma'),
        field('company', 'Company name', 'text', 'Acme Technologies Pvt Ltd'),
        field(
          'workEmail',
          'Work email',
          'email',
          'priya@acme.com',
          'Use your company email — we send a secure sign-in link.'
        ),
        h('button', { class: 'lqf-btn', type: 'submit', id: 'lqf-submit', text: 'Get started →' }),
        h('div', { class: 'lqf-trust' }, [
          h('span', { text: '🔒' }),
          h('span', { text: 'No spam. We only use this to set up your account.' }),
        ]),
      ]
    );

    return h('div', null, [
      stepDots(2),
      h('button', { class: 'lqf-back', type: 'button', onClick: goBack }, [
        h('span', { text: '←' }),
        'Back',
      ]),
      h('span', { class: 'lqf-pill', text: state.selected.title + ' · ' + state.selected.sub }),
      h('h2', { class: 'lqf-title', text: 'Create your hiring account' }),
      h('p', {
        class: 'lqf-sub',
        text: "Tell us where to send your secure sign-in link and we'll get you set up.",
      }),
      form,
    ]);
  }

  function setFieldError(id, msg) {
    const input = document.getElementById('lqf-' + id);
    const err = document.getElementById('lqf-err-' + id);
    if (input) input.classList.toggle('has-error', Boolean(msg));
    if (err) err.textContent = msg || '';
  }

  async function onStandardSubmit(e) {
    e.preventDefault();
    if (state.submitting) return;

    const values = {
      name: document.getElementById('lqf-name').value,
      company: document.getElementById('lqf-company').value,
      workEmail: document.getElementById('lqf-workEmail').value,
    };

    let firstBad = null;
    Object.keys(schema).forEach((key) => {
      const msg = schema[key](values[key]);
      setFieldError(key, msg);
      if (msg && !firstBad) firstBad = key;
    });
    if (firstBad) {
      const el = document.getElementById('lqf-' + firstBad);
      if (el) el.focus();
      return;
    }

    const btn = document.getElementById('lqf-submit');
    const formErr = document.getElementById('lqf-formerr');
    formErr.style.display = 'none';
    state.submitting = true;
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const resp = await fetch(LEADS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          company: values.company.trim(),
          workEmail: values.workEmail.trim().toLowerCase(),
          annualVolume: state.selected.id,
        }),
      });
      const result = await resp.json().catch(() => ({ ok: false }));
      if (!resp.ok || !result.ok) {
        throw new Error(result.error || 'Something went wrong. Please try again.');
      }
      renderSuccess(values);
    } catch (err) {
      formErr.textContent = err.message || 'Could not submit. Please try again.';
      formErr.style.display = 'block';
      state.submitting = false;
      btn.disabled = false;
      btn.textContent = 'Get started →';
    }
  }

  function renderSuccess(values) {
    state.submitting = false;
    const card = h('div', { class: 'lqf-card' }, [
      h('div', { class: 'lqf-success' }, [
        h('div', { class: 'lqf-check', text: '✓' }),
        h('h2', { class: 'lqf-title', text: 'Check your inbox' }),
        h('p', { class: 'lqf-sub' }, [
          'We sent a secure sign-in link to ',
          h('strong', { text: values.workEmail.trim().toLowerCase() }),
          '. Click it to finish setting up ' + values.company.trim() + ' on HireTrack.',
        ]),
        h('div', { class: 'lqf-trust' }, [
          h('span', { text: '📨' }),
          h('span', { text: "Didn't get it? Check spam or contact our team." }),
        ]),
      ]),
    ]);
    state.root.innerHTML = '';
    state.root.appendChild(h('div', { class: 'lqf-wrap' }, [card]));
  }

  // ── Step 2B: Enterprise fast-track (Cal.com inline embed) ─────────────────────
  // Vanilla twin of @calcom/embed-react's getCalApi()/<Cal/>: load the official
  // embed loader once, then bind the inline calendar to our container.
  function loadCalApi() {
    if (state.calLoaded) return;
    (function (C, A, L) {
      const p = function (a, ar) {
        a.q.push(ar);
      };
      const d = C.document;
      C.Cal =
        C.Cal ||
        function () {
          const cal = C.Cal;
          const ar = arguments;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            d.head.appendChild(d.createElement('script')).src = A;
            cal.loaded = true;
          }
          if (ar[0] === L) {
            const api = function () {
              p(api, arguments);
            };
            const namespace = ar[1];
            api.q = api.q || [];
            if (typeof namespace === 'string') {
              cal.ns[namespace] = cal.ns[namespace] || api;
              p(cal.ns[namespace], ar);
              p(cal, ['initNamespace', namespace]);
            } else {
              p(cal, ar);
            }
            return;
          }
          p(cal, ar);
        };
    })(window, 'https://app.cal.com/embed/embed.js', 'init');
    state.calLoaded = true;
  }

  function initCalInline() {
    loadCalApi();
    window.Cal('init', CAL_NAMESPACE, { origin: 'https://cal.com' });
    window.Cal.ns[CAL_NAMESPACE]('inline', {
      elementOrSelector: '#lqf-cal-inline',
      calLink: CAL_LINK,
      config: { layout: 'month_view' },
    });
    window.Cal.ns[CAL_NAMESPACE]('ui', { hideEventTypeDetails: false, layout: 'month_view' });
  }

  function renderEnterprise() {
    const node = h('div', null, [
      stepDots(2),
      h('button', { class: 'lqf-back', type: 'button', onClick: goBack }, [
        h('span', { text: '←' }),
        'Back',
      ]),
      h('span', {
        class: 'lqf-badge',
        text: 'Enterprise / BPO · Priority',
        style: 'display:inline-block;margin-bottom:1rem;',
      }),
      h('h2', { class: 'lqf-title', text: 'Book your enterprise demo' }),
      h('p', {
        class: 'lqf-sub',
        text: 'Hiring 50+ roles? Skip the form — grab time with our enterprise team for a white-glove walkthrough, volume pricing and a dedicated account manager.',
      }),
      h('div', { class: 'lqf-cal', id: 'lqf-cal-inline' }),
    ]);
    // Initialise after the container is in the DOM (mirrors the useEffect in the
    // React spec, which runs getCalApi() on mount).
    setTimeout(initCalInline, 0);
    return node;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  function mount(selector) {
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root) return;
    injectStyles();
    state.root = root;
    state.step = 1;
    state.selected = null;
    state.submitting = false;
    render();
  }

  window.LeadFunnel = { mount };
})();
