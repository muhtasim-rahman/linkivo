// ============================================================
// Linkivo — links.js  v1.3.0
// Folder view: render links, sort/filter, actions, recycle bin
// ============================================================

import {
  db, ref, set, get, update, remove,
  onValue, serverTimestamp
} from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import {
  toast, confirm, showDropdown, genId,
  copyToClipboard, escapeHtml, timeAgo,
  getFavicon, calcLinkPoints, weightedRandom, Storage
} from './utils.js';
import { incrementLinkCount } from './folders.js';

// ── DB paths ─────────────────────────────────────────────
const uid      = () => getCurrentUser()?.uid;
const linkRef  = (fid, lid)  => ref(db, `users/${uid()}/folders/${fid}/links/${lid}`);
const linksRef = (fid)       => ref(db, `users/${uid()}/folders/${fid}/links`);
const rbRef    = (id)        => ref(db, `users/${uid()}/recycleBin/${id}`);
const rbAllRef = ()          => ref(db, `users/${uid()}/recycleBin`);

// ── State ─────────────────────────────────────────────────
let _currentFolder  = null;
let _links          = [];
let _sortMode       = Storage.get('linkSort', 'date_desc');
let _viewMode       = Storage.get('linkView', 'list');
let _filterText     = '';
let _unsubLinks     = null;
let _selectedIds    = new Set();
let _multiSelect    = false;

// ══════════════════════════════════════════════════════════
// LINK CRUD
// ══════════════════════════════════════════════════════════

export async function updateLink(fid, lid, data) {
  await update(linkRef(fid, lid), { ...data, updatedAt: Date.now() });
}

export async function toggleLike(fid, link) {
  const wasLiked    = link.liked;
  const wasDisliked = link.disliked;
  await updateLink(fid, link.id, {
    liked:    !wasLiked,
    disliked: wasDisliked ? false : link.disliked,
    points:   calcPoints({ ...link, liked: !wasLiked, disliked: false }),
  });
}

export async function toggleDislike(fid, link) {
  const wasDisliked = link.disliked;
  await updateLink(fid, link.id, {
    disliked: !wasDisliked,
    liked:    wasDisliked ? link.liked : false,
    points:   calcPoints({ ...link, disliked: !wasDisliked, liked: false }),
  });
}

export async function toggleStar(fid, link) {
  await updateLink(fid, link.id, {
    starred: !link.starred,
    points:  calcPoints({ ...link, starred: !link.starred }),
  });
}

export async function togglePin(fid, link) {
  await updateLink(fid, link.id, { pinned: !link.pinned });
}

export async function toggleBlock(fid, link) {
  await updateLink(fid, link.id, {
    blocked: !link.blocked,
    points:  link.blocked ? calcPoints({ ...link, blocked: false }) : 0,
  });
  toast(link.blocked ? 'Link unblocked' : 'Link blocked from random', 'info');
}

export async function deleteLink(fid, link) {
  // Move to recycle bin
  const rbId = genId('rb_');
  await set(rbRef(rbId), {
    id:         rbId,
    type:       'link',
    originalFid: fid,
    originalLid: link.id,
    data:       link,
    deletedAt:  Date.now(),
    expireAt:   Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
  await remove(linkRef(fid, link.id));
  await incrementLinkCount(fid, -1);
  toast('Link moved to Recycle Bin', 'info');
}

export async function deleteLinksBulk(fid, linkIds) {
  for (const lid of linkIds) {
    const snap = await get(linkRef(fid, lid));
    if (!snap.exists()) continue;
    await deleteLink(fid, snap.val());
  }
  toast(`${linkIds.length} link${linkIds.length !== 1 ? 's' : ''} deleted`, 'info');
}

export async function addOpenCount(fid, lid) {
  const snap = await get(linkRef(fid, lid));
  if (!snap.exists()) return;
  const link = snap.val();
  await updateLink(fid, lid, { openCount: (link.openCount || 0) + 1 });
}

function calcPoints(link) {
  if (link.blocked) return 0;
  let p = 100;
  if (link.liked)    p += 50;
  if (link.disliked) p -= 40;
  if (link.starred)  p += 100;
  if ((link.openCount || 0) > 10) p *= Math.max(0.4, 1 - ((link.openCount - 10) * 0.02));
  return Math.max(0, Math.round(p));
}

// ══════════════════════════════════════════════════════════
// FOLDER VIEW — main entry
// ══════════════════════════════════════════════════════════

export function openFolderView(folder) {
  _currentFolder = folder;
  _selectedIds.clear();
  _multiSelect = false;
  _filterText  = '';

  const container = document.getElementById('folder-view-content');
  if (!container) return;

  container.innerHTML = buildFolderViewHTML(folder);
  bindFolderViewEvents(container, folder);

  // Unsubscribe previous listener
  if (_unsubLinks) _unsubLinks();

  // Real-time links subscription
  onValue(linksRef(folder.id), (snap) => {
    _links = snap.exists() ? Object.values(snap.val()) : [];
    renderLinks(container, folder);
  }, { _unsubLinks });
}

// ── Build folder view HTML skeleton ──────────────────────
function buildFolderViewHTML(folder) {
  const colorStyle = folder.color
    ? `background:${hexRgba(folder.color, 0.12)};color:${folder.color}`
    : 'background:var(--gradient-soft);color:var(--primary)';

  return `
    <!-- Back + title -->
    <div class="folder-view-topbar" id="folder-topbar">
      <button class="folder-back-btn" id="folder-back-btn" title="Back">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div class="folder-view-icon" style="${colorStyle}">
        ${folder.locked ? '<i class="fa-solid fa-lock"></i>' : `<i class="${folder.icon || 'fa-solid fa-folder'}"></i>`}
      </div>
      <div class="folder-view-title-wrap">
        <h2 class="folder-view-title">${escapeHtml(folder.name)}</h2>
        <span class="folder-view-meta" id="folder-link-count">Loading…</span>
      </div>
      <button class="topbar-btn" id="folder-import-btn" title="Import links">
        <i class="fa-solid fa-file-import"></i>
      </button>
      <button class="topbar-btn" id="folder-search-toggle" title="Search">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
    </div>

    <!-- Search bar (hidden by default) -->
    <div class="folder-search-bar hidden" id="folder-search-bar">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="search" id="folder-search-input" placeholder="Search links…" autocomplete="off">
      <button id="folder-search-close"><i class="fa-solid fa-xmark"></i></button>
    </div>

    <!-- Controls: sort + view toggle + multi-select -->
    <div class="links-controls" id="links-controls">
      <div class="links-sort-wrap">
        <button class="btn btn-ghost btn-sm links-sort-btn" id="links-sort-btn">
          <i class="fa-solid fa-arrow-down-wide-short"></i>
          <span id="sort-label">Latest</span>
          <i class="fa-solid fa-chevron-down" style="font-size:10px"></i>
        </button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-left:auto">
        <button class="btn btn-ghost btn-icon links-view-btn ${_viewMode === 'list' ? 'active' : ''}" data-view="list" title="List view">
          <i class="fa-solid fa-list"></i>
        </button>
        <button class="btn btn-ghost btn-icon links-view-btn ${_viewMode === 'grid' ? 'active' : ''}" data-view="grid" title="Grid view">
          <i class="fa-solid fa-grip"></i>
        </button>
        <button class="btn btn-ghost btn-sm" id="multi-select-btn" title="Select multiple">
          <i class="fa-solid fa-check-double"></i>
        </button>
      </div>
    </div>

    <!-- Multi-select action bar -->
    <div class="multi-select-bar hidden" id="multi-select-bar">
      <span class="multi-select-count" id="multi-count">0 selected</span>
      <div style="display:flex;gap:6px;margin-left:auto">
        <button class="btn btn-ghost btn-sm" id="multi-select-all-btn">All</button>
        <button class="btn btn-ghost btn-sm" id="multi-delete-btn" style="color:var(--danger)">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
        <button class="btn btn-ghost btn-sm" id="multi-cancel-btn">Cancel</button>
      </div>
    </div>

    <!-- Links list/grid -->
    <div class="links-container ${_viewMode === 'grid' ? 'links-grid' : 'links-list'}" id="links-container">
      <div class="skeleton-list">
        ${[1,2,3,4].map(i => `
          <div class="link-card-skeleton">
            <div class="skeleton" style="width:44px;height:44px;border-radius:var(--r-md);flex-shrink:0"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:6px">
              <div class="skeleton" style="width:70%;height:13px"></div>
              <div class="skeleton" style="width:45%;height:10px"></div>
              <div class="skeleton" style="width:30%;height:10px"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ── Bind events ───────────────────────────────────────────
function bindFolderViewEvents(container, folder) {
  // Back button
  container.querySelector('#folder-back-btn')?.addEventListener('click', () => {
    window.Router?.go?.('home');
  });

  // Search toggle
  const searchBar   = container.querySelector('#folder-search-bar');
  const searchInput = container.querySelector('#folder-search-input');
  container.querySelector('#folder-search-toggle')?.addEventListener('click', () => {
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) searchInput.focus();
    else { _filterText = ''; renderLinks(container, folder); }
  });
  container.querySelector('#folder-search-close')?.addEventListener('click', () => {
    searchBar.classList.add('hidden');
    _filterText = ''; searchInput.value = '';
    renderLinks(container, folder);
  });
  searchInput?.addEventListener('input', () => {
    _filterText = searchInput.value.toLowerCase();
    renderLinks(container, folder);
  });

  // Sort dropdown
  container.querySelector('#links-sort-btn')?.addEventListener('click', (e) => {
    const sortOptions = [
      { label: 'Latest first',   icon: 'fa-solid fa-calendar-days',   value: 'date_desc'  },
      { label: 'Oldest first',   icon: 'fa-solid fa-calendar',        value: 'date_asc'   },
      { label: 'A → Z',          icon: 'fa-solid fa-arrow-down-a-z',  value: 'alpha_asc'  },
      { label: 'Z → A',          icon: 'fa-solid fa-arrow-up-z-a',    value: 'alpha_desc' },
      { label: 'Most liked',     icon: 'fa-solid fa-heart',           value: 'liked'      },
      { label: 'Favourites',     icon: 'fa-solid fa-star',            value: 'starred'    },
      { label: 'Most opened',    icon: 'fa-solid fa-fire',            value: 'opens'      },
      { label: 'High points',    icon: 'fa-solid fa-bolt',            value: 'points'     },
      { label: 'Pinned first',   icon: 'fa-solid fa-thumbtack',       value: 'pinned'     },
    ];
    showDropdown(e.currentTarget, sortOptions.map(opt => ({
      label:  opt.label,
      icon:   opt.icon,
      action: () => {
        _sortMode = opt.value;
        Storage.set('linkSort', opt.value);
        container.querySelector('#sort-label').textContent = opt.label;
        renderLinks(container, folder);
      },
    })));
  });

  // View mode toggle
  container.querySelectorAll('.links-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _viewMode = btn.dataset.view;
      Storage.set('linkView', _viewMode);
      container.querySelectorAll('.links-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const lc = container.querySelector('#links-container');
      lc.className = `links-container ${_viewMode === 'grid' ? 'links-grid' : 'links-list'}`;
      renderLinks(container, folder);
    });
  });

  // Multi-select
  container.querySelector('#multi-select-btn')?.addEventListener('click', () => toggleMultiSelect(container, folder));
  container.querySelector('#multi-cancel-btn')?.addEventListener('click', () => { _multiSelect = false; _selectedIds.clear(); toggleMultiSelect(container, folder); });
  container.querySelector('#multi-select-all-btn')?.addEventListener('click', () => {
    getFilteredSorted().forEach(l => _selectedIds.add(l.id));
    renderLinks(container, folder);
    updateMultiCount(container);
  });
  container.querySelector('#multi-delete-btn')?.addEventListener('click', async () => {
    if (!_selectedIds.size) return;
    const ok = await confirm('Delete Links', `Delete ${_selectedIds.size} link${_selectedIds.size !== 1 ? 's' : ''}?`, true);
    if (!ok) return;
    await deleteLinksBulk(folder.id, [..._selectedIds]);
    _selectedIds.clear();
    _multiSelect = false;
    toggleMultiSelect(container, folder);
  });

  // Import into this folder
  container.querySelector('#folder-import-btn')?.addEventListener('click', async () => {
    const { showImportModal } = await import('./import.js');
    const { getFolders, saveLinksToFolder, createFolder } = await import('./folders.js');
    const folders = await getFolders();
    showImportModal(folders, async (links, fTarget, isNew) => {
      let fid = folder.id; // default to current folder
      if (isNew) {
        const nf = await createFolder(fTarget);
        fid = nf?.id || folder.id;
      } else if (fTarget !== folder.id) {
        fid = fTarget;
      }
      const added = await saveLinksToFolder(fid, links);
      toast(`${added} link${added !== 1 ? 's' : ''} saved!`, 'success');
    });
  });
}

// ── Filter + sort ─────────────────────────────────────────
function getFilteredSorted() {
  let list = [..._links];

  // Filter
  if (_filterText) {
    list = list.filter(l =>
      (l.title || '').toLowerCase().includes(_filterText) ||
      (l.url   || '').toLowerCase().includes(_filterText) ||
      (l.domain|| '').toLowerCase().includes(_filterText)
    );
  }

  // Sort
  const sorts = {
    date_desc:  (a, b) => (b.addedAt  || 0) - (a.addedAt  || 0),
    date_asc:   (a, b) => (a.addedAt  || 0) - (b.addedAt  || 0),
    alpha_asc:  (a, b) => (a.title||'').localeCompare(b.title||''),
    alpha_desc: (a, b) => (b.title||'').localeCompare(a.title||''),
    liked:      (a, b) => (b.liked ? 1 : 0) - (a.liked ? 1 : 0),
    starred:    (a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0),
    opens:      (a, b) => (b.openCount || 0) - (a.openCount || 0),
    points:     (a, b) => (b.points   || 0) - (a.points   || 0),
    pinned:     (a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0),
  };
  list.sort(sorts[_sortMode] || sorts.date_desc);

  // Pinned always float to top
  const pinned   = list.filter(l => l.pinned);
  const unpinned = list.filter(l => !l.pinned);
  return [...pinned, ...unpinned];
}

// ── Render links ──────────────────────────────────────────
function renderLinks(container, folder) {
  const lc   = container.querySelector('#links-container');
  const list = getFilteredSorted();
  const countEl = container.querySelector('#folder-link-count');
  if (countEl) countEl.textContent = `${list.length} link${list.length !== 1 ? 's' : ''}`;

  if (!list.length) {
    lc.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fa-solid fa-link-slash"></i></div>
        <h3>${_filterText ? 'No results' : 'No links yet'}</h3>
        <p>${_filterText ? 'Try a different search term' : 'Import links or add manually to this folder'}</p>
      </div>`;
    return;
  }

  lc.innerHTML = '';
  list.forEach((link, idx) => {
    const el = _viewMode === 'grid'
      ? createGridCard(link, folder, idx)
      : createListCard(link, folder, idx);
    lc.appendChild(el);
  });
}

// ── List Card ─────────────────────────────────────────────
function createListCard(link, folder, idx) {
  const el = document.createElement('div');
  el.className = `link-list-card${link.pinned ? ' is-pinned' : ''}${link.blocked ? ' is-blocked' : ''}${_selectedIds.has(link.id) ? ' is-selected' : ''}`;
  el.dataset.lid = link.id;
  el.style.animationDelay = `${idx * 0.03}s`;

  el.innerHTML = `
    ${_multiSelect ? `<div class="link-checkbox-wrap"><input type="checkbox" class="link-checkbox" ${_selectedIds.has(link.id) ? 'checked' : ''}></div>` : ''}
    <div class="link-thumb-wrap">
      ${link.starred ? '<div class="link-star-badge"><i class="fa-solid fa-star"></i></div>' : ''}
      <img class="link-thumb" src="${link.favicon || ''}" 
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23e2e8f0%22/><text x=%2216%22 y=%2222%22 font-size=%2216%22 text-anchor=%22middle%22>🔗</text></svg>'"
           width="40" height="40" loading="lazy">
    </div>
    <div class="link-info">
      <div class="link-title">${escapeHtml(link.title || link.domain || 'Untitled')}</div>
      <div class="link-url">${escapeHtml(link.url)}</div>
      <div class="link-meta">
        <span class="link-domain"><i class="fa-solid fa-globe"></i> ${escapeHtml(link.domain || '')}</span>
        <span class="link-time">${timeAgo(link.addedAt)}</span>
        ${link.openCount ? `<span class="link-opens"><i class="fa-solid fa-eye"></i> ${link.openCount}</span>` : ''}
        ${link.points !== undefined ? `<span class="link-points"><i class="fa-solid fa-bolt"></i> ${link.points}</span>` : ''}
      </div>
    </div>
    <div class="link-actions">
      ${link.pinned   ? '<i class="fa-solid fa-thumbtack link-action-badge pin"></i>'  : ''}
      ${link.liked    ? '<i class="fa-solid fa-heart    link-action-badge like"></i>'   : ''}
      ${link.blocked  ? '<i class="fa-solid fa-ban      link-action-badge block"></i>'  : ''}
      <button class="link-menu-btn" title="Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>
  `;

  // Click → open embedded preview
  el.addEventListener('click', (e) => {
    if (e.target.closest('.link-menu-btn') || e.target.closest('.link-checkbox-wrap')) return;
    if (_multiSelect) { toggleLinkSelect(link.id, el); return; }
    openEmbeddedPreview(link, folder);
  });

  // Three-dot menu
  el.querySelector('.link-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showLinkMenu(e.currentTarget, link, folder, el);
  });

  // Checkbox
  el.querySelector('.link-checkbox')?.addEventListener('change', () => {
    toggleLinkSelect(link.id, el);
  });

  return el;
}

// ── Grid Card ─────────────────────────────────────────────
function createGridCard(link, folder, idx) {
  const el = document.createElement('div');
  el.className = `link-grid-card${link.pinned ? ' is-pinned' : ''}${link.blocked ? ' is-blocked' : ''}${_selectedIds.has(link.id) ? ' is-selected' : ''}`;
  el.dataset.lid = link.id;
  el.style.animationDelay = `${idx * 0.03}s`;

  el.innerHTML = `
    ${_multiSelect ? `<input type="checkbox" class="link-grid-checkbox" ${_selectedIds.has(link.id) ? 'checked' : ''}>` : ''}
    <div class="link-grid-top">
      <img class="link-grid-favicon" src="${link.favicon || ''}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23e2e8f0%22/><text x=%2216%22 y=%2222%22 font-size=%2216%22 text-anchor=%22middle%22>🔗</text></svg>'"
           width="32" height="32" loading="lazy">
      <button class="link-grid-menu" title="Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>
    <div class="link-grid-title">${escapeHtml(link.title || link.domain || 'Untitled')}</div>
    <div class="link-grid-domain">${escapeHtml(link.domain || '')}</div>
    <div class="link-grid-badges">
      ${link.starred ? '<span class="grid-badge star"><i class="fa-solid fa-star"></i></span>' : ''}
      ${link.liked   ? '<span class="grid-badge like"><i class="fa-solid fa-heart"></i></span>' : ''}
      ${link.pinned  ? '<span class="grid-badge pin"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
      ${link.blocked ? '<span class="grid-badge block"><i class="fa-solid fa-ban"></i></span>' : ''}
    </div>
  `;

  el.addEventListener('click', (e) => {
    if (e.target.closest('.link-grid-menu') || e.target.closest('.link-grid-checkbox')) return;
    if (_multiSelect) { toggleLinkSelect(link.id, el); return; }
    openEmbeddedPreview(link, folder);
  });
  el.querySelector('.link-grid-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showLinkMenu(e.currentTarget, link, folder, el);
  });
  el.querySelector('.link-grid-checkbox')?.addEventListener('change', () => toggleLinkSelect(link.id, el));

  return el;
}

// ── Link three-dot menu ───────────────────────────────────
function showLinkMenu(anchor, link, folder, el) {
  showDropdown(anchor, [
    {
      label: link.pinned ? 'Unpin' : 'Pin',
      icon:  'fa-solid fa-thumbtack',
      action: () => togglePin(folder.id, link),
    },
    {
      label: link.starred ? 'Remove Favourite' : 'Add to Favourites',
      icon:  'fa-solid fa-star',
      action: () => toggleStar(folder.id, link),
    },
    {
      label: link.liked ? 'Unlike' : 'Like',
      icon:  'fa-solid fa-heart',
      action: () => toggleLike(folder.id, link),
    },
    {
      label: link.disliked ? 'Remove Dislike' : 'Dislike',
      icon:  'fa-regular fa-thumbs-down',
      action: () => toggleDislike(folder.id, link),
    },
    {
      label: link.blocked ? 'Unblock' : 'Block from Random',
      icon:  'fa-solid fa-ban',
      action: () => toggleBlock(folder.id, link),
    },
    'divider',
    {
      label: 'Copy URL',
      icon:  'fa-solid fa-copy',
      action: async () => { await copyToClipboard(link.url); toast('Copied!', 'success'); },
    },
    {
      label: 'Open in new tab',
      icon:  'fa-solid fa-arrow-up-right-from-square',
      action: () => window.open(link.url, '_blank', 'noopener'),
    },
    'divider',
    {
      label:  'Delete',
      icon:   'fa-solid fa-trash',
      danger: true,
      action: async () => {
        const ok = await confirm('Delete Link', `Delete "${link.title || link.url}"?`, true);
        if (ok) deleteLink(folder.id, link);
      },
    },
  ], { align: 'right' });
}

// ── Multi-select helpers ──────────────────────────────────
function toggleMultiSelect(container, folder) {
  const bar = container.querySelector('#multi-select-bar');
  const ctrl= container.querySelector('#links-controls');
  if (_multiSelect) {
    bar.classList.remove('hidden');
    ctrl.classList.add('has-multi-select');
  } else {
    bar.classList.add('hidden');
    ctrl.classList.remove('has-multi-select');
  }
  renderLinks(container, folder);
}

function toggleLinkSelect(lid, el) {
  if (_selectedIds.has(lid)) _selectedIds.delete(lid);
  else                        _selectedIds.add(lid);
  el.classList.toggle('is-selected', _selectedIds.has(lid));
  const cb = el.querySelector('.link-checkbox, .link-grid-checkbox');
  if (cb) cb.checked = _selectedIds.has(lid);
  const container = document.getElementById('folder-view-content');
  updateMultiCount(container);
}

function updateMultiCount(container) {
  const el = container?.querySelector('#multi-count');
  if (el) el.textContent = `${_selectedIds.size} selected`;
}

// ══════════════════════════════════════════════════════════
// EMBEDDED PREVIEW
// ══════════════════════════════════════════════════════════

export function openEmbeddedPreview(link, folder) {
  // Record open
  addOpenCount(folder.id, link.id);
  // Add to history
  addToHistory(link);

  const existing = document.getElementById('preview-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'preview-overlay';
  overlay.className = 'preview-overlay';

  overlay.innerHTML = `
    <div class="preview-panel" id="preview-panel">
      <!-- Header -->
      <div class="preview-header">
        <img class="preview-favicon" src="${link.favicon || ''}"
             onerror="this.style.display='none'" width="18" height="18">
        <div class="preview-header-info">
          <div class="preview-title">${escapeHtml(link.title || link.domain || 'Link')}</div>
          <div class="preview-url">${escapeHtml(link.url)}</div>
        </div>
        <button class="preview-close-btn" id="preview-close" title="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <!-- Iframe -->
      <div class="preview-frame-wrap" id="preview-frame-wrap">
        <div class="preview-loading" id="preview-loading">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:28px;color:var(--primary)"></i>
          <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:8px">Loading preview…</div>
        </div>
        <iframe id="preview-iframe" class="preview-iframe"
          src="${link.url}"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          loading="lazy"
          title="Preview: ${escapeHtml(link.title || link.url)}">
        </iframe>
      </div>

      <!-- Action bar -->
      <div class="preview-actions">
        <button class="preview-action-btn ${link.starred ? 'active-star' : ''}" id="prev-star" title="Favourite">
          <i class="fa-${link.starred ? 'solid' : 'regular'} fa-star"></i>
          <span>Favourite</span>
        </button>
        <button class="preview-action-btn ${link.liked ? 'active-like' : ''}" id="prev-like" title="Like">
          <i class="fa-${link.liked ? 'solid' : 'regular'} fa-heart"></i>
          <span>Like</span>
        </button>
        <button class="preview-action-btn ${link.disliked ? 'active-dislike' : ''}" id="prev-dislike" title="Dislike">
          <i class="fa-${link.disliked ? 'solid' : 'regular'} fa-thumbs-down"></i>
          <span>Dislike</span>
        </button>
        <button class="preview-action-btn ${link.blocked ? 'active-block' : ''}" id="prev-block" title="Block">
          <i class="fa-solid fa-ban"></i>
          <span>Block</span>
        </button>
        <button class="preview-action-btn" id="prev-copy" title="Copy URL">
          <i class="fa-solid fa-copy"></i>
          <span>Copy</span>
        </button>
        <button class="preview-action-btn" id="prev-open" title="Open in new tab">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
          <span>Open</span>
        </button>
        <button class="preview-action-btn" id="prev-fullscreen" title="Fullscreen">
          <i class="fa-solid fa-expand"></i>
          <span>Full</span>
        </button>
        <button class="preview-action-btn danger" id="prev-delete" title="Delete">
          <i class="fa-solid fa-trash"></i>
          <span>Delete</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  // iframe load
  const iframe  = overlay.querySelector('#preview-iframe');
  const loading = overlay.querySelector('#preview-loading');
  iframe.addEventListener('load', () => loading.classList.add('hidden'), { once: true });
  iframe.addEventListener('error', () => {
    loading.innerHTML = `
      <i class="fa-solid fa-circle-exclamation" style="font-size:28px;color:var(--danger)"></i>
      <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:8px">Preview not available</div>
      <a href="${link.url}" target="_blank" class="btn btn-primary btn-sm" style="margin-top:12px">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> Open in browser
      </a>`;
  }, { once: true });

  // Close
  const close = () => {
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
  };
  overlay.querySelector('#preview-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Fullscreen
  let isFullscreen = false;
  overlay.querySelector('#prev-fullscreen').onclick = () => {
    isFullscreen = !isFullscreen;
    overlay.querySelector('#preview-panel').classList.toggle('preview-fullscreen', isFullscreen);
    overlay.querySelector('#prev-fullscreen').innerHTML = isFullscreen
      ? '<i class="fa-solid fa-compress"></i><span>Exit</span>'
      : '<i class="fa-solid fa-expand"></i><span>Full</span>';
  };

  // Actions
  overlay.querySelector('#prev-star').onclick    = async () => { await toggleStar(folder.id, link); link.starred = !link.starred; updatePreviewBtn(overlay, '#prev-star', link.starred, 'star', 'Favourite'); };
  overlay.querySelector('#prev-like').onclick    = async () => { await toggleLike(folder.id, link); link.liked = !link.liked; updatePreviewBtn(overlay, '#prev-like', link.liked, 'like', 'Like'); };
  overlay.querySelector('#prev-dislike').onclick = async () => { await toggleDislike(folder.id, link); link.disliked = !link.disliked; updatePreviewBtn(overlay, '#prev-dislike', link.disliked, 'dislike', 'Dislike'); };
  overlay.querySelector('#prev-block').onclick   = async () => { await toggleBlock(folder.id, link); link.blocked = !link.blocked; toast(link.blocked ? 'Blocked' : 'Unblocked', 'info'); close(); };
  overlay.querySelector('#prev-copy').onclick    = async () => { await copyToClipboard(link.url); toast('Copied!', 'success'); };
  overlay.querySelector('#prev-open').onclick    = () => window.open(link.url, '_blank', 'noopener');
  overlay.querySelector('#prev-delete').onclick  = async () => {
    const ok = await confirm('Delete Link', `Delete "${link.title || link.url}"?`, true);
    if (ok) { close(); deleteLink(folder.id, link); }
  };
}

function updatePreviewBtn(overlay, selector, active, type, label) {
  const btn = overlay.querySelector(selector);
  if (!btn) return;
  const iconMap = { star: 'fa-star', like: 'fa-heart', dislike: 'fa-thumbs-down' };
  const icon = iconMap[type] || 'fa-circle';
  btn.className = `preview-action-btn${active ? ` active-${type}` : ''}`;
  btn.innerHTML = `<i class="fa-${active ? 'solid' : 'regular'} ${icon}"></i><span>${label}</span>`;
}

// ══════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════

export async function addToHistory(link) {
  const id      = genId('h_');
  const histRef = ref(db, `users/${uid()}/history/${id}`);
  await set(histRef, {
    id,
    url:       link.url,
    title:     link.title || link.domain || link.url,
    favicon:   link.favicon || '',
    domain:    link.domain || '',
    openedAt:  Date.now(),
    folderId:  link.folderId || '',
    folderName:link.folderName || '',
  });

  // Keep only last 500
  const allRef  = ref(db, `users/${uid()}/history`);
  const snap    = await get(allRef);
  if (snap.exists()) {
    const all   = Object.entries(snap.val()).sort((a, b) => b[1].openedAt - a[1].openedAt);
    if (all.length > 500) {
      const toDelete = all.slice(500);
      for (const [key] of toDelete) {
        await remove(ref(db, `users/${uid()}/history/${key}`));
      }
    }
  }
}

// ══════════════════════════════════════════════════════════
// RECYCLE BIN UI
// ══════════════════════════════════════════════════════════

export function showRecycleBin() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:520px;max-height:88vh">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-trash-can" style="color:var(--danger);margin-right:8px"></i>Recycle Bin</span>
        <button class="btn btn-ghost btn-icon rb-close-btn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="padding:0">
        <div id="rb-list" style="max-height:60vh;overflow-y:auto">
          <div style="display:flex;align-items:center;justify-content:center;padding:40px;color:var(--text-muted)">
            <i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i> Loading…
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger btn-sm" id="rb-empty-btn">
          <i class="fa-solid fa-trash"></i> Empty Bin
        </button>
        <button class="btn btn-secondary btn-sm rb-close-btn">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelectorAll('.rb-close-btn').forEach(b => b.onclick = close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  // Load items
  onValue(rbAllRef(), (snap) => {
    const list = document.getElementById('rb-list');
    if (!list) return;
    if (!snap.exists()) {
      list.innerHTML = `<div class="empty-state" style="padding:40px 20px"><div class="empty-state-icon"><i class="fa-solid fa-trash-can"></i></div><h3>Recycle bin is empty</h3><p>Deleted items appear here for 30 days</p></div>`;
      return;
    }
    const items = Object.values(snap.val()).sort((a, b) => b.deletedAt - a.deletedAt);
    list.innerHTML = items.map(item => `
      <div class="rb-item" data-rbid="${item.id}">
        <div class="rb-item-icon">
          <i class="fa-solid ${item.type === 'folder' ? 'fa-folder' : 'fa-link'}" style="color:var(--${item.type === 'folder' ? 'warning' : 'primary'})"></i>
        </div>
        <div class="rb-item-info">
          <div class="rb-item-name">${escapeHtml(item.data?.name || item.data?.title || item.data?.url || 'Unknown')}</div>
          <div class="rb-item-meta">Deleted ${timeAgo(item.deletedAt)} · Expires in ${Math.ceil((item.expireAt - Date.now()) / 86400000)}d</div>
        </div>
        <div class="rb-item-actions">
          <button class="btn btn-ghost btn-sm rb-restore-btn" data-rbid="${item.id}" title="Restore">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
          <button class="btn btn-ghost btn-sm rb-perm-del-btn" data-rbid="${item.id}" title="Delete permanently" style="color:var(--danger)">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.rb-restore-btn').forEach(btn => {
      btn.onclick = async () => {
        const rbid = btn.dataset.rbid;
        const item = snap.val()[rbid];
        if (item?.type === 'folder') {
          const { restoreFolder } = await import('./folders.js');
          await restoreFolder(rbid);
        } else {
          // Restore link
          const { originalFid, originalLid, data } = item;
          await set(ref(db, `users/${uid()}/folders/${originalFid}/links/${originalLid}`), data);
          await remove(rbRef(rbid));
          toast('Link restored', 'success');
        }
      };
    });

    list.querySelectorAll('.rb-perm-del-btn').forEach(btn => {
      btn.onclick = async () => {
        const ok = await confirm('Delete Permanently', 'This cannot be undone.', true);
        if (ok) { await remove(rbRef(btn.dataset.rbid)); toast('Permanently deleted', 'info'); }
      };
    });
  });

  // Empty bin
  document.getElementById('rb-empty-btn').onclick = async () => {
    const ok = await confirm('Empty Recycle Bin', 'Permanently delete all items? This cannot be undone.', true);
    if (ok) {
      const snap = await get(rbAllRef());
      if (snap.exists()) {
        for (const key of Object.keys(snap.val())) {
          await remove(rbRef(key));
        }
      }
      toast('Recycle bin emptied', 'info');
    }
  };
}

// ── Helpers ───────────────────────────────────────────────
function hexRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
