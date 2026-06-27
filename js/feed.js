/**
 * Feed — community feed for profile.html (#feed route) and index.html (preview widget).
 * Requires: window.sb (Supabase client from app.js), showToast() from app.js.
 * Exposes:  window.Feed = { init(containerId, candidate), initPreview(containerId) }
 *
 * init()        — full feed with post composer; used on profile.html #feed route.
 * initPreview() — read-only latest-5 widget; used on index.html homepage.
 */
(function () {
  'use strict';

  const PAGE_SIZE = 10;
  const PREVIEW_SIZE = 5;
  const CACHE_TTL = 5 * 60 * 1000; // 5 min — matches BrowseJobs convention

  const TYPE_META = {
    general: { label: '💬 Post', color: '#64748b', bg: '#f1f5f9' },
    job: { label: '💼 Job Share', color: '#2563eb', bg: '#dbeafe' },
    hiring: { label: '🏢 Now Hiring', color: '#c2410c', bg: '#ffedd5' },
    open_to_work: { label: '🟢 Open to Work', color: '#138808', bg: '#dcfce7' },
    hired: { label: '🎉 Got Hired', color: '#7c3aed', bg: '#ede9fe' },
    tip: { label: '💡 Career Tip', color: '#0369a1', bg: '#e0f2fe' },
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function nameInitials(name) {
    if (!name) return '?';
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  // ── CSS ────────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('fd-styles')) return;
    const s = document.createElement('style');
    s.id = 'fd-styles';
    s.textContent = [
      /* Wrapper */
      '.fd-wrap{max-width:680px;margin:0 auto;}',

      /* Composer */
      '.fd-composer{background:#fff;border:1.5px solid #e2e8f0;border-radius:14px;padding:1.25rem;margin-bottom:1.25rem;box-shadow:0 1px 4px rgba(0,0,0,0.04);}',
      '.fd-composer-top{display:flex;gap:12px;margin-bottom:1rem;}',
      '.fd-compose-ta{flex:1;border:1.5px solid #e2e8f0;border-radius:10px;padding:0.75rem;font-size:0.9rem;font-family:inherit;resize:vertical;min-height:78px;outline:none;color:#0f172a;line-height:1.65;transition:border-color 0.15s;}',
      '.fd-compose-ta:focus{border-color:#ff9933;}',
      '.fd-composer-btm{display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;}',
      '.fd-char-count{font-size:0.73rem;color:#94a3b8;align-self:flex-end;margin-left:auto;order:1;}',

      /* Avatars */
      '.fd-av{width:42px;height:42px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.88rem;font-weight:800;color:#fff;overflow:hidden;object-fit:cover;}',
      '.fd-av--cand{background:linear-gradient(135deg,#ff9933,#e67e22);}' /* saffron */,
      '.fd-av--company{background:linear-gradient(135deg,#138808,#0a5c00);}' /* India green */,
      '.fd-av--me{background:linear-gradient(135deg,#ff9933,#c2410c);}',

      /* Post type pills */
      '.fd-pills{display:flex;gap:5px;flex-wrap:wrap;}',
      '.fd-pill{background:#f1f5f9;color:#64748b;border:1.5px solid #e2e8f0;border-radius:20px;padding:0.28rem 0.8rem;font-size:0.73rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all 0.15s;}',
      '.fd-pill:hover{border-color:#ff9933;color:#c2410c;}',
      '.fd-pill--active{background:#fff4e6;border-color:#ff9933;color:#c2410c;}',

      /* Post button */
      '.fd-post-btn{background:linear-gradient(135deg,#ff9933,#e67e22);color:#fff;border:none;border-radius:8px;padding:0.5rem 1.4rem;font-size:0.88rem;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;transition:opacity 0.15s;order:2;}',
      '.fd-post-btn:hover{opacity:0.88;}',
      '.fd-post-btn:disabled{opacity:0.5;cursor:not-allowed;}',

      /* Sign-in CTA (logged-out) */
      '.fd-signin-cta{background:#fff7ed;border:1.5px solid #ff9933;border-radius:12px;padding:1rem 1.25rem;text-align:center;margin-bottom:1.25rem;}',
      '.fd-signin-cta p{font-size:0.88rem;color:#64748b;margin-bottom:0.5rem;}',
      '.fd-signin-cta a{color:#c2410c;font-weight:700;text-decoration:none;}',
      '.fd-signin-cta a:hover{text-decoration:underline;}',

      /* Cards */
      '.fd-card{background:#fff;border:1.5px solid #e2e8f0;border-radius:14px;padding:1.2rem;margin-bottom:1rem;transition:box-shadow 0.15s;}',
      '.fd-card:hover{box-shadow:0 4px 18px rgba(0,0,0,0.07);}',
      '.fd-card-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:0.85rem;}',
      '.fd-card-meta{flex:1;min-width:0;}',
      '.fd-card-name{font-size:0.92rem;font-weight:700;color:#0f172a;}',
      '.fd-card-sub{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px;}',
      '.fd-type-badge{font-size:0.7rem;font-weight:700;padding:2px 9px;border-radius:20px;white-space:nowrap;}',
      '.fd-dot{color:#cbd5e1;font-size:0.8rem;}',
      '.fd-time{font-size:0.74rem;color:#94a3b8;}',
      '.fd-card-body{font-size:0.88rem;line-height:1.75;color:#334155;white-space:pre-wrap;word-break:break-word;margin-bottom:0.85rem;}',
      '.fd-card-foot{display:flex;align-items:center;gap:10px;padding-top:0.7rem;border-top:1px solid #f1f5f9;}',

      /* Like button */
      '.fd-like-btn{background:none;border:1.5px solid #e2e8f0;border-radius:20px;padding:0.28rem 0.85rem;font-size:0.82rem;cursor:pointer;font-family:inherit;color:#64748b;display:flex;align-items:center;gap:5px;transition:all 0.15s;}',
      '.fd-like-btn:hover:not(:disabled){border-color:#f43f5e;color:#f43f5e;}',
      '.fd-like-btn.fd-liked{border-color:#f43f5e;color:#f43f5e;background:#fff5f5;}',
      '.fd-like-btn:disabled{cursor:not-allowed;opacity:0.5;}',

      /* Like count (read-only, no button) */
      '.fd-like-count{font-size:0.82rem;color:#94a3b8;display:flex;align-items:center;gap:5px;}',

      /* Flag button */
      '.fd-flag-btn{background:none;border:none;cursor:pointer;color:#cbd5e1;font-size:0.9rem;padding:0.28rem 0.5rem;border-radius:6px;font-family:inherit;margin-left:auto;transition:color 0.15s;}',
      '.fd-flag-btn:hover:not(:disabled){color:#f43f5e;}',
      '.fd-flag-btn:disabled{opacity:0.45;cursor:not-allowed;}',

      /* Load more */
      '.fd-load-more-btn{background:#fff;border:1.5px solid #e2e8f0;border-radius:8px;padding:0.6rem 2rem;font-size:0.88rem;font-weight:600;color:#64748b;cursor:pointer;font-family:inherit;transition:all 0.15s;}',
      '.fd-load-more-btn:hover{border-color:#ff9933;color:#c2410c;}',

      /* States */
      '.fd-loading{text-align:center;padding:3rem 1rem;color:#94a3b8;font-size:0.9rem;}',
      '.fd-empty{text-align:center;padding:3rem 1rem;color:#94a3b8;font-size:0.9rem;}',
      '.fd-error{text-align:center;padding:2rem 1rem;color:#dc2626;font-size:0.88rem;background:#fff5f5;border-radius:10px;border:1.5px solid #fecaca;}',

      /* Preview CTA */
      '.fd-preview-cta{text-align:center;padding:1.25rem 0;}',
      '.fd-preview-cta a{color:#c2410c;font-weight:700;font-size:0.88rem;text-decoration:none;}',
      '.fd-preview-cta a:hover{text-decoration:underline;}',

      /* Mobile */
      '@media(max-width:600px){',
      '.fd-composer-btm{flex-direction:column;align-items:stretch;}',
      '.fd-post-btn{width:100%;text-align:center;order:0;}',
      '.fd-char-count{order:1;text-align:right;}',
      '.fd-pills{order:2;}',
      '.fd-pill{font-size:0.7rem;padding:0.25rem 0.6rem;}',
      '}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Module state (singleton — one full feed per page) ─────────────────────

  let _posts = [];
  let _offset = 0;
  let _hasMore = true;
  let _myLikedIds = new Set();
  let _candidate = null;
  let _loading = false;
  let _selectedType = 'general';
  let _lastLoad = 0;

  // ── Data ───────────────────────────────────────────────────────────────────

  async function fetchPage() {
    const { data, error } = await window.sb
      .from('feed_posts')
      .select(
        'id,author_name,author_avatar,author_type,post_type,content,like_count,flag_count,created_at'
      )
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .range(_offset, _offset + PAGE_SIZE - 1);
    if (error) throw error;
    return data || [];
  }

  async function fetchPreviewPosts() {
    const { data, error } = await window.sb
      .from('feed_posts')
      .select('id,author_name,author_avatar,author_type,post_type,content,like_count,created_at')
      .eq('is_hidden', false)
      .order('created_at', { ascending: false })
      .limit(PREVIEW_SIZE);
    if (error) throw error;
    return data || [];
  }

  async function fetchMyLikes(postIds) {
    if (!_candidate || !postIds.length) return;
    try {
      const { data } = await window.sb
        .from('feed_likes')
        .select('post_id')
        .eq('user_id', _candidate.id)
        .in('post_id', postIds);
      (data || []).forEach((r) => _myLikedIds.add(r.post_id));
    } catch (_) {
      /* non-fatal */
    }
  }

  // ── HTML builders ──────────────────────────────────────────────────────────

  function _avatarHtml(post, cls = '') {
    if (post.author_avatar) {
      return `<img src="${escapeHtml(post.author_avatar)}" class="fd-av ${cls}" alt="${escapeHtml(post.author_name)}" loading="lazy">`;
    }
    const avatarCls = post.author_type === 'company' ? 'fd-av--company' : 'fd-av--cand';
    return `<div class="fd-av ${avatarCls} ${cls}">${escapeHtml(nameInitials(post.author_name))}</div>`;
  }

  function renderComposer() {
    if (!_candidate) {
      return (
        '<div class="fd-signin-cta">' +
        '<p>Share career updates, tips, and wins with the HireTrack community.</p>' +
        '<a href="login.html">Sign in to post →</a>' +
        '</div>'
      );
    }
    return (
      '<div class="fd-composer" id="fd-composer">' +
      '<div class="fd-composer-top">' +
      `<div class="fd-av fd-av--me">${escapeHtml(nameInitials(_candidate.name))}</div>` +
      '<textarea id="fd-compose-ta" class="fd-compose-ta"' +
      ' placeholder="Share a win, career tip, or what you\'re looking for…"' +
      ' maxlength="1500" rows="3" aria-label="Write a post"></textarea>' +
      '</div>' +
      '<div class="fd-composer-btm">' +
      '<div class="fd-pills" id="fd-pills">' +
      '<button class="fd-pill fd-pill--active" data-type="general">💬 General</button>' +
      '<button class="fd-pill" data-type="open_to_work">🟢 Open to Work</button>' +
      '<button class="fd-pill" data-type="tip">💡 Career Tip</button>' +
      '<button class="fd-pill" data-type="hired">🎉 Got Hired</button>' +
      '<button class="fd-pill" data-type="job">💼 Job Share</button>' +
      '<button class="fd-pill" data-type="hiring">🏢 Hiring</button>' +
      '</div>' +
      '<span class="fd-char-count" id="fd-char-count">0 / 1500</span>' +
      '<button class="fd-post-btn" id="fd-post-btn">Post</button>' +
      '</div>' +
      '</div>'
    );
  }

  function renderCard(post, { interactive = true } = {}) {
    const meta = TYPE_META[post.post_type] || TYPE_META.general;
    const liked = _myLikedIds.has(post.id);
    const avatar = _avatarHtml(post);
    const foot = interactive
      ? `<button class="fd-like-btn${liked ? ' fd-liked' : ''}" data-id="${escapeHtml(post.id)}" aria-label="${liked ? 'Unlike' : 'Like'} this post">` +
        `${liked ? '❤️' : '🤍'} <span class="fd-lc">${post.like_count || 0}</span>` +
        `</button>` +
        `<button class="fd-flag-btn" data-id="${escapeHtml(post.id)}" title="Report post" aria-label="Report post">⚑</button>`
      : `<span class="fd-like-count">🤍 ${post.like_count || 0}</span>`;

    return (
      `<article class="fd-card" data-post-id="${escapeHtml(post.id)}">` +
      '<div class="fd-card-head">' +
      avatar +
      '<div class="fd-card-meta">' +
      `<div class="fd-card-name">${escapeHtml(post.author_name)}</div>` +
      '<div class="fd-card-sub">' +
      `<span class="fd-type-badge" style="color:${meta.color};background:${meta.bg};">${meta.label}</span>` +
      '<span class="fd-dot">·</span>' +
      `<time class="fd-time" datetime="${escapeHtml(post.created_at)}">${timeAgo(post.created_at)}</time>` +
      '</div>' +
      '</div>' +
      '</div>' +
      `<p class="fd-card-body">${escapeHtml(post.content)}</p>` +
      `<div class="fd-card-foot">${foot}</div>` +
      '</article>'
    );
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function _renderList() {
    const list = document.getElementById('fd-list');
    if (!list) return;
    if (!_posts.length) {
      list.innerHTML =
        '<div class="fd-empty">No posts yet — be the first to share something! 🚀</div>';
    } else {
      list.innerHTML = _posts.map((p) => renderCard(p, { interactive: true })).join('');
    }
  }

  function _renderLoadMore() {
    const wrap = document.getElementById('fd-more-wrap');
    if (!wrap) return;
    if (_hasMore) {
      wrap.innerHTML =
        '<div style="text-align:center;margin:1.25rem 0;"><button class="fd-load-more-btn" id="fd-load-more">Load more posts</button></div>';
      document.getElementById('fd-load-more').addEventListener('click', _loadMore);
    } else if (_posts.length > 0) {
      wrap.innerHTML =
        '<div style="text-align:center;padding:1.5rem;color:#94a3b8;font-size:0.85rem;">You\'re all caught up! 🙌</div>';
    } else {
      wrap.innerHTML = '';
    }
  }

  function _buildContainer(container) {
    container.innerHTML =
      '<div class="fd-wrap">' +
      renderComposer() +
      '<div id="fd-list"><div class="fd-loading">Loading feed…</div></div>' +
      '<div id="fd-more-wrap"></div>' +
      '</div>';
    _wireComposer();
    _wireList();
  }

  // ── Event wiring ───────────────────────────────────────────────────────────

  function _wireComposer() {
    const pills = document.getElementById('fd-pills');
    if (pills) {
      pills.addEventListener('click', (e) => {
        const pill = e.target.closest('.fd-pill');
        if (!pill) return;
        document
          .querySelectorAll('#fd-pills .fd-pill')
          .forEach((p) => p.classList.remove('fd-pill--active'));
        pill.classList.add('fd-pill--active');
        _selectedType = pill.dataset.type || 'general';
      });
    }

    const ta = document.getElementById('fd-compose-ta');
    if (ta) {
      ta.addEventListener('input', () => {
        const cc = document.getElementById('fd-char-count');
        if (cc) cc.textContent = `${ta.value.length} / 1500`;
      });
    }

    const postBtn = document.getElementById('fd-post-btn');
    if (postBtn) postBtn.addEventListener('click', _handlePost);
  }

  function _wireList() {
    const list = document.getElementById('fd-list');
    if (!list) return;
    list.addEventListener('click', (e) => {
      const likeBtn = e.target.closest('.fd-like-btn');
      if (likeBtn) {
        _handleLike(likeBtn);
        return;
      }
      const flagBtn = e.target.closest('.fd-flag-btn');
      if (flagBtn) {
        _handleFlag(flagBtn);
      }
    });
  }

  // ── Action handlers ────────────────────────────────────────────────────────

  async function _handlePost() {
    if (!_candidate) return;
    const ta = document.getElementById('fd-compose-ta');
    const content = (ta ? ta.value : '').trim();
    if (!content) {
      if (ta) ta.focus();
      return;
    }

    const btn = document.getElementById('fd-post-btn');
    btn.disabled = true;
    btn.textContent = 'Posting…';

    try {
      const { data, error } = await window.sb
        .from('feed_posts')
        .insert([
          {
            author_id: _candidate.id,
            author_type: 'candidate',
            author_name: _candidate.name || 'Anonymous',
            author_avatar: _candidate.photo_url || null,
            post_type: _selectedType,
            content,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      if (ta) {
        ta.value = '';
      }
      const cc = document.getElementById('fd-char-count');
      if (cc) cc.textContent = '0 / 1500';

      _posts.unshift(data);
      _renderList();
      _wireList(); // re-wire after re-render
    } catch (err) {
      console.error('Feed post failed:', err);
      showToast('Could not post. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Post';
    }
  }

  async function _handleLike(btn) {
    if (!_candidate) {
      sessionStorage.setItem('redirect_after_login', window.location.href);
      window.location.href = 'login.html';
      return;
    }

    const postId = btn.dataset.id;
    const post = _posts.find((p) => p.id === postId);
    if (!post) return;

    btn.disabled = true;
    const wasLiked = _myLikedIds.has(postId);

    try {
      if (wasLiked) {
        const { error } = await window.sb
          .from('feed_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', _candidate.id);
        if (error) throw error;
        post.like_count = Math.max(0, (post.like_count || 0) - 1);
        _myLikedIds.delete(postId);
      } else {
        const { error } = await window.sb
          .from('feed_likes')
          .insert([{ post_id: postId, user_id: _candidate.id }]);
        if (error) throw error;
        post.like_count = (post.like_count || 0) + 1;
        _myLikedIds.add(postId);
      }
      // Sync count to DB — fire-and-forget
      window.sb
        .from('feed_posts')
        .update({ like_count: post.like_count })
        .eq('id', postId)
        .then(() => {});
    } catch (err) {
      console.error('Like failed:', err);
    } finally {
      const liked = _myLikedIds.has(postId);
      btn.disabled = false;
      btn.innerHTML = `${liked ? '❤️' : '🤍'} <span class="fd-lc">${post.like_count || 0}</span>`;
      btn.classList.toggle('fd-liked', liked);
      btn.setAttribute('aria-label', `${liked ? 'Unlike' : 'Like'} this post`);
    }
  }

  async function _handleFlag(btn) {
    if (!_candidate) {
      sessionStorage.setItem('redirect_after_login', window.location.href);
      window.location.href = 'login.html';
      return;
    }

    const postId = btn.dataset.id;
    const post = _posts.find((p) => p.id === postId);
    if (!post) return;

    btn.disabled = true;
    post.flag_count = (post.flag_count || 0) + 1;
    const autoHide = post.flag_count >= 3;

    try {
      const { error } = await window.sb
        .from('feed_posts')
        .update({
          flag_count: post.flag_count,
          is_flagged: true,
          ...(autoHide ? { is_hidden: true } : {}),
        })
        .eq('id', postId);
      if (error) throw error;

      btn.textContent = '✓ Reported';
      showToast('Post reported. Thank you for keeping the community safe.');

      // If auto-hidden, remove from local list
      if (autoHide) {
        _posts = _posts.filter((p) => p.id !== postId);
        _renderList();
        _wireList();
      }
    } catch (err) {
      console.error('Flag failed:', err);
      btn.disabled = false;
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────

  async function _loadMore() {
    if (_loading || !_hasMore) return;
    _loading = true;

    try {
      const page = await fetchPage();
      await fetchMyLikes(page.map((p) => p.id));
      _posts = _posts.concat(page);
      _hasMore = page.length === PAGE_SIZE;
      _offset += page.length;
      _renderList();
      _wireList();
      _renderLoadMore();
    } catch (err) {
      console.error('Feed fetch failed:', err);
      const list = document.getElementById('fd-list');
      if (list && !_posts.length) {
        list.innerHTML =
          '<div class="fd-error">Failed to load feed. <button onclick="Feed._retry()" style="background:none;border:none;color:#c2410c;cursor:pointer;font-weight:700;font-family:inherit;">Retry</button></div>';
      }
    } finally {
      _loading = false;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Full feed with composer. Called on profile.html #feed route.
   * Caches posts for CACHE_TTL; re-fetches on cold start or after TTL.
   */
  async function init(containerId, candidate) {
    _candidate = candidate || null;

    injectStyles();

    const container = document.getElementById(containerId);
    if (!container || !window.sb) return;

    // Cache hit: rebuild DOM from existing posts, skip network
    if (_posts.length > 0 && Date.now() - _lastLoad < CACHE_TTL) {
      _buildContainer(container);
      _renderList();
      _wireList();
      _renderLoadMore();
      return;
    }

    // Cold start or TTL expired
    _posts = [];
    _offset = 0;
    _hasMore = true;
    _myLikedIds = new Set();
    _selectedType = 'general';
    _loading = false;

    _buildContainer(container);
    await _loadMore();
    _lastLoad = Date.now();
  }

  /**
   * Read-only preview widget (latest PREVIEW_SIZE posts, no composer/like/flag).
   * Called on index.html homepage.
   */
  async function initPreview(containerId) {
    injectStyles();

    const container = document.getElementById(containerId);
    if (!container || !window.sb) return;

    container.innerHTML = '<div class="fd-wrap"><div class="fd-loading">Loading feed…</div></div>';

    try {
      const posts = await fetchPreviewPosts();
      if (!posts.length) {
        container.innerHTML =
          '<div class="fd-wrap"><div class="fd-empty">No posts yet. Be the first!</div></div>';
        return;
      }
      const candidate = window.Session ? window.Session.getCandidate() : null;
      const feedUrl = candidate ? 'profile.html#feed' : 'login.html';
      container.innerHTML =
        '<div class="fd-wrap">' +
        posts.map((p) => renderCard(p, { interactive: false })).join('') +
        `<div class="fd-preview-cta"><a href="${feedUrl}">See all posts on the Feed →</a></div>` +
        '</div>';
    } catch (err) {
      console.error('Feed preview failed:', err);
      container.innerHTML =
        '<div class="fd-wrap"><div class="fd-error">Could not load feed preview.</div></div>';
    }
  }

  // Exposed for retry button in error state
  function _retry() {
    _loadMore();
  }

  window.Feed = { init, initPreview, _retry };
})();
