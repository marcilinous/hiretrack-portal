(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────────
  let _convs      = [];
  let _openConvId = null;
  let _messages   = [];
  let _msgIds     = new Set();
  let _rtChannel  = null;
  let _stylesInj  = false;

  // ── Utils ────────────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function isPro(candidate) {
    return !!(candidate?.pro_expires_at && new Date() < new Date(candidate.pro_expires_at));
  }

  function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const diffDays = Math.floor((Date.now() - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7)  return d.toLocaleDateString('en-IN', { weekday: 'short' });
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  function initials(name) {
    return String(name || '?').split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2);
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (_stylesInj || document.getElementById('ch-styles')) return;
    _stylesInj = true;
    const s = document.createElement('style');
    s.id = 'ch-styles';
    s.textContent = `
      .ch-wrap{display:flex;height:calc(100vh - 210px);min-height:400px;border:1.5px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#fff;}
      .ch-sidebar{width:268px;flex-shrink:0;border-right:1.5px solid #e2e8f0;display:flex;flex-direction:column;}
      .ch-sidebar-hd{padding:0.9rem 1rem;border-bottom:1.5px solid #e2e8f0;font-weight:800;font-size:0.9rem;color:#0f172a;}
      .ch-conv-list{flex:1;overflow-y:auto;}
      .ch-conv-item{display:flex;align-items:center;gap:0.7rem;padding:0.8rem 1rem;cursor:pointer;border-bottom:1px solid #f1f5f9;transition:background 0.12s;}
      .ch-conv-item:hover,.ch-active{background:#eff6ff;}
      .ch-c-av{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.82rem;flex-shrink:0;color:#fff;background:#1e3a5f;}
      .ch-c-meta{flex:1;min-width:0;}
      .ch-c-name{font-size:0.83rem;font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .ch-c-prev{font-size:0.73rem;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
      .ch-c-right{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;}
      .ch-c-time{font-size:0.68rem;color:#94a3b8;}
      .ch-unread{background:#ff9933;color:#fff;border-radius:999px;font-size:0.62rem;font-weight:800;padding:2px 6px;min-width:16px;text-align:center;}
      .ch-thread{flex:1;display:flex;flex-direction:column;min-width:0;}
      .ch-th-hd{padding:0.9rem 1.1rem;border-bottom:1.5px solid #e2e8f0;display:flex;align-items:center;gap:0.7rem;flex-shrink:0;}
      .ch-th-av{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.78rem;flex-shrink:0;color:#fff;background:#1e3a5f;}
      .ch-th-name{font-weight:800;font-size:0.88rem;color:#0f172a;}
      .ch-th-sub{font-size:0.73rem;color:#64748b;}
      .ch-msgs{flex:1;overflow-y:auto;padding:0.9rem;display:flex;flex-direction:column;gap:0.45rem;}
      .ch-msg{max-width:72%;display:flex;flex-direction:column;}
      .ch-msg.mine{align-self:flex-end;align-items:flex-end;}
      .ch-msg.theirs{align-self:flex-start;align-items:flex-start;}
      .ch-bbl{padding:0.55rem 0.8rem;border-radius:16px;font-size:0.84rem;line-height:1.45;word-break:break-word;}
      .ch-msg.mine .ch-bbl{background:#2563eb;color:#fff;border-bottom-right-radius:4px;}
      .ch-msg.theirs .ch-bbl{background:#f1f5f9;color:#0f172a;border-bottom-left-radius:4px;}
      .ch-msg-t{font-size:0.66rem;color:#94a3b8;margin-top:2px;}
      .ch-input-bar{padding:0.75rem 0.9rem;border-top:1.5px solid #e2e8f0;display:flex;gap:0.6rem;align-items:flex-end;flex-shrink:0;}
      .ch-inp{flex:1;border:1.5px solid #e2e8f0;border-radius:12px;padding:0.6rem 0.85rem;font-size:0.86rem;font-family:inherit;resize:none;outline:none;max-height:100px;line-height:1.4;transition:border-color 0.15s;}
      .ch-inp:focus{border-color:#2563eb;}
      .ch-send{background:#ff9933;color:#fff;border:none;border-radius:10px;padding:0.55rem 1rem;font-size:0.86rem;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0;}
      .ch-send:hover{background:#e8850f;}
      .ch-send:disabled{background:#cbd5e1;cursor:not-allowed;}
      .ch-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;color:#94a3b8;gap:0.4rem;padding:2rem;text-align:center;font-size:0.85rem;}
      .ch-pro-gate{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:3rem 2rem;text-align:center;background:#fff;border-radius:14px;border:1.5px solid #e2e8f0;}
      .ch-bubble-btn{position:fixed;bottom:1.5rem;right:1.5rem;width:54px;height:54px;border-radius:50%;background:#ff9933;color:#fff;border:none;font-size:1.4rem;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.18);z-index:900;display:flex;align-items:center;justify-content:center;transition:transform 0.18s;}
      .ch-bubble-btn:hover{transform:scale(1.08);}
      .ch-bubble-cnt{position:absolute;top:-3px;right:-3px;background:#ef4444;color:#fff;border-radius:999px;font-size:0.62rem;font-weight:800;padding:2px 5px;min-width:16px;text-align:center;border:2px solid #fff;}
      .ch-emp-wrap{display:flex;flex-direction:column;height:360px;border:1.5px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;margin-top:1rem;}
      @media(max-width:600px){
        .ch-wrap{flex-direction:column;height:auto;}
        .ch-sidebar{width:100%;border-right:none;border-bottom:1.5px solid #e2e8f0;max-height:190px;}
        .ch-thread{min-height:340px;}
      }
    `;
    document.head.appendChild(s);
  }

  // ── DB helpers ───────────────────────────────────────────────────────────────
  async function findOrCreateConv(candidateId, employerId, jobId) {
    const sb = window.sb;
    let q = sb.from('conversations').select('*').eq('candidate_id', candidateId).eq('employer_id', employerId);
    if (jobId) q = q.eq('job_id', jobId);
    const { data: ex } = await q.maybeSingle();
    if (ex) return ex;

    const row = { candidate_id: candidateId, employer_id: employerId };
    if (jobId) row.job_id = jobId;
    const { data: created, error } = await sb.from('conversations').insert(row).select().single();
    if (error) throw error;
    return created;
  }

  async function loadMessages(convId) {
    const { data, error } = await window.sb.from('messages')
      .select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function sendMsg(convId, senderId, senderType, content) {
    const sb = window.sb;
    const { data: msg, error } = await sb.from('messages').insert({
      conversation_id: convId,
      sender_id:       senderId,
      sender_type:     senderType,
      content,
      message_type:    'text',
    }).select().single();
    if (error) throw error;

    const unreadField = senderType === 'candidate' ? 'employer_unread' : 'candidate_unread';
    const { data: cv } = await sb.from('conversations').select(unreadField).eq('id', convId).single();
    await sb.from('conversations').update({
      last_message:    content.slice(0, 120),
      last_message_at: msg.created_at,
      [unreadField]:   ((cv?.[unreadField]) || 0) + 1,
    }).eq('id', convId);

    return msg;
  }

  async function markRead(convId, viewerType) {
    const field = viewerType === 'candidate' ? 'candidate_unread' : 'employer_unread';
    await window.sb.from('conversations').update({ [field]: 0 }).eq('id', convId);
  }

  // ── Realtime ─────────────────────────────────────────────────────────────────
  function subscribe(convId, onMsg) {
    if (_rtChannel) { window.sb.removeChannel(_rtChannel); _rtChannel = null; }
    _rtChannel = window.sb.channel('ch-' + convId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${convId}`,
      }, payload => onMsg(payload.new))
      .subscribe();
  }

  // ── Render helpers ────────────────────────────────────────────────────────────
  function msgBubble(msg, myId) {
    const mine = msg.sender_id === myId;
    return `<div class="ch-msg ${mine ? 'mine' : 'theirs'}">
      <div class="ch-bbl">${esc(msg.content || '')}</div>
      <div class="ch-msg-t">${fmtTime(msg.created_at)}</div>
    </div>`;
  }

  function pushMsg(msg) {
    if (_msgIds.has(msg.id)) return false;
    _msgIds.add(msg.id);
    _messages.push(msg);
    return true;
  }

  function renderMsgs(myId, listId) {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = _messages.length
      ? _messages.map(m => msgBubble(m, myId)).join('')
      : '<div style="text-align:center;color:#94a3b8;font-size:0.82rem;padding:1rem;">No messages yet. Say hello!</div>';
    el.scrollTop = el.scrollHeight;
  }

  // Renders header + messages list + input bar into `container` element.
  function mountThread(container, headerName, headerSub, myId, senderType, convId, msgsListId) {
    container.innerHTML = `
      <div class="ch-th-hd">
        <div class="ch-th-av">${esc(initials(headerName))}</div>
        <div>
          <div class="ch-th-name">${esc(headerName)}</div>
          ${headerSub ? `<div class="ch-th-sub">${esc(headerSub)}</div>` : ''}
        </div>
      </div>
      <div class="ch-msgs" id="${esc(msgsListId)}"></div>
      <div class="ch-input-bar">
        <textarea class="ch-inp" id="ch-inp-${esc(msgsListId)}" placeholder="Type a message…" rows="1"></textarea>
        <button class="ch-send" id="ch-send-${esc(msgsListId)}">Send</button>
      </div>`;

    const inp = container.querySelector('.ch-inp');
    const btn = container.querySelector('.ch-send');

    inp.addEventListener('input', () => {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btn.click(); }
    });
    btn.addEventListener('click', async () => {
      const text = inp.value.trim();
      if (!text) return;
      btn.disabled = true;
      inp.value = ''; inp.style.height = 'auto';
      try {
        const msg = await sendMsg(convId, myId, senderType, text);
        pushMsg(msg);
        renderMsgs(myId, msgsListId);
      } catch {
        inp.value = text;
      } finally {
        btn.disabled = false;
        inp.focus();
      }
    });

    subscribe(convId, msg => {
      if (!pushMsg(msg)) return;
      renderMsgs(myId, msgsListId);
    });
  }

  // ── Candidate Chat (profile.html #chat) ───────────────────────────────────────
  async function init(containerId, candidate) {
    injectStyles();
    _openConvId = null;
    const root = document.getElementById(containerId);
    if (!root) return;

    if (!isPro(candidate)) {
      root.innerHTML = `
        <div class="ch-pro-gate">
          <div style="font-size:2.2rem;">💬</div>
          <div style="font-size:1rem;font-weight:800;color:#0f172a;">Chat is a Pro feature</div>
          <div style="font-size:0.82rem;color:#64748b;max-width:280px;">Upgrade to HireTrack Pro to message employers directly and get hired faster.</div>
          <a href="#pro" style="background:#ff9933;color:#fff;padding:0.7rem 1.8rem;border-radius:10px;font-weight:800;font-size:0.87rem;text-decoration:none;">Upgrade to Pro →</a>
        </div>`;
      return;
    }

    root.innerHTML = `<div style="color:#94a3b8;padding:2rem;text-align:center;font-size:0.85rem;">Loading conversations…</div>`;

    let convs;
    try {
      const { data, error } = await window.sb.from('conversations')
        .select('*').eq('candidate_id', candidate.id).order('last_message_at', { ascending: false });
      if (error) throw error;
      convs = data || [];
    } catch {
      root.innerHTML = `<div style="color:#ef4444;padding:2rem;text-align:center;">Failed to load conversations.</div>`;
      return;
    }

    // Batch-fetch employer names
    const empMap = {};
    if (convs.length) {
      const ids = [...new Set(convs.map(c => c.employer_id))];
      const { data: emps } = await window.sb.from('employers').select('id,company,contact_name').in('id', ids);
      (emps || []).forEach(e => { empMap[e.id] = e; });
    }

    _convs = convs.map(c => ({
      ...c,
      _empName: empMap[c.employer_id]?.company || empMap[c.employer_id]?.contact_name || 'Employer',
    }));

    renderCandidateUI(root, candidate);
    if (_convs.length > 0) selectConv(_convs[0].id, root, candidate);
  }

  function renderCandidateUI(root, candidate) {
    const items = _convs.map(c => {
      const unread = c.candidate_unread || 0;
      return `<div class="ch-conv-item${_openConvId === c.id ? ' ch-active' : ''}" data-cid="${esc(c.id)}">
        <div class="ch-c-av">${esc(initials(c._empName))}</div>
        <div class="ch-c-meta">
          <div class="ch-c-name">${esc(c._empName)}</div>
          <div class="ch-c-prev">${esc(c.last_message || 'Start the conversation')}</div>
        </div>
        <div class="ch-c-right">
          <div class="ch-c-time">${fmtTime(c.last_message_at)}</div>
          ${unread > 0 ? `<div class="ch-unread">${unread}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    root.innerHTML = `<div class="ch-wrap">
      <div class="ch-sidebar">
        <div class="ch-sidebar-hd">💬 Messages</div>
        <div class="ch-conv-list" id="ch-conv-list">
          ${_convs.length
            ? items
            : '<div style="padding:1.5rem;text-align:center;color:#94a3b8;font-size:0.82rem;">No conversations yet.<br>Employers will appear here when they message you.</div>'}
        </div>
      </div>
      <div class="ch-thread" id="ch-thread">
        <div class="ch-empty"><div style="font-size:2rem;">💬</div><div>Select a conversation</div></div>
      </div>
    </div>`;

    root.querySelector('#ch-conv-list').addEventListener('click', e => {
      const item = e.target.closest('.ch-conv-item');
      if (!item) return;
      root.querySelectorAll('.ch-conv-item').forEach(el => el.classList.remove('ch-active'));
      item.classList.add('ch-active');
      selectConv(item.dataset.cid, root, candidate);
    });
  }

  async function selectConv(convId, root, candidate) {
    _openConvId = convId;
    _messages = []; _msgIds.clear();

    const conv = _convs.find(c => c.id === convId);
    const threadEl = root.querySelector('#ch-thread');
    if (!threadEl) return;

    threadEl.innerHTML = `<div class="ch-empty"><div style="font-size:1.5rem;">⏳</div><div>Loading…</div></div>`;

    try {
      const msgs = await loadMessages(convId);
      msgs.forEach(m => pushMsg(m));
    } catch {
      threadEl.innerHTML = `<div class="ch-empty" style="color:#ef4444;">Failed to load messages.</div>`;
      return;
    }

    await markRead(convId, 'candidate').catch(() => {});
    mountThread(threadEl, conv?._empName || 'Employer', null, candidate.id, 'candidate', convId, 'ch-msgs');
    renderMsgs(candidate.id, 'ch-msgs');
  }

  // ── Floating bubble (profile.html) ───────────────────────────────────────────
  async function initBubble(candidate) {
    if (!isPro(candidate)) return;
    injectStyles();
    const existing = document.getElementById('ch-bubble');
    if (existing) existing.remove();

    let totalUnread = 0;
    try {
      const { data } = await window.sb.from('conversations')
        .select('candidate_unread').eq('candidate_id', candidate.id);
      totalUnread = (data || []).reduce((s, c) => s + (c.candidate_unread || 0), 0);
    } catch { /* non-critical */ }

    const btn = document.createElement('button');
    btn.id = 'ch-bubble';
    btn.className = 'ch-bubble-btn';
    btn.setAttribute('aria-label', 'Messages');
    btn.innerHTML = `💬${totalUnread > 0 ? `<span class="ch-bubble-cnt">${totalUnread}</span>` : ''}`;
    btn.addEventListener('click', () => { location.hash = 'chat'; });
    document.body.appendChild(btn);
  }

  // ── Employer thread (employer-dashboard.html) ─────────────────────────────────
  async function openEmployerThread(containerId, candidateId, jobId, employer) {
    injectStyles();
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `<div style="padding:1rem;color:#94a3b8;font-size:0.85rem;">Opening conversation…</div>`;

    let conv, candidateName;
    try {
      conv = await findOrCreateConv(candidateId, employer.id, jobId || null);
      const { data: c } = await window.sb.from('candidates').select('name').eq('id', candidateId).single();
      candidateName = c?.name || 'Candidate';
    } catch {
      container.innerHTML = `<div style="color:#ef4444;padding:1rem;font-size:0.85rem;">Could not open conversation.</div>`;
      return;
    }

    _messages = []; _msgIds.clear();
    try {
      const msgs = await loadMessages(conv.id);
      msgs.forEach(m => pushMsg(m));
    } catch { /* show empty */ }

    await markRead(conv.id, 'employer').catch(() => {});

    const wrap = document.createElement('div');
    wrap.className = 'ch-emp-wrap';
    container.innerHTML = '';
    container.appendChild(wrap);

    mountThread(wrap, candidateName, 'Direct message', employer.id, 'employer', conv.id, 'ch-emp-msgs');
    renderMsgs(employer.id, 'ch-emp-msgs');
  }

  // ── Cleanup (call on modal close) ─────────────────────────────────────────────
  function cleanup() {
    if (_rtChannel) { window.sb.removeChannel(_rtChannel); _rtChannel = null; }
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.Chat = { init, initBubble, openEmployerThread, cleanup };
})();
