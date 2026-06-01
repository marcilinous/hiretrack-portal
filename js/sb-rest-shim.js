/**
 * sb-rest-shim.js — bypass the supabase-js v2 auth-lock deadlock.
 *
 * supabase-js v2 guards getSession() and the per-request token lookup behind
 * navigator.locks.request(); in some browsers/webviews that lock never resolves,
 * hanging every query AND every awaited getSession() on page load. This installer
 * replaces sb.from()/sb.rpc() with direct PostgREST fetch calls and
 * sb.auth.getSession()/getUser() with a direct localStorage read, so nothing
 * awaits the lock. All existing call sites keep the same chainable API and the
 * { data, error } return shape — no call-site changes required.
 *
 * Canonical copy of the logic inlined in app.js (kept standalone so pages that
 * don't load app.js — e.g. admin/dashboard.html — can reuse it).
 *
 * Usage:
 *   const sb = supabase.createClient(URL, ANON, { ... });
 *   installSbRestShim(sb, { url: URL, anonKey: ANON, storageKey: 'sb-<ref>-auth-token' });
 *
 * Returns the helper object (also exposed as window.sbQuery).
 */
(function () {
  'use strict';

  function installSbRestShim(sb, opts) {
    opts = opts || {};
    if (!sb || typeof fetch === 'undefined') return null;

    const url = opts.url;
    const ANON = opts.anonKey;
    const STORAGE_KEY = opts.storageKey;
    if (!url || !ANON || !STORAGE_KEY) {
      console.warn('[HT] installSbRestShim: missing url/anonKey/storageKey — not installed');
      return null;
    }
    const REST = url + '/rest/v1';
    const AUTH = url + '/auth/v1';
    const enc = encodeURIComponent;

    // Robust session read: handles the `base64-` storage prefix (recent supabase-js)
    // and the legacy { currentSession } wrapper, falling back to plain JSON.
    function readSession() {
      try {
        let raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
        if (!raw) return null;
        if (raw.startsWith('base64-')) raw = atob(raw.slice(7));
        const p = JSON.parse(raw);
        return (p && p.currentSession) ? p.currentSession : p;
      } catch (e) { return null; }
    }
    function writeSession(s) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {} }
    function token() { const s = readSession(); return (s && s.access_token) ? s.access_token : ANON; }
    function authHeaders(extra) {
      return Object.assign({ apikey: ANON, Authorization: 'Bearer ' + token(), Accept: 'application/json' }, extra || {});
    }
    function result(data, error) { return { data: data, error: error || null }; }

    // Manual refresh-token grant — the real client's auto-refresh may be deadlocked,
    // so without this the app would 401 once the access token expires (~1h).
    let _refreshing = null;
    function refresh() {
      if (_refreshing) return _refreshing;
      const s = readSession();
      if (!s || !s.refresh_token) return Promise.resolve(null);
      _refreshing = fetch(AUTH + '/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      }).then(r => r.ok ? r.json() : null)
        .then(ns => { if (ns && ns.access_token) { writeSession(ns); return ns; } return null; })
        .catch(() => null)
        .finally(() => { _refreshing = null; });
      return _refreshing;
    }

    function from(table) {
      const st = { method: 'GET', cols: null, filters: [], order: [], limit: null, offset: null, body: null, want: false, single: 0, prefer: [] };

      async function exec() {
        const params = [];
        if (st.cols) params.push('select=' + st.cols.replace(/\s+/g, ''));
        st.filters.forEach(f => params.push(f));
        if (st.order.length) params.push('order=' + st.order.join(','));
        if (st.limit != null) params.push('limit=' + st.limit);
        if (st.offset != null) params.push('offset=' + st.offset);
        const reqUrl = REST + '/' + table + (params.length ? ('?' + params.join('&')) : '');

        const headers = authHeaders();
        const prefer = st.prefer.slice();
        if (st.method !== 'GET') {
          headers['Content-Type'] = 'application/json';
          prefer.push(st.want ? 'return=representation' : 'return=minimal');
        }
        if (prefer.length) headers['Prefer'] = prefer.join(',');
        const fetchOpts = { method: st.method, headers: headers };
        if (st.body != null) fetchOpts.body = JSON.stringify(st.body);

        let resp;
        try {
          resp = await fetch(reqUrl, fetchOpts);
          if (resp.status === 401) {
            const ns = await refresh();
            if (ns) { headers.Authorization = 'Bearer ' + ns.access_token; resp = await fetch(reqUrl, fetchOpts); }
          }
        } catch (e) {
          return result(null, { message: e.message || 'Network error', code: 'fetch_error' });
        }

        let payload = null;
        const text = await resp.text();
        if (text) { try { payload = JSON.parse(text); } catch (e) { payload = text; } }

        if (!resp.ok) {
          const err = (payload && typeof payload === 'object')
            ? { message: payload.message || payload.error || resp.statusText, details: payload.details, hint: payload.hint, code: payload.code || String(resp.status) }
            : { message: String(payload || resp.statusText), code: String(resp.status) };
          return result(null, err);
        }

        let data = payload;
        if (st.single) {
          const arr = Array.isArray(data) ? data : (data == null ? [] : [data]);
          if (st.single === 2) {           // maybeSingle
            data = arr.length ? arr[0] : null;
          } else {                          // single
            if (arr.length !== 1) return result(null, { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' });
            data = arr[0];
          }
        }
        return result(data, null);
      }

      const b = {
        select(cols, o) { st.cols = (cols == null ? '*' : cols); if (st.method !== 'GET') st.want = true; if (o && o.count) st.prefer.push('count=' + o.count); return b; },
        insert(rows) { st.method = 'POST'; st.body = rows; return b; },
        upsert(rows, o) { st.method = 'POST'; st.body = rows; st.prefer.push('resolution=merge-duplicates'); if (o && o.onConflict) st.filters.push('on_conflict=' + o.onConflict); return b; },
        update(obj) { st.method = 'PATCH'; st.body = obj; return b; },
        delete() { st.method = 'DELETE'; return b; },
        eq(c, v) { st.filters.push(c + '=eq.' + enc(v)); return b; },
        neq(c, v) { st.filters.push(c + '=neq.' + enc(v)); return b; },
        gt(c, v) { st.filters.push(c + '=gt.' + enc(v)); return b; },
        gte(c, v) { st.filters.push(c + '=gte.' + enc(v)); return b; },
        lt(c, v) { st.filters.push(c + '=lt.' + enc(v)); return b; },
        lte(c, v) { st.filters.push(c + '=lte.' + enc(v)); return b; },
        like(c, v) { st.filters.push(c + '=like.' + enc(v)); return b; },
        ilike(c, v) { st.filters.push(c + '=ilike.' + enc(v)); return b; },
        is(c, v) { st.filters.push(c + '=is.' + (v === null ? 'null' : v)); return b; },
        in(c, arr) { st.filters.push(c + '=in.(' + (arr || []).map(x => enc(x)).join(',') + ')'); return b; },
        contains(c, v) { const val = Array.isArray(v) ? ('{' + v.map(enc).join(',') + '}') : (typeof v === 'object' ? enc(JSON.stringify(v)) : enc(v)); st.filters.push(c + '=cs.' + val); return b; },
        not(c, op, v) { st.filters.push(c + '=not.' + op + '.' + (v === null ? 'null' : enc(v))); return b; },
        or(f) { st.filters.push('or=(' + f + ')'); return b; },
        match(obj) { Object.keys(obj || {}).forEach(k => st.filters.push(k + '=eq.' + enc(obj[k]))); return b; },
        filter(c, op, v) { st.filters.push(c + '=' + op + '.' + enc(v)); return b; },
        order(c, o) { const asc = !o || o.ascending !== false; st.order.push(c + '.' + (asc ? 'asc' : 'desc')); return b; },
        limit(n) { st.limit = n; return b; },
        range(a, c) { st.offset = a; st.limit = (c - a + 1); return b; },
        single() { st.single = 1; return exec(); },
        maybeSingle() { st.single = 2; return exec(); },
        then(res, rej) { return exec().then(res, rej); },
        catch(rej) { return exec().catch(rej); },
        finally(fn) { return exec().finally(fn); }
      };
      return b;
    }

    async function rpc(fn, params) {
      try {
        const resp = await fetch(REST + '/rpc/' + fn, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(params || {}) });
        const text = await resp.text();
        let payload = null; if (text) { try { payload = JSON.parse(text); } catch (e) { payload = text; } }
        if (!resp.ok) return result(null, (payload && payload.message) ? payload : { message: String(payload || resp.statusText), code: String(resp.status) });
        return result(payload, null);
      } catch (e) { return result(null, { message: e.message, code: 'fetch_error' }); }
    }

    // Install over the real client so all existing sb.from()/sb.rpc()/getSession()
    // calls route through fetch instead of the deadlocking lock.
    sb.from = from;
    sb.rpc = rpc;
    if (sb.auth) {
      sb.auth.getSession = async () => ({ data: { session: readSession() }, error: null });
      sb.auth.getUser = async () => { const s = readSession(); return { data: { user: s ? s.user : null }, error: null }; };
    }

    const helper = { from, rpc, readSession, token, refresh };
    try { window.sbQuery = helper; } catch (e) {}
    console.log('[HT] Supabase REST shim active (auth-lock bypass)');
    return helper;
  }

  try { window.installSbRestShim = installSbRestShim; } catch (e) {}
})();
