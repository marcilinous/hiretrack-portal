/**
 * ApplyModal — shared job detail + apply modal for jobs.html and profile.html.
 * Requires: style.css (provides .btn-apply, .btn-whatsapp, .tag),
 *           window.sb (for view-count increment, optional).
 * Exposes window.ApplyModal = { open(job, opts), close() }.
 */
(function () {
  'use strict';

  const BACKDROP_ID = 'am-backdrop';

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function injectStyles() {
    if (document.getElementById('am-styles')) return;
    const s = document.createElement('style');
    s.id = 'am-styles';
    s.textContent = [
      '.am-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:500;display:none;align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow-y:auto;}',
      '.am-backdrop.am-open{display:flex;}',
      '.am-box{background:#fff;border-radius:16px;width:100%;max-width:660px;padding:2rem;position:relative;margin:auto;}',
      '.am-close{position:absolute;top:1rem;right:1rem;background:#f1f5f9;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1rem;color:#64748b;display:flex;align-items:center;justify-content:center;}',
      '.am-title{font-size:1.2rem;font-weight:800;color:#0f172a;margin-bottom:0.25rem;}',
      '.am-company{color:#64748b;font-size:0.9rem;margin-bottom:1rem;}',
      '.am-meta{display:flex;flex-wrap:wrap;gap:0.6rem;margin-bottom:1rem;}',
      '.am-meta-item{background:#f1f5f9;padding:0.3rem 0.85rem;border-radius:20px;font-size:0.79rem;color:#374151;font-weight:500;}',
      '.am-skills{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:1.1rem;}',
      '.am-desc{font-size:0.9rem;line-height:1.75;color:#334155;white-space:pre-wrap;border-top:1px solid #e2e8f0;padding-top:1rem;margin-bottom:1.2rem;max-height:220px;overflow-y:auto;}',
      '.am-actions{display:flex;gap:10px;}',
      '@media(max-width:640px){.am-backdrop{padding:0;align-items:flex-end;}.am-box{border-radius:16px 16px 0 0;max-height:90vh;overflow-y:auto;}}',
    ].join('');
    document.head.appendChild(s);
  }

  function getOrCreateBackdrop() {
    let el = document.getElementById(BACKDROP_ID);
    if (el) return el;

    el = document.createElement('div');
    el.id = BACKDROP_ID;
    el.className = 'am-backdrop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<div class="am-box" id="am-box">' +
      '<button class="am-close" id="am-close" aria-label="Close">&#10005;</button>' +
      '<div class="am-title"   id="am-title"></div>' +
      '<div class="am-company" id="am-company"></div>' +
      '<div class="am-meta"    id="am-meta"></div>' +
      '<div class="am-skills"  id="am-skills"></div>' +
      '<div class="am-desc"    id="am-desc"></div>' +
      '<div class="am-actions" id="am-actions"></div>' +
      '</div>';
    document.body.appendChild(el);

    el.addEventListener('click', function (e) {
      if (e.target === el) close();
    });
    el.querySelector('#am-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.classList.contains('am-open')) close();
    });

    return el;
  }

  /**
   * open(job, opts)
   *
   * job     — job row from the DB (or static JOBS array).
   * opts    — {
   *   isLoggedIn:        boolean,
   *   applicationStatus: string | null  (e.g. 'Applied', 'Shortlisted'),
   *   onApply:           async function — called when user clicks Apply,
   *                      throw to signal failure (modal resets button).
   *   onWhatsApp:        function — called when user clicks WhatsApp.
   * }
   */
  function open(job, opts) {
    if (!job) return;
    opts = opts || {};
    const {
      isLoggedIn = false,
      applicationStatus = null,
      onApply = null,
      onWhatsApp = null,
    } = opts;

    injectStyles();
    const backdrop = getOrCreateBackdrop();

    // ── Content ──
    document.getElementById('am-title').textContent = job.title || '';
    document.getElementById('am-company').textContent = '🏢 ' + (job.company || '');

    const metaParts = [
      job.location ? '<span class="am-meta-item">📍 ' + escapeHtml(job.location) + '</span>' : '',
      job.salary ? '<span class="am-meta-item">💰 ' + escapeHtml(job.salary) + '</span>' : '',
      job.experience
        ? '<span class="am-meta-item">🎯 ' + escapeHtml(job.experience) + '</span>'
        : '',
      job.job_type || job.type
        ? '<span class="am-meta-item">' + escapeHtml(job.job_type || job.type) + '</span>'
        : '',
    ];
    document.getElementById('am-meta').innerHTML = metaParts.join('');

    const skills = Array.isArray(job.tags)
      ? job.tags
      : Array.isArray(job.skills)
        ? job.skills
        : typeof job.skills === 'string'
          ? job.skills
              .split(',')
              .map(function (s) {
                return s.trim();
              })
              .filter(Boolean)
          : [];
    document.getElementById('am-skills').innerHTML = skills
      .slice(0, 8)
      .map(function (s) {
        return '<span class="tag">' + escapeHtml(s) + '</span>';
      })
      .join('');

    document.getElementById('am-desc').textContent =
      job.description || 'Contact employer for full job description.';

    // ── Actions (built without inline handlers) ──
    const actEl = document.getElementById('am-actions');
    actEl.innerHTML = '';

    if (isLoggedIn) {
      if (applicationStatus) {
        const appliedBtn = document.createElement('button');
        appliedBtn.className = 'btn-apply applied';
        appliedBtn.style.cssText = 'flex:1;padding:0.8rem;';
        appliedBtn.disabled = true;
        appliedBtn.textContent = '✓ ' + applicationStatus;
        actEl.appendChild(appliedBtn);
      } else if (onApply) {
        const applyBtn = document.createElement('button');
        applyBtn.className = 'btn-apply';
        applyBtn.style.cssText = 'flex:1;padding:0.8rem;';
        applyBtn.textContent = 'Apply Now';
        applyBtn.addEventListener('click', async function () {
          applyBtn.disabled = true;
          applyBtn.textContent = 'Applying…';
          try {
            await onApply();
            applyBtn.textContent = '✓ Applied';
            applyBtn.classList.add('applied');
          } catch (e) {
            applyBtn.disabled = false;
            applyBtn.textContent = 'Apply Now';
          }
        });
        actEl.appendChild(applyBtn);
      }
    } else {
      const signinBtn = document.createElement('button');
      signinBtn.className = 'btn-apply';
      signinBtn.style.cssText = 'flex:1;padding:0.8rem;';
      signinBtn.textContent = 'Sign in to apply';
      signinBtn.addEventListener('click', function () {
        sessionStorage.setItem('redirect_after_login', window.location.href);
        window.location.href = 'login.html';
      });
      actEl.appendChild(signinBtn);
    }

    if (job.phone && onWhatsApp) {
      const waBtn = document.createElement('button');
      waBtn.className = 'btn-whatsapp';
      waBtn.textContent = '💬 WhatsApp';
      waBtn.addEventListener('click', onWhatsApp);
      actEl.appendChild(waBtn);
    }

    // Fire-and-forget view count increment
    if (job.employer_id && window.sb) {
      window.sb
        .from('jobs')
        .update({ views: (job.views || 0) + 1 })
        .eq('id', job.id)
        .then(function () {});
    }

    backdrop.classList.add('am-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    const el = document.getElementById(BACKDROP_ID);
    if (el) el.classList.remove('am-open');
    document.body.style.overflow = '';
  }

  window.ApplyModal = { open, close };
})();
