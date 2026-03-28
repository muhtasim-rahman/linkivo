// ============================================================
// Linkivo — history.js  v1.3.0
// History page: opened links log with actions
// ============================================================

import { db, ref, onValue, remove, get, set } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, confirm, showDropdown, copyToClipboard, timeAgo, escapeHtml, genId } from './utils.js';

const uid     = () => getCurrentUser()?.uid;
const histRef = ()  => ref(db, `users/${uid()}/history`);

let _history    = [];
let _filterText = '';
let _unsubHist  = null;

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════

export function initHistoryPage() {
  buildHistoryUI();
  subscribeHistory();
}

function subscribeHistory() {
  if (_unsubHist) _unsubHist();
  onValue(histRef(), (snap) => {
    _history = snap.exists()
      ? Object.values(snap.val()).sort((a, b) => b.openedAt - a.openedAt)
      : [];
    renderHistory();
  });
}

// ══════════════════════════════════════════════════════════
// UI BUILD
// ══════════════════════════════════════════════════════════

function buildHistoryUI() {
  const page = document.getElementById('page-history');
  if (!page) return;

  page.innerHTML = `
    <div class="history-page">

      <!-- Header -->
      <div class="history-header">
        <div>
          <h2 class="history-title">History</h2>
          <p class="history-subtitle" id="hist-subtitle">Loading…</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="topbar-btn" id="hist-search-toggle" title="Search">
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
          <button class="topbar-btn" id="hist-clear-btn" title="Clear all history" style="color:var(--danger)">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <!-- Search bar -->
      <div class="history-search-bar hidden" id="hist-search-bar">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" id="hist-search-input" placeholder="Search history…" autocomplete="off">
        <button id="hist-search-close"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <!-- List -->
      <div class="history-list" id="history-list">
        ${[1,2,3,4,5].map(() => `
          <div class="history-item-skeleton">
            <div class="skeleton" style="width:36px;height:36px;border-radius:var(--r-sm);flex-shrink:0"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:6px">
              <div class="skeleton" style="width:65%;height:12px"></div>
              <div class="skeleton" style="width:40%;height:10px"></div>
            </div>
          </div>`).join('')}
      </div>

    </div>
  `;

  bindHistoryEvents();
}

function bindHistoryEvents() {
  // Search
  const searchBar   = document.getElementById('hist-search-bar');
  const searchInput = document.getElementById('hist-search-input');

  document.getElementById('hist-search-toggle')?.addEventListener('click', () => {
    searchBar?.classList.toggle('hidden');
    if (!searchBar?.classList.contains('hidden')) searchInput?.focus();
    else { _filterText = ''; renderHistory(); }
  });
  document.getElementById('hist-search-close')?.addEventListener('click', () => {
    searchBar?.classList.add('hidden');
    _filterText = ''; if (searchInput) searchInput.value = '';
    renderHistory();
  });
  searchInput?.addEventListener('input', () => {
    _filterText = searchInput.value.toLowerCase();
    renderHistory();
  });

  // Clear all
  document.getElementById('hist-clear-btn')?.addEventListener('click', async () => {
    if (!_history.length) { toast('History is already empty', 'info'); return; }
    const ok = await confirm('Clear History', `Delete all ${_history.length} history items?`, true);
    if (!ok) return;
    const snap = await get(histRef());
    if (snap.exists()) {
      for (const key of Object.keys(snap.val())) {
        await remove(ref(db, `users/${uid()}/history/${key}`));
      }
    }
    toast('History cleared', 'info');
  });
}

// ══════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════

function renderHistory() {
  const list     = document.getElementById('history-list');
  const subtitle = document.getElementById('hist-subtitle');
  if (!list) return;

  let items = [..._history];
  if (_filterText) {
    items = items.filter(h =>
      (h.title  || '').toLowerCase().includes(_filterText) ||
      (h.url    || '').toLowerCase().includes(_filterText) ||
      (h.domain || '').toLowerCase().includes(_filterText)
    );
  }

  if (subtitle) subtitle.textContent = `${_history.length} link${_history.length !== 1 ? 's' : ''} opened`;

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
        <h3>${_filterText ? 'No results' : 'No history yet'}</h3>
        <p>${_filterText ? 'Try a different search' : 'Links opened via Random Discover will appear here'}</p>
      </div>`;
    return;
  }

  // Group by date
  const groups = groupByDate(items);
  list.innerHTML = '';

  for (const [label, groupItems] of Object.entries(groups)) {
    // Date header
    const header = document.createElement('div');
    header.className = 'history-date-header';
    header.innerHTML = `<span>${label}</span><span>${groupItems.length}</span>`;
    list.appendChild(header);

    // Items
    groupItems.forEach((item, idx) => {
      const el = createHistoryItem(item, idx);
      list.appendChild(el);
    });
  }
}

function createHistoryItem(item, idx) {
  const el = document.createElement('div');
  el.className = 'history-item';
  el.dataset.hid = item.id;
  el.style.animationDelay = `${idx * 0.025}s`;

  el.innerHTML = `
    <div class="hist-thumb">
      <img src="${item.favicon || ''}" width="36" height="36"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23e2e8f0%22/><text x=%2216%22 y=%2222%22 font-size=%2215%22 text-anchor=%22middle%22>🔗</text></svg>'"
           loading="lazy" style="border-radius:var(--r-sm);object-fit:contain">
    </div>
    <div class="hist-info">
      <div class="hist-title">${escapeHtml(item.title || item.domain || 'Link')}</div>
      <div class="hist-url">${escapeHtml(item.url || '')}</div>
      <div class="hist-meta">
        <span class="hist-time"><i class="fa-regular fa-clock"></i> ${timeAgo(item.openedAt)}</span>
        ${item.folderName ? `<span class="hist-folder"><i class="fa-solid fa-folder"></i> ${escapeHtml(item.folderName)}</span>` : ''}
      </div>
    </div>
    <button class="hist-menu-btn" title="Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
  `;

  // Click to open
  el.addEventListener('click', (e) => {
    if (e.target.closest('.hist-menu-btn')) return;
    window.open(item.url, '_blank', 'noopener');
  });

  // Three-dot menu
  el.querySelector('.hist-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showHistMenu(e.currentTarget, item, el);
  });

  return el;
}

function showHistMenu(anchor, item, el) {
  showDropdown(anchor, [
    {
      label:  'Open in new tab',
      icon:   'fa-solid fa-arrow-up-right-from-square',
      action: () => window.open(item.url, '_blank', 'noopener'),
    },
    {
      label:  'Copy URL',
      icon:   'fa-solid fa-copy',
      action: async () => { await copyToClipboard(item.url); toast('Copied!', 'success'); },
    },
    'divider',
    {
      label:  'Remove from history',
      icon:   'fa-solid fa-trash',
      danger: true,
      action: async () => {
        await remove(ref(db, `users/${uid()}/history/${item.id}`));
        el.style.animation = 'fadeOut 0.2s ease forwards';
        setTimeout(() => el.remove(), 200);
        toast('Removed from history', 'info');
      },
    },
  ], { align: 'right' });
}

// ── Group items by date label ──────────────────────────────
function groupByDate(items) {
  const groups = {};
  const now    = new Date();
  const todayStr = now.toDateString();
  const yestStr  = new Date(now - 86400000).toDateString();

  for (const item of items) {
    const d   = new Date(item.openedAt);
    const ds  = d.toDateString();
    let label;
    if (ds === todayStr)  label = 'Today';
    else if (ds === yestStr) label = 'Yesterday';
    else label = d.toLocaleDateString('en-US', { weekday:'long', day:'numeric', month:'short' });

    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }
  return groups;
}
