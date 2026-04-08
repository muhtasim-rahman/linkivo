// ============================================================
// Linkivo — utils.js
// Shared utility functions
// ============================================================

// ── ID Generator ─────────────────────────────────────────
export function genId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Toast Notification ───────────────────────────────────
export function toast(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark',
                  warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };

  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <i class="fa-solid ${icons[type]} toast-icon" style="color:${colors[type]}"></i>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(el);

  const remove = () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  };
  setTimeout(remove, duration);
  el.addEventListener('click', remove);
}

// ── Modal helpers ────────────────────────────────────────
export function showModal(html, onClose) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    if (onClose) onClose();
  };

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const modal = backdrop.querySelector('.modal');
  modal._close = close;

  // Close on Escape
  const esc = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } };
  document.addEventListener('keydown', esc);

  return { modal, close };
}

export function closeModal(modal) {
  if (modal?._close) modal._close();
}

// ── Confirm Dialog ───────────────────────────────────────
export function confirm(title, message, danger = false) {
  return new Promise((resolve) => {
    const { modal, close } = showModal(`
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(title)}</span>
        <button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-muted);font-size:var(--fs-sm)">${escapeHtml(message)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm confirm-cancel">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm confirm-ok">${danger ? 'Delete' : 'Confirm'}</button>
      </div>
    `);

    modal.querySelector('.confirm-ok').onclick     = () => { close(); resolve(true); };
    modal.querySelector('.confirm-cancel').onclick  = () => { close(); resolve(false); };
    modal.querySelector('.modal-close-btn').onclick = () => { close(); resolve(false); };
  });
}

// ── Prompt Dialog ────────────────────────────────────────
export function prompt(title, placeholder = '', defaultValue = '') {
  return new Promise((resolve) => {
    const { modal, close } = showModal(`
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(title)}</span>
        <button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <input class="form-input prompt-input" type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}">
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm prompt-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm prompt-ok">OK</button>
      </div>
    `);

    const input = modal.querySelector('.prompt-input');
    input.focus();
    input.select();

    const submit = () => { close(); resolve(input.value.trim()); };
    modal.querySelector('.prompt-ok').onclick     = submit;
    modal.querySelector('.prompt-cancel').onclick  = () => { close(); resolve(null); };
    modal.querySelector('.modal-close-btn').onclick= () => { close(); resolve(null); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  });
}

// ── PIN Dialog ───────────────────────────────────────────
export function pinDialog(title = 'Enter PIN', message = '') {
  return new Promise((resolve) => {
    const { modal, close } = showModal(`
      <div class="modal-header">
        <span class="modal-title">${escapeHtml(title)}</span>
        <button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;align-items:center">
        ${message ? `<p style="color:var(--text-muted);font-size:var(--fs-sm);text-align:center">${escapeHtml(message)}</p>` : ''}
        <div style="display:flex;gap:8px;justify-content:center">
          ${[0,1,2,3,4,5].map(i => `<div class="pin-dot" data-i="${i}" style="width:14px;height:14px;border-radius:50%;border:2px solid var(--border-2);background:transparent;transition:all 0.15s"></div>`).join('')}
        </div>
        <input class="form-input pin-input" type="password" inputmode="numeric" maxlength="6"
          pattern="[0-9]*" autocomplete="off"
          style="text-align:center;letter-spacing:8px;font-size:20px;width:160px">
        <div class="pin-error" style="color:var(--danger);font-size:var(--fs-xs);min-height:16px;text-align:center"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm pin-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm pin-ok">Confirm</button>
      </div>
    `);

    const input = modal.querySelector('.pin-input');
    const dots  = modal.querySelectorAll('.pin-dot');
    input.focus();

    input.addEventListener('input', () => {
      const val = input.value.replace(/\D/g, '').slice(0, 6);
      input.value = val;
      dots.forEach((d, i) => {
        d.style.background = i < val.length ? 'var(--primary)' : 'transparent';
        d.style.borderColor = i < val.length ? 'var(--primary)' : 'var(--border-2)';
      });
    });

    const submit = () => {
      const val = input.value.trim();
      if (val.length !== 6) {
        modal.querySelector('.pin-error').textContent = 'PIN must be 6 digits';
        input.focus();
        return;
      }
      close();
      resolve(val);
    };

    modal.querySelector('.pin-ok').onclick     = submit;
    modal.querySelector('.pin-cancel').onclick  = () => { close(); resolve(null); };
    modal.querySelector('.modal-close-btn').onclick = () => { close(); resolve(null); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  });
}

// ── Dropdown Menu ────────────────────────────────────────
export function showDropdown(anchor, items, { align = 'left' } = {}) {
  // Remove any existing dropdown
  document.querySelectorAll('.dropdown').forEach(d => d.remove());

  const menu = document.createElement('div');
  menu.className = 'dropdown';

  items.forEach(item => {
    if (item === 'divider') {
      const div = document.createElement('div');
      div.className = 'dropdown-divider';
      menu.appendChild(div);
      return;
    }
    const btn = document.createElement('button');
    btn.className = `dropdown-item${item.danger ? ' danger' : ''}`;
    btn.innerHTML = `<i class="${item.icon || ''}"></i>${escapeHtml(item.label)}`;
    if (item.disabled) { btn.disabled = true; btn.style.opacity = '0.5'; }
    btn.onclick = () => { menu.remove(); item.action?.(); };
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  const rect = anchor.getBoundingClientRect();
  const mw = 200;
  let left = align === 'right' ? rect.right - mw : rect.left;
  let top  = rect.bottom + 4;

  // Keep in viewport
  if (left + mw > window.innerWidth - 8)  left = window.innerWidth - mw - 8;
  if (left < 8)                            left = 8;
  if (top + 300 > window.innerHeight)     top = rect.top - 4;

  menu.style.cssText = `position:fixed;top:${top}px;left:${left}px;min-width:${mw}px`;

  // Close on outside click
  const dismiss = (e) => {
    if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', dismiss, true); }
  };
  setTimeout(() => document.addEventListener('click', dismiss, true), 10);

  return menu;
}

// ── URL Utilities ────────────────────────────────────────
export function isValidUrl(str) {
  try { const u = new URL(str); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}

export function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url; }
}

export function getFavicon(url) {
  try {
    const domain = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch { return null; }
}

export function cleanUrl(url) {
  url = url.trim();
  if (url && !url.startsWith('http')) url = 'https://' + url;
  return url;
}

// ── HTML Sanitization ────────────────────────────────────
export function escapeHtml(str) {
  if (typeof str !== 'string') return str ?? '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ── Date Formatting ──────────────────────────────────────
export function timeAgo(ts) {
  const now = Date.now();
  const diff = now - (ts || now);
  const s = Math.floor(diff / 1000);
  if (s < 60)      return 'just now';
  if (s < 3600)    return `${Math.floor(s/60)}m ago`;
  if (s < 86400)   return `${Math.floor(s/3600)}h ago`;
  if (s < 604800)  return `${Math.floor(s/86400)}d ago`;
  if (s < 2592000) return `${Math.floor(s/604800)}w ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { day:'numeric', month:'short', year:'numeric' });
}

// ── Storage (localStorage) ───────────────────────────────
export const Storage = {
  get:    (key, fallback = null) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set:    (key, val)             => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  remove: (key)                  => { try { localStorage.removeItem(key); } catch {} },
};

// ── Theme ────────────────────────────────────────────────
export const Theme = {
  init() {
    const saved = Storage.get('theme', 'light');
    this.apply(saved);
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Storage.set('theme', theme);
    const logoLight = document.querySelectorAll('.logo-light');
    const logoDark  = document.querySelectorAll('.logo-dark');
    if (theme === 'dark') {
      logoLight.forEach(el => el.classList.add('hidden'));
      logoDark.forEach(el  => el.classList.remove('hidden'));
    } else {
      logoLight.forEach(el => el.classList.remove('hidden'));
      logoDark.forEach(el  => el.classList.add('hidden'));
    }
  },
  toggle() {
    const current = Storage.get('theme', 'light');
    this.apply(current === 'dark' ? 'light' : 'dark');
  },
  current() { return Storage.get('theme', 'light'); }
};

// ── Debounce ─────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ── Deep clone ───────────────────────────────────────────
export function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── Truncate text ────────────────────────────────────────
export function truncate(str, len = 60) {
  return str?.length > len ? str.slice(0, len) + '…' : (str || '');
}

// ── Point Calculator (for Random Link system) ────────────
export function calcLinkPoints(link, config) {
  const pt = config?.pointSystem || { basePoints:100, likeBonus:50, dislikePenalty:-40, favouriteBonus:100, blockedMultiplier:0 };
  if (link.blocked) return 0;
  let points = pt.basePoints;
  if (link.liked)    points += pt.likeBonus;
  if (link.disliked) points += pt.dislikePenalty;
  if (link.starred)  points += pt.favouriteBonus;
  // Reduce points for links opened many times (discovery fairness)
  if (link.openCount > 10) points *= Math.max(0.4, 1 - (link.openCount - 10) * 0.02);
  return Math.max(0, Math.round(points));
}

// ── Weighted random selection ────────────────────────────
export function weightedRandom(items, weightFn) {
  const weights = items.map(weightFn);
  const total   = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return items[Math.floor(Math.random() * items.length)];
  let rand = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Copy to clipboard ────────────────────────────────────
export async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    ta.remove(); return true;
  }
}

// ── Register Service Worker ──────────────────────────────
export async function registerSW() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('[SW] Registered:', reg.scope);
    } catch (e) {
      console.warn('[SW] Registration failed:', e);
    }
  }
}
