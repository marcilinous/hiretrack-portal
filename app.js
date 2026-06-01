// ── SERVICE WORKER + STALE CACHE NUKE ──
if ('serviceWorker' in navigator) {
  // Purge all old caches immediately on page load
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => {
        if (key !== 'hiretrack-v6') {
          caches.delete(key);
          console.log('[HT] Purged stale cache:', key);
        }
      });
    });
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Force the new SW to install and activate immediately
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        if (newSW) {
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'activated') {
              console.log('[HT] New service worker activated');
            }
          });
        }
      });
    }).catch(() => {});
  });
}

// ── SUPABASE CONFIG ──
const supabaseUrl = 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkam5wcXl6YXlpZHRocGZtdmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMTY4NDgsImV4cCI6MjA5MjU5Mjg0OH0.h0R_BKqPX0GhXS4LBnmkDAVh5ZN91p-qcs2gHrTcSvQ';
const SUPABASE_URL = supabaseUrl;
const SUPABASE_KEY = supabaseAnonKey;

// Safe storage engine to prevent SecurityError in restricted environments (e.g. Private Mode)
let _storageMem = {};
const safeLocalStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return _storageMem[key] || null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      _storageMem[key] = value;
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
    delete _storageMem[key];
  }
};

let sb;
try {
  if (typeof supabase !== 'undefined') {
    sb = supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: safeLocalStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sb-pdjnpqyzayidthpfmvjk-auth-token',
        // ── navigator LockManager deadlock fix ──
        // supabase-js wraps getSession() (and the token lookup before every query)
        // in navigator.locks.request(). In some browsers / in-app webviews that lock
        // is never granted, so getSession() — and everything that awaits it — hangs
        // forever, even though the JWT is valid in localStorage. This pass-through
        // lock runs the callback immediately without touching navigator.locks,
        // resolving the deadlock while leaving session persistence and auto-refresh
        // fully intact.
        lock: async (_name, _acquireTimeout, fn) => await fn()
      }
    });
  } else {
    console.error('Supabase library is not loaded. JSDelivr CDN might be blocked.');
    const mockFunc = () => { throw new Error('Authentication service is currently unavailable. Please check your internet connection or disable ad-blockers.'); };
    sb = {
      auth: {
        signUp: mockFunc,
        signInWithPassword: mockFunc,
        signInWithOtp: mockFunc,
        verifyOtp: mockFunc,
        signOut: mockFunc,
        getSession: mockFunc,
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        resetPasswordForEmail: mockFunc,
        updateUser: mockFunc,
        getUser: mockFunc
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: mockFunc,
            single: mockFunc,
            order: mockFunc
          }),
          or: () => ({
            maybeSingle: mockFunc
          }),
          order: mockFunc
        }),
        insert: () => ({
          select: () => ({
            single: mockFunc
          })
        }),
        update: () => ({
          eq: mockFunc
        }),
        delete: () => ({
          eq: mockFunc
        })
      }),
      storage: {
        from: () => ({
          upload: mockFunc,
          getPublicUrl: () => ({ data: { publicUrl: '' } })
        })
      }
    };
  }
} catch (e) {
  console.error('Failed to initialize Supabase client:', e);
}
window.sb = sb;

// ── REST query shim: bypass supabase-js auth-lock deadlock ───────────────────
// supabase-js v2 guards getSession() and the per-request token lookup behind
// navigator.locks.request(); in some browsers/webviews that lock never resolves,
// hanging every query AND every awaited getSession() on page load. This shim
// replaces sb.from()/sb.rpc() with direct PostgREST fetch calls and
// sb.auth.getSession() with a direct localStorage read, so nothing awaits the lock.
// All existing call sites keep working unchanged (same chainable API, same
// { data, error } return shape). Auth writes (signIn/signUp/signOut) and storage
// remain on the real client.
(function installRestShim() {
  if (!sb || typeof fetch === 'undefined') return;
  const REST = supabaseUrl + '/rest/v1';
  const AUTH = supabaseUrl + '/auth/v1';
  const ANON = supabaseAnonKey;
  const STORAGE_KEY = 'sb-pdjnpqyzayidthpfmvjk-auth-token';
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
      const url = REST + '/' + table + (params.length ? ('?' + params.join('&')) : '');

      const headers = authHeaders();
      const prefer = st.prefer.slice();
      if (st.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        prefer.push(st.want ? 'return=representation' : 'return=minimal');
      }
      if (prefer.length) headers['Prefer'] = prefer.join(',');
      const opts = { method: st.method, headers: headers };
      if (st.body != null) opts.body = JSON.stringify(st.body);

      let resp;
      try {
        resp = await fetch(url, opts);
        if (resp.status === 401) {
          const ns = await refresh();
          if (ns) { headers.Authorization = 'Bearer ' + ns.access_token; resp = await fetch(url, opts); }
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
      select(cols, opts) { st.cols = (cols == null ? '*' : cols); if (st.method !== 'GET') st.want = true; if (opts && opts.count) st.prefer.push('count=' + opts.count); return b; },
      insert(rows) { st.method = 'POST'; st.body = rows; return b; },
      upsert(rows, opts) { st.method = 'POST'; st.body = rows; st.prefer.push('resolution=merge-duplicates'); if (opts && opts.onConflict) st.filters.push('on_conflict=' + opts.onConflict); return b; },
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
      order(c, opts) { const asc = !opts || opts.ascending !== false; st.order.push(c + '.' + (asc ? 'asc' : 'desc')); return b; },
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

  // Install over the real client so all existing sb.from()/sb.rpc()/getSession() calls
  // route through fetch instead of the deadlocking lock.
  sb.from = from;
  sb.rpc = rpc;
  if (sb.auth) {
    sb.auth.getSession = async () => ({ data: { session: readSession() }, error: null });
    sb.auth.getUser = async () => { const s = readSession(); return { data: { user: s ? s.user : null }, error: null }; };
  }
  window.sbQuery = { from, rpc, readSession, token, refresh };
  console.log('[HT] Supabase REST shim active (auth-lock bypass)');
})();


const JOBS = [
  { id:'static-1', title:'MIS Executive', company:'Infosys BPM', location:'Bengaluru', salary:'₹4–6 LPA', type:'Full Time', tags:['Excel','MIS','Reporting'], posted:'2 days ago', phone:'9876543210' },
  { id:'static-2', title:'Data Analyst', company:'Manipal Health', location:'Manipal', salary:'₹5–8 LPA', type:'Full Time', tags:['SQL','Python','Tableau'], posted:'1 day ago', phone:'9845012345' },
  { id:'static-3', title:'Excel Reporting Analyst', company:'Decathlon India', location:'Bengaluru', salary:'₹3.5–5 LPA', type:'Full Time', tags:['Excel','Power BI','VBA'], posted:'3 days ago', phone:'9900112233' },
  { id:'static-4', title:'SQL Database Executive', company:'Ninjacart', location:'Bengaluru', salary:'₹4–7 LPA', type:'Contract', tags:['SQL','MySQL','Reporting'], posted:'Today', phone:'9123456780' },
  { id:'static-5', title:'BI Analyst', company:'KPMG India', location:'Bengaluru', salary:'₹7–11 LPA', type:'Full Time', tags:['Power BI','DAX','SQL'], posted:'4 days ago', phone:'9988776655' },
  { id:'static-6', title:'MIS & Automation Analyst', company:'Bigbasket', location:'Bengaluru', salary:'₹5–8 LPA', type:'Full Time', tags:['Excel','Automation','Python'], posted:'Today', phone:'9871234560' },
  { id:'static-7', title:'Operations Data Analyst', company:'Zepto', location:'Remote', salary:'₹6–9 LPA', type:'Remote', tags:['SQL','Excel','Analytics'], posted:'2 days ago', phone:'9765432109' },
  { id:'static-8', title:'Reporting Executive', company:'TVS Motors', location:'Mysuru', salary:'₹3–5 LPA', type:'Full Time', tags:['Excel','MIS','SAP'], posted:'5 days ago', phone:'9654321098' },
  { id:'static-9', title:'AI Operations Analyst', company:'Accenture', location:'Bengaluru', salary:'₹8–13 LPA', type:'Full Time', tags:['AI','Automation','Python'], posted:'1 day ago', phone:'9543210987' },
  { id:'static-10', title:'Data Entry & Reporting Officer', company:'Karnataka Bank', location:'Mangaluru', salary:'₹2.5–4 LPA', type:'Full Time', tags:['Excel','Data Entry','MIS'], posted:'3 days ago', phone:'9432109876' },
  { id:'static-11', title:'Business Analyst', company:'Wipro', location:'Bengaluru', salary:'₹6–10 LPA', type:'Full Time', tags:['SQL','Power BI','Excel'], posted:'Today', phone:'9321098765' },
  { id:'static-12', title:'MIS Officer', company:'Apollo Hospitals', location:'Bengaluru', salary:'₹4–6 LPA', type:'Full Time', tags:['MIS','Excel','Reporting'], posted:'2 days ago', phone:'9210987654' },
];

let _candidateMem = null;
let _employerMem = null;

const Session = {
  getCandidate() {
    try {
      return JSON.parse(sessionStorage.getItem('ht_candidate') || 'null');
    } catch {
      return _candidateMem;
    }
  },
  setCandidate(c) {
    try {
      sessionStorage.setItem('ht_candidate', JSON.stringify(c));
    } catch {}
    _candidateMem = c;
  },
  clearCandidate() {
    try {
      sessionStorage.removeItem('ht_candidate');
    } catch {}
    _candidateMem = null;
  },
  getEmployer() {
    try {
      return JSON.parse(sessionStorage.getItem('ht_employer') || 'null');
    } catch {
      return _employerMem;
    }
  },
  setEmployer(e) {
    try {
      sessionStorage.setItem('ht_employer', JSON.stringify(e));
    } catch {}
    _employerMem = e;
  },
  clearEmployer() {
    try {
      sessionStorage.removeItem('ht_employer');
    } catch {}
    _employerMem = null;
  }
};
window.Session = Session;

const CandidateAuth = {
  async register(data, resumeFile = null) {
    try {
      const { data: res, error } = await sb.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            role: 'candidate',
            name: data.name,
            mobile: data.mobile,
            city: data.city,
            experience: data.experience,
            jobtitle: data.jobtitle,
            skills: data.skills || [],
            about: data.about || '',
            current_company: data.currentCompany || '',
            preferred_job_type: data.preferredJobType || '',
            expected_salary: data.expectedSalary || '',
            notice_period: data.noticePeriod || ''
          }
        }
      });
      if (error) return { ok: false, msg: error.message };

      const user = res.user;
      const session = res.session;

      // Handle resume file upload if session is active (logged in immediately)
      if (session && resumeFile) {
        try {
          const ext = resumeFile.name.split('.').pop().toLowerCase() || 'pdf';
          const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await sb.storage.from('resumes').upload(path, resumeFile, { upsert: true, contentType: resumeFile.type });
          if (!upErr) {
            const { data: { publicUrl } } = sb.storage.from('resumes').getPublicUrl(path);
            await sb.from('candidates').update({ resume_url: publicUrl, resume_name: resumeFile.name }).eq('id', user.id);
          }
        } catch (e) {
          console.error('Resume upload error on signup:', e);
        }
      }

      if (session) {
        const { data: candidate } = await sb.from('candidates').select('*').eq('id', user.id).maybeSingle();
        if (candidate) {
          Session.setCandidate(candidate);
          return { ok: true, candidate };
        }
      }

      return { ok: true, msg: 'Verification link sent! Please check your email.', user };
    } catch (e) {
      console.error('Registration error:', e);
      return { ok: false, msg: e.message || 'An error occurred during registration. Please try again.' };
    }
  },
  async login(email, password) {
    try {
      const { data: authData, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, msg: error.message };

      // Race the candidate profile fetch against a 10s timeout
      const candidatePromise = sb.from('candidates').select('*').eq('id', authData.user.id).maybeSingle();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Database query timed out. Please try again.')), 10000));

      let candidateResult;
      try {
        candidateResult = await Promise.race([candidatePromise, timeoutPromise]);
      } catch (timeoutErr) {
        console.error('Candidate fetch timeout:', timeoutErr);
        await sb.auth.signOut();
        return { ok: false, msg: timeoutErr.message };
      }

      const candidate = candidateResult?.data;
      if (!candidate) {
        await sb.auth.signOut();
        return { ok: false, msg: 'Candidate profile not found. If you registered as an employer, please use Employer Login.' };
      }

      Session.setCandidate(candidate);
      return { ok: true, candidate };
    } catch (e) {
      console.error('Login error:', e);
      return { ok: false, msg: e.message || 'An error occurred during login. Please check your network connection.' };
    }
  },
  async logout() {
    try {
      localStorage.removeItem('sb-pdjnpqyzayidthpfmvjk-auth-token');
    } catch (e) {
      console.warn('localStorage access failed:', e);
    }
    Session.clearCandidate();
    Session.clearEmployer();
    try {
      sb.auth.signOut();
    } catch (e) {
      console.error('SignOut error:', e);
    }
    window.location.href = 'index.html';
  }
};
window.CandidateAuth = CandidateAuth;

const EmployerAuth = {
  async checkExists(identifier) {
    try {
      const { data } = await sb.from('employers').select('*').or(`email.eq.${identifier},mobile.eq.${identifier}`).maybeSingle();
      return data || null;
    } catch (e) {
      console.error('Check exists error:', e);
      return null;
    }
  },
  async register(data) {
    try {
      const { data: res, error } = await sb.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            role: 'employer',
            company: data.company,
            contact_name: data.contactName,
            mobile: data.mobile,
            city: data.city,
            industry: data.industry
          }
        }
      });
      if (error) return { ok: false, msg: error.message };

      const user = res.user;
      const session = res.session;

      if (session) {
        const { data: employer } = await sb.from('employers').select('*').eq('id', user.id).maybeSingle();
        if (employer) {
          Session.setEmployer(employer);
          return { ok: true, employer };
        }
      }

      return { ok: true, msg: 'Verification link sent! Please check your email.', user };
    } catch (e) {
      console.error('Employer registration error:', e);
      return { ok: false, msg: e.message || 'An error occurred during registration. Please try again.' };
    }
  },
  async login(identifier, password) {
    try {
      let email = identifier;
      if (!identifier.includes('@')) {
        const { data } = await sb.from('employers').select('email').eq('mobile', identifier).maybeSingle();
        if (data?.email) email = data.email;
      }

      const { data: authData, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, msg: error.message };

      const { data: employer } = await sb.from('employers').select('*').eq('id', authData.user.id).maybeSingle();
      if (!employer) {
        await sb.auth.signOut();
        return { ok: false, msg: 'Employer profile not found' };
      }

      Session.setEmployer(employer);
      return { ok: true, employer };
    } catch (e) {
      console.error('Employer login error:', e);
      return { ok: false, msg: e.message || 'An error occurred during login. Please check your network connection.' };
    }
  },
  async logout() {
    try {
      localStorage.removeItem('sb-pdjnpqyzayidthpfmvjk-auth-token');
    } catch (e) {
      console.warn('localStorage access failed:', e);
    }
    Session.clearCandidate();
    Session.clearEmployer();
    try {
      sb.auth.signOut();
    } catch (e) {
      console.error('SignOut error:', e);
    }
    window.location.href = 'index.html';
  }
};
window.EmployerAuth = EmployerAuth;

// ── SESSION & AUTH STATE SYNCHRONIZATION ──
async function syncSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
      const user = session.user;
      const role = user.user_metadata?.role;
      if (role === 'candidate') {
        const { data: candidate } = await sb.from('candidates').select('*').eq('id', user.id).maybeSingle();
        if (candidate) {
          Session.setCandidate(candidate);
          Session.clearEmployer();
        }
      } else if (role === 'employer') {
        const { data: employer } = await sb.from('employers').select('*').eq('id', user.id).maybeSingle();
        if (employer) {
          Session.setEmployer(employer);
          Session.clearCandidate();
        }
      }
    } else {
      Session.clearCandidate();
      Session.clearEmployer();
    }
  } catch (e) {
    console.error('syncSession error:', e);
  }
}

syncSession();

sb.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    const user = session.user;
    const role = user.user_metadata?.role;
    if (role === 'candidate') {
      const { data: candidate } = await sb.from('candidates').select('*').eq('id', user.id).maybeSingle();
      if (candidate) {
        Session.setCandidate(candidate);
        Session.clearEmployer();
      }
    } else if (role === 'employer') {
      const { data: employer } = await sb.from('employers').select('*').eq('id', user.id).maybeSingle();
      if (employer) {
        Session.setEmployer(employer);
        Session.clearCandidate();
      }
    }
  } else if (event === 'SIGNED_OUT') {
    Session.clearCandidate();
    Session.clearEmployer();
  }
});

const JobsDB = {
  async getEmployerJobs(employerId) {
    const { data } = await sb.from('jobs').select('*').eq('employer_id', employerId).order('posted_at', { ascending: false });
    return data || [];
  },
  async getAllPublicJobs() {
    const { data } = await sb.from('jobs').select('*').eq('delisted', false).order('posted_at', { ascending: false });
    return data || [];
  },
async sendJobAlerts(job) {
    // Find candidates whose skills or city match this job
    try {
      const { data: candidates } = await sb
        .from('candidates')
        .select('id, name, email, city, skills, job_alerts_enabled')
        .eq('job_alerts_enabled', true)
        .not('email', 'is', null);

      if (!candidates || !candidates.length) return;

      const jobSkills = (job.skills || '').toLowerCase().split(',').map(s => s.trim());
      const jobLocation = (job.location || '').toLowerCase();
      const jobTitle = (job.title || '').toLowerCase();

      // Score candidates by relevance
      const matches = candidates.filter(c => {
        if (!c.email) return false;
        const candSkills = Array.isArray(c.skills)
          ? c.skills.map(s => s.toLowerCase())
          : (c.skills || '').toLowerCase().split(',').map(s => s.trim());
        const candCity = (c.city || '').toLowerCase();

        // Match if: same city OR remote job OR skill overlap
        const cityMatch = jobLocation === 'remote' || candCity === jobLocation || jobLocation.includes(candCity) || candCity.includes(jobLocation);
        const skillMatch = jobSkills.some(js => candSkills.some(cs => cs.includes(js) || js.includes(cs)));
        const titleMatch = candSkills.some(cs => jobTitle.includes(cs));

        return cityMatch || skillMatch || titleMatch;
      });

      if (!matches.length) return;

      // Send email alerts (max 50 per job to avoid spam)
      const toNotify = matches.slice(0, 50);
      for (const candidate of toNotify) {
        await fetch('/api/email?action=job-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: candidate.email,
            candidateName: candidate.name,
            jobTitle: job.title,
            company: job.company,
            location: job.location,
            salary: job.salary || 'Negotiable',
            jobType: job.job_type || job.jobType,
          })
        }).catch(() => {}); // Silent fail per email
      }
      console.log(`Job alerts sent to ${toNotify.length} candidates`);
    } catch(e) {
      console.error('Job alert error:', e);
    }
  },

  async postJob(job) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + (job.dayLimit || 15));
    const { data, error } = await sb.from('jobs').insert([{
      employer_id: job.employerId, title: job.title, company: job.company,
      location: job.location, job_type: job.jobType, salary: job.salary,
      experience: job.experience, skills: job.skills, phone: job.phone,
      description: job.description, email: job.email, expires_at: expiryDate.toISOString()
    }]).select().single();
    if (error) return { ok: false, msg: error.message };
    return { ok: true, job: data };
  },
  async deleteJob(jobId) { await sb.from('jobs').delete().eq('id', jobId); },
  async updateJob(jobId, updates) { await sb.from('jobs').update(updates).eq('id', jobId); },
  async extendJob(jobId, currentExpiry) {
    const base = currentExpiry && new Date(currentExpiry) > new Date() ? new Date(currentExpiry) : new Date();
    base.setDate(base.getDate() + 15);
    await sb.from('jobs').update({ expires_at: base.toISOString() }).eq('id', jobId);
  }
};

const ApplicationsDB = {
  async apply(candidateId, jobId) {
    const { data: existing } = await sb.from('applications').select('id').eq('candidate_id', candidateId).eq('job_id', jobId).maybeSingle();
    if (existing) return { ok: false, msg: 'Already applied' };
    const { error } = await sb.from('applications').insert([{ candidate_id: candidateId, job_id: String(jobId), status: 'Applied' }]);
    if (error) return { ok: false, msg: error.message };
    return { ok: true };
  },
  async getCandidateApplications(candidateId) {
    const { data } = await sb.from('applications').select('*').eq('candidate_id', candidateId).order('applied_at', { ascending: false });
    return data || [];
  },
  async getJobApplications(jobId) {
    const { data } = await sb.from('applications').select('*, candidates(*)').eq('job_id', String(jobId));
    return data || [];
  },
  async updateStatus(candidateId, jobId, status) {
    await sb.from('applications').update({ status }).eq('candidate_id', candidateId).eq('job_id', String(jobId));
  }
};

async function upgradePlan(employerId, planName, paymentId) {
  const limits = { free:{jobs:1,days:15}, starter:{jobs:3,days:30}, pro:{jobs:10,days:60} };
  const plan = limits[planName];
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await sb.from('employers').update({
    plan: planName, payment_id: paymentId,
    plan_expires_at: expiresAt.toISOString(),
    job_limit: plan.jobs, day_limit: plan.days
  }).eq('id', employerId);
  const employer = Session.getEmployer();
  if (employer) { employer.plan = planName; employer.job_limit = plan.jobs; employer.day_limit = plan.days; Session.setEmployer(employer); }
}

function isJobExpired(job) {
  const expiry = job.expires_at || job.expiresAt;
  if (!expiry) return false;
  return new Date() > new Date(expiry);
}

function getDaysLeft(job) {
  const expiry = job.expires_at || job.expiresAt;
  if (!expiry) return null;
  return Math.ceil((new Date(expiry) - new Date()) / (1000*60*60*24));
}

function getExpiryLabel(job) {
  const days = getDaysLeft(job);
  if (days === null) return null;
  if (days < 0) return { text:'Expired', class:'expiry-expired' };
  if (days === 0) return { text:'Expires today', class:'expiry-urgent' };
  if (days <= 3) return { text:`Expires in ${days}d`, class:'expiry-urgent' };
  return { text:`${days}d left`, class:'expiry-ok' };
}

function renderNavbar(activePage) {
  const candidate = Session.getCandidate();
  const employer = Session.getEmployer();
  let rightHTML = '';
  if (candidate) {
    rightHTML = `<div class="nav-user"><span class="nav-user-name">Hi, <span>${candidate.name.split(' ')[0]}</span></span><span class="btn-logout" onclick="CandidateAuth.logout()">Logout</span></div>`;
  } else if (employer) {
    rightHTML = `<div class="nav-user"><span class="nav-user-name">Hi, <span>${employer.contact_name.split(' ')[0]}</span></span><a href="/employer-messages.html" class="btn-employer" ${activePage==='messages'?'style="background:#ff9933;border-color:#ff9933;"':''}>💬 Messages</a><a href="/post-job.html" class="btn-signup">+ Post Job</a></div>`;
  } else {
    rightHTML = `<a href="/login.html" class="btn-login">Login</a><a href="/signup.html" class="btn-signup">Sign Up</a><a href="/employer-auth.html" class="btn-employer">For Employers</a>`;
  }

  // Mobile nav links
  let mobileLinks = '';
  if (candidate) {
    mobileLinks = `<a href="/jobs.html" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a><a href="/profile.html" ${activePage==='profile'?'class="active"':''}>My Profile</a>`;
  } else if (employer) {
    mobileLinks = `<a href="/employer-dashboard.html" ${activePage==='dashboard'?'class="active"':''}>Dashboard</a><a href="/post-job.html" ${activePage==='postjob'?'class="active"':''}>Post a Job</a><a href="/employer-messages.html" ${activePage==='messages'?'class="active"':''}>💬 Messages</a><a href="/pricing.html" ${activePage==='pricing'?'class="active"':''}>Pricing</a><div class="nav-divider"></div><a href="#" onclick="EmployerAuth.logout()">Logout</a>`;
  } else {
    mobileLinks = `<a href="/index.html" ${activePage==='home'?'class="active"':''}>Home</a><a href="/jobs.html" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a><a href="/blog.html" ${activePage==='blog'?'class="active"':''}>Blog</a><div class="nav-divider"></div><a href="/login.html">Candidate Login</a><a href="/employer-auth.html">Employer Login</a><a href="/signup.html">Sign Up Free</a>`;
  }

  return `<nav class="navbar">
    <a href="${candidate ? '/profile.html' : employer ? '/employer-dashboard.html' : '/index.html'}" class="nav-logo">Hire<span>Track</span></a>
    <div class="nav-center">
      ${employer ? `
        <a href="/employer-dashboard.html" ${activePage==='dashboard'?'class="active"':''}>Dashboard</a>
        <a href="/post-job.html" ${activePage==='postjob'?'class="active"':''}>Post a Job</a>
        <a href="/pricing.html" ${activePage==='pricing'?'class="active"':''}>Pricing</a>
      ` : `
        ${activePage !== 'profile' ? `<a href="/index.html" ${activePage==='home'?'class="active"':''}>Home</a>` : ''}
        <a href="/jobs.html" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a>
        <a href="/blog.html" ${activePage==='blog'?'class="active"':''}>Blog</a>
      `}
    </div>
    <div class="nav-right">${rightHTML}</div>
    <button class="mobile-menu-btn" onclick="toggleMobileMenu()" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </nav>
  <div class="mobile-nav" id="mobile-nav">${mobileLinks}</div>`;
}

function renderJobCard(job, applications=[]) {
  const candidate = Session.getCandidate();
  const alreadyApplied = candidate && applications.find(a => a.job_id === String(job.id));
  const typeClass = {'Full Time':'badge-full','Contract':'badge-contract','Remote':'badge-remote'};
  const waMsg = encodeURIComponent(`Hi, I found your job posting for *${job.title}* at *${job.company}* on HireTrack. I would like to apply.`);
  const expired = isJobExpired(job);
  const expiry = getExpiryLabel(job);
  const tags = Array.isArray(job.tags) ? job.tags : (job.skills||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,3);
  return `<div class="job-card ${expired?'job-expired':''}" onclick="openJobModal('${job.id}')">
    <div class="jc-top"><div class="jc-title">${job.title}</div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">${expiry?`<span class="expiry-badge ${expiry.class}">${expiry.text}</span>`:''}<span class="badge ${typeClass[job.type||job.job_type]||'badge-full'}">${job.type||job.job_type}</span></div></div>
    <div class="jc-company">🏢 ${job.company}</div>
    <div class="jc-meta"><span>📍 ${job.location}</span><span>💰 ${job.salary||'Negotiable'}</span><span>🕒 ${job.posted||new Date(job.posted_at).toLocaleDateString('en-IN')}</span></div>
    <div class="jc-tags">${tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
    <div class="jc-footer" onclick="event.stopPropagation()">
      ${job.phone ? `<button class="btn-whatsapp" onclick="whatsappApply('${job.phone}','${waMsg}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.532 5.857L.057 23.925l6.235-1.635A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.494-5.193-1.355l-.372-.22-3.7.971 1.008-3.573-.242-.383A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg> WhatsApp</button>` : ''}
      <button class="btn-apply ${alreadyApplied?'applied':''} ${expired?'expired-btn':''}" style="${!job.phone?'flex:1;':''}" onclick="${expired?`showToast('This job has expired.')`:`applyJob('${job.id}',this)`}">${expired?'⚠ Expired':alreadyApplied?'✓ Applied':'Apply Now'}</button>
    </div>
  </div>`;
}

function renderJobs(jobs, containerId, applications=[]) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!jobs.length) { el.innerHTML='<div class="empty-state"><div class="es-icon">🔍</div><p>No jobs found.</p></div>'; return; }
  el.innerHTML = jobs.map(j => renderJobCard(j, applications)).join('');
}

function whatsappApply(phone, msg) {
  const candidate = Session.getCandidate();
  if (!candidate) { sessionStorage.setItem('redirect_after_login', window.location.href); showToast('Please login to apply via WhatsApp!'); setTimeout(()=>window.location.href='login.html',1500); return; }
  window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg+` My name is ${candidate.name}, ${candidate.experience} experience.`)}`, '_blank');
}

async function applyJob(jobId, btn) {
  const candidate = Session.getCandidate();
  if (!candidate) { sessionStorage.setItem('redirect_after_login', window.location.href); window.location.href='login.html'; return; }
  btn.textContent = 'Applying...'; btn.disabled = true;

  // Insert with status "Applied"
  const { data: existing } = await sb.from('applications').select('id,status').eq('candidate_id', candidate.id).eq('job_id', String(jobId)).maybeSingle();
  if (existing) {
    btn.textContent='✓ Applied'; btn.classList.add('applied');
    showToast('Already applied to this job.');
    return;
  }
  const { error } = await sb.from('applications').insert([{ candidate_id: candidate.id, job_id: String(jobId), status: 'Applied' }]);
  if (!error) {
    btn.textContent = '✓ Applied'; btn.classList.add('applied');
    showToast('✅ Applied! Notifying employer...');
    const job = [...JOBS, ...(window._employerJobs||[])].find(j=>String(j.id)===String(jobId));
    if (job?.email) {
      fetch('/api/email?action=notify-employer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employerEmail: job.email,
          company: job.company,
          jobTitle: job.title,
          candidateName: candidate.name,
          candidateCity: candidate.city,
          candidateExperience: candidate.experience,
          candidateSkills: Array.isArray(candidate.skills) ? candidate.skills : []
        })
      }).catch(() => {});
    }
  } else {
    btn.textContent='Apply Now'; btn.disabled=false;
    showToast('Failed. Try again.');
  }
}


async function callGroq(prompt) {
  try { const res = await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})}); const data=await res.json(); return data.answer||'Could not get a response.'; }
  catch(e) { return `Error: ${e.message}`; }
}

async function askAI() {
  const input = document.getElementById('ai-input');
  const box = document.getElementById('ai-response');
  const q = input?.value?.trim(); if(!q) return;
  box.style.display='block'; box.innerHTML='<span class="ai-loading">Thinking...</span>';
  box.textContent = await callGroq(q); input.value='';
}

function quickAsk(q) { document.getElementById('ai-input').value=q; askAI(); }

function toggleMobileMenu() {
  const nav = document.getElementById('mobile-nav');
  if (nav) nav.classList.toggle('open');
}

// Close mobile menu on link click
document.addEventListener('click', e => {
  const nav = document.getElementById('mobile-nav');
  if (nav && nav.classList.contains('open') && e.target.tagName === 'A') {
    nav.classList.remove('open');
  }
});

function showToast(msg) {
  let t=document.getElementById('ht-toast');
  if(!t){t=document.createElement('div');t.id='ht-toast';t.style.cssText='position:fixed;bottom:1.5rem;right:1.5rem;background:#1e293b;color:#fff;padding:0.75rem 1.2rem;border-radius:10px;font-size:0.88rem;font-weight:600;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,0.2);transition:opacity 0.3s;';document.body.appendChild(t);}
  t.textContent=msg; t.style.opacity='1'; setTimeout(()=>t.style.opacity='0',2500);
}

document.addEventListener('keydown', e => {
  if(e.key==='Enter'&&document.activeElement?.id==='ai-input') askAI();
  if(e.key==='Escape'){const m=document.getElementById('jd-modal');if(m){m.classList.remove('show');document.body.style.overflow='';}}
});
