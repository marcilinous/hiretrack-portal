// ── SUPABASE CONFIG ──
const SUPABASE_URL = 'https://pdjnpqyzayidthpfmvjk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkam5wcXl6YXlpZHRocGZtdmprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMTY4NDgsImV4cCI6MjA5MjU5Mjg0OH0.h0R_BKqPX0GhXS4LBnmkDAVh5ZN91p-qcs2gHrTcSvQ';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const WEB3FORMS_KEY = '30483d95-3da0-4a00-a262-944b2e82b3b2';

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

const Session = {
  getCandidate() { return JSON.parse(sessionStorage.getItem('ht_candidate') || 'null'); },
  setCandidate(c) { sessionStorage.setItem('ht_candidate', JSON.stringify(c)); },
  clearCandidate() { sessionStorage.removeItem('ht_candidate'); },
  getEmployer() { return JSON.parse(sessionStorage.getItem('ht_employer') || 'null'); },
  setEmployer(e) { sessionStorage.setItem('ht_employer', JSON.stringify(e)); },
  clearEmployer() { sessionStorage.removeItem('ht_employer'); }
};

const CandidateAuth = {
  async register(data) {
    const { data: existing } = await sb.from('candidates').select('id').eq('email', data.email).maybeSingle();
    if (existing) return { ok: false, msg: 'Email already registered' };
    const { data: candidate, error } = await sb.from('candidates').insert([{
      name: data.name, email: data.email, mobile: data.mobile,
      password: data.password, city: data.city, experience: data.experience,
      jobtitle: data.jobtitle, skills: data.skills || [],
      resume_name: data.resumeName || '', resume_data: data.resumeData || ''
    }]).select().single();
    if (error) return { ok: false, msg: error.message };
    Session.setCandidate(candidate);
    return { ok: true, candidate };
  },
  async login(email, password) {
    const { data: candidate } = await sb.from('candidates').select('*').eq('email', email).eq('password', password).maybeSingle();
    if (!candidate) return { ok: false, msg: 'Invalid email or password' };
    Session.setCandidate(candidate);
    return { ok: true, candidate };
  },
  logout() { Session.clearCandidate(); window.location.href = 'index.html'; }
};

const EmployerAuth = {
  async checkExists(identifier) {
    const { data } = await sb.from('employers').select('*').or(`email.eq.${identifier},mobile.eq.${identifier}`).maybeSingle();
    return data || null;
  },
  async register(data) {
    const { data: existing } = await sb.from('employers').select('id').eq('email', data.email).maybeSingle();
    if (existing) return { ok: false, msg: 'Email already registered' };
    const { data: employer, error } = await sb.from('employers').insert([{
      company: data.company, contact_name: data.contactName,
      email: data.email, mobile: data.mobile, password: data.password,
      city: data.city, industry: data.industry,
      plan: 'free', job_limit: 1, day_limit: 15
    }]).select().single();
    if (error) return { ok: false, msg: error.message };
    Session.setEmployer(employer);
    return { ok: true, employer };
  },
  async login(identifier, password) {
    const { data: employer } = await sb.from('employers').select('*').or(`email.eq.${identifier},mobile.eq.${identifier}`).eq('password', password).maybeSingle();
    if (!employer) return { ok: false, msg: 'Invalid credentials' };
    Session.setEmployer(employer);
    return { ok: true, employer };
  },
  logout() { Session.clearEmployer(); window.location.href = 'index.html'; }
};

const JobsDB = {
  async getEmployerJobs(employerId) {
    const { data } = await sb.from('jobs').select('*').eq('employer_id', employerId).order('posted_at', { ascending: false });
    return data || [];
  },
  async getAllPublicJobs() {
    const { data } = await sb.from('jobs').select('*').eq('delisted', false).order('posted_at', { ascending: false });
    return data || [];
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
    const { error } = await sb.from('applications').insert([{ candidate_id: candidateId, job_id: String(jobId) }]);
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
    rightHTML = `<div class="nav-user"><span class="nav-user-name">Hi, <span>${candidate.name.split(' ')[0]}</span></span><a href="profile.html" class="btn-employer">My Profile</a><span class="btn-logout" onclick="CandidateAuth.logout()">Logout</span></div>`;
  } else if (employer) {
    rightHTML = `<div class="nav-user"><span class="nav-user-name">Hi, <span>${employer.contact_name.split(' ')[0]}</span></span><a href="post-job.html" class="btn-signup">+ Post Job</a></div>`;
  } else {
    rightHTML = `<a href="login.html" class="btn-login">Login</a><a href="signup.html" class="btn-signup">Sign Up</a><a href="employer-auth.html" class="btn-employer">For Employers</a>`;
  }

  // Mobile nav links
  let mobileLinks = '';
  if (candidate) {
    mobileLinks = `<a href="jobs.html" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a><a href="profile.html" ${activePage==='profile'?'class="active"':''}>My Profile</a><div class="nav-divider"></div><a href="#" onclick="CandidateAuth.logout()">Logout</a>`;
  } else if (employer) {
    mobileLinks = `<a href="employer-dashboard.html" ${activePage==='dashboard'?'class="active"':''}>Dashboard</a><a href="post-job.html" ${activePage==='postjob'?'class="active"':''}>Post a Job</a><a href="pricing.html" ${activePage==='pricing'?'class="active"':''}>Pricing</a><div class="nav-divider"></div><a href="#" onclick="EmployerAuth.logout()">Logout</a>`;
  } else {
    mobileLinks = `<a href="index.html" ${activePage==='home'?'class="active"':''}>Home</a><a href="jobs.html" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a><div class="nav-divider"></div><a href="login.html">Candidate Login</a><a href="employer-auth.html">Employer Login</a><a href="signup.html">Sign Up Free</a>`;
  }

  return `<nav class="navbar">
    <a href="index.html" class="nav-logo">Hire<span>Track</span></a>
    <div class="nav-center">
      ${employer ? `
        <a href="employer-dashboard.html" ${activePage==='dashboard'?'class="active"':''}>Dashboard</a>
        <a href="post-job.html" ${activePage==='postjob'?'class="active"':''}>Post a Job</a>
        <a href="pricing.html" ${activePage==='pricing'?'class="active"':''}>Pricing</a>
      ` : `
        <a href="index.html" ${activePage==='home'?'class="active"':''}>Home</a>
        <a href="jobs.html" ${activePage==='jobs'?'class="active"':''}>Browse Jobs</a>
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
      <button class="btn-whatsapp" onclick="whatsappApply('${job.phone}','${waMsg}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.122 1.532 5.857L.057 23.925l6.235-1.635A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.494-5.193-1.355l-.372-.22-3.7.971 1.008-3.573-.242-.383A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg> WhatsApp</button>
      <button class="btn-apply ${alreadyApplied?'applied':''} ${expired?'expired-btn':''}" onclick="${expired?`showToast('This job has expired.')`:`applyJob('${job.id}',this)`}">${expired?'⚠ Expired':alreadyApplied?'✓ Applied':'Apply Now'}</button>
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
    if (job) sendEmailNotification(candidate, job, job.email||'anchansachinv99@gmail.com');
  } else {
    btn.textContent='Apply Now'; btn.disabled=false;
    showToast('Failed. Try again.');
  }
}

async function sendEmailNotification(candidate, job, employerEmail) {
  try {
    await fetch('https://api.web3forms.com/submit', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ access_key:WEB3FORMS_KEY, subject:`New Application — ${job.title} | HireTrack`,
        message:`Job: ${job.title}\nCompany: ${job.company}\n\nCandidate: ${candidate.name}\nEmail: ${candidate.email}\nMobile: ${candidate.mobile}\nCity: ${candidate.city}\nExp: ${candidate.experience}\nSkills: ${(candidate.skills||[]).join(', ')}\n\nDashboard: https://hiretrack-portal.vercel.app/employer-dashboard.html`,
        from_name:'HireTrack Notifications', email:employerEmail, replyto:candidate.email }) });
  } catch(e) { console.log('Email error:',e); }
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
