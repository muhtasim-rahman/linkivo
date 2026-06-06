// ============================================================
// Linkivo — history.js  v1.4.5
// History page: date-grouped, search, locked folder protection,
// 2s undo delete, 5s clear-all undo, 3-dot menu per item,
// no re-history when opening from history page
// ============================================================

import { db, ref, get, remove, onValue } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, confirm, Storage, escapeHtml, timeAgo,
         debounce, getFavicon, showDropdown, copyToClipboard } from './utils.js';
import { isFolderUnlocked, verifyAndUnlockFolder } from './folders.js';

const uid = () => getCurrentUser()?.uid;

let _items       = [];
let _filter      = '';
let _clearTimer  = null;   // for clear-all undo
let _clearSnap   = null;   // saved snapshot for undo

export function initHistoryPage() {
  const page = document.getElementById('page-history');
  if (!page) return;

  _doAutoClear();

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:var(--sp-4) var(--sp-5) var(--sp-3);
                  border-bottom:1px solid var(--border);flex-shrink:0">
        <div>
          <h2 style="font-size:var(--fs-xl);font-weight:800;letter-spacing:-0.3px">History</h2>
          <p id="hist-meta" style="font-size:var(--fs-xs);color:var(--text-muted);margin-top:2px">Loading…</p>
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          <button class="topbar-btn" id="hist-search-btn" title="Search history">
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
          <button class="topbar-btn" id="hist-clear-btn" title="Clear all history"
            style="color:var(--text-muted)">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <!-- Search bar -->
      <div class="hist-search-bar hidden" id="hist-search-bar">
        <i class="fa-solid fa-magnifying-glass" style="color:var(--text-subtle);font-size:14px;flex-shrink:0"></i>
        <input type="search" id="hist-search-input" placeholder="Search history…" autocomplete="off">
        <button id="hist-search-close" style="border:none;background:none;cursor:pointer;
          color:var(--text-subtle);padding:4px;font-size:14px;flex-shrink:0">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- List -->
      <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;
                  overscroll-behavior:contain" id="hist-list">
        <div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Loading…
        </div>
      </div>
    </div>`;

  _bindEvents(page);
  _subscribe(page);
}

// ── Events ────────────────────────────────────────────────
function _bindEvents(page) {
  const $ = id => page.querySelector(`#${id}`);

  // Search toggle
  $('hist-search-btn')?.addEventListener('click', () => {
    const bar = $('hist-search-bar');
    const hidden = bar.classList.toggle('hidden');
    if (!hidden) $('hist-search-input')?.focus();
    else { _filter = ''; if ($('hist-search-input')) $('hist-search-input').value = ''; _render(page); }
  });
  $('hist-search-close')?.addEventListener('click', () => {
    $('hist-search-bar')?.classList.add('hidden');
    _filter = '';
    if ($('hist-search-input')) $('hist-search-input').value = '';
    _render(page);
  });
  $('hist-search-input')?.addEventListener('input', debounce(e => {
    _filter = e.target.value.toLowerCase();
    _render(page);
  }, 200));

  // Clear all → 5s undo window
  $('hist-clear-btn')?.addEventListener('click', async () => {
    if (!_items.length) return;
    const ok = await confirm('Clear History',
      `Delete all ${_items.length} history entries? You'll have 5 seconds to undo.`, true);
    if (!ok) return;

    // Save snapshot for undo
    _clearSnap = { ...((await get(ref(db, `users/${uid()}/history`))).val() || {}) };

    // Optimistic: hide all items visually
    const list = page.querySelector('#hist-list');
    if (list) list.style.opacity = '0.3';

    // Schedule actual server delete after 5s
    clearTimeout(_clearTimer);
    _clearTimer = setTimeout(async () => {
      await remove(ref(db, `users/${uid()}/history`));
      _clearSnap  = null;
      _clearTimer = null;
      if (list) list.style.opacity = '';
      toast('History cleared', 'info');
    }, 5000);

    // Undo toast (5s)
    _showUndoToast('Clearing history…', async () => {
      clearTimeout(_clearTimer);
      _clearTimer = null;
      if (list) list.style.opacity = '';
      // Nothing to restore — we didn't delete yet
      _clearSnap = null;
    }, 5000);
  });
}

// ── Firebase subscription ─────────────────────────────────
function _subscribe(page) {
  onValue(ref(db, `users/${uid()}/history`), async snap => {
    if (!snap.exists()) { _items = []; _render(page); return; }

    const fSnap   = await get(ref(db, `users/${uid()}/folders`));
    const folders = fSnap.exists() ? fSnap.val() : {};

    _items = Object.values(snap.val())
      .sort((a, b) => b.openedAt - a.openedAt)
      .map(item => ({
        ...item,
        folderLocked: !!(item.folderId && folders[item.folderId]?.locked && !isFolderUnlocked(item.folderId)),
        folderObj:    item.folderId ? folders[item.folderId] : null,
      }));

    const meta = page.querySelector('#hist-meta');
    if (meta) meta.textContent = `${_items.length} link${_items.length !== 1 ? 's' : ''} opened`;

    _render(page);
  });
}

// ── Render ────────────────────────────────────────────────
function _render(page) {
  const list = page.querySelector('#hist-list');
  if (!list) return;

  let items = _items;
  if (_filter) {
    items = items.filter(i =>
      (i.title || '').toLowerCase().includes(_filter) ||
      (i.url   || '').toLowerCase().includes(_filter) ||
      (i.domain|| '').toLowerCase().includes(_filter)
    );
  }

  if (!items.length) {
    list.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  padding:60px 20px;gap:16px;text-align:center">
        <div style="width:64px;height:64px;background:var(--gradient-soft);border-radius:var(--r-xl);
                    display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--primary)">
          <i class="fa-solid fa-clock-rotate-left"></i>
        </div>
        <h3 style="font-size:var(--fs-lg)">${_filter ? 'No results' : 'No history yet'}</h3>
        <p style="font-size:var(--fs-sm)">${_filter ? 'Try a different search term' : 'Links you open will appear here'}</p>
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
        const locked = item.folderLocked;
        const safeUrl = locked ? '' : escapeHtml(item.url);
        return `
        <div class="hist-item${locked ? ' locked-link' : ''}"
          data-id="${item.id}"
          data-url="${safeUrl}"
          data-fid="${item.folderId || ''}"
          data-locked="${locked ? '1' : '0'}">

          ${locked
            ? `<div class="hist-lock-icon"><i class="fa-solid fa-lock"></i></div>`
            : `<img class="hist-favicon" src="${item.favicon || getFavicon(item.url) || ''}"
                 loading="lazy" onerror="this.style.display='none'">`
          }

          <div class="hist-item-info">
            <div class="hist-item-title">
              ${locked
                ? '<span style="color:var(--text-muted);font-style:italic">Content locked</span>'
                : escapeHtml(item.title || item.domain || item.url)
              }
            </div>
            <div class="hist-item-meta">
              <span>${timeAgo(item.openedAt)}</span>
              ${item.folderName
                ? `<span><i class="fa-solid fa-folder"></i> ${escapeHtml(item.folderName)}</span>`
                : ''}
              ${locked
                ? `<span style="color:var(--warning,#f59e0b)">
                     <i class="fa-solid fa-lock"></i> Tap to unlock
                   </span>`
                : ''}
            </div>
          </div>

          <div class="hist-item-actions">
            <button class="hist-item-menu btn btn-ghost btn-icon" data-id="${item.id}"
              title="More options" aria-label="More options">
              <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
            <button class="hist-item-del btn btn-ghost btn-icon" data-del="${item.id}"
              title="Remove" aria-label="Remove">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>`;
      }).join('')}
    </div>`
  ).join('');

  // Bind events on rendered items
  _bindItemEvents(list, page);
}

// ── Item events ───────────────────────────────────────────
function _bindItemEvents(list, page) {
  const _pending = new Map();

  // Click on item → open or unlock
  list.querySelectorAll('.hist-item').forEach(el => {
    el.addEventListener('click', async e => {
      if (e.target.closest('.hist-item-del') || e.target.closest('.hist-item-menu')) return;
      const locked = el.dataset.locked === '1';
      const url    = el.dataset.url;

      if (locked) {
        const fid   = el.dataset.fid;
        const fSnap = await get(ref(db, `users/${uid()}/folders/${fid}`));
        if (!fSnap.exists()) return;
        const ok = await verifyAndUnlockFolder(fSnap.val());
        if (!ok) return;
        el.classList.remove('locked-link');
        el.dataset.locked = '0';
        el.querySelector('.hist-lock-icon')?.remove();
      }

      // Open without creating new history entry
      window.__skipHistoryTracking = true;
      setTimeout(() => { window.__skipHistoryTracking = false; }, 2000);
      if (url) window.open(url, '_blank', 'noopener');
    });
  });

  // 3-dot menu
  list.querySelectorAll('.hist-item-menu').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const itemEl = btn.closest('.hist-item');
      const id     = btn.dataset.id;
      const url    = itemEl?.dataset.url || '';
      const locked = itemEl?.dataset.locked === '1';

      const menuItems = [];
      if (!locked && url) {
        menuItems.push({
          icon: 'fa-solid fa-arrow-up-right-from-square',
          label: 'Open',
          action: () => {
            window.__skipHistoryTracking = true;
            setTimeout(() => { window.__skipHistoryTracking = false; }, 2000);
            window.open(url, '_blank', 'noopener');
          }
        });
        menuItems.push({
          icon: 'fa-solid fa-copy',
          label: 'Copy URL',
          action: () => copyToClipboard(url)
        });
        menuItems.push('divider');
      }
      menuItems.push({
        icon: 'fa-solid fa-trash-can',
        label: 'Delete',
        danger: true,
        action: () => _deleteItem(id, itemEl, _pending)
      });

      showDropdown(btn, menuItems, { align: 'right' });
    });
  });

  // X delete button → 2s undo
  list.querySelectorAll('.hist-item-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id     = btn.dataset.del;
      const itemEl = btn.closest('.hist-item');
      _deleteItem(id, itemEl, _pending);
    });
  });
}

// ── Delete with 2s undo ───────────────────────────────────
function _deleteItem(id, itemEl, pendingMap) {
  if (!itemEl) return;

  // Optimistic hide
  itemEl.style.opacity  = '0.3';
  itemEl.style.pointerEvents = 'none';

  // Scheduled server delete
  const timer = setTimeout(async () => {
    await remove(ref(db, `users/${uid()}/history/${id}`));
    pendingMap.delete(id);
    itemEl.remove();
  }, 2000);
  pendingMap.set(id, timer);

  _showUndoToast('History entry removed', () => {
    clearTimeout(pendingMap.get(id));
    pendingMap.delete(id);
    itemEl.style.opacity       = '';
    itemEl.style.pointerEvents = '';
  }, 2000);
}

// ── Undo toast ────────────────────────────────────────────
function _showUndoToast(message, onUndo, duration = 2000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'toast toast-info';
  el.style.cssText = 'display:flex;align-items:center;gap:10px;max-width:360px;min-width:240px';
  el.innerHTML = `
    <i class="fa-solid fa-clock-rotate-left toast-icon"></i>
    <span style="flex:1;font-size:13px">${escapeHtml(message)}</span>
    <button class="btn btn-ghost btn-sm" style="font-size:12px;padding:2px 10px;flex-shrink:0;white-space:nowrap">
      Undo
    </button>`;
  container.appendChild(el);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 220);
  };

  el.querySelector('button').addEventListener('click', () => {
    cleanup();
    onUndo?.();
  });
  setTimeout(cleanup, duration);
}

// ── Date helpers ──────────────────────────────────────────
function _dateKey(d)   { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function _dateLabel(d) {
  const today = new Date();
  const diff  = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()) -
     new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return `${diff} days ago`;
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── Auto-clear ────────────────────────────────────────────
async function _doAutoClear() {
  const days = Storage.get('autoClearHistoryDays', 0);
  if (!days) return;
  try {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const snap   = await get(ref(db, `users/${uid()}/history`));
    if (!snap.exists()) return;
    const old = Object.entries(snap.val()).filter(([, v]) => v.openedAt < cutoff);
    for (const [key] of old) await remove(ref(db, `users/${uid()}/history/${key}`));
    if (old.length) console.log(`[History] Auto-cleared ${old.length} entries`);
  } catch {}
}
