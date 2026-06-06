// ============================================================
// Linkivo — history.js  v1.4.2
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
          <button class="btn btn-ghost btn-sm" id="hist-clear-btn" title="Clear all">
            <i class="fa-solid fa-trash"></i><span style="margin-left:4px;display:none" class="hist-clear-label">Clear</span>
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

  // FIX: Clear history — single remove() not a loop
  $('hist-clear-btn')?.addEventListener('click', async () => {
    if (!_items.length) return;
    const ok = await confirm('Clear History', `Delete all ${_items.length} history entries?`, true);
    if (!ok) return;
    await remove(ref(db, `users/${uid()}/history`)); // ONE call
    toast('History cleared', 'info');
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
      ${g.items.map(item => `
        <div class="hist-item${item.folderLocked?' locked-link':''}" data-id="${item.id}" data-url="${escapeHtml(item.url)}" data-fid="${item.folderId||''}" data-locked="${item.folderLocked?'1':'0'}">
          <img src="${item.favicon||getFavicon(item.url)||''}"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23e2e8f0%22/><text x=%2216%22 y=%2222%22 font-size=%2215%22 text-anchor=%22middle%22>🔗</text></svg>'"
            loading="lazy">
          <div class="hist-item-info">
            <div class="hist-item-title">${escapeHtml(item.title||item.domain||item.url)}</div>
            <div class="hist-item-meta">
              <span class="hist-item-domain">${escapeHtml(item.domain||'')}</span>
              <span>${timeAgo(item.openedAt)}</span>
              ${item.folderName?`<span>📁 ${escapeHtml(item.folderName)}</span>`:''}
              ${item.folderLocked?'<span>🔒 Locked</span>':''}
            </div>
          </div>
          <button class="hist-item-del" data-del="${item.id}" title="Remove"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('')}
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
      window.open(url, '_blank', 'noopener');
    });
  });

  // Delete individual
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await remove(ref(db, `users/${uid()}/history/${btn.dataset.del}`));
    });
  });
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
