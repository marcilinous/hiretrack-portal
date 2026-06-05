// ── SERVICE WORKER + STALE CACHE NUKE ──
if ('serviceWorker' in navigator) {
  // Purge all old caches immediately on page load
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => {
        if (key !== 'hiretrack-v7') {
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

// ── Install the fetch-based REST shim (auth-lock bypass). The implementation
// lives in the shared js/sb-rest-shim.js, which must be loaded *before* this
// file on every page (see the <script src="/js/sb-rest-shim.js"> tag). ──
if (typeof window !== 'undefined' && window.installSbRestShim) {
  window.installSbRestShim(sb, {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    storageKey: 'sb-pdjnpqyzayidthpfmvjk-auth-token'
  });
} else {
  console.error('[HT] sb-rest-shim.js not loaded before app.js — Supabase queries may deadlock. Check the <script src="/js/sb-rest-shim.js"> tag ordering.');
}


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

      return await this._loadAfterAuth(authData.user.id);
    } catch (e) {
      console.error('Employer login error:', e);
      return { ok: false, msg: e.message || 'An error occurred during login. Please check your network connection.' };
    }
  },

  // ── Email OTP (Supabase-native, server-verified by GoTrue) ──
  // sendOtp emails a code to an EXISTING employer. shouldCreateUser:false stops a
  // non-employer email from silently creating an auth user. The 6-digit code is
  // delivered via the Supabase email template ({{ .Token }}).
  async sendOtp(email) {
    try {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) return { ok: false, msg: error.message };
      return { ok: true };
    } catch (e) {
      console.error('Employer sendOtp error:', e);
      return { ok: false, msg: e.message || 'Failed to send OTP. Please try again.' };
    }
  },
  // verifyOtp validates the emailed code with GoTrue and, on success, loads the
  // employer profile and establishes the session.
  async verifyOtp(email, token) {
    try {
      const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) return { ok: false, msg: error.message };
      if (!data?.user) return { ok: false, msg: 'Verification failed. Please try again.' };
      return await this._loadAfterAuth(data.user.id);
    } catch (e) {
      console.error('Employer verifyOtp error:', e);
      return { ok: false, msg: e.message || 'Failed to verify OTP. Please try again.' };
    }
  },

  // Shared: after a real Supabase Auth session exists, load the employer row
  // (id == auth.uid() universally post-v20) and set the session.
  async _loadAfterAuth(userId) {
    const { data: employer } = await sb.from('employers').select('*').eq('id', userId).maybeSingle();
    if (!employer) {
      await sb.auth.signOut();
      return { ok: false, msg: 'Employer profile not found. If you registered as a candidate, please use Candidate Login.' };
    }
    Session.setEmployer(employer);
    return { ok: true, employer };
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
// Rehydrate cached profiles from the real Supabase session. Restores whichever
// profile row(s) exist for this auth user (keyed by id) and NEVER cross-clears the
// other profile. (Cross-clearing was the logout-on-refresh bug: for an account
// whose auth role is 'candidate' but which also has an employer row — e.g. the same
// email used for both — the async restore ran the candidate branch and called
// Session.clearEmployer(), wiping ht_employer from sessionStorage; the next refresh
// then found it empty and bounced to login. Each page guard reads only the profile
// it needs, so setting both is harmless.)
async function restoreProfile(user) {
  if (!user || !user.id) return;
  const { data: emp } = await sb.from('employers').select('*').eq('id', user.id).maybeSingle();
  if (emp) Session.setEmployer(emp);
  const { data: cand } = await sb.from('candidates').select('*').eq('id', user.id).maybeSingle();
  if (cand) Session.setCandidate(cand);
}

// Returns true while a valid (token-bearing) Supabase session is still in storage.
function hasLiveSession() {
  try {
    const s = window.sbQuery && window.sbQuery.readSession && window.sbQuery.readSession();
    return !!(s && s.access_token);
  } catch (e) { return false; }
}

async function syncSession() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) {
      // No Supabase session → only clear the candidate cache (never blindly clear
      // the employer cache here).
      Session.clearCandidate();
      return;
    }
    await restoreProfile(session.user);
  } catch (e) {
    console.error('syncSession error:', e);
  }
}

// Expose the in-flight restore so page guards can await it before redirecting.
// (Employer/candidate profiles live in per-tab sessionStorage, but the real
// Supabase session is in persistent localStorage — a fresh tab must wait for
// syncSession() to rehydrate the profile instead of bouncing to login.)
window.htSessionReady = syncSession();

sb.auth.onAuthStateChange(async (event, session) => {
  if (session && session.user) {
    await restoreProfile(session.user);
  } else if (event === 'SIGNED_OUT') {
    // Only clear if the session is genuinely gone. supabase-js can emit a spurious
    // SIGNED_OUT on load (e.g. a refresh-token rotation race with the REST shim's
    // own refresh); if a valid token is still in storage, keep the user signed in —
    // this was causing a logout on every page refresh. A real logout removes the
    // token first (see EmployerAuth/CandidateAuth.logout), so this still clears then.
    if (!hasLiveSession()) {
      Session.clearCandidate();
      Session.clearEmployer();
    }
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
    // window.sbQuery is the fetch-based shim (same client as sb.from once installed).
    const q = window.sbQuery || sb;
    const { data, error } = await q.from('jobs').insert([{
      employer_id: job.employerId, title: job.title, company: job.company,
      location: job.location, job_type: job.jobType, salary: job.salary,
      experience: job.experience, skills: job.skills, phone: job.phone,
      description: job.description, email: job.email, expires_at: expiryDate.toISOString(),
      pincode: job.pincode || null, city: job.city || null, subcity: job.subcity || null,
      application_deadline: job.application_deadline || null,
      openings: job.openings || 1
    }]).select().single();
    // The v33 trigger raises JOB_SLOTS_FULL when over the slot cap; callers
    // (post-job.html) detect that and show the upgrade / add-on modal.
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

// ── Shared Job-posting form (Bug 3) ──
// Single source of truth for the job fields used by BOTH the employer
// (post-job.html) and executive (executive-dashboard.html) dashboards.
// renderInto() injects the canonical fields; collect() reads them back.
const JobForm = {
  _inputStyle: 'border:1.5px solid #e2e8f0;border-radius:8px;padding:0.6rem 0.75rem;font-size:0.88rem;font-family:inherit;outline:none;width:100%;box-sizing:border-box;background:#fff;',

  fieldsHTML() {
    const s = this._inputStyle;
    return `
      <div class="form-row">
        <div class="fg-form"><label>Job Title *</label><input type="text" id="jf-title" placeholder="e.g. MIS Executive" /></div>
        <div class="fg-form"><label>Job Type *</label>
          <select id="jf-type"><option>Full Time</option><option>Part Time</option><option>Contract</option><option>Remote</option></select>
        </div>
      </div>
      <div class="fg-form"><label>Location *</label>
        <div style="display:grid;grid-template-columns:130px 1fr 1fr;gap:0.5rem;align-items:start;">
          <input type="text" id="jf-pincode" placeholder="Pincode" maxlength="6" inputmode="numeric" style="${s}"/>
          <input type="text" id="jf-city" placeholder="City (auto-filled)" style="${s}"/>
          <select id="jf-subcity" style="${s}"><option value="">Area / Sub-city</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="fg-form"><label>Salary Range (LPA)</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
            <input type="number" id="jf-salary-min" placeholder="Min" min="0" step="0.5" style="${s}"/>
            <input type="number" id="jf-salary-max" placeholder="Max" min="0" step="0.5" style="${s}"/>
          </div>
        </div>
        <div class="fg-form"><label>Experience Required</label>
          <select id="jf-experience"><option>0–1 years (Fresher)</option><option>1–3 years</option><option>3–5 years</option><option>5+ years</option></select>
        </div>
      </div>
      <div class="form-row">
        <div class="fg-form"><label>Application Deadline</label><input type="date" id="jf-deadline" style="${s}"/></div>
        <div class="fg-form"><label>Number of Openings</label><input type="number" id="jf-openings" min="1" value="1" style="${s}"/></div>
      </div>
      <div class="fg-form"><label>Required Skills (comma separated)</label><input type="text" id="jf-skills" placeholder="e.g. Excel, SQL, Power BI" /></div>
      <div class="fg-form"><label>WhatsApp Contact Number *</label><input type="tel" id="jf-phone" placeholder="10-digit mobile" maxlength="10" /></div>
      <div class="fg-form"><label>Job Description *</label><textarea id="jf-description" rows="6" placeholder="Describe the role, responsibilities and requirements..."></textarea></div>
    `;
  },

  renderInto(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = this.fieldsHTML();
    // PincodeUtil (pincode.js) is a top-level `const`, so it's a global lexical
    // binding — NOT a property of window. Reference it directly, not via window.
    if (typeof PincodeUtil !== 'undefined') PincodeUtil.attach('jf-pincode', 'jf-city', 'jf-subcity');
  },

  collect() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    const city = v('jf-city'), subcity = v('jf-subcity');
    const min = v('jf-salary-min'), max = v('jf-salary-max');
    let salary = '';
    if (min && max) salary = `₹${min}–${max} LPA`;
    else if (min || max) salary = `₹${min || max} LPA`;
    return {
      title: v('jf-title'),
      jobType: v('jf-type'),
      pincode: v('jf-pincode'),
      city, subcity,
      location: [subcity, city].filter(Boolean).join(', '),
      salaryMin: min, salaryMax: max, salary,
      experience: v('jf-experience'),
      skills: v('jf-skills'),
      application_deadline: v('jf-deadline') || null,
      openings: parseInt(v('jf-openings'), 10) || 1,
      phone: v('jf-phone'),
      description: v('jf-description'),
    };
  },

  // Shared required-field validation. Returns an error string or null.
  validate(d) {
    if (!d.title || !d.city || !d.phone || !d.description) {
      return 'Please fill all required fields (Job Title, Location, WhatsApp number, Description).';
    }
    if (!/^\d{10}$/.test(d.phone)) return 'Enter a valid 10-digit WhatsApp number.';
    return null;
  },

  // AI: write the Job Description from the fields already entered in the form.
  // Uses callGroq (defined in app.js) and writes the result into #jf-description.
  async generateDescription() {
    const d = this.collect();
    if (!d.title) return { ok: false, msg: 'Enter a Job Title first.' };
    if (typeof callGroq !== 'function') return { ok: false, msg: 'AI is unavailable right now.' };

    const details = [
      `Job Title: ${d.title}`,
      d.jobType ? `Job Type: ${d.jobType}` : '',
      d.location ? `Location: ${d.location}` : '',
      d.salary ? `Salary: ${d.salary}` : '',
      d.experience ? `Experience Required: ${d.experience}` : '',
      d.skills ? `Required Skills: ${d.skills}` : '',
      (d.openings && d.openings > 1) ? `Number of Openings: ${d.openings}` : ''
    ].filter(Boolean).join('\n');

    const prompt = `Write a professional job description based on these details:\n${details}\n\n` +
      `Format: Role Summary (2 lines), Key Responsibilities (4 bullet points), Required Skills (4 items). Plain text only, no markdown.`;

    const answer = await callGroq(prompt);
    if (!answer || /^Error:/i.test(answer)) return { ok: false, msg: answer || 'Could not generate description.' };
    const descEl = document.getElementById('jf-description');
    if (descEl) descEl.value = answer;
    return { ok: true, text: answer };
  }
};
window.JobForm = JobForm;

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
  // For accounts that are BOTH candidate and employer (same email), prefer the
  // employer identity on employer-context pages; candidate-first everywhere else.
  const EMPLOYER_PAGES = ['postjob', 'dashboard', 'pricing', 'messages'];
  const preferEmployer = EMPLOYER_PAGES.indexOf(activePage) !== -1;
  const asEmployer = !!employer && (preferEmployer || !candidate);
  const asCandidate = !!candidate && !asEmployer;
  let rightHTML = '';
  if (asCandidate) {
    rightHTML = `<div class="nav-user"><span class="nav-user-name">Hi, <span>${candidate.name.split(' ')[0]}</span></span><span class="btn-logout" onclick="CandidateAuth.logout()">Logout</span></div>`;
  } else if (asEmployer) {
    rightHTML = `<div class="nav-user"><span class="nav-user-name">Hi, <span>${employer.contact_name.split(' ')[0]}</span></span><a href="/employer-messages.html" class="btn-employer" ${activePage==='messages'?'style="background:#ff9933;border-color:#ff9933;"':''}>💬 Messages</a><a href="/post-job.html" class="btn-signup">+ Post Job</a></div>`;
  } else {
    rightHTML = `<a href="/login.html" class="btn-login">Login</a><a href="/signup.html" class="btn-signup">Sign Up</a><a href="/employer-auth.html" class="btn-employer">For Employers</a>`;
  }

  // Mobile nav links
  let mobileLinks = '';
  if (asCandidate) {
    mobileLinks = `<a href="/jobs.html" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a><a href="/profile.html" ${activePage==='profile'?'class="active"':''}>My Profile</a>`;
  } else if (asEmployer) {
    mobileLinks = `<a href="/employer-dashboard.html" ${activePage==='dashboard'?'class="active"':''}>Dashboard</a><a href="/post-job.html" ${activePage==='postjob'?'class="active"':''}>Post a Job</a><a href="/employer-messages.html" ${activePage==='messages'?'class="active"':''}>💬 Messages</a><a href="/pricing.html" ${activePage==='pricing'?'class="active"':''}>Pricing</a><div class="nav-divider"></div><a href="#" onclick="EmployerAuth.logout()">Logout</a>`;
  } else {
    mobileLinks = `<a href="/index.html" ${activePage==='home'?'class="active"':''}>Home</a><a href="/jobs.html" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a><a href="/blog.html" ${activePage==='blog'?'class="active"':''}>Blog</a><div class="nav-divider"></div><a href="/login.html">Candidate Login</a><a href="/employer-auth.html">Employer Login</a><a href="/signup.html">Sign Up Free</a>`;
  }

  return `<nav class="navbar">
    <a href="${asCandidate ? '/profile.html' : asEmployer ? '/employer-dashboard.html' : '/index.html'}" class="nav-logo">Hire<span>Track</span></a>
    <div class="nav-center">
      ${asEmployer ? `
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
