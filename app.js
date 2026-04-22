const GEMINI_API_KEY = 'AIzaSyA8M0q--3U9U8VHGU3Sb3Bwa7wfgOdKCzw';

function getJobs() {
  return [
    { id:1, title:'MIS Executive', company:'Infosys BPM', location:'Bengaluru', salary:'₹4–6 LPA', type:'Full Time', tags:['Excel','MIS','Reporting'], posted:'2 days ago' },
    { id:2, title:'Data Analyst', company:'Manipal Health', location:'Manipal', salary:'₹5–8 LPA', type:'Full Time', tags:['SQL','Python','Tableau'], posted:'1 day ago' },
    { id:3, title:'Excel Reporting Analyst', company:'Decathlon India', location:'Bengaluru', salary:'₹3.5–5 LPA', type:'Full Time', tags:['Excel','Power BI','VBA'], posted:'3 days ago' },
    { id:4, title:'SQL Database Executive', company:'Ninjacart', location:'Bengaluru', salary:'₹4–7 LPA', type:'Contract', tags:['SQL','MySQL','Reporting'], posted:'Today' },
    { id:5, title:'BI Analyst', company:'KPMG India', location:'Bengaluru', salary:'₹7–11 LPA', type:'Full Time', tags:['Power BI','DAX','SQL'], posted:'4 days ago' },
    { id:6, title:'MIS & Automation Analyst', company:'Bigbasket', location:'Bengaluru', salary:'₹5–8 LPA', type:'Full Time', tags:['Excel','Automation','Python'], posted:'Today' },
    { id:7, title:'Operations Data Analyst', company:'Zepto', location:'Remote', salary:'₹6–9 LPA', type:'Remote', tags:['SQL','Excel','Analytics'], posted:'2 days ago' },
    { id:8, title:'Reporting Executive', company:'TVS Motors', location:'Mysuru', salary:'₹3–5 LPA', type:'Full Time', tags:['Excel','MIS','SAP'], posted:'5 days ago' },
    { id:9, title:'AI Operations Analyst', company:'Accenture', location:'Bengaluru', salary:'₹8–13 LPA', type:'Full Time', tags:['AI','Automation','Python'], posted:'1 day ago' },
  ];
}

function renderJobs(jobs, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const typeClass = { 'Full Time':'badge-full', 'Contract':'badge-contract', 'Remote':'badge-remote' };
  container.innerHTML = jobs.map(j => `
    <div class="job-card" onclick="window.location='jobs.html?id=${j.id}'">
      <div class="job-card-top">
        <div class="job-title">${j.title}</div>
        <span class="job-badge ${typeClass[j.type]||'badge-full'}">${j.type}</span>
      </div>
      <div class="job-company">${j.company}</div>
      <div class="job-meta">
        <span>📍 ${j.location}</span>
        <span>💰 ${j.salary}</span>
        <span>🕒 ${j.posted}</span>
      </div>
      <div class="job-tags">${j.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
    </div>
  `).join('');
}

async function callGemini(prompt) {
  const systemPrompt = `You are a helpful career assistant for HireTrack, a job portal focused on MIS, Data, Excel, SQL and office technology roles in Karnataka, India. Give concise, practical advice in 3-5 sentences. Always be encouraging and specific to the Indian job market.`;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt + '\n\nUser question: ' + prompt }] }]
      })
    });
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not get a response. Please try again.';
  } catch (e) {
    return 'AI assistant is not configured yet. Please add your Gemini API key in app.js to enable this feature.';
  }
}

async function askAI() {
  const input = document.getElementById('ai-input');
  const responseBox = document.getElementById('ai-response');
  const question = input.value.trim();
  if (!question) return;
  responseBox.style.display = 'block';
  responseBox.textContent = 'Thinking...';
  const answer = await callGemini(question);
  responseBox.textContent = answer;
  input.value = '';
}

function quickAsk(question) {
  document.getElementById('ai-input').value = question;
  askAI();
}

function searchJobs() {
  const q = document.getElementById('search-input')?.value?.trim();
  if (q) window.location = `jobs.html?search=${encodeURIComponent(q)}`;
  else window.location = 'jobs.html';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (document.activeElement.id === 'ai-input') askAI();
    if (document.activeElement.id === 'search-input') searchJobs();
  }
});