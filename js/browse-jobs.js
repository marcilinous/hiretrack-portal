/**
 * BrowseJobs — shared job-listing module for jobs.html (guest) and profile.html (candidate).
 * Requires window.sb (Supabase client) to be initialized before use.
 * Exposes window.BrowseJobs.
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    const secs = Math.floor((Date.now() - d.getTime()) / 1000);
    if (secs < 60)   return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60)   return mins === 1 ? '1 minute ago'  : `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)  return hours === 1 ? '1 hour ago'   : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 30)   return days === 1 ? '1 day ago'     : `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
    const years = Math.floor(months / 12);
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }

  // ─────────────────────────────────────────
  // Internal state
  // ─────────────────────────────────────────

  // Per-candidate RPC result cache: { [candidateId]: { ts: number, jobs: Array } }
  const _cache = {};
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Per-container store so event delegation always reads the latest render's data
  const _containerStore = new WeakMap(); // containerEl → { jobMap, options }
  const _listenersSet   = new WeakSet(); // containers with a delegation listener already attached

  // ─────────────────────────────────────────
  // Band-matching (mirrors jobs.html logic exactly)
  // ─────────────────────────────────────────

  function matchExp(job, band) {
    const e = (job.experience || '').toLowerCase();
    if (!e) return true;
    if (band === 'fresher') return /fresher|0|1\s*year/.test(e);
    if (band === '1-3')     return /[1-3]\s*(year|yr)/.test(e);
    if (band === '3-5')     return /[3-5]\s*(year|yr)/.test(e);
    if (band === '5+')      return /[5-9]\s*(year|yr)|10/.test(e);
    return true;
  }

  function matchSalary(job, band) {
    const sal = (job.salary || '');
    // Match integers and decimals, e.g. "₹3.5–8 LPA" → ["3.5", "8"]
    const nums = sal.match(/\d+(?:\.\d+)?/g);
    if (!nums || !nums.length) return true; // unknown salary always passes
    const low  = parseFloat(nums[0]);
    const high = parseFloat(nums[nums.length - 1]);
    // Range-overlap: job range [low, high] overlaps filter band
    if (band === '0-3')  return low  <  3;
    if (band === '3-6')  return low  <  6 && high >= 3;
    if (band === '6-10') return low  < 10 && high >= 6;
    if (band === '10+')  return high >= 10;
    return true;
  }

  // ─────────────────────────────────────────
  // Skills extraction (handles array / string / tags column)
  // ─────────────────────────────────────────

  function getSkills(job) {
    if (Array.isArray(job.skills_arr) && job.skills_arr.length) return job.skills_arr;
    if (Array.isArray(job.tags)       && job.tags.length)       return job.tags;
    if (Array.isArray(job.skills)     && job.skills.length)     return job.skills;
    if (typeof job.skills === 'string' && job.skills.trim())
      return job.skills.split(',').map(s => s.trim()).filter(Boolean);
    return [];
  }

  // ─────────────────────────────────────────
  // CSS — injected once into <head>
  // ─────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('bj-styles')) return;
    const style = document.createElement('style');
    style.id = 'bj-styles';
    style.textContent = `
/* ── BrowseJobs card ── */
.bj-job-card {
  background: #fff;
  border: 1.5px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.1rem 1.25rem;
  margin-bottom: 0.75rem;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.18s, box-shadow 0.18s;
}
.bj-job-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 18px rgba(59,130,246,0.1);
}
.bj-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 24px;
  margin-bottom: 0.45rem;
}
/* match score bubble */
.bj-match-bubble {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 20px;
  letter-spacing: 0.2px;
  flex-shrink: 0;
}
/* application status badges */
.bj-status-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 20px;
  flex-shrink: 0;
}
.bj-badge-applied     { background: #eff6ff; color: #1d4ed8; }
.bj-badge-shortlisted { background: #fef3c7; color: #92400e; }
.bj-badge-interview   { background: #f5f3ff; color: #6d28d9; }
.bj-badge-hired       { background: #dcfce7; color: #15803d; }
.bj-badge-rejected    { background: transparent; color: #6b7280; border: 1.5px solid #d1d5db; }
/* card body */
.bj-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 0.28rem;
  line-height: 1.35;
  text-decoration: none;
  display: block;
}
.bj-meta {
  font-size: 0.78rem;
  color: #64748b;
  margin-bottom: 0.55rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 0.3rem;
}
.bj-meta-sep { color: #cbd5e1; }
.bj-details {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}
.bj-detail-chip {
  font-size: 0.73rem;
  color: #374151;
  background: #f1f5f9;
  padding: 3px 9px;
  border-radius: 6px;
  font-weight: 500;
}
.bj-skills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 0.75rem;
}
.bj-skill-chip {
  font-size: 0.67rem;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 2px 8px;
  border-radius: 8px;
  font-weight: 600;
}
.bj-skill-more {
  font-size: 0.67rem;
  color: #94a3b8;
  padding: 2px 5px;
  font-weight: 500;
  align-self: center;
}
.bj-save-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 0 2px;
  line-height: 1;
  color: #94a3b8;
  flex-shrink: 0;
  opacity: 0.5;
  transition: opacity 0.15s, transform 0.15s;
}
.bj-save-btn:hover { opacity: 1; transform: scale(1.15); }
.bj-save-btn.bj-saved { opacity: 1; filter: sepia(1) saturate(3) hue-rotate(5deg); }
.bj-card-foot {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.65rem;
  border-top: 1px solid #f1f5f9;
}
/* action buttons */
.bj-btn {
  border: none;
  padding: 0.5rem 1.3rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}
.bj-btn-apply {
  background: #2563eb;
  color: #fff;
}
.bj-btn-apply:hover { background: #1d4ed8; }
.bj-btn-view {
  background: #f0f7ff;
  color: #2563eb;
  border: 1.5px solid #bfdbfe;
}
.bj-btn-view:hover { background: #dbeafe; }
.bj-btn-signin {
  background: #f1f5f9;
  color: #64748b;
  border: 1.5px solid #e2e8f0;
  cursor: default;
}
/* whatsapp share */
.bj-wa-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 0.35rem 0.6rem;
  border-radius: 7px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #16a34a;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}
.bj-wa-btn:hover { background: #f0fdf4; }
/* empty state */
.bj-empty {
  text-align: center;
  padding: 3rem 1rem;
  color: #94a3b8;
}
.bj-empty-icon { font-size: 2.5rem; margin-bottom: 0.75rem; }
/* infinite scroll */
.scroll-sentinel { height: 1px; }
.loading-more {
  text-align: center;
  padding: 1rem;
  color: #94a3b8;
  font-size: 0.85rem;
  font-weight: 500;
}
@media (max-width: 768px) {
  .bj-job-card { width: 95%; }
}
    `;
    document.head.appendChild(style);
  }

  // ─────────────────────────────────────────
  // fetchForGuest
  // ─────────────────────────────────────────

  const DEFAULT_LIMIT = 20;

  async function fetchForGuest({ offset = 0, limit = DEFAULT_LIMIT } = {}) {
    const { data, error } = await window.sb
      .from('jobs')
      .select('*')
      .neq('delisted', true)
      .or('status.eq.active,status.is.null')
      .order('posted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    const jobs = (data || []).map(j => ({ ...j, type: j.job_type }));
    return { jobs, hasMore: jobs.length === limit };
  }

  // ─────────────────────────────────────────
  // fetchForCandidate
  // ─────────────────────────────────────────

  async function fetchForCandidate(candidateId) {
    const cached = _cache[candidateId];
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      return cached.jobs;
    }

    try {
      const { data: rpcRows, error: rpcErr } = await window.sb
        .rpc('match_jobs_for_candidate', { p_candidate_id: candidateId });

      if (rpcErr) throw rpcErr;
      if (!rpcRows || !rpcRows.length) return [];

      // Build score map: { jobId → match_score }
      const scoreMap = {};
      rpcRows.forEach(r => { scoreMap[String(r.id)] = r.match_score; });
      const ids = rpcRows.map(r => r.id);

      // Fetch full job rows for the RPC-returned IDs
      const { data: fullJobs, error: jobErr } = await window.sb
        .from('jobs')
        .select('*')
        .in('id', ids)
        .eq('delisted', false)
        .eq('status', 'active');

      if (jobErr) throw jobErr;

      // Merge and sort: match_score desc, then posted_at desc
      const merged = (fullJobs || []).map(j => ({
        ...j,
        type: j.job_type,
        match_score: scoreMap[String(j.id)] ?? 0,
      }));
      merged.sort((a, b) => {
        if (b.match_score !== a.match_score) return b.match_score - a.match_score;
        return new Date(b.posted_at) - new Date(a.posted_at);
      });

      _cache[candidateId] = { ts: Date.now(), jobs: merged };
      return merged;
    } catch (e) {
      console.warn('BrowseJobs.fetchForCandidate failed, falling back to guest fetch:', e);
      const { jobs } = await fetchForGuest({ limit: 100 });
      return jobs;
    }
  }

  // ─────────────────────────────────────────
  // fetchApplicationStatuses
  // ─────────────────────────────────────────

  async function fetchApplicationStatuses(candidateId) {
    try {
      const { data, error } = await window.sb
        .from('applications')
        .select('job_id, status')
        .eq('candidate_id', candidateId);

      if (error) throw error;
      const map = {};
      (data || []).forEach(a => { map[String(a.job_id)] = a.status; });
      return map;
    } catch (e) {
      console.warn('BrowseJobs.fetchApplicationStatuses error:', e);
      return {};
    }
  }

  // ─────────────────────────────────────────
  // applyClientFilters
  // ─────────────────────────────────────────

  function applyClientFilters(jobs, filters = {}) {
    const {
      keyword,
      locations,
      jobTypes,
      experienceBands,
      salaryBands,
      recency,
      minMatchScore,
    } = filters;

    // Recency cutoff timestamp
    let cutoff = null;
    if (recency === '24h') cutoff = Date.now() - 24 * 60 * 60 * 1000;
    else if (recency === '7d')  cutoff = Date.now() - 7  * 24 * 60 * 60 * 1000;
    else if (recency === '30d') cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return jobs.filter(j => {
      const skills = getSkills(j);
      const hay   = [j.title || '', j.company || '', ...skills].join(' ').toLowerCase();
      const jloc  = (j.location || '').toLowerCase();
      const jtype = (j.job_type || j.type || '').toLowerCase();

      // keyword
      if (keyword && keyword.trim()) {
        if (!hay.includes(keyword.trim().toLowerCase())) return false;
      }

      // locations (any match in the multi-select set)
      if (locations && locations.length) {
        if (!locations.some(l => jloc.includes(l.toLowerCase()))) return false;
      }

      // jobTypes
      if (jobTypes && jobTypes.length) {
        if (!jobTypes.some(t => jtype.includes(t.toLowerCase()))) return false;
      }

      // experienceBands (mirrors jobs.html matchExp)
      if (experienceBands && experienceBands.length) {
        if (!experienceBands.some(b => matchExp(j, b))) return false;
      }

      // salaryBands
      if (salaryBands && salaryBands.length) {
        if (!salaryBands.some(b => matchSalary(j, b))) return false;
      }

      // recency
      if (cutoff && j.posted_at) {
        if (new Date(j.posted_at).getTime() < cutoff) return false;
      }

      // minMatchScore (only meaningful if job has match_score)
      if (minMatchScore != null && j.match_score != null) {
        if (j.match_score < minMatchScore) return false;
      }

      return true;
    });
  }

  // ─────────────────────────────────────────
  // render
  // ─────────────────────────────────────────

  const STATUS_BADGE_CLASS = {
    Applied:     'bj-badge-applied',
    Shortlisted: 'bj-badge-shortlisted',
    Interview:   'bj-badge-interview',
    Hired:       'bj-badge-hired',
    Rejected:    'bj-badge-rejected',
  };

  function buildCardHtml(job, applicationStatusMap, isLoggedIn, savedJobIds) {
    const jid     = String(job.id);
    const status  = applicationStatusMap[jid];
    const isSaved = savedJobIds && savedJobIds.has(jid);
    const skills  = getSkills(job);
    const display = skills.slice(0, 5);
    const extra   = skills.length > 5 ? skills.length - 5 : 0;

    // Match bubble — only if match_score is present
    const matchBubble = (job.match_score != null)
      ? `<span class="bj-match-bubble">⚡ ${Math.round(job.match_score)}% match</span>`
      : '<span></span>';

    // Status badge
    const statusBadge = status
      ? `<span class="bj-status-badge ${STATUS_BADGE_CLASS[status] || 'bj-badge-applied'}">${escapeHtml(status)}</span>`
      : '';

    // Save button (only when logged in)
    const saveBtn = isLoggedIn
      ? `<button class="bj-save-btn ${isSaved ? 'bj-saved' : ''}" data-action="save" data-jid="${jid}" data-saved="${isSaved ? '1' : ''}" title="${isSaved ? 'Remove from saved' : 'Save job'}" aria-label="${isSaved ? 'Unsave' : 'Save'}">${isSaved ? '🔖' : '🔖'}</button>`
      : '';

    // Skill chips
    const skillsHtml = display.length
      ? `<div class="bj-skills">
          ${display.map(s => `<span class="bj-skill-chip">${escapeHtml(s)}</span>`).join('')}
          ${extra ? `<span class="bj-skill-more">+${extra} more</span>` : ''}
        </div>`
      : '';

    // Action button
    let btnHtml;
    if (status) {
      btnHtml = `<button class="bj-btn bj-btn-view" data-action="view" data-jid="${jid}">View Application</button>`;
    } else if (!isLoggedIn) {
      btnHtml = `<button class="bj-btn bj-btn-signin" data-action="signin" data-jid="${jid}">Sign in to apply</button>`;
    } else {
      btnHtml = `<button class="bj-btn bj-btn-apply" data-action="apply" data-jid="${jid}">Apply</button>`;
    }

    const postedAgo = job.posted_at ? timeAgo(job.posted_at) : (job.posted || '');
    const jobType   = job.job_type || job.type;

    return `<div class="bj-job-card" data-jid="${jid}">
  <div class="bj-card-top">
    <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">${matchBubble}${statusBadge}</div>
    ${saveBtn}
  </div>
  <a class="bj-title" href="/job.html?id=${jid}" onclick="event.preventDefault()" tabindex="-1" aria-label="${escapeHtml(job.title)} at ${escapeHtml(job.company || '')}">${escapeHtml(job.title)}</a>
  <div class="bj-meta">
    <span>${escapeHtml(job.company || '')}</span>
    <span class="bj-meta-sep">·</span>
    <span>📍 ${escapeHtml(job.location || 'India')}</span>
    <span class="bj-meta-sep">·</span>
    <span>${escapeHtml(postedAgo)}</span>
  </div>
  <div class="bj-details">
    ${job.salary    ? `<span class="bj-detail-chip">💰 ${escapeHtml(job.salary)}</span>`      : ''}
    ${job.experience? `<span class="bj-detail-chip">🎯 ${escapeHtml(job.experience)}</span>`  : ''}
    ${jobType       ? `<span class="bj-detail-chip">${escapeHtml(jobType)}</span>`            : ''}
  </div>
  ${skillsHtml}
  <div class="bj-card-foot">
    ${btnHtml}
    <button class="bj-wa-btn" data-action="share" data-jid="${jid}" title="Share on WhatsApp">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.532 5.857L.057 23.925l6.235-1.635A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.494-5.193-1.355l-.372-.22-3.7.971 1.008-3.573-.242-.383A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
      Share
    </button>
  </div>
</div>`;
  }

  function render(containerEl, jobs, options = {}) {
    injectStyles();

    const {
      applicationStatusMap = {},
      isLoggedIn = false,
      savedJobIds = null,
      onApplyClick = null,
      onViewApplicationClick = null,
      onSaveToggle = null,
    } = options;

    // Build a lookup map and update the per-container store (used by event delegation)
    const jobMap = new Map();
    jobs.forEach(j => jobMap.set(String(j.id), j));
    _containerStore.set(containerEl, { jobMap, options: { applicationStatusMap, isLoggedIn, savedJobIds, onApplyClick, onViewApplicationClick, onSaveToggle } });

    // Attach delegation listener only once per container element
    if (!_listenersSet.has(containerEl)) {
      _listenersSet.add(containerEl);
      containerEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const stored = _containerStore.get(containerEl);
        if (!stored) return;

        const action = btn.dataset.action;
        const jid    = btn.dataset.jid;
        const job    = stored.jobMap.get(jid);
        const opts   = stored.options;

        if (action === 'apply'  && opts.onApplyClick)            opts.onApplyClick(jid, job);
        if (action === 'view'   && opts.onViewApplicationClick)  opts.onViewApplicationClick(jid);
        if (action === 'save'   && opts.onSaveToggle) {
          const isSaved = btn.dataset.saved === '1';
          opts.onSaveToggle(jid, isSaved, btn);
        }
        if (action === 'signin') {
          sessionStorage.setItem('redirect_after_login', window.location.href);
          window.location.href = 'login.html';
        }
        if (action === 'share' && job) {
          const url  = `https://www.hiretrack.co.in/job.html?id=${jid}`;
          const text = `🔥 *${job.title}* at *${job.company || ''}*${job.location ? '\n📍 ' + job.location : ''}${job.salary ? ' | 💰 ' + job.salary : ''}\n\nApply on HireTrack 👉 ${url}`;
          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }
      });
    }

    // Render
    if (!jobs.length) {
      containerEl.innerHTML = '<div class="bj-empty"><div class="bj-empty-icon">🔍</div><p>No jobs match your filters.</p></div>';
      return;
    }

    containerEl.innerHTML = jobs
      .map(j => buildCardHtml(j, applicationStatusMap, isLoggedIn, savedJobIds))
      .join('');
  }

  // ─────────────────────────────────────────
  // setupInfiniteScroll
  // ─────────────────────────────────────────

  function setupInfiniteScroll(containerEl, fetchNext) {
    // Remove any pre-existing sentinel (e.g., after a render() call clears the container)
    const old = containerEl.querySelector('.scroll-sentinel');
    if (old) old.remove();

    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    containerEl.appendChild(sentinel);

    let fetching = false;

    const observer = new IntersectionObserver(async entries => {
      if (!entries[0].isIntersecting || fetching) return;
      fetching = true;

      const loader = document.createElement('div');
      loader.className = 'loading-more';
      loader.textContent = 'Loading…';
      sentinel.insertAdjacentElement('beforebegin', loader);

      try {
        const result = await fetchNext();
        loader.remove();
        if (!result || !result.hasMore) {
          observer.disconnect();
          sentinel.remove();
        }
      } catch (e) {
        loader.remove();
        observer.disconnect();
        sentinel.remove();
      } finally {
        fetching = false;
      }
    }, { rootMargin: '200px' });

    observer.observe(sentinel);

    // Return a teardown function so callers can disconnect manually (e.g., on filter change)
    return () => { observer.disconnect(); sentinel.remove(); };
  }

  // ─────────────────────────────────────────
  // Expose global
  // ─────────────────────────────────────────

  window.BrowseJobs = {
    fetchForGuest,
    fetchForCandidate,
    fetchApplicationStatuses,
    applyClientFilters,
    render,
    setupInfiniteScroll,
  };

})();
