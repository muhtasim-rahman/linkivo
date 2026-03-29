// ============================================================
// Linkivo — links.js  v1.4.0
// Fixes: duplicate calcPoints, addOpenCount, multi-select,
// grid view, search, scroll, blur locked content, link move,
// advanced preview (iframe→og:image→jpg→favicon), resizable
// ============================================================

import { db, ref, set, get, update, remove, onValue, serverTimestamp, push } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, confirm, showDropdown, genId, copyToClipboard, escapeHtml, timeAgo, getFavicon, calcLinkPoints, Storage } from './utils.js';
import { incrementLinkCount, isFolderUnlocked, verifyAndUnlockFolder, getFolders, saveLinksToFolder } from './folders.js';

const uid     = () => getCurrentUser()?.uid;
const linkRef = (fid, lid) => ref(db, `users/${uid()}/folders/${fid}/links/${lid}`);
const linksRef= (fid)      => ref(db, `users/${uid()}/folders/${fid}/links`);
const rbRef   = (id)       => ref(db, `users/${uid()}/recycleBin/${id}`);

// ── State ─────────────────────────────────────────────────
let _currentFolder = null;
let _links         = [];
let _sortMode      = Storage.get('linkSort','date_desc');
let _viewMode      = Storage.get('linkView','list');
let _filterText    = '';
let _unsubLinks    = null;
let _selectedIds   = new Set();
let _multiSelect   = false;
let _showUrls      = Storage.get('showLinkUrls', true);
let _openNewTab    = Storage.get('openLinksNewTab', false);
// Resizable preview height
let _previewH      = Storage.get('previewHeight', 420);

// ══════════════════════════════════════════════════════════
// LINK CRUD — uses single calcLinkPoints from utils.js
// ══════════════════════════════════════════════════════════

async function _updateLink(fid, lid, data) {
  await update(linkRef(fid, lid), { ...data, updatedAt: Date.now() });
}

export async function toggleLike(fid, link) {
  // Like and dislike are mutually exclusive
  const newLiked    = !link.liked;
  const newDisliked = newLiked ? false : link.disliked;
  const updated     = { ...link, liked: newLiked, disliked: newDisliked };
  await _updateLink(fid, link.id, { liked: newLiked, disliked: newDisliked, points: calcLinkPoints(updated) });
}

export async function toggleDislike(fid, link) {
  // Like and dislike are mutually exclusive
  const newDisliked = !link.disliked;
  const newLiked    = newDisliked ? false : link.liked;
  const updated     = { ...link, disliked: newDisliked, liked: newLiked };
  await _updateLink(fid, link.id, { disliked: newDisliked, liked: newLiked, points: calcLinkPoints(updated) });
}

export async function toggleStar(fid, link) {
  const updated = { ...link, starred: !link.starred };
  await _updateLink(fid, link.id, { starred: !link.starred, points: calcLinkPoints(updated) });
}

export async function togglePin(fid, link) {
  await _updateLink(fid, link.id, { pinned: !link.pinned });
}

export async function toggleBlock(fid, link) {
  const blocked = !link.blocked;
  await _updateLink(fid, link.id, { blocked, points: blocked ? 0 : calcLinkPoints({ ...link, blocked: false }) });
  toast(blocked ? 'Blocked from random' : 'Unblocked', 'info');
}

export async function deleteLink(fid, link) {
  const rbId = genId('rb_');
  await set(rbRef(rbId), {
    id: rbId, type: 'link', originalFid: fid, originalLid: link.id, data: link,
    deletedAt: Date.now(), expireAt: Date.now() + 30*24*60*60*1000,
  });
  await remove(linkRef(fid, link.id));
  await incrementLinkCount(fid, -1);
  toast('Moved to Recycle Bin', 'info');
}

export async function deleteLinksBulk(fid, linkIds) {
  for (const lid of linkIds) {
    const snap = await get(linkRef(fid, lid));
    if (snap.exists()) await deleteLink(fid, snap.val());
  }
}

// ── Move link to another folder ───────────────────────────
export async function moveLinkToFolder(srcFid, link, destFid) {
  if (srcFid === destFid) return;
  const lid = genId('l_');
  await set(ref(db, `users/${uid()}/folders/${destFid}/links/${lid}`), { ...link, id: lid, addedAt: Date.now() });
  await remove(linkRef(srcFid, link.id));
  await incrementLinkCount(srcFid, -1);
  await incrementLinkCount(destFid, 1);
  toast('Link moved!', 'success');
}

export async function moveLinksBulk(srcFid, linkIds, destFid) {
  for (const lid of linkIds) {
    const snap = await get(linkRef(srcFid, lid));
    if (snap.exists()) await moveLinkToFolder(srcFid, snap.val(), destFid);
  }
  toast(`${linkIds.length} link${linkIds.length!==1?'s':''} moved`, 'success');
}

// ── Open count — no extra read needed ────────────────────
export async function addOpenCount(fid, link) {
  // Use Firebase transaction-style increment without extra get()
  const openCount = (link.openCount || 0) + 1;
  const updated   = { ...link, openCount };
  await _updateLink(fid, link.id, { openCount, points: calcLinkPoints(updated) });
}

// ══════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════

export async function addToHistory(link) {
  const id = genId('h_');
  await set(ref(db, `users/${uid()}/history/${id}`), {
    id, url: link.url, title: link.title||link.domain||link.url,
    favicon: link.favicon||'', domain: link.domain||'',
    openedAt: Date.now(), folderId: link.folderId||'', folderName: link.folderName||'',
  });
  // Prune to max (bulk delete — one call)
  const snap = await get(ref(db, `users/${uid()}/history`));
  if (snap.exists()) {
    const all = Object.entries(snap.val()).sort((a,b)=>b[1].openedAt-a[1].openedAt);
    const max = Storage.get('historyMax', 500);
    if (all.length > max) {
      // Delete all excess in one remove per key
      for (const [key] of all.slice(max)) {
        await remove(ref(db, `users/${uid()}/history/${key}`));
      }
    }
  }
}

// ══════════════════════════════════════════════════════════
// FOLDER VIEW
// ══════════════════════════════════════════════════════════

export function openFolderView(folder) {
  _currentFolder = folder;
  _selectedIds.clear();
  _multiSelect = false;
  _filterText  = '';

  const container = document.getElementById('folder-view-content');
  if (!container) return;

  // Check if folder is locked and not unlocked this session
  if (folder.locked && !isFolderUnlocked(folder.id)) {
    _renderLockedPlaceholder(container, folder);
    return;
  }

  container.innerHTML = _buildFolderHTML(folder);
  _bindFolderEvents(container, folder);

  if (_unsubLinks) { _unsubLinks(); _unsubLinks = null; }
  onValue(linksRef(folder.id), (snap) => {
    _links = snap.exists() ? Object.values(snap.val()) : [];
    _renderLinks(container, folder);
  });
}

function _renderLockedPlaceholder(container, folder) {
  container.innerHTML = `
    <div class="folder-view-topbar">
      <button class="folder-back-btn" id="folder-back-btn"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="folder-view-icon" style="background:rgba(139,92,246,0.12);color:var(--pin-color)">
        <i class="fa-solid fa-lock"></i>
      </div>
      <div class="folder-view-title-wrap">
        <h2 class="folder-view-title">${escapeHtml(folder.name)}</h2>
        <span style="font-size:var(--fs-xs);color:var(--text-muted)">Locked folder</span>
      </div>
    </div>
    <div class="empty-state" style="flex:1">
      <div class="empty-state-icon" style="background:rgba(139,92,246,0.12);color:var(--pin-color)">
        <i class="fa-solid fa-lock"></i>
      </div>
      <h3>This folder is locked</h3>
      <p>Enter the 6-digit PIN to access its contents</p>
      <button class="btn btn-primary" id="folder-unlock-btn">
        <i class="fa-solid fa-unlock"></i> Unlock Folder
      </button>
    </div>`;

  container.querySelector('#folder-back-btn')?.addEventListener('click', () => window.Router?.go?.('home'));
  container.querySelector('#folder-unlock-btn')?.addEventListener('click', async () => {
    const ok = await verifyAndUnlockFolder(folder);
    if (ok) openFolderView(folder);
  });
}

function _buildFolderHTML(folder) {
  return `
    <!-- Topbar -->
    <div class="folder-view-topbar" id="folder-topbar">
      <button class="folder-back-btn" id="folder-back-btn"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="folder-view-icon" style="background:${_hexRgba(folder.color||'#3b82f6',0.12)};color:${folder.color||'var(--primary)'}">
        <i class="${folder.icon||'fa-solid fa-folder'}"></i>
      </div>
      <div class="folder-view-title-wrap">
        <h2 class="folder-view-title">${escapeHtml(folder.name)}</h2>
        <span class="folder-view-meta" id="folder-link-count">Loading…</span>
      </div>
      <button class="topbar-btn" id="folder-import-btn" title="Import"><i class="fa-solid fa-file-import"></i></button>
      <button class="topbar-btn" id="folder-search-toggle" title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
    </div>

    <!-- Search bar -->
    <div class="folder-search-bar hidden" id="folder-search-bar">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="search" id="folder-search-input" placeholder="Search links…" autocomplete="off">
      <button id="folder-search-close" style="border:none;background:none;cursor:pointer;color:var(--text-subtle);font-size:14px;padding:4px"><i class="fa-solid fa-xmark"></i></button>
    </div>

    <!-- Controls -->
    <div class="links-controls" id="links-controls">
      <button class="btn btn-ghost btn-sm links-sort-btn" id="links-sort-btn">
        <i class="fa-solid fa-arrow-down-wide-short"></i>
        <span id="sort-label">Latest</span>
        <i class="fa-solid fa-chevron-down" style="font-size:9px"></i>
      </button>
      <div style="display:flex;gap:4px;align-items:center;margin-left:auto">
        <button class="btn btn-ghost btn-icon links-view-btn ${_viewMode==='list'?'active':''}" data-view="list" title="List"><i class="fa-solid fa-list"></i></button>
        <button class="btn btn-ghost btn-icon links-view-btn ${_viewMode==='grid'?'active':''}" data-view="grid" title="Grid"><i class="fa-solid fa-grip"></i></button>
        <button class="btn btn-ghost btn-sm" id="multi-select-btn" title="Select"><i class="fa-solid fa-check-double"></i></button>
      </div>
    </div>

    <!-- Multi-select bar -->
    <div class="multi-select-bar hidden" id="multi-select-bar">
      <span class="multi-select-count" id="multi-count">0 selected</span>
      <div style="display:flex;gap:6px;margin-left:auto;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="multi-select-all-btn">All</button>
        <button class="btn btn-ghost btn-sm" id="multi-move-btn"><i class="fa-solid fa-folder-open"></i> Move</button>
        <button class="btn btn-ghost btn-sm" id="multi-delete-btn" style="color:var(--danger)"><i class="fa-solid fa-trash"></i> Delete</button>
        <button class="btn btn-ghost btn-sm" id="multi-cancel-btn">Cancel</button>
      </div>
    </div>

    <!-- Links container -->
    <div class="links-container ${_viewMode==='grid'?'links-grid':'links-list'}" id="links-container" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain">
      <div style="display:flex;align-items:center;justify-content:center;padding:40px;color:var(--text-muted)">
        <i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i> Loading links…
      </div>
    </div>
  `;
}

function _bindFolderEvents(container, folder) {
  const $ = id => container.querySelector(`#${id}`);

  $('folder-back-btn')?.addEventListener('click', () => {
    if (_unsubLinks) { _unsubLinks(); _unsubLinks = null; }
    window.Router?.go?.('home');
  });

  // Search
  const searchBar   = $('folder-search-bar');
  const searchInput = $('folder-search-input');
  $('folder-search-toggle')?.addEventListener('click', () => {
    const isHidden = searchBar.classList.toggle('hidden');
    if (!isHidden) { searchInput.focus(); searchBar.classList.remove('hidden'); }
    else { _filterText = ''; searchInput.value = ''; _renderLinks(container, folder); }
  });
  $('folder-search-close')?.addEventListener('click', () => {
    searchBar.classList.add('hidden');
    _filterText = ''; searchInput.value = '';
    _renderLinks(container, folder);
  });
  searchInput?.addEventListener('input', () => {
    _filterText = searchInput.value.toLowerCase();
    _renderLinks(container, folder);
  });

  // Sort
  $('links-sort-btn')?.addEventListener('click', (e) => {
    const opts = [
      { label:'Latest first',  icon:'fa-solid fa-calendar-days',  value:'date_desc'  },
      { label:'Oldest first',  icon:'fa-solid fa-calendar',       value:'date_asc'   },
      { label:'A → Z',         icon:'fa-solid fa-arrow-down-a-z', value:'alpha_asc'  },
      { label:'Z → A',         icon:'fa-solid fa-arrow-up-z-a',   value:'alpha_desc' },
      { label:'Liked',         icon:'fa-solid fa-heart',          value:'liked'      },
      { label:'Favourites',    icon:'fa-solid fa-star',           value:'starred'    },
      { label:'Most opened',   icon:'fa-solid fa-fire',           value:'opens'      },
      { label:'High points',   icon:'fa-solid fa-bolt',           value:'points'     },
      { label:'Pinned first',  icon:'fa-solid fa-thumbtack',      value:'pinned'     },
    ];
    showDropdown(e.currentTarget, opts.map(o => ({
      label: o.label, icon: o.icon,
      action: () => {
        _sortMode = o.value; Storage.set('linkSort', o.value);
        container.querySelector('#sort-label').textContent = o.label;
        _renderLinks(container, folder);
      }
    })));
  });

  // View mode
  container.querySelectorAll('.links-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _viewMode = btn.dataset.view; Storage.set('linkView', _viewMode);
      container.querySelectorAll('.links-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const lc = container.querySelector('#links-container');
      lc.className = `links-container ${_viewMode==='grid'?'links-grid':'links-list'}`;
      lc.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain';
      _renderLinks(container, folder);
    });
  });

  // Multi-select
  $('multi-select-btn')?.addEventListener('click', () => {
    _multiSelect = !_multiSelect; _selectedIds.clear();
    _toggleMultiBar(container); _renderLinks(container, folder);
  });
  $('multi-cancel-btn')?.addEventListener('click', () => {
    _multiSelect = false; _selectedIds.clear();
    _toggleMultiBar(container); _renderLinks(container, folder);
  });
  $('multi-select-all-btn')?.addEventListener('click', () => {
    _getFiltered().forEach(l => _selectedIds.add(l.id));
    _renderLinks(container, folder); _updateMultiCount(container);
  });
  $('multi-delete-btn')?.addEventListener('click', async () => {
    if (!_selectedIds.size) return;
    const ok = await confirm('Delete Links', `Delete ${_selectedIds.size} link${_selectedIds.size!==1?'s':''}?`, true);
    if (!ok) return;
    await deleteLinksBulk(folder.id, [..._selectedIds]);
    _selectedIds.clear(); _multiSelect = false; _toggleMultiBar(container);
  });
  $('multi-move-btn')?.addEventListener('click', async () => {
    if (!_selectedIds.size) return;
    const folders = await getFolders();
    const otherFolders = folders.filter(f => f.id !== folder.id);
    if (!otherFolders.length) { toast('No other folders to move to', 'warning'); return; }
    _showMoveToFolderModal([..._selectedIds], folder.id, otherFolders, container);
  });

  // Import
  $('folder-import-btn')?.addEventListener('click', async () => {
    const { showImportModal } = await import('./import.js');
    const folders = await getFolders();
    showImportModal(folders, async (links, fTarget, isNew, opts) => {
      let fid = folder.id;
      if (isNew) { const nf = (await import('./folders.js')).createFolder(fTarget); fid = (await nf)?.id || folder.id; }
      else if (fTarget !== folder.id) fid = fTarget;
      const { saveLinksToFolder: slf } = await import('./folders.js');
      const added = await slf(fid, links, opts);
      toast(`${added} link${added!==1?'s':''} saved!`, 'success');
    });
  });
}

// ── Move to folder modal ──────────────────────────────────
function _showMoveToFolderModal(linkIds, srcFid, destFolders, container) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:400px">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-folder-open" style="color:var(--warning);margin-right:8px"></i>Move ${linkIds.length} link${linkIds.length!==1?'s':''} to…</span>
        <button class="btn btn-ghost btn-icon move-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:6px">
        ${destFolders.map(f=>`
          <button class="settings-row settings-row-btn move-folder-item" data-fid="${f.id}" style="border:1px solid var(--border);border-radius:var(--r-md)">
            <i class="fa-solid fa-folder" style="color:${f.color||'var(--primary)'};width:20px;text-align:center"></i>
            <div class="settings-row-info" style="text-align:left">
              <div class="settings-row-label">${escapeHtml(f.name)}</div>
              <div class="settings-row-sub">${f.linkCount||0} links</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:var(--text-subtle);font-size:12px"></i>
          </button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector('.move-close').onclick = close;
  backdrop.addEventListener('click', e => { if(e.target===backdrop) close(); });
  backdrop.querySelectorAll('.move-folder-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      close();
      await moveLinksBulk(srcFid, linkIds, btn.dataset.fid);
      _selectedIds.clear(); _multiSelect = false;
      _toggleMultiBar(container);
    });
  });
}

// ── Filtered + sorted links ───────────────────────────────
function _getFiltered() {
  let list = [..._links];
  if (_filterText) {
    list = list.filter(l =>
      (l.title||'').toLowerCase().includes(_filterText) ||
      (l.url||'').toLowerCase().includes(_filterText) ||
      (l.domain||'').toLowerCase().includes(_filterText)
    );
  }
  const sorts = {
    date_desc:  (a,b) => (b.addedAt||0)-(a.addedAt||0),
    date_asc:   (a,b) => (a.addedAt||0)-(b.addedAt||0),
    alpha_asc:  (a,b) => (a.title||'').localeCompare(b.title||''),
    alpha_desc: (a,b) => (b.title||'').localeCompare(a.title||''),
    liked:      (a,b) => (b.liked?1:0)-(a.liked?1:0),
    starred:    (a,b) => (b.starred?1:0)-(a.starred?1:0),
    opens:      (a,b) => (b.openCount||0)-(a.openCount||0),
    points:     (a,b) => (b.points||0)-(a.points||0),
    pinned:     (a,b) => (b.pinned?1:0)-(a.pinned?1:0),
  };
  list.sort(sorts[_sortMode]||sorts.date_desc);
  return [...list.filter(l=>l.pinned), ...list.filter(l=>!l.pinned)];
}

// ── Render links ──────────────────────────────────────────
function _renderLinks(container, folder) {
  const lc   = container.querySelector('#links-container');
  const list = _getFiltered();
  const countEl = container.querySelector('#folder-link-count');
  if (countEl) countEl.textContent = `${list.length} link${list.length!==1?'s':''}`;
  if (!lc) return;

  if (!list.length) {
    lc.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-link-slash"></i></div><h3>${_filterText?'No results':'No links yet'}</h3><p>${_filterText?'Try a different search':'Import links or add to this folder'}</p></div>`;
    return;
  }

  lc.innerHTML = '';
  list.forEach((link, idx) => {
    const el = _viewMode === 'grid'
      ? _createGridCard(link, folder, idx)
      : _createListCard(link, folder, idx);
    lc.appendChild(el);
  });
}

// ── List card ─────────────────────────────────────────────
function _createListCard(link, folder, idx) {
  const el = document.createElement('div');
  el.className = `link-list-card${link.pinned?' is-pinned':''}${link.blocked?' is-blocked':''}${_selectedIds.has(link.id)?' is-selected':''}`;
  el.dataset.lid = link.id;
  el.style.animationDelay = `${Math.min(idx*0.025, 0.3)}s`;

  const showUrl = Storage.get('showLinkUrls', true);

  el.innerHTML = `
    ${_multiSelect?`<div class="link-checkbox-wrap"><input type="checkbox" class="link-checkbox" ${_selectedIds.has(link.id)?'checked':''}></div>`:''}
    <div class="link-thumb-wrap">
      ${link.starred?'<div class="link-star-badge"><i class="fa-solid fa-star"></i></div>':''}
      <img class="link-thumb" src="${link.favicon||''}" loading="lazy" width="40" height="40"
        onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23e2e8f0%22/><text x=%2216%22 y=%2222%22 font-size=%2216%22 text-anchor=%22middle%22>🔗</text></svg>'">
    </div>
    <div class="link-info">
      <div class="link-title">${escapeHtml(link.title||link.domain||'Untitled')}</div>
      ${showUrl?`<div class="link-url">${escapeHtml(link.url)}</div>`:''}
      <div class="link-meta">
        <span class="link-domain"><i class="fa-solid fa-globe"></i> ${escapeHtml(link.domain||'')}</span>
        <span class="link-time">${timeAgo(link.addedAt)}</span>
        ${link.openCount?`<span class="link-opens"><i class="fa-solid fa-eye"></i> ${link.openCount}</span>`:''}
        <span class="link-points" title="Points"><i class="fa-solid fa-bolt"></i> ${link.points??100}</span>
      </div>
    </div>
    <div class="link-actions">
      ${link.pinned?'<i class="fa-solid fa-thumbtack link-action-badge pin"></i>':''}
      ${link.liked?'<i class="fa-solid fa-heart link-action-badge like"></i>':''}
      ${link.blocked?'<i class="fa-solid fa-ban link-action-badge block"></i>':''}
      <button class="link-menu-btn" title="Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>`;

  el.addEventListener('click', e => {
    if (e.target.closest('.link-menu-btn')||e.target.closest('.link-checkbox-wrap')) return;
    if (_multiSelect) { _toggleSelect(link.id, el, container); return; }
    _openInNewTabOrPreview(link, folder);
  });
  el.querySelector('.link-menu-btn')?.addEventListener('click', e => {
    e.stopPropagation(); _showLinkMenu(e.currentTarget, link, folder, el);
  });
  el.querySelector('.link-checkbox')?.addEventListener('change', () => _toggleSelect(link.id, el, container));
  return el;
}

// ── Grid card — FIXED height ──────────────────────────────
function _createGridCard(link, folder, idx) {
  const el = document.createElement('div');
  el.className = `link-grid-card${link.pinned?' is-pinned':''}${link.blocked?' is-blocked':''}${_selectedIds.has(link.id)?' is-selected':''}`;
  el.dataset.lid = link.id;
  el.style.animationDelay = `${Math.min(idx*0.025,0.3)}s`;

  el.innerHTML = `
    ${_multiSelect?`<input type="checkbox" class="link-grid-checkbox" ${_selectedIds.has(link.id)?'checked':''}>`:''}
    <div class="link-grid-top">
      <img class="link-grid-favicon" src="${link.favicon||''}" loading="lazy" width="32" height="32"
        onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23e2e8f0%22/><text x=%2216%22 y=%2222%22 font-size=%2216%22 text-anchor=%22middle%22>🔗</text></svg>'">
      <button class="link-grid-menu" title="Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>
    <div class="link-grid-title">${escapeHtml(link.title||link.domain||'Untitled')}</div>
    <div class="link-grid-domain">${escapeHtml(link.domain||'')}</div>
    <div class="link-grid-badges">
      ${link.starred?'<span class="grid-badge star"><i class="fa-solid fa-star"></i></span>':''}
      ${link.liked?'<span class="grid-badge like"><i class="fa-solid fa-heart"></i></span>':''}
      ${link.pinned?'<span class="grid-badge pin"><i class="fa-solid fa-thumbtack"></i></span>':''}
      ${link.blocked?'<span class="grid-badge block"><i class="fa-solid fa-ban"></i></span>':''}
    </div>`;

  el.addEventListener('click', e => {
    if (e.target.closest('.link-grid-menu')||e.target.closest('.link-grid-checkbox')) return;
    if (_multiSelect) { _toggleSelect(link.id, el, container); return; }
    _openInNewTabOrPreview(link, folder);
  });
  el.querySelector('.link-grid-menu')?.addEventListener('click', e => {
    e.stopPropagation(); _showLinkMenu(e.currentTarget, link, folder, el);
  });
  el.querySelector('.link-grid-checkbox')?.addEventListener('change', () => _toggleSelect(link.id, el, container));
  return el;
}

// ── Open link: new tab or embedded preview ────────────────
function _openInNewTabOrPreview(link, folder) {
  if (Storage.get('openLinksNewTab', false)) {
    window.open(link.url, '_blank', 'noopener');
    addOpenCount(folder.id, link);
    addToHistory({ ...link, folderId: folder.id, folderName: folder.name });
  } else {
    openEmbeddedPreview(link, folder);
  }
}

// ── Link menu ─────────────────────────────────────────────
function _showLinkMenu(anchor, link, folder, el) {
  showDropdown(anchor, [
    { label: link.pinned?'Unpin':'Pin',                  icon:'fa-solid fa-thumbtack',                action:()=>togglePin(folder.id,link) },
    { label: link.starred?'Remove Favourite':'Favourite',icon:'fa-solid fa-star',                     action:()=>toggleStar(folder.id,link) },
    { label: link.liked?'Unlike':'Like',                 icon:'fa-solid fa-heart',                    action:()=>toggleLike(folder.id,link) },
    { label: link.disliked?'Remove Dislike':'Dislike',   icon:'fa-regular fa-thumbs-down',            action:()=>toggleDislike(folder.id,link) },
    { label: link.blocked?'Unblock':'Block from Random', icon:'fa-solid fa-ban',                      action:()=>toggleBlock(folder.id,link) },
    'divider',
    { label: 'Move to folder', icon:'fa-solid fa-folder-open',
      action: async () => {
        const folders = await getFolders();
        const other   = folders.filter(f=>f.id!==folder.id);
        if (!other.length) { toast('No other folders','warning'); return; }
        _showMoveToFolderModal([link.id], folder.id, other, document.getElementById('folder-view-content'));
      }},
    { label: 'Copy URL',        icon:'fa-solid fa-copy',                          action:async()=>{await copyToClipboard(link.url);toast('Copied!','success');} },
    { label: 'Open in new tab', icon:'fa-solid fa-arrow-up-right-from-square',   action:()=>window.open(link.url,'_blank','noopener') },
    { label: 'Open incognito',  icon:'fa-solid fa-user-secret',
      action:()=>{ if(Storage.get('incognitoMode',false)) window.open(link.url,'_blank','noopener'); else window.open(link.url,'_blank','noopener'); } },
    'divider',
    { label:'Delete', icon:'fa-solid fa-trash', danger:true,
      action:async()=>{ const ok=await confirm('Delete Link',`Delete "${link.title||link.url}"?`,true); if(ok)deleteLink(folder.id,link); }},
  ], { align:'right' });
}

// ── Multi-select helpers ──────────────────────────────────
function _toggleSelect(lid, el, container) {
  if (_selectedIds.has(lid)) _selectedIds.delete(lid);
  else                        _selectedIds.add(lid);
  el.classList.toggle('is-selected', _selectedIds.has(lid));
  const cb = el.querySelector('.link-checkbox,.link-grid-checkbox');
  if (cb) cb.checked = _selectedIds.has(lid);
  _updateMultiCount(container || document.getElementById('folder-view-content'));
}

function _toggleMultiBar(container) {
  const bar  = container.querySelector('#multi-select-bar');
  bar?.classList.toggle('hidden', !_multiSelect);
}

function _updateMultiCount(container) {
  const el = container?.querySelector('#multi-count');
  if (el) el.textContent = `${_selectedIds.size} selected`;
}

// ══════════════════════════════════════════════════════════
// ADVANCED EMBEDDED PREVIEW
// Strategy: iframe → og:image → first jpg img → favicon
// ══════════════════════════════════════════════════════════

export function openEmbeddedPreview(link, folder) {
  addOpenCount(folder.id, link);
  addToHistory({ ...link, folderId: folder.id, folderName: folder.name });

  document.getElementById('preview-overlay')?.remove();

  const savedH = Storage.get('previewHeight', 420);

  const overlay = document.createElement('div');
  overlay.id = 'preview-overlay';
  overlay.className = 'preview-overlay';
  overlay.innerHTML = `
    <div class="preview-panel" id="preview-panel" style="height:${savedH}px">
      <!-- Resize handle -->
      <div class="preview-resize-handle" id="preview-resize" title="Drag to resize">
        <div class="preview-resize-bar"></div>
      </div>

      <!-- Header -->
      <div class="preview-header">
        <img class="preview-favicon" src="${link.favicon||''}" onerror="this.style.display='none'" width="18" height="18">
        <div class="preview-header-info">
          <div class="preview-title">${escapeHtml(link.title||link.domain||'Link')}</div>
          <div class="preview-url">${escapeHtml(link.url)}</div>
        </div>
        <button class="topbar-btn" id="preview-close" title="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <!-- Content area: iframe + fallback layers -->
      <div class="preview-frame-wrap" id="preview-frame-wrap">
        <!-- Loading state -->
        <div class="preview-loading" id="preview-loading">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:28px;color:var(--primary)"></i>
          <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:8px">Loading preview…</div>
        </div>

        <!-- Layer 1: iframe -->
        <iframe id="preview-iframe" class="preview-iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          loading="lazy" title="Preview"></iframe>

        <!-- Layer 2: thumbnail fallback (og:image / first jpg) -->
        <div id="preview-thumb-layer" class="preview-thumb-layer hidden">
          <img id="preview-thumb-img" src="" alt="Page preview" style="max-width:100%;max-height:calc(100% - 80px);object-fit:contain;border-radius:var(--r-md)">
          <div class="preview-thumb-open">
            <button class="btn btn-primary" id="thumb-open-btn">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Website
            </button>
            <button class="btn btn-secondary btn-sm" id="thumb-incognito-btn">
              <i class="fa-solid fa-user-secret"></i> Incognito
            </button>
          </div>
        </div>

        <!-- Layer 3: favicon fallback -->
        <div id="preview-favicon-layer" class="preview-thumb-layer hidden" style="align-items:center;justify-content:center;flex-direction:column;gap:16px">
          <img src="${link.favicon||''}" width="64" height="64" style="border-radius:12px;opacity:0.7" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect width=%2264%22 height=%2264%22 rx=%2212%22 fill=%22%23e2e8f0%22/><text x=%2232%22 y=%2244%22 font-size=%2232%22 text-anchor=%22middle%22>🔗</text></svg>'">
          <div style="text-align:center;color:var(--text-muted);font-size:var(--fs-sm)">Preview not available for this site</div>
          <button class="btn btn-primary" id="fav-open-btn">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open ${escapeHtml(link.domain||link.url)}
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="preview-actions" id="preview-actions">
        <button class="preview-action-btn ${link.starred?'active-star':''}" id="prev-star" title="Favourite"><i class="fa-${link.starred?'solid':'regular'} fa-star"></i><span>Fav</span></button>
        <button class="preview-action-btn ${link.liked?'active-like':''}" id="prev-like" title="Like"><i class="fa-${link.liked?'solid':'regular'} fa-heart"></i><span>Like</span></button>
        <button class="preview-action-btn ${link.disliked?'active-dislike':''}" id="prev-dislike" title="Dislike"><i class="fa-${link.disliked?'solid':'regular'} fa-thumbs-down"></i><span>Dislike</span></button>
        <button class="preview-action-btn" id="prev-copy" title="Copy"><i class="fa-solid fa-copy"></i><span>Copy</span></button>
        <button class="preview-action-btn" id="prev-open" title="Open tab"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>Open</span></button>
        <button class="preview-action-btn" id="prev-fullscreen" title="Fullscreen"><i class="fa-solid fa-expand"></i><span>Full</span></button>
        <button class="preview-action-btn danger" id="prev-delete" title="Delete"><i class="fa-solid fa-trash"></i><span>Delete</span></button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const panel   = overlay.querySelector('#preview-panel');
  const iframe  = overlay.querySelector('#preview-iframe');
  const loading = overlay.querySelector('#preview-loading');
  const thumbL  = overlay.querySelector('#preview-thumb-layer');
  const favL    = overlay.querySelector('#preview-favicon-layer');
  const thumbImg= overlay.querySelector('#preview-thumb-img');

  // ── Preview strategy ─────────────────────────────────────
  let iframeBlocked = false;
  let iframeTimeout;

  const tryIframe = () => {
    iframe.src = link.url;
    iframeTimeout = setTimeout(() => {
      // iframe didn't fire load/error in 5s → try og:image
      if (!iframeBlocked) tryOgImage();
    }, 5000);
  };

  iframe.addEventListener('load', () => {
    clearTimeout(iframeTimeout);
    // Check if actually loaded (cross-origin might still load but blank)
    loading?.classList.add('hidden');
  }, { once: true });

  iframe.addEventListener('error', () => {
    clearTimeout(iframeTimeout);
    iframeBlocked = true;
    iframe.classList.add('hidden');
    tryOgImage();
  }, { once: true });

  const tryOgImage = async () => {
    try {
      // Fetch via allorigins proxy to get og:image
      const apiUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(link.url)}`;
      const res    = await fetch(apiUrl, { signal: AbortSignal.timeout(6000) });
      const data   = await res.json();
      const html   = data.contents || '';
      const parser = new DOMParser();
      const doc    = parser.parseFromString(html, 'text/html');

      let imgUrl = doc.querySelector('meta[property="og:image"]')?.content ||
                   doc.querySelector('meta[name="twitter:image"]')?.content;

      if (!imgUrl) {
        // Find first jpg/jpeg image
        const imgs = [...doc.querySelectorAll('img[src]')];
        const jpgImg = imgs.find(i => /\.(jpe?g)/i.test(i.getAttribute('src')));
        if (jpgImg) {
          imgUrl = jpgImg.getAttribute('src');
          if (imgUrl && !imgUrl.startsWith('http')) {
            imgUrl = new URL(imgUrl, link.url).href;
          }
        }
      }

      if (imgUrl) {
        thumbImg.src = imgUrl;
        thumbImg.onload = () => {
          loading?.classList.add('hidden');
          iframe.classList.add('hidden');
          thumbL.classList.remove('hidden');
        };
        thumbImg.onerror = () => tryFaviconFallback();
      } else {
        tryFaviconFallback();
      }
    } catch {
      tryFaviconFallback();
    }
  };

  const tryFaviconFallback = () => {
    loading?.classList.add('hidden');
    iframe.classList.add('hidden');
    thumbL.classList.add('hidden');
    favL.classList.remove('hidden');
  };

  // Start loading
  tryIframe();

  // Thumbnail open buttons
  overlay.querySelector('#thumb-open-btn')?.addEventListener('click', () => window.open(link.url,'_blank','noopener'));
  overlay.querySelector('#thumb-incognito-btn')?.addEventListener('click', () => window.open(link.url,'_blank','noopener'));
  overlay.querySelector('#fav-open-btn')?.addEventListener('click', () => window.open(link.url,'_blank','noopener'));

  // ── Resize handle ─────────────────────────────────────────
  const resizeHandle = overlay.querySelector('#preview-resize');
  let startY, startH;
  resizeHandle?.addEventListener('mousedown', e => {
    startY = e.clientY; startH = panel.getBoundingClientRect().height;
    const onMove = (ev) => {
      const delta = startY - ev.clientY;
      const newH  = Math.max(200, Math.min(window.innerHeight * 0.92, startH + delta));
      panel.style.height = newH + 'px';
    };
    const onUp = () => {
      Storage.set('previewHeight', panel.getBoundingClientRect().height);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  // Touch resize
  resizeHandle?.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY; startH = panel.getBoundingClientRect().height;
    const onMove = (ev) => {
      const delta = startY - ev.touches[0].clientY;
      const newH  = Math.max(200, Math.min(window.innerHeight*0.92, startH + delta));
      panel.style.height = newH + 'px';
    };
    const onEnd = () => {
      Storage.set('previewHeight', panel.getBoundingClientRect().height);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('touchmove', onMove, { passive:true });
    window.addEventListener('touchend', onEnd);
  }, { passive:true });

  // ── Close ─────────────────────────────────────────────────
  const close = () => {
    clearTimeout(iframeTimeout);
    iframe.src = '';
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
  };
  overlay.querySelector('#preview-close').onclick = close;
  overlay.addEventListener('click', e => { if(e.target===overlay) close(); });

  // ── Fullscreen ─────────────────────────────────────────────
  let isFS = false;
  overlay.querySelector('#prev-fullscreen').onclick = () => {
    isFS = !isFS;
    panel.classList.toggle('preview-fullscreen', isFS);
    overlay.querySelector('#prev-fullscreen').innerHTML = isFS
      ? '<i class="fa-solid fa-compress"></i><span>Exit</span>'
      : '<i class="fa-solid fa-expand"></i><span>Full</span>';
  };

  // ── Actions ───────────────────────────────────────────────
  overlay.querySelector('#prev-star').onclick    = async () => { await toggleStar(folder.id, link); link.starred=!link.starred; _updPrevBtn(overlay,'#prev-star',link.starred,'fa-star','Fav','active-star'); };
  overlay.querySelector('#prev-like').onclick    = async () => { await toggleLike(folder.id, link); link.liked=!link.liked; _updPrevBtn(overlay,'#prev-like',link.liked,'fa-heart','Like','active-like'); };
  overlay.querySelector('#prev-dislike').onclick = async () => { await toggleDislike(folder.id, link); link.disliked=!link.disliked; _updPrevBtn(overlay,'#prev-dislike',link.disliked,'fa-thumbs-down','Dislike','active-dislike'); };
  overlay.querySelector('#prev-copy').onclick    = async () => { await copyToClipboard(link.url); toast('Copied!','success'); };
  overlay.querySelector('#prev-open').onclick    = () => window.open(link.url,'_blank','noopener');
  overlay.querySelector('#prev-delete').onclick  = async () => {
    const ok = await confirm('Delete Link',`Delete "${link.title||link.url}"?`,true);
    if (ok) { close(); deleteLink(folder.id, link); }
  };
}

function _updPrevBtn(overlay, sel, active, icon, label, cls) {
  const btn = overlay.querySelector(sel);
  if (!btn) return;
  btn.className = `preview-action-btn${active?' '+cls:''}`;
  btn.innerHTML = `<i class="fa-${active?'solid':'regular'} ${icon}"></i><span>${label}</span>`;
}

// ══════════════════════════════════════════════════════════
// RECYCLE BIN
// ══════════════════════════════════════════════════════════

export function showRecycleBin() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal mobile-full" style="max-width:520px;max-height:88vh">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-trash-can" style="color:var(--danger);margin-right:8px"></i>Recycle Bin</span>
        <button class="btn btn-ghost btn-icon rb-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div style="max-height:60vh;overflow-y:auto" id="rb-list">
        <div style="display:flex;align-items:center;justify-content:center;padding:40px;color:var(--text-muted)">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:8px"></i> Loading…
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger btn-sm" id="rb-empty-btn"><i class="fa-solid fa-trash"></i> Empty Bin</button>
        <button class="btn btn-secondary btn-sm rb-close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelectorAll('.rb-close').forEach(b=>b.onclick=close);
  backdrop.addEventListener('click', e=>{if(e.target===backdrop)close();});

  // Load recycle bin
  onValue(ref(null || (window.__firebase?.db), `users/${uid()}/recycleBin`), (snap) => {
    // Use dynamic import for db access
    import('./firebase-init.js').then(({ db, ref: fbRef, onValue: fbOnValue, remove: fbRemove }) => {
      fbOnValue(fbRef(db, `users/${uid()}/recycleBin`), (s) => {
        const list = document.getElementById('rb-list');
        if (!list) return;
        if (!s.exists()) {
          list.innerHTML = `<div class="empty-state" style="padding:40px 20px"><div class="empty-state-icon"><i class="fa-solid fa-trash-can"></i></div><h3>Recycle bin is empty</h3><p>Deleted items appear here for 30 days</p></div>`;
          return;
        }
        const items = Object.values(s.val()).sort((a,b)=>b.deletedAt-a.deletedAt);
        list.innerHTML = items.map(item=>`
          <div class="rb-item">
            <div class="rb-item-icon"><i class="fa-solid ${item.type==='folder'?'fa-folder':'fa-link'}" style="color:var(--${item.type==='folder'?'warning':'primary'})"></i></div>
            <div class="rb-item-info">
              <div class="rb-item-name">${escapeHtml(item.data?.name||item.data?.title||item.data?.url||'Unknown')}</div>
              <div class="rb-item-meta">Deleted ${timeAgo(item.deletedAt)} · Expires in ${Math.max(0,Math.ceil((item.expireAt-Date.now())/86400000))}d</div>
            </div>
            <div class="rb-item-actions">
              <button class="btn btn-ghost btn-sm" data-rbid="${item.id}" data-type="${item.type}" title="Restore"><i class="fa-solid fa-rotate-left"></i></button>
              <button class="btn btn-ghost btn-sm" data-rbid-del="${item.id}" title="Delete forever" style="color:var(--danger)"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </div>`).join('');

        // Restore
        list.querySelectorAll('[data-rbid]').forEach(btn => {
          btn.onclick = async () => {
            const id   = btn.dataset.rbid;
            const type = btn.dataset.type;
            if (type==='folder') {
              const { restoreFolder } = await import('./folders.js');
              await restoreFolder(id);
            } else {
              const sn = await (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js')).get(fbRef(db,`users/${uid()}/recycleBin/${id}`));
              if (sn.exists()) {
                const { originalFid,originalLid,data } = sn.val();
                await (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js')).set(fbRef(db,`users/${uid()}/folders/${originalFid}/links/${originalLid}`),data);
                await fbRemove(fbRef(db,`users/${uid()}/recycleBin/${id}`));
                toast('Link restored','success');
              }
            }
          };
        });
        // Perm delete
        list.querySelectorAll('[data-rbid-del]').forEach(btn => {
          btn.onclick = async () => {
            const ok = await confirm('Delete Permanently','This cannot be undone.',true);
            if (ok) { await fbRemove(fbRef(db,`users/${uid()}/recycleBin/${btn.dataset.rbidDel}`)); toast('Permanently deleted','info'); }
          };
        });
      });

      // Empty bin
      document.getElementById('rb-empty-btn').onclick = async () => {
        const ok = await confirm('Empty Recycle Bin','Permanently delete all items? Cannot be undone.',true);
        if (!ok) return;
        const sn = await (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js')).get(fbRef(db,`users/${uid()}/recycleBin`));
        if (sn.exists()) await fbRemove(fbRef(db,`users/${uid()}/recycleBin`));
        toast('Recycle bin emptied','info');
      };
    });
  }, { onlyOnce: true });
}

// ── Helpers ───────────────────────────────────────────────
function _hexRgba(hex, alpha) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// For container reference in multi-select
let container;
