/**
 * ════════════════════════════════════════════════════
 * HireTrack Resume Builder — Scalable Template System
 * ════════════════════════════════════════════════════
 *
 * ARCHITECTURE: Each template is a self-contained module.
 * Adding a new template = adding ONE object to TEMPLATES registry.
 * Zero changes to core builder logic required.
 */

// ── Template Registry ──
// Add new templates here. That's all you need to do.
const TEMPLATES = {

  modern: {
    id: 'modern',
    name: 'Modern',
    tagline: 'Best for Tech & Finance',
    plan: 'free',          // 'free' | 'pro'
    previewEmoji: '💼',
    accentColor: '#3b82f6',
    render: (data) => Templates.modern(data),   // Function reference
    previewHTML: () => Previews.modern(),        // Mini preview HTML
  },

  classic: {
    id: 'classic',
    name: 'Classic',
    tagline: 'Best for Sales & HR',
    plan: 'pro',
    previewEmoji: '📋',
    accentColor: '#0f172a',
    render: (data) => Templates.classic(data),
    previewHTML: () => Previews.classic(),
  },

  minimal: {
    id: 'minimal',
    name: 'Minimal',
    tagline: 'Best for All Industries',
    plan: 'pro',
    previewEmoji: '✨',
    accentColor: '#3b82f6',
    render: (data) => Templates.minimal(data),
    previewHTML: () => Previews.minimal(),
  },

  executive: {
    id: 'executive',
    name: 'Executive',
    tagline: 'Best for Senior Roles',
    plan: 'pro',
    previewEmoji: '🎯',
    accentColor: '#0f172a',
    render: (data) => Templates.executive(data),
    previewHTML: () => Previews.executive(),
  },

  creative: {
    id: 'creative',
    name: 'Creative',
    tagline: 'Best for Design & Marketing',
    plan: 'pro',
    previewEmoji: '🎨',
    accentColor: '#6d28d9',
    render: (data) => Templates.creative(data),
    previewHTML: () => Previews.creative(),
  },

  simple: {
    id: 'simple',
    name: 'Simple',
    tagline: 'Best for Traditional Industries',
    plan: 'pro',
    previewEmoji: '📄',
    accentColor: '#000000',
    render: (data) => Templates.simple(data),
    previewHTML: () => Previews.simple(),
  },

  twocol: {
    id: 'twocol',
    name: 'Two Column',
    tagline: 'Best for IT & Engineering',
    plan: 'pro',
    previewEmoji: '⚡',
    accentColor: '#0ea5e9',
    render: (data) => Templates.twocol(data),
    previewHTML: () => Previews.twocol(),
  },

  // ── TO ADD A NEW TEMPLATE: just add an entry like this ──
  // compact: {
  //   id: 'compact',
  //   name: 'Compact',
  //   tagline: 'Fits more on one page',
  //   plan: 'pro',
  //   previewEmoji: '📐',
  //   accentColor: '#0f766e',
  //   render: (data) => Templates.compact(data),
  //   previewHTML: () => Previews.compact(),
  // },
};


// ── Template Grid Generator ──
// Reads from TEMPLATES registry — no manual HTML needed per template
function generateTemplateGrid(isPro) {
  return Object.values(TEMPLATES).map(tpl => `
    <div class="template-card ${tpl.id === 'modern' ? 'selected' : ''}"
         id="tpl-${tpl.id}"
         onclick="selectTemplate('${tpl.id}')">
      <div class="template-preview" style="background:${tpl.id === 'modern' ? '#1e3a5f' : '#fff'};">
        ${tpl.previewHTML()}
      </div>
      <div class="template-label">
        <div>
          <h3>${tpl.name}</h3>
          <span>${tpl.tagline}</span>
        </div>
        ${tpl.plan === 'pro' ? '<span class="pro-badge">⭐ PRO</span>' : ''}
        <div class="template-check">✓</div>
      </div>
    </div>
  `).join('');
}


// ── Render Dispatcher ──
// selectTemplate() and renderPreview() call this — no switch/case needed
function renderTemplate(templateId, data) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) return TEMPLATES.modern.render(data); // Fallback
  return tpl.render(data);
}


// ── Preview Template Buttons Generator ──
// Auto-generates buttons in Step 4 from registry
function generatePreviewButtons(activeTemplate) {
  return Object.values(TEMPLATES).map(tpl => `
    <button
      onclick="changePreviewTemplate('${tpl.id}')"
      id="ptpl-${tpl.id}"
      style="
        background: ${tpl.id === activeTemplate ? '#eff6ff' : '#f8fafc'};
        border: 1.5px solid ${tpl.id === activeTemplate ? '#bfdbfe' : '#e2e8f0'};
        color: ${tpl.id === activeTemplate ? '#1d4ed8' : '#374151'};
        padding: 6px 10px; border-radius: 6px; font-size: 0.78rem;
        font-weight: 600; cursor: pointer; font-family: inherit; width: 100%;
      ">
      ${tpl.name}${tpl.plan === 'pro' ? ' ⭐' : ''}
    </button>
  `).join('');
}


// ════════════════════════════════════════════════════
// ADDING A NEW TEMPLATE — Step-by-Step Guide
// ════════════════════════════════════════════════════
//
// STEP 1: Add entry to TEMPLATES registry above (30 seconds)
//   compact: {
//     id: 'compact', name: 'Compact', tagline: '...', plan: 'pro',
//     previewEmoji: '📐', accentColor: '#0f766e',
//     render: (data) => Templates.compact(data),
//     previewHTML: () => Previews.compact(),
//   }
//
// STEP 2: Add CSS for the template (in <style> or separate file)
//   .resume-compact { ... }
//   .resume-compact .rc-name { ... }
//
// STEP 3: Add render function to Templates object
//   Templates.compact = function(data) {
//     return `<div class="resume-compact">
//       <div class="rc-name">${data.name}</div>
//       ... rest of template HTML
//     </div>`;
//   }
//
// STEP 4: Add mini preview to Previews object
//   Previews.compact = function() {
//     return `<div style="...small thumbnail HTML..."></div>`;
//   }
//
// That's it. The grid, buttons, and render logic update automatically.
// No other files need to change.
//
// ════════════════════════════════════════════════════
// RECOMMENDED NEXT 5 TEMPLATES TO BUILD
// ════════════════════════════════════════════════════
//
// 1. Compact     — Dense single-column, fits 10+ years experience cleanly
// 2. ATS-Safe    — Plain text optimized, no tables, max ATS compatibility
// 3. Photo       — Includes circular profile photo (top-right or sidebar)
// 4. Timeline    — Left-side timeline line with dot markers for experience
// 5. Infographic — Visual skill meters, colored section dividers, icons
//
// Each = ~1 hour to build following the pattern above.
