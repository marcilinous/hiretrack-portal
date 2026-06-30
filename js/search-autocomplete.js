// js/search-autocomplete.js
//
// Lightweight role + city autocomplete used by index.html and jobs.html.
//
// Public API:
//   SearchAutocomplete.attach({ input, onSelect, onSearch })
//     - input: the <input> element to wire (required)
//     - onSelect(value): called when the user picks a suggestion
//     - onSearch(): optional — invoked when Enter is pressed on a non-suggestion value
//
// Wires up a popover that shows matching role/city suggestions or, when the
// input is empty + focused, a "Popular searches" panel. Keyboard accessible
// (↑ / ↓ / Enter / Esc).

(function () {
  const ROLES = [
    'Data Analyst', 'MIS Executive', 'HR Executive', 'Sales Executive',
    'Business Analyst', 'Digital Marketing', 'Content Writer',
    'Full Stack Developer', 'Customer Support', 'Operations Manager',
    'Accounts Executive', 'Software Engineer', 'Product Manager',
    'Data Entry Operator', 'Telecaller', 'Back Office Executive',
    'Admin Assistant', 'Graphic Designer', 'UI/UX Designer',
    'DevOps Engineer',
  ];

  const LOCATIONS = [
    'Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune', 'Chennai',
    'Kolkata', 'Ahmedabad', 'Mysuru', 'Mangaluru', 'Remote',
  ];

  const POPULAR = [
    'MIS Executive Bengaluru',
    'Data Analyst Hyderabad',
    'Sales Executive Mumbai',
    'IT Jobs Bengaluru',
    'Remote Jobs India',
    'Fresher Jobs',
  ];

  if (document.getElementById('ht-ac-style')) return;
  const css = document.createElement('style');
  css.id = 'ht-ac-style';
  css.textContent = `
    .ht-ac-wrap{position:relative;}
    .ht-ac{position:absolute;left:0;right:0;top:calc(100% + 6px);background:#fff;border:1.5px solid #e2e8f0;border-radius:12px;box-shadow:0 14px 40px rgba(15,23,42,0.12);padding:6px;max-height:340px;overflow:auto;z-index:50;display:none;}
    .ht-ac.show{display:block;}
    .ht-ac-section{font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;padding:8px 12px 4px;}
    .ht-ac-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;color:#0f172a;font-size:0.92rem;line-height:1.2;}
    .ht-ac-item .ic{font-size:0.95rem;color:#94a3b8;}
    .ht-ac-item:hover, .ht-ac-item.active{background:#eff6ff;color:#1d4ed8;}
    .ht-ac-empty{padding:0.9rem 1rem;font-size:0.85rem;color:#94a3b8;text-align:center;}
  `;
  document.head.appendChild(css);

  function attach({ input, onSelect, onSearch }) {
    if (!input) return;
    // Wrap the input so the popover positions correctly.
    const parent = input.parentElement;
    if (parent && !parent.classList.contains('ht-ac-wrap')) {
      // Insert a relative wrapper around the input without breaking siblings.
      const wrap = document.createElement('div');
      wrap.className = 'ht-ac-wrap';
      // Mirror the input's intended layout — width 100% inside wrap.
      input.style.width = '100%';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    const wrap = input.parentElement;
    const ac = document.createElement('div');
    ac.className = 'ht-ac';
    ac.setAttribute('role', 'listbox');
    wrap.appendChild(ac);

    let activeIdx = -1;
    let items = [];

    function close() {
      ac.classList.remove('show');
      activeIdx = -1;
      items = [];
    }

    function render(html, currentItems) {
      ac.innerHTML = html;
      items = currentItems;
      activeIdx = -1;
      ac.classList.toggle('show', !!items.length);
      Array.from(ac.querySelectorAll('.ht-ac-item')).forEach((el, i) => {
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pick(items[i]);
        });
      });
    }

    function pick(val) {
      if (!val) return;
      input.value = val;
      close();
      if (typeof onSelect === 'function') onSelect(val);
    }

    function matches(q) {
      q = (q || '').trim().toLowerCase();
      if (!q) return null;
      const roleHits = ROLES.filter((r) => r.toLowerCase().includes(q)).slice(0, 6);
      const locHits = LOCATIONS.filter((l) => l.toLowerCase().includes(q)).slice(0, 4);
      return { roleHits, locHits };
    }

    function popular() {
      const list = POPULAR.map(
        (p) =>
          `<div class="ht-ac-item" role="option"><span class="ic">⭐</span>${p}</div>`
      ).join('');
      return {
        html: `<div class="ht-ac-section">Popular searches</div>${list}`,
        items: POPULAR.slice(),
      };
    }

    function update() {
      const q = input.value;
      if (!q) {
        const p = popular();
        render(p.html, p.items);
        return;
      }
      const m = matches(q);
      const parts = [];
      const ordered = [];
      if (m.roleHits.length) {
        parts.push(`<div class="ht-ac-section">Roles</div>`);
        m.roleHits.forEach((r) => {
          parts.push(`<div class="ht-ac-item" role="option"><span class="ic">💼</span>${r}</div>`);
          ordered.push(r);
        });
      }
      if (m.locHits.length) {
        parts.push(`<div class="ht-ac-section">Locations</div>`);
        m.locHits.forEach((l) => {
          parts.push(`<div class="ht-ac-item" role="option"><span class="ic">📍</span>${l}</div>`);
          ordered.push(l);
        });
      }
      if (!ordered.length) {
        render(`<div class="ht-ac-empty">No matches — press Enter to search "${escapeHtml(q)}"</div>`, []);
        return;
      }
      render(parts.join(''), ordered);
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    }

    function highlight() {
      Array.from(ac.querySelectorAll('.ht-ac-item')).forEach((el, i) => {
        el.classList.toggle('active', i === activeIdx);
      });
    }

    input.addEventListener('focus', update);
    input.addEventListener('input', update);
    input.addEventListener('keydown', (e) => {
      if (!ac.classList.contains('show')) {
        if (e.key === 'Enter' && typeof onSearch === 'function') onSearch();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % items.length;
        highlight();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + items.length) % items.length;
        highlight();
      } else if (e.key === 'Enter') {
        if (activeIdx >= 0) {
          e.preventDefault();
          pick(items[activeIdx]);
        } else if (typeof onSearch === 'function') {
          onSearch();
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) close();
    });
  }

  window.SearchAutocomplete = { attach };
})();
