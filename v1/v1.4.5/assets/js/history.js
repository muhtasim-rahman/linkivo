// ============================================================
// Linkivo — history.js  v1.4.5
// Fix: opening from history no longer creates new history entry
// Fix: locked folder items never load real data from Firebase
// Feat: undo delete (2s window), undo clear-all (5s window)
// History page: date-grouped, search, locked folder blur,
// auto-clear, clear = single remove() call (bug fix)
// ============================================================

import { db, ref, get, remove, onValue } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, confirm, Storage, escapeHtml, timeAgo, debounce, getFavicon } from './utils.js';
import { isFolderUnlocked, verifyAndUnlockFolder } from './folders.js';

const uid = () => getCurrentUser()?.uid;

let _items  = [];
let _filter = '';

export function clearHistorySearch() {
  _filter = '';
  const bar   = document.getElementById('hist-search-bar');
  const input = document.getElementById('hist-search-input');
  if (bar)   bar.classList.add('hidden');
  if (input) input.value = '';
}

export function initHistoryPage() {
  const page = document.getElementById('page-history');
  if (!page) return;

  _doAutoClear();

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--sp-4) var(--sp-5) var(--sp-3);border-bottom:1px solid var(--border);flex-shrink:0">
        <div>
          <h2 style="font-size:var(--fs-xl);font-weight:800;letter-spacing:-0.3px">History</h2>
          <p id="hist-meta" style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:2px">Loading…</p>
        </div>
        <div style="display:flex;gap:6px">
          <button class="topbar-btn" id="hist-search-btn" title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
          <button class="topbar-btn" id="hist-menu-btn" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
          <button class="topbar-btn hidden" id="hist-clear-btn" title="Clear all">
            <i class="fa-solid fa-trash-clock"></i>
          </button>
        </div>
      </div>

      <!-- Search bar (hidden by default) -->
      <div class="hist-search-bar hidden" id="hist-search-bar">
        <i class="fa-solid fa-magnifying-glass" style="color:var(--text-subtle);font-size:14px;flex-shrink:0"></i>
        <input type="search" id="hist-search-input" placeholder="Search history…" autocomplete="off">
        <button id="hist-search-close" style="border:none;background:none;cursor:pointer;color:var(--text-subtle);padding:4px;font-size:14px;flex-shrink:0">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Content -->
      <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain" id="hist-list">
        <div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Loading…
        </div>
      </div>
    </div>`;

  _bindEvents(page);
  _subscribe(page);
}

function _bindEvents(page) {
  const $ = id => page.querySelector(`#${id}`);

  // 3-dot menu
  $('hist-menu-btn')?.addEventListener('click', async e => {
    const { showDropdown } = await import('./utils.js');
    showDropdown(e.currentTarget, [
      { label: 'Clear all', icon: 'fa-solid fa-trash-clock',
        action: () => $('hist-clear-btn')?.click() },
      { label: 'Export history', icon: 'fa-solid fa-file-export',
        action: () => _exportHistory() },
      'divider',
      { label: 'Auto-clear settings', icon: 'fa-solid fa-gear',
        action: () => { window.Router?.go?.('settings'); setTimeout(() => {
          document.querySelector('[data-settings-section="history"]')?.scrollIntoView({ behavior:'smooth' });
        }, 500); }},
    ], { align: 'right' });
  });

  // Show clear button when items exist (kept for programmatic access)
  // It's now hidden by default; 3-dot menu triggers it

  // Search
  $('hist-search-btn')?.addEventListener('click', () => {
    const bar = $('hist-search-bar');
    const isHidden = bar.classList.toggle('hidden');
    if (!isHidden) $('hist-search-input')?.focus();
    else { _filter = ''; $('hist-search-input').value = ''; _render(page); }
  });
  $('hist-search-close')?.addEventListener('click', () => {
    $('hist-search-bar')?.classList.add('hidden');
    _filter = ''; $('hist-search-input').value = ''; _render(page);
  });
  $('hist-search-input')?.addEventListener('input', debounce(e => {
    _filter = e.target.value.toLowerCase(); _render(page);
  }, 200));

  // Clear history — confirmation + 5-second undo toast
  $('hist-clear-btn')?.addEventListener('click', async () => {
    if (!_items.length) return;
    const ok = await confirm('Clear History', `Delete all ${_items.length} history entries?`, true);
    if (!ok) return;

    // Snapshot for undo
    const snapshot = [..._items];
    _items = [];
    _render(page);

    const tc  = document.getElementById('toast-container');
    const el  = document.createElement('div');
    let undone = false;
    let secs   = 5;
    el.className = 'toast toast-info';
    el.style.cssText = 'gap:8px;align-items:center;min-width:260px';

    const updateEl = () => {
      el.innerHTML = `
        <i class="fa-solid fa-trash toast-icon" style="color:var(--text-muted)"></i>
        <span style="flex:1;font-size:12px">Cleared ${snapshot.length} entries &nbsp;
          <span style="color:var(--text-subtle)">(${secs}s)</span></span>
        <button style="border:none;background:var(--primary);color:#fff;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0" id="hist-clear-undo">
          Undo
        </button>`;
      el.querySelector('#hist-clear-undo')?.addEventListener('click', () => {
        undone = true;
        clearInterval(ticker);
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 220);
        _items = snapshot;
        _render(page);
      });
    };
    updateEl();
    tc?.appendChild(el);

    const ticker = setInterval(() => {
      secs--;
      if (secs <= 0) {
        clearInterval(ticker);
        if (!undone) {
          remove(ref(db, `users/${uid()}/history`));
          el.classList.add('toast-out');
          setTimeout(() => el.remove(), 220);
        }
      } else {
        updateEl();
      }
    }, 1000);
  });
}

function _subscribe(page) {
  onValue(ref(db, `users/${uid()}/history`), async snap => {
    if (!snap.exists()) { _items = []; _render(page); return; }

    // Also need folder data for locked check
    const fSnap = await get(ref(db, `users/${uid()}/folders`));
    const folders = fSnap.exists() ? fSnap.val() : {};

    _items = Object.values(snap.val())
      .sort((a,b) => b.openedAt - a.openedAt)
      .map(item => ({
        ...item,
        folderLocked: item.folderId && folders[item.folderId]?.locked && !isFolderUnlocked(item.folderId),
        folderObj: item.folderId ? folders[item.folderId] : null,
      }));

    // Update meta
    const meta = page.querySelector('#hist-meta');
    if (meta) meta.textContent = `${_items.length} link${_items.length!==1?'s':''} opened`;

    // Show clear label
    const clabel = page.querySelector('.hist-clear-label');
    if (clabel) clabel.style.display = _items.length ? '' : 'none';

    _render(page);
  });
}

function _render(page) {
  const list = page.querySelector('#hist-list');
  if (!list) return;

  let items = _items;
  if (_filter) {
    items = items.filter(i =>
      (i.title||'').toLowerCase().includes(_filter) ||
      (i.url||'').toLowerCase().includes(_filter)   ||
      (i.domain||'').toLowerCase().includes(_filter)
    );
  }

  if (!items.length) {
    list.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;gap:16px;text-align:center">
        <div style="width:64px;height:64px;background:var(--gradient-soft);border-radius:var(--r-xl);display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--primary)">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <h3 style="font-size:var(--fs-lg)">${_filter?'No results':'No history yet'}</h3>
        <p style="font-size:var(--fs-sm)">${_filter?'Try a different search term':'Links you open will appear here'}</p>
      </div>`;
    return;
  }

  // Group by date
  const groups = {};
  items.forEach(item => {
    const d   = new Date(item.openedAt);
    const key = _dateKey(d);
    if (!groups[key]) groups[key] = { label: _dateLabel(d), items: [] };
    groups[key].items.push(item);
  });

  list.innerHTML = Object.values(groups).map(g => `
    <div class="hist-date-group">
      <div class="hist-date-label">${g.label}</div>
      ${g.items.map(item => {
        // For locked folders, show only a placeholder — no real data in DOM
        const title  = item.folderLocked ? 'Content locked' : escapeHtml(item.title||item.domain||item.url);
        const domain = item.folderLocked ? '' : escapeHtml(item.domain||'');
        const favSrc = item.folderLocked ? '' : (item.favicon||getFavicon(item.url)||'');
        const fallback = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23e2e8f0%22/></svg>";
        return `
        <div class="hist-item${item.folderLocked?' locked-link':''}" data-id="${item.id}"
             data-url="${item.folderLocked ? '' : escapeHtml(item.url||'')}"
             data-fid="${item.folderId||''}" data-locked="${item.folderLocked?'1':'0'}">
          ${item.folderLocked
            ? `<div style="width:32px;height:32px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-lock" style="font-size:14px;color:var(--text-subtle)"></i></div>`
            : `<img src="${favSrc}" onerror="this.src='${fallback}'" loading="lazy">`}
          <div class="hist-item-info">
            <div class="hist-item-title">${title}</div>
            <div class="hist-item-meta">
              ${domain ? `<span class="hist-item-domain">${domain}</span>` : ''}
              <span>${timeAgo(item.openedAt)}</span>
              ${item.folderName ? `<span><i class="fa-solid fa-folder" style="font-size:9px;margin-right:2px"></i>${escapeHtml(item.folderName)}</span>` : ''}
              ${item.folderLocked ? '<span><i class="fa-solid fa-lock" style="font-size:9px;margin-right:2px"></i>Locked</span>' : ''}
            </div>
          </div>
          <button class="hist-item-del" data-del="${item.id}" title="Remove"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
      }).join('')}
    </div>`).join('');

  // Click to open (or unlock if locked)
  list.querySelectorAll('.hist-item').forEach(el => {
    el.addEventListener('click', async e => {
      if (e.target.closest('[data-del]')) return;
      const locked = el.dataset.locked === '1';
      const url    = el.dataset.url;
      if (locked) {
        const fid = el.dataset.fid;
        // Load folder to verify
        const fSnap = await get(ref(db, `users/${uid()}/folders/${fid}`));
        if (!fSnap.exists()) return;
        const folder = fSnap.val();
        const ok = await verifyAndUnlockFolder(folder);
        if (!ok) return;
        // Unlock visual
        el.classList.remove('locked-link');
        el.dataset.locked = '0';
      }
      // Open without creating a new history entry (source='history')
      window.open(url, '_blank', 'noopener');
      // Note: addToHistory is only called by links.js addOpenCount which checks source
    });
  });

  // Delete individual — 2-second undo window
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id    = btn.dataset.del;
      const item  = _items.find(i => i.id === id);
      if (!item) return;

      // Remove from DOM immediately
      const row = btn.closest('.hist-item');
      row?.remove();

      // Show undo toast
      let undone  = false;
      let timer;
      const { toast: showToast } = await import('./utils.js');

      const tc = document.getElementById('toast-container');
      const el = document.createElement('div');
      el.className = 'toast toast-info';
      el.style.cssText = 'cursor:pointer;gap:8px;align-items:center;min-width:240px';
      el.innerHTML = `
        <i class="fa-solid fa-trash toast-icon" style="color:var(--text-muted)"></i>
        <span style="flex:1;font-size:12px">Removed: <b>${escapeHtml((item.title||item.domain||'').slice(0,30))}</b></span>
        <button style="border:none;background:var(--primary);color:#fff;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;flex-shrink:0" id="hist-undo-${id}">
          Undo
        </button>`;
      tc?.appendChild(el);

      const commit = async () => {
        if (undone) return;
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 220);
        await remove(ref(db, `users/${uid()}/history/${id}`));
      };

      timer = setTimeout(commit, 2000);
      el.querySelector(`#hist-undo-${id}`)?.addEventListener('click', () => {
        undone = true;
        clearTimeout(timer);
        el.classList.add('toast-out');
        setTimeout(() => el.remove(), 220);
        // Re-add item to _items and re-render
        if (!_items.find(i => i.id === id)) _items.unshift(item);
        _render(page);
      });
      el.addEventListener('click', e => { if (e.target.id !== `hist-undo-${id}`) commit(); });
      setTimeout(() => el.classList.add('toast-out'), 2200);
    });
  });
}

function _exportHistory() {
  if (!_items.length) { import('./utils.js').then(({toast:t})=>t('No history to export','info')); return; }
  const rows = ['URL,Title,Domain,Opened At'];
  _items.forEach(i => {
    const esc = s => `"${(s||'').replace(/"/g,'""')}"`;
    rows.push([esc(i.url), esc(i.title||i.domain||''), esc(i.domain||''), new Date(i.openedAt).toISOString()].join(','));
  });
  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
  const a    = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `linkivo-history-${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click(); URL.revokeObjectURL(a.href);
  import('./utils.js').then(({toast:t})=>t('History exported','success'));
}

function _dateKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function _dateLabel(d) {
  const today = new Date();
  const diff  = Math.floor((today.setHours(0,0,0,0) - d.setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff} days ago`;
  return d.toLocaleDateString('en-US',{ weekday:'long', month:'short', day:'numeric' });
}

async function _doAutoClear() {
  const days = Storage.get('autoClearHistoryDays', 0);
  if (!days) return;
  try {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const snap   = await get(ref(db, `users/${uid()}/history`));
    if (!snap.exists()) return;
    const old = Object.entries(snap.val()).filter(([,v]) => v.openedAt < cutoff);
    for (const [key] of old) await remove(ref(db, `users/${uid()}/history/${key}`));
    if (old.length) console.log(`[History] Auto-cleared ${old.length} entries`);
  } catch {}
}
