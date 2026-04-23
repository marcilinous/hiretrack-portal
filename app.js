// ── CONFIG ──
const GEMINI_API_KEY = 'AIzaSyBifOCm37o1lAsNvy00FG2EjWkzOlcM4OI';

// ── JOB DATA ──
const JOBS = [
  { id:1, title:'MIS Executive', company:'Infosys BPM', location:'Bengaluru', salary:'₹4–6 LPA', type:'Full Time', tags:['Excel','MIS','Reporting'], posted:'2 days ago', phone:'9876543210' },
  { id:2, title:'Data Analyst', company:'Manipal Health', location:'Manipal', salary:'₹5–8 LPA', type:'Full Time', tags:['SQL','Python','Tableau'], posted:'1 day ago', phone:'9845012345' },
  { id:3, title:'Excel Reporting Analyst', company:'Decathlon India', location:'Bengaluru', salary:'₹3.5–5 LPA', type:'Full Time', tags:['Excel','Power BI','VBA'], posted:'3 days ago', phone:'9900112233' },
  { id:4, title:'SQL Database Executive', company:'Ninjacart', location:'Bengaluru', salary:'₹4–7 LPA', type:'Contract', tags:['SQL','MySQL','Reporting'], posted:'Today', phone:'9123456780' },
  { id:5, title:'BI Analyst', company:'KPMG India', location:'Bengaluru', salary:'₹7–11 LPA', type:'Full Time', tags:['Power BI','DAX','SQL'], posted:'4 days ago', phone:'9988776655' },
  { id:6, title:'MIS & Automation Analyst', company:'Bigbasket', location:'Bengaluru', salary:'₹5–8 LPA', type:'Full Time', tags:['Excel','Automation','Python'], posted:'Today', phone:'9871234560' },
  { id:7, title:'Operations Data Analyst', company:'Zepto', location:'Remote', salary:'₹6–9 LPA', type:'Remote', tags:['SQL','Excel','Analytics'], posted:'2 days ago', phone:'9765432109' },
  { id:8, title:'Reporting Executive', company:'TVS Motors', location:'Mysuru', salary:'₹3–5 LPA', type:'Full Time', tags:['Excel','MIS','SAP'], posted:'5 days ago', phone:'9654321098' },
  { id:9, title:'AI Operations Analyst', company:'Accenture', location:'Bengaluru', salary:'₹8–13 LPA', type:'Full Time', tags:['AI','Automation','Python'], posted:'1 day ago', phone:'9543210987' },
  { id:10, title:'Data Entry & Reporting Officer', company:'Karnataka Bank', location:'Mangaluru', salary:'₹2.5–4 LPA', type:'Full Time', tags:['Excel','Data Entry','MIS'], posted:'3 days ago', phone:'9432109876' },
  { id:11, title:'Business Analyst', company:'Wipro', location:'Bengaluru', salary:'₹6–10 LPA', type:'Full Time', tags:['SQL','Power BI','Excel'], posted:'Today', phone:'9321098765' },
  { id:12, title:'MIS Officer', company:'Apollo Hospitals', location:'Bengaluru', salary:'₹4–6 LPA', type:'Full Time', tags:['MIS','Excel','Reporting'], posted:'2 days ago', phone:'9210987654' },
];

// ── AUTH HELPERS ──
const Auth = {
  // Candidates
  getCandidates() { return JSON.parse(localStorage.getItem('ht_candidates') || '[]'); },
  saveCandidates(list) { localStorage.setItem('ht_candidates', JSON.stringify(list)); },
  getCurrentCandidate() { return JSON.parse(localStorage.getItem('ht_candidate_session') || 'null'); },
  setCurrentCandidate(c) { localStorage.setItem('ht_candidate_session', JSON.stringify(c)); },
  logoutCandidate() { localStorage.removeItem('ht_candidate_session'); },

  registerCandidate(data) {
    const list = this.getCandidates();
    if (list.find(c => c.email === data.email)) return { ok:false, msg:'Email already registered' };
    const candidate = { ...data, id: Date.now(), applications: [], resumeName: data.resumeName || '' };
    list.push(candidate);
    this.saveCandidates(list);
    this.setCurrentCandidate(candidate);
    return { ok:true, candidate };
  },

  loginCandidate(email, password) {
    const list = this.getCandidates();
    const c = list.find(x => x.email === email && x.password === password);
    if (!c) return { ok:false, msg:'Invalid email or password' };
    this.setCurrentCandidate(c);
    return { ok:true, candidate:c };
  },

  // Employers
  getEmployers() { return JSON.parse(localStorage.getItem('ht_employers') || '[]'); },
  saveEmployers(list) { localStorage.setItem('ht_employers', JSON.stringify(list)); },
  getCurrentEmployer() { return JSON.parse(localStorage.getItem('ht_employer_session') || 'null'); },
  setCurrentEmployer(e) { localStorage.setItem('ht_employer_session', JSON.stringify(e)); },
  logoutEmployer() { localStorage.removeItem('ht_employer_session'); },

  checkEmployerExists(identifier) {
    const list = this.getEmployers();
    return list.find(e => e.email === identifier || e.mobile === identifier) || null;
  },

  registerEmployer(data) {
    const list = this.getEmployers();
    if (list.find(e => e.email === data.email)) return { ok:false, msg:'Email already registered' };
    const employer = { ...data, id: Date.now(), postedJobs: [] };
    list.push(employer);
    this.saveEmployers(list);
    this.setCurrentEmployer(employer);
    return { ok:true, employer };
  },

  loginEmployer(identifier, password) {
    const list = this.getEmployers();
    const e = list.find(x => (x.email === identifier || x.mobile === identifier) && x.password === password);
    if (!e) return { ok:false, msg:'Invalid credentials' };
    this.setCurrentEmployer(e);
    return { ok:true, employer:e };
  },

  // Applications
  getApplications() { return JSON.parse(localStorage.getItem('ht_applications') || '[]'); },
  saveApplications(list) { localStorage.setItem('ht_applications', JSON.stringify(list)); },

  applyToJob(candidateId, jobId) {
    const apps = this.getApplications();
    if (apps.find(a => a.candidateId === candidateId && a.jobId === jobId)) return { ok:false, msg:'Already applied' };
    apps.push({ candidateId, jobId, status:'Applied', appliedAt: new Date().toISOString() });
    this.saveApplications(apps);
    return { ok:true };
  },

  getCandidateApplications(candidateId) {
    return this.getApplications().filter(a => a.candidateId === candidateId);
  },

  getJobApplications(jobId) {
    const apps = this.getApplications().filter(a => a.jobId === jobId);
    const candidates = this.getCandidates();
    return apps.map(a => ({ ...a, candidate: candidates.find(c => c.id === a.candidateId) }));
  },

  // Employer posted jobs
  getEmployerJobs() { return JSON.parse(localStorage.getItem('ht_employer_jobs') || '[]'); },
  saveEmployerJob(job) {
    const jobs = this.getEmployerJobs();
    jobs.push({ ...job, id: Date.now(), postedAt: new Date().toISOString(), applicants: 0 });
    localStorage.setItem('ht_employer_jobs', JSON.stringify(jobs));
  },
  deleteEmployerJob(jobId) {
    const jobs = this.getEmployerJobs().filter(j => j.id !== jobId);
    localStorage.setItem('ht_employer_jobs', JSON.stringify(jobs));
  }
};

// ── NAVBAR RENDERER ──
function renderNavbar(activePage) {
  const candidate = Auth.getCurrentCandidate();
  const employer = Auth.getCurrentEmployer();
  const pages = { home:'index.html', jobs:'jobs.html', postjob:'post-job.html', signup:'signup.html', login:'login.html', profile:'profile.html', employer:'employer-auth.html', dashboard:'employer-dashboard.html' };

  let rightHTML = '';
  if (candidate) {
    const initials = candidate.name.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);
    rightHTML = `<div class="nav-user">
      <span class="nav-user-name">Hi, <span>${candidate.name.split(' ')[0]}</span></span>
      <a href="${pages.profile}" class="btn-employer">My Profile</a>
      <span class="btn-logout" onclick="logoutCandidate()">Logout</span>
    </div>`;
  } else if (employer) {
    rightHTML = `<div class="nav-user">
      <span class="nav-user-name">Hi, <span>${employer.contactName.split(' ')[0]}</span></span>
      <a href="${pages.dashboard}" class="btn-employer">Dashboard</a>
      <span class="btn-logout" onclick="logoutEmployer()">Logout</span>
    </div>`;
  } else {
    rightHTML = `
      <a href="${pages.login}" class="btn-login">Login</a>
      <a href="${pages.signup}" class="btn-signup">Sign Up</a>
      <a href="${pages.employer}" class="btn-employer">For Employers</a>
    `;
  }

  return `<nav class="navbar">
    <a href="${pages.home}" class="nav-logo">Hire<span>Track</span></a>
    <div class="nav-center">
      <a href="${pages.home}" ${activePage==='home'?'class="active"':''}>Home</a>
      <a href="${pages.jobs}" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a>
    </div>
    <div class="nav-right">${rightHTML}</div>
  </nav>`;
}

function logoutCandidate() { Auth.logoutCandidate(); window.location.href='index.html'; }
function logoutEmployer() { Auth.logoutEmployer(); window.location.href='index.html'; }

// ── JOB CARD RENDERER ──
function renderJobCard(job) {
  const candidate = Auth.getCurrentCandidate();
  const apps = Auth.getApplications();
  const alreadyApplied = candidate && apps.find(a => a.candidateId === candidate.id && a.jobId === job.id);
  const typeClass = { 'Full Time':'badge-full','Contract':'badge-contract','Remote':'badge-remote' };
  const waMsg = encodeURIComponent(`Hi, I found your job posting for *${job.title}* at *${job.company}* on HireTrack. I would like to apply for this position. Please find my details attached.`);

  return `<div class="job-card">
    <div class="jc-top">
      <div class="jc-title">${job.title}</div>
      <span class="badge ${typeClass[job.type]||'badge-full'}">${job.type}</span>
    </div>
    <div class="jc-company">🏢 ${job.company}</div>
    <div class="jc-meta">
      <span>📍 ${job.location}</span>
      <span>💰 ${job.salary}</span>
      <span>🕒 ${job.posted}</span>
    </div>
    <div class="jc-tags">${job.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
    <div class="jc-footer">
      <button class="btn-whatsapp" onclick="whatsappApply('${job.phone}','${waMsg}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.532 5.857L.057 23.925l6.235-1.635A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.494-5.193-1.355l-.372-.22-3.7.971 1.008-3.573-.242-.383A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
        WhatsApp
      </button>
      <button class="btn-apply ${alreadyApplied?'applied':''}" onclick="applyJob(${job.id},this)">
        ${alreadyApplied?'✓ Applied':'Apply Now'}
      </button>
    </div>
  </div>`;
}

function whatsappApply(phone, msg) {
  window.open(`https://wa.me/91${phone}?text=${msg}`, '_blank');
}

function applyJob(jobId, btn) {
  const candidate = Auth.getCurrentCandidate();
  if (!candidate) {
    sessionStorage.setItem('redirect_after_login', window.location.href);
    window.location.href = 'login.html';
    return;
  }
  const result = Auth.applyToJob(candidate.id, jobId);
  if (result.ok) {
    btn.textContent = '✓ Applied';
    btn.classList.add('applied');
    showToast('Application submitted successfully!');
  } else {
    showToast('You have already applied to this job.');
  }
}

// ── JOBS RENDERER ──
function renderJobs(jobs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!jobs.length) { el.innerHTML = '<div class="empty-state"><div class="es-icon">🔍</div><p>No jobs found matching your filters.</p></div>'; return; }
  el.innerHTML = jobs.map(renderJobCard).join('');
}

// ── AI ASSISTANT ──
async function callGemini(prompt) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{ parts:[{ text: `You are a helpful career assistant for HireTrack, a job portal for MIS, Data, Excel, SQL and analytics roles in Karnataka, India. Give concise, practical advice in 3-5 sentences. Be encouraging and specific to the Indian job market.\n\nUser question: ${prompt}` }] }] })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not get a response. Please try again.';
  } catch(e) {
    return 'Please add your Gemini API key in app.js to enable the AI assistant.';
  }
}

async function askAI() {
  const input = document.getElementById('ai-input');
  const box = document.getElementById('ai-response');
  const q = input?.value?.trim();
  if (!q) return;
  box.style.display = 'block';
  box.innerHTML = '<span class="ai-loading">Thinking...</span>';
  box.style.display = 'block';
  const answer = await callGemini(q);
  box.textContent = answer;
  input.value = '';
}

function quickAsk(q) { document.getElementById('ai-input').value = q; askAI(); }

// ── TOAST ──
function showToast(msg) {
  let t = document.getElementById('ht-toast');
  if (!t) { t = document.createElement('div'); t.id='ht-toast'; t.style.cssText='position:fixed;bottom:1.5rem;right:1.5rem;background:#1e293b;color:#fff;padding:0.75rem 1.2rem;border-radius:10px;font-size:0.88rem;font-weight:600;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,0.2);transition:opacity 0.3s;'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity='1';
  setTimeout(() => t.style.opacity='0', 2500);
}

// ── KEYBOARD SHORTCUT ──
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.activeElement?.id === 'ai-input') askAI();
    if (document.activeElement?.id === 'search-input') {
      const q = document.getElementById('search-input').value.trim();
      window.location.href = q ? `jobs.html?search=${encodeURIComponent(q)}` : 'jobs.html';
    }
  }
});
