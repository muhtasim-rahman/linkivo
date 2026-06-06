// ============================================================
// Linkivo — links.js  v1.4.3
// Step 2 fixes: grid height, multi-select, search bar,
// scroll issue, link move, blur locked folders, PIN session,
// advanced preview (iframe→og:image→jpg→favicon), resizable
// ============================================================

import { db, ref, set, get, update, remove, onValue } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import {
  toast, confirm, showDropdown, genId,
  copyToClipboard, escapeHtml, timeAgo,
  calcLinkPoints, Storage
} from './utils.js';
import { incrementLinkCount, isFolderUnlocked, verifyAndUnlockFolder, getFolders } from './folders.js';

const uid      = () => getCurrentUser()?.uid;
const linkRef  = (fid, lid) => ref(db, `users/${uid()}/folders/${fid}/links/${lid}`);
const linksRef = (fid)      => ref(db, `users/${uid()}/folders/${fid}/links`);
const rbRef    = (id)       => ref(db, `users/${uid()}/recycleBin/${id}`);

// ── Module state ─────────────────────────────────────────
let _folder     = null;
let _links      = [];
let _sort       = Storage.get('linkSort','date_desc');
let _view       = Storage.get('linkView','list');
let _filter     = '';
let _unsub      = null;
let _selected   = new Set();
let _multi      = false;

// ══════════════════════════════════════════════════════════
// LINK CRUD
// ══════════════════════════════════════════════════════════

async function _upd(fid, lid, data) {
  await update(linkRef(fid, lid), { ...data, updatedAt: Date.now() });
}

export async function toggleLike(fid, link) {
  const liked    = !link.liked;
  const disliked = liked ? false : link.disliked; // mutually exclusive
  await _upd(fid, link.id, { liked, disliked, points: calcLinkPoints({ ...link, liked, disliked }) });
}

export async function toggleDislike(fid, link) {
  const disliked = !link.disliked;
  const liked    = disliked ? false : link.liked; // mutually exclusive
  await _upd(fid, link.id, { disliked, liked, points: calcLinkPoints({ ...link, disliked, liked }) });
}

export async function toggleStar(fid, link) {
  const starred = !link.starred;
  await _upd(fid, link.id, { starred, points: calcLinkPoints({ ...link, starred }) });
}

export async function togglePin(fid, link) {
  await _upd(fid, link.id, { pinned: !link.pinned });
}

export async function toggleBlock(fid, link) {
  const blocked = !link.blocked;
  await _upd(fid, link.id, { blocked, points: blocked ? 0 : calcLinkPoints({ ...link, blocked: false }) });
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

export async function deleteLinksBulk(fid, ids) {
  for (const lid of ids) {
    const s = await get(linkRef(fid, lid));
    if (s.exists()) await deleteLink(fid, s.val());
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

export async function moveLinksBulk(srcFid, ids, destFid) {
  for (const lid of ids) {
    const s = await get(linkRef(srcFid, lid));
    if (s.exists()) await moveLinkToFolder(srcFid, s.val(), destFid);
  }
  toast(`${ids.length} link${ids.length!==1?'s':''} moved`, 'success');
}

// ── Open count — no extra read ────────────────────────────
export async function addOpenCount(fid, link) {
  const oc = (link.openCount || 0) + 1;
  await _upd(fid, link.id, { openCount: oc, points: calcLinkPoints({ ...link, openCount: oc }) });
}

// ── History entry ─────────────────────────────────────────
export async function addToHistory(link) {
  const id = genId('h_');
  await set(ref(db, `users/${uid()}/history/${id}`), {
    id, url: link.url,
    title:   link.title || link.domain || link.url,
    favicon: link.favicon || '',
    domain:  link.domain || '',
    openedAt: Date.now(),
    folderId: link.folderId || '',
    folderName: link.folderName || '',
  });
  // Prune — one remove call on exceeded keys
  const snap = await get(ref(db, `users/${uid()}/history`));
  if (!snap.exists()) return;
  const max = Storage.get('historyMax', 500);
  const all = Object.entries(snap.val()).sort((a,b) => b[1].openedAt - a[1].openedAt);
  if (all.length > max) {
    for (const [key] of all.slice(max)) {
      await remove(ref(db, `users/${uid()}/history/${key}`));
    }
  }
}

// ══════════════════════════════════════════════════════════
// FOLDER VIEW — main entry
// ══════════════════════════════════════════════════════════

export function openFolderView(folder) {
  _folder = folder;
  _selected.clear();
  _multi  = false;
  _filter = '';

  const ct = document.getElementById('folder-view-content');
  if (!ct) return;

  // Locked + not yet unlocked this session
  if (folder.locked && !isFolderUnlocked(folder.id)) {
    _renderLocked(ct, folder);
    return;
  }

  ct.innerHTML = _buildHTML(folder);
  _bind(ct, folder);

  // Real-time subscription
  if (_unsub) { _unsub(); _unsub = null; }
  onValue(linksRef(folder.id), snap => {
    _links = snap.exists() ? Object.values(snap.val()) : [];
    _render(ct, folder);
  });
}

// ── Locked placeholder ────────────────────────────────────
function _renderLocked(ct, folder) {
  ct.innerHTML = `
    <div class="fv-topbar">
      <button class="fv-back" id="fv-back"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="fv-icon" style="background:rgba(139,92,246,0.12);color:var(--pin-color)"><i class="fa-solid fa-lock"></i></div>
      <div class="fv-title-wrap">
        <h2 class="fv-title">${escapeHtml(folder.name)}</h2>
        <span class="fv-meta">Locked folder</span>
      </div>
    </div>
    <div class="empty-state" style="flex:1">
      <div class="empty-state-icon" style="background:rgba(139,92,246,0.12);color:var(--pin-color);width:80px;height:80px;font-size:36px">
        <i class="fa-solid fa-lock"></i>
      </div>
      <h3>This folder is locked</h3>
      <p>Enter your 6-digit PIN to access the contents</p>
      <button class="btn btn-primary" id="fv-unlock-btn">
        <i class="fa-solid fa-unlock-keyhole"></i> Unlock Folder
      </button>
    </div>`;
  ct.querySelector('#fv-back')?.addEventListener('click', () => window.Router?.go?.('home'));
  ct.querySelector('#fv-unlock-btn')?.addEventListener('click', async () => {
    const ok = await verifyAndUnlockFolder(folder);
    if (ok) openFolderView(folder);
  });
}

// ── Build HTML shell ──────────────────────────────────────
function _buildHTML(folder) {
  const iconBg = _hexRgba(folder.color || '#3b82f6', 0.12);
  return `
    <!-- Topbar -->
    <div class="fv-topbar" id="fv-topbar">
      <button class="fv-back" id="fv-back"><i class="fa-solid fa-arrow-left"></i></button>
      <div class="fv-icon" style="background:${iconBg};color:${folder.color||'var(--primary)'}">
        <i class="${folder.icon||'fa-solid fa-folder'}"></i>
      </div>
      <div class="fv-title-wrap">
        <h2 class="fv-title">${escapeHtml(folder.name)}</h2>
        <span class="fv-meta" id="fv-count">Loading…</span>
      </div>
      <button class="topbar-btn" id="fv-search-btn" title="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
      <button class="topbar-btn" id="fv-import-btn" title="Import"><i class="fa-solid fa-file-import"></i></button>
    </div>

    <!-- Search bar — hidden by default, clear single-icon design -->
    <div class="fv-search-bar hidden" id="fv-search-bar">
      <i class="fa-solid fa-magnifying-glass" style="color:var(--text-subtle);font-size:14px;flex-shrink:0"></i>
      <input type="search" id="fv-search-input" placeholder="Search links in this folder…" autocomplete="off"
        style="flex:1;border:none;background:none;outline:none;font-size:var(--fs-sm);color:var(--text);font-family:var(--font-ui)">
      <button id="fv-search-clear" style="border:none;background:none;cursor:pointer;color:var(--text-subtle);padding:4px;font-size:14px;flex-shrink:0;line-height:1">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <!-- Controls -->
    <div class="links-controls" id="links-controls">
      <button class="btn btn-ghost btn-sm" id="sort-btn" style="gap:4px">
        <i class="fa-solid fa-arrow-down-wide-short"></i>
        <span id="sort-label">Latest</span>
        <i class="fa-solid fa-chevron-down" style="font-size:9px"></i>
      </button>
      <div style="display:flex;gap:4px;align-items:center;margin-left:auto">
        <button class="btn btn-ghost btn-icon view-btn ${_view==='list'?'view-active':''}" data-v="list" title="List"><i class="fa-solid fa-list"></i></button>
        <button class="btn btn-ghost btn-icon view-btn ${_view==='grid'?'view-active':''}" data-v="grid" title="Grid"><i class="fa-solid fa-grip"></i></button>
        <button class="btn btn-ghost btn-sm" id="multi-btn" title="Select multiple"><i class="fa-solid fa-check-double"></i></button>
      </div>
    </div>

    <!-- Multi-select action bar -->
    <div class="multi-bar hidden" id="multi-bar">
      <span class="multi-count" id="multi-count">0 selected</span>
      <div style="display:flex;gap:6px;margin-left:auto;align-items:center">
        <button class="btn btn-ghost btn-sm" id="multi-all">All</button>
        <button class="btn btn-ghost btn-sm" id="multi-move"><i class="fa-solid fa-folder-open"></i> Move</button>
        <button class="btn btn-ghost btn-sm" id="multi-del" style="color:var(--danger)"><i class="fa-solid fa-trash"></i> Delete</button>
        <button class="btn btn-ghost btn-sm" id="multi-cancel"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </div>

    <!-- Links container — takes remaining height, scrolls internally -->
    <div id="links-ct" class="links-container ${_view==='grid'?'links-grid':'links-list'}">
      <div class="lc-loading">
        <i class="fa-solid fa-spinner fa-spin" style="color:var(--primary);font-size:20px"></i>
      </div>
    </div>
  `;
}

// ── Bind events ───────────────────────────────────────────
function _bind(ct, folder) {
  const $  = id => ct.querySelector(`#${id}`);
  const lc = () => ct.querySelector('#links-ct');

  // Back
  $('fv-back')?.addEventListener('click', () => {
    if (_unsub) { _unsub(); _unsub = null; }
    window.Router?.go?.('home');
  });

  // Search toggle — single clear icon, no double icon
  $('fv-search-btn')?.addEventListener('click', () => {
    const bar = $('fv-search-bar');
    const open = bar.classList.toggle('hidden');
    if (!open) { $('fv-search-input')?.focus(); }
    else { _filter = ''; if ($('fv-search-input')) $('fv-search-input').value = ''; _render(ct, folder); }
  });
  $('fv-search-clear')?.addEventListener('click', () => {
    $('fv-search-bar')?.classList.add('hidden');
    _filter = ''; if ($('fv-search-input')) $('fv-search-input').value = '';
    _render(ct, folder);
  });
  $('fv-search-input')?.addEventListener('input', e => {
    _filter = e.target.value.toLowerCase();
    _render(ct, folder);
  });

  // Sort
  $('sort-btn')?.addEventListener('click', e => {
    const opts = [
      { label:'Latest first',  icon:'fa-solid fa-calendar-days', value:'date_desc'  },
      { label:'Oldest first',  icon:'fa-solid fa-calendar',      value:'date_asc'   },
      { label:'A → Z',         icon:'fa-solid fa-arrow-down-a-z',value:'alpha_asc'  },
      { label:'Z → A',         icon:'fa-solid fa-arrow-up-z-a',  value:'alpha_desc' },
      { label:'Liked',         icon:'fa-solid fa-heart',         value:'liked'      },
      { label:'Favourites',    icon:'fa-solid fa-star',          value:'starred'    },
      { label:'Most opened',   icon:'fa-solid fa-fire',          value:'opens'      },
      { label:'High points',   icon:'fa-solid fa-bolt',          value:'points'     },
      { label:'Pinned first',  icon:'fa-solid fa-thumbtack',     value:'pinned'     },
    ];
    showDropdown(e.currentTarget, opts.map(o => ({
      label: o.label, icon: o.icon,
      action: () => { _sort = o.value; Storage.set('linkSort', o.value); if ($('sort-label')) $('sort-label').textContent = o.label; _render(ct, folder); }
    })));
  });

  // View toggle
  ct.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _view = btn.dataset.v; Storage.set('linkView', _view);
      ct.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('view-active', b.dataset.v === _view));
      const l = lc();
      if (l) l.className = `links-container ${_view==='grid'?'links-grid':'links-list'}`;
      _render(ct, folder);
    });
  });

  // Multi-select toggle
  $('multi-btn')?.addEventListener('click', () => {
    _multi = !_multi; _selected.clear();
    $('multi-bar')?.classList.toggle('hidden', !_multi);
    _render(ct, folder);
  });
  $('multi-cancel')?.addEventListener('click', () => {
    _multi = false; _selected.clear();
    $('multi-bar')?.classList.add('hidden');
    _render(ct, folder);
  });
  $('multi-all')?.addEventListener('click', () => {
    _getList().forEach(l => _selected.add(l.id));
    _render(ct, folder); _updCount(ct);
  });
  $('multi-del')?.addEventListener('click', async () => {
    if (!_selected.size) return;
    const ok = await confirm('Delete Links', `Delete ${_selected.size} selected link${_selected.size!==1?'s':''}?`, true);
    if (!ok) return;
    await deleteLinksBulk(folder.id, [..._selected]);
    _selected.clear(); _multi = false; $('multi-bar')?.classList.add('hidden');
  });
  $('multi-move')?.addEventListener('click', async () => {
    if (!_selected.size) { toast('Select links first','warning'); return; }
    const folders = await getFolders();
    const others  = folders.filter(f => f.id !== folder.id);
    if (!others.length) { toast('No other folders','warning'); return; }
    _showMoveModal([..._selected], folder.id, others, ct);
  });

  // Import
  $('fv-import-btn')?.addEventListener('click', async () => {
    const { showImportModal } = await import('./import.js');
    const { getFolders: gf, saveLinksToFolder, createFolder } = await import('./folders.js');
    const fls = await gf();
    showImportModal(fls, async (links, fTarget, isNew, opts) => {
      let fid = isNew ? (await createFolder(fTarget))?.id : (fTarget || folder.id);
      if (!fid) fid = folder.id;
      const { saveLinksToFolder: slf } = await import('./folders.js');
      const added = await slf(fid, links, opts);
      toast(`${added} link${added!==1?'s':''} saved!`, 'success');
    });
  });
}

// ── Move modal ────────────────────────────────────────────
function _showMoveModal(ids, srcFid, folders, ct) {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-folder-open" style="color:var(--warning);margin-right:8px"></i>Move ${ids.length} link${ids.length!==1?'s':''} to…</span>
        <button class="btn btn-ghost btn-icon mc"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:6px;padding:var(--sp-4)">
        ${folders.map(f=>`
          <button class="move-item" data-fid="${f.id}" style="display:flex;align-items:center;gap:var(--sp-3);padding:10px var(--sp-3);border:1.5px solid var(--border);border-radius:var(--r-md);background:none;cursor:pointer;transition:all 0.15s;text-align:left;width:100%">
            <i class="fa-solid fa-folder" style="color:${f.color||'var(--warning)'};width:20px;text-align:center"></i>
            <div style="flex:1;min-width:0">
              <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text)">${escapeHtml(f.name)}</div>
              <div style="font-size:var(--fs-xs);color:var(--text-subtle)">${f.linkCount||0} links</div>
            </div>
            <i class="fa-solid fa-chevron-right" style="color:var(--text-subtle);font-size:11px"></i>
          </button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.querySelector('.mc').onclick = close;
  bd.addEventListener('click', e => { if(e.target===bd) close(); });
  bd.querySelectorAll('.move-item').forEach(btn => {
    btn.addEventListener('mouseover', () => btn.style.borderColor = 'var(--primary)');
    btn.addEventListener('mouseout',  () => btn.style.borderColor = 'var(--border)');
    btn.addEventListener('click', async () => {
      close();
      await moveLinksBulk(srcFid, ids, btn.dataset.fid);
      _selected.clear(); _multi = false;
      ct.querySelector('#multi-bar')?.classList.add('hidden');
    });
  });
}

// ── Get filtered + sorted list ────────────────────────────
function _getList() {
  let list = [..._links];
  if (_filter) {
    list = list.filter(l =>
      (l.title||'').toLowerCase().includes(_filter) ||
      (l.url||'').toLowerCase().includes(_filter)   ||
      (l.domain||'').toLowerCase().includes(_filter)
    );
  }
  const sorters = {
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
  list.sort(sorters[_sort] || sorters.date_desc);
  return [...list.filter(l=>l.pinned), ...list.filter(l=>!l.pinned)];
}

// ── Render ────────────────────────────────────────────────
function _render(ct, folder) {
  const lc   = ct.querySelector('#links-ct');
  const list = _getList();
  const cnt  = ct.querySelector('#fv-count');
  if (cnt) cnt.textContent = `${list.length} link${list.length!==1?'s':''}`;
  if (!lc) return;

  if (!list.length) {
    lc.innerHTML = `
      <div class="empty-state" style="padding:var(--sp-12) var(--sp-5)">
        <div class="empty-state-icon"><i class="fa-solid fa-link-slash"></i></div>
        <h3>${_filter?'No results':'No links yet'}</h3>
        <p>${_filter?'Try a different search term':'Import links or add some to this folder'}</p>
      </div>`;
    return;
  }

  lc.innerHTML = '';
  list.forEach((link, idx) => {
    const el = _view === 'grid' ? _gridCard(link, folder, idx) : _listCard(link, folder, idx);
    lc.appendChild(el);
  });
}

// ── List card ─────────────────────────────────────────────
function _listCard(link, folder, idx) {
  const el   = document.createElement('div');
  const sel  = _selected.has(link.id);
  const showUrl = Storage.get('showLinkUrls', true);
  el.className = `link-row${link.pinned?' pinned':''}${link.blocked?' blocked':''}${sel?' sel':''}`;
  el.dataset.lid = link.id;
  el.style.animationDelay = `${Math.min(idx * 0.025, 0.4)}s`;

  el.innerHTML = `
    ${_multi ? `<div class="link-cb-wrap"><input type="checkbox" class="link-cb" ${sel?'checked':''}></div>` : ''}
    <div class="link-thumb">
      ${link.starred ? '<div class="link-star-dot"></div>' : ''}
      <img src="${link.favicon||''}" loading="lazy" width="38" height="38"
        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%23e2e8f0%22/><text x=%2216%22 y=%2222%22 font-size=%2215%22 text-anchor=%22middle%22>🔗</text></svg>'">
    </div>
    <div class="link-info">
      <div class="link-title">${escapeHtml(link.title||link.domain||'Untitled')}</div>
      ${showUrl ? `<div class="link-url">${escapeHtml(link.url)}</div>` : ''}
      <div class="link-meta">
        <span>${escapeHtml(link.domain||'')}</span>
        <span>${timeAgo(link.addedAt)}</span>
        ${link.openCount ? `<span>👁 ${link.openCount}</span>` : ''}
        <span style="color:var(--warning)">⚡${link.points??100}</span>
      </div>
    </div>
    <div class="link-right">
      ${link.pinned  ? '<i class="fa-solid fa-thumbtack" style="font-size:10px;color:var(--pin-color)"></i>' : ''}
      ${link.liked   ? '<i class="fa-solid fa-heart"     style="font-size:10px;color:var(--like-color)"></i>' : ''}
      ${link.blocked ? '<i class="fa-solid fa-ban"       style="font-size:10px;color:var(--danger)"></i>' : ''}
      <button class="lmenu" title="Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>`;

  el.addEventListener('click', e => {
    if (e.target.closest('.lmenu') || e.target.closest('.link-cb-wrap')) return;
    if (_multi) { _toggleSel(link.id, el, document.getElementById('folder-view-content')); return; }
    _openLink(link, folder);
  });
  el.querySelector('.lmenu')?.addEventListener('click', e => { e.stopPropagation(); _linkMenu(e.currentTarget, link, folder, el); });
  el.querySelector('.link-cb')?.addEventListener('change', () => _toggleSel(link.id, el, document.getElementById('folder-view-content')));
  return el;
}

// ── Grid card — fixed 148px height ───────────────────────
function _gridCard(link, folder, idx) {
  const el  = document.createElement('div');
  const sel = _selected.has(link.id);
  el.className = `link-grid${link.pinned?' pinned':''}${link.blocked?' blocked':''}${sel?' sel':''}`;
  el.dataset.lid = link.id;
  el.style.animationDelay = `${Math.min(idx * 0.025, 0.4)}s`;

  el.innerHTML = `
    ${_multi ? `<input type="checkbox" class="grid-cb" ${sel?'checked':''}style="position:absolute;top:8px;left:8px;z-index:1;accent-color:var(--primary)">` : ''}
    <div class="grid-top">
      <img src="${link.favicon||''}" loading="lazy" width="28" height="28"
        style="border-radius:6px;flex-shrink:0;object-fit:contain;background:var(--surface-2);border:1px solid var(--border)"
        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 28 28%22><rect width=%2228%22 height=%2228%22 rx=%226%22 fill=%22%23e2e8f0%22/><text x=%2214%22 y=%2220%22 font-size=%2213%22 text-anchor=%22middle%22>🔗</text></svg>'">
      <button class="gmenu" title="Options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
    </div>
    <div class="grid-title">${escapeHtml(link.title||link.domain||'Untitled')}</div>
    <div class="grid-domain">${escapeHtml(link.domain||'')}</div>
    <div class="grid-badges">
      ${link.starred ? '<span class="gb star"><i class="fa-solid fa-star"></i></span>' : ''}
      ${link.liked   ? '<span class="gb like"><i class="fa-solid fa-heart"></i></span>' : ''}
      ${link.pinned  ? '<span class="gb pin"><i class="fa-solid fa-thumbtack"></i></span>' : ''}
      ${link.blocked ? '<span class="gb ban"><i class="fa-solid fa-ban"></i></span>' : ''}
    </div>`;

  el.addEventListener('click', e => {
    if (e.target.closest('.gmenu') || e.target.closest('.grid-cb')) return;
    if (_multi) { _toggleSel(link.id, el, document.getElementById('folder-view-content')); return; }
    _openLink(link, folder);
  });
  el.querySelector('.gmenu')?.addEventListener('click', e => { e.stopPropagation(); _linkMenu(e.currentTarget, link, folder, el); });
  el.querySelector('.grid-cb')?.addEventListener('change', () => _toggleSel(link.id, el, document.getElementById('folder-view-content')));
  return el;
}

// ── Open link ─────────────────────────────────────────────
function _openLink(link, folder) {
  if (Storage.get('openLinksNewTab', false)) {
    window.open(link.url, '_blank', 'noopener');
    addOpenCount(folder.id, link);
    addToHistory({ ...link, folderId: folder.id, folderName: folder.name });
  } else {
    openEmbeddedPreview(link, folder);
  }
}

// ── Link three-dot menu ────────────────────────────────────
function _linkMenu(anchor, link, folder, el) {
  showDropdown(anchor, [
    { label: link.pinned?'Unpin':'Pin',                   icon:'fa-solid fa-thumbtack',              action:()=>togglePin(folder.id,link) },
    { label: link.starred?'Remove Favourite':'Favourite', icon:'fa-solid fa-star',                   action:()=>toggleStar(folder.id,link) },
    { label: link.liked?'Unlike':'Like',                  icon:'fa-solid fa-heart',                  action:()=>toggleLike(folder.id,link) },
    { label: link.disliked?'Remove Dislike':'Dislike',    icon:'fa-regular fa-thumbs-down',          action:()=>toggleDislike(folder.id,link) },
    { label: link.blocked?'Unblock':'Block from Random',  icon:'fa-solid fa-ban',                    action:()=>toggleBlock(folder.id,link) },
    'divider',
    { label:'Move to folder', icon:'fa-solid fa-folder-open',
      action: async () => {
        const folders = await getFolders();
        const others  = folders.filter(f=>f.id!==folder.id);
        if (!others.length) { toast('No other folders','warning'); return; }
        _showMoveModal([link.id], folder.id, others, document.getElementById('folder-view-content'));
      }},
    { label:'Copy URL',        icon:'fa-solid fa-copy',                         action:async()=>{ await copyToClipboard(link.url); toast('Copied!','success'); } },
    { label:'Open in new tab', icon:'fa-solid fa-arrow-up-right-from-square',  action:()=>window.open(link.url,'_blank','noopener') },
    'divider',
    { label:'Delete', icon:'fa-solid fa-trash', danger:true,
      action:async()=>{ const ok=await confirm('Delete Link',`Delete "${link.title||link.url}"?`,true); if(ok)deleteLink(folder.id,link); } },
  ], { align:'right' });
}

// ── Multi-select helpers ──────────────────────────────────
function _toggleSel(lid, el, ct) {
  if (_selected.has(lid)) _selected.delete(lid);
  else                     _selected.add(lid);
  el.classList.toggle('sel', _selected.has(lid));
  const cb = el.querySelector('.link-cb,.grid-cb');
  if (cb) cb.checked = _selected.has(lid);
  _updCount(ct);
}

function _updCount(ct) {
  const el = ct?.querySelector('#multi-count');
  if (el) el.textContent = `${_selected.size} selected`;
}

// ══════════════════════════════════════════════════════════
// ADVANCED EMBEDDED PREVIEW
// iframe → og:image → first jpg → favicon fallback
// ══════════════════════════════════════════════════════════

export function openEmbeddedPreview(link, folder) {
  // Track open
  addOpenCount(folder.id, link);
  addToHistory({ ...link, folderId: folder.id, folderName: folder.name });

  document.getElementById('lv-preview-overlay')?.remove();

  const savedH  = Math.max(200, Math.min(window.innerHeight * 0.85, Storage.get('previewHeight', 420)));
  const overlay = document.createElement('div');
  overlay.id = 'lv-preview-overlay';
  overlay.className = 'pv-overlay';

  overlay.innerHTML = `
    <div class="pv-panel" id="pv-panel" style="height:${savedH}px">
      <!-- Drag-to-resize handle -->
      <div class="pv-resize" id="pv-resize"><div class="pv-resize-bar"></div></div>

      <!-- Header -->
      <div class="pv-header">
        <img class="pv-fav" src="${link.favicon||''}" onerror="this.style.display='none'" width="16" height="16">
        <div class="pv-hinfo">
          <div class="pv-htitle">${escapeHtml(link.title||link.domain||'Link')}</div>
          <div class="pv-hurl">${escapeHtml(link.url)}</div>
        </div>
        <button class="topbar-btn" id="pv-close" title="Close"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <!-- Content: iframe + fallback layers -->
      <div class="pv-content" id="pv-content">
        <!-- Loading -->
        <div class="pv-loading" id="pv-loading">
          <i class="fa-solid fa-spinner fa-spin" style="font-size:26px;color:var(--primary)"></i>
          <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:8px">Loading preview…</div>
        </div>

        <!-- Layer 1: iframe -->
        <iframe id="pv-iframe" class="pv-iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          loading="lazy" title="Preview: ${escapeHtml(link.title||link.url)}"></iframe>

        <!-- Layer 2: og:image / first jpg fallback -->
        <div id="pv-thumb" class="pv-fallback hidden">
          <img id="pv-thumb-img" src="" alt="Preview"
            style="max-width:100%;max-height:calc(100% - 90px);object-fit:contain;border-radius:var(--r-md)">
          <div class="pv-fb-actions">
            <button class="btn btn-primary btn-sm" id="pv-fb-open">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Website
            </button>
            <button class="btn btn-secondary btn-sm" id="pv-fb-incognito">
              <i class="fa-solid fa-user-secret"></i> Incognito
            </button>
          </div>
        </div>

        <!-- Layer 3: favicon fallback -->
        <div id="pv-fav-fb" class="pv-fallback hidden">
          <img id="pv-fav-img" src="${link.favicon||''}" width="56" height="56"
            style="border-radius:12px;opacity:0.6"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 56 56%22><rect width=%2256%22 height=%2256%22 rx=%2212%22 fill=%22%23e2e8f0%22/><text x=%2228%22 y=%2238%22 font-size=%2228%22 text-anchor=%22middle%22>🔗</text></svg>'">
          <div style="font-size:var(--fs-sm);color:var(--text-muted);text-align:center">Preview not available for this website</div>
          <button class="btn btn-primary" id="pv-fav-open">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open ${escapeHtml(link.domain||link.url)}
          </button>
        </div>
      </div>

      <!-- Action bar -->
      <div class="pv-actions">
        <button class="pva ${link.starred?'pva-star':''}" id="pva-star" title="Favourite"><i class="fa-${link.starred?'solid':'regular'} fa-star"></i><span>Fav</span></button>
        <button class="pva ${link.liked?'pva-like':''}" id="pva-like" title="Like"><i class="fa-${link.liked?'solid':'regular'} fa-heart"></i><span>Like</span></button>
        <button class="pva ${link.disliked?'pva-dis':''}" id="pva-dis" title="Dislike"><i class="fa-${link.disliked?'solid':'regular'} fa-thumbs-down"></i><span>Dislike</span></button>
        <button class="pva" id="pva-copy" title="Copy URL"><i class="fa-solid fa-copy"></i><span>Copy</span></button>
        <button class="pva" id="pva-open" title="Open in new tab"><i class="fa-solid fa-arrow-up-right-from-square"></i><span>Open</span></button>
        <button class="pva" id="pva-fs" title="Fullscreen"><i class="fa-solid fa-expand"></i><span>Full</span></button>
        <button class="pva pva-danger" id="pva-del" title="Delete"><i class="fa-solid fa-trash"></i><span>Delete</span></button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  const panel  = overlay.querySelector('#pv-panel');
  const iframe = overlay.querySelector('#pv-iframe');
  const loading= overlay.querySelector('#pv-loading');
  const thumbL = overlay.querySelector('#pv-thumb');
  const thumbI = overlay.querySelector('#pv-thumb-img');
  const favL   = overlay.querySelector('#pv-fav-fb');

  // ── Preview strategy ──────────────────────────────────
  let blocked  = false;
  let iframeTO;

  const showLoading  = () => { loading?.classList.remove('hidden'); };
  const hideLoading  = () => loading?.classList.add('hidden');
  const showThumb    = () => { hideLoading(); iframe.classList.add('hidden'); thumbL.classList.remove('hidden'); };
  const showFavLayer = () => { hideLoading(); iframe.classList.add('hidden'); thumbL.classList.add('hidden'); favL.classList.remove('hidden'); };

  const tryOgImage = async () => {
    try {
      const r    = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(link.url)}`, { signal: AbortSignal.timeout(7000) });
      const data = await r.json();
      const doc  = new DOMParser().parseFromString(data.contents||'','text/html');
      let img    = doc.querySelector('meta[property="og:image"]')?.content
                || doc.querySelector('meta[name="twitter:image"]')?.content;
      if (!img) {
        // Fallback: first jpg/jpeg image in page
        const imgs = [...doc.querySelectorAll('img[src]')];
        const jpg  = imgs.find(i => /\.(jpe?g)/i.test(i.getAttribute('src')));
        if (jpg) {
          let src = jpg.getAttribute('src');
          if (src && !src.startsWith('http')) src = new URL(src, link.url).href;
          img = src;
        }
      }
      if (img) {
        thumbI.src    = img;
        thumbI.onload = () => showThumb();
        thumbI.onerror= () => showFavLayer();
      } else {
        showFavLayer();
      }
    } catch { showFavLayer(); }
  };

  // Start with iframe
  showLoading();
  iframeTO = setTimeout(() => { if (!blocked) tryOgImage(); }, 5500);

  iframe.addEventListener('load', () => {
    clearTimeout(iframeTO);
    hideLoading();
    // Check if cross-origin blank (iframe loaded but no content)
    try { if (!iframe.contentDocument?.body?.innerHTML?.trim()) throw new Error('empty'); }
    catch { /* cross-origin — assume loaded */ }
  }, { once: true });

  iframe.addEventListener('error', () => {
    clearTimeout(iframeTO);
    blocked = true;
    iframe.classList.add('hidden');
    tryOgImage();
  }, { once: true });

  iframe.src = link.url;

  // Fallback open buttons
  overlay.querySelector('#pv-fb-open')?.addEventListener('click', () => window.open(link.url,'_blank','noopener'));
  overlay.querySelector('#pv-fb-incognito')?.addEventListener('click', () => window.open(link.url,'_blank','noopener'));
  overlay.querySelector('#pv-fav-open')?.addEventListener('click', () => window.open(link.url,'_blank','noopener'));

  // ── Resize ────────────────────────────────────────────
  const resizeHandle = overlay.querySelector('#pv-resize');
  const startResize  = (startY, startH, moveEv, upEv, getY) => {
    const onMove = ev => {
      const delta = startY - getY(ev);
      panel.style.height = Math.max(200, Math.min(window.innerHeight*0.92, startH+delta)) + 'px';
    };
    const onUp = () => {
      Storage.set('previewHeight', panel.getBoundingClientRect().height);
      window.removeEventListener(moveEv, onMove);
      window.removeEventListener(upEv,  onUp);
    };
    window.addEventListener(moveEv, onMove);
    window.addEventListener(upEv,  onUp);
  };
  resizeHandle?.addEventListener('mousedown', e => startResize(e.clientY, panel.offsetHeight, 'mousemove','mouseup', ev=>ev.clientY));
  resizeHandle?.addEventListener('touchstart', e => startResize(e.touches[0].clientY, panel.offsetHeight, 'touchmove','touchend', ev=>ev.touches[0].clientY), {passive:true});

  // ── Close ─────────────────────────────────────────────
  const close = () => {
    clearTimeout(iframeTO);
    iframe.src = '';
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 280);
  };
  overlay.querySelector('#pv-close').onclick = close;
  overlay.addEventListener('click', e => { if(e.target===overlay) close(); });

  // ── Fullscreen ────────────────────────────────────────
  let fs = false;
  overlay.querySelector('#pva-fs').onclick = () => {
    fs = !fs;
    panel.classList.toggle('pv-fullscreen', fs);
    overlay.querySelector('#pva-fs').innerHTML = fs
      ? '<i class="fa-solid fa-compress"></i><span>Exit</span>'
      : '<i class="fa-solid fa-expand"></i><span>Full</span>';
  };

  // ── Action buttons ────────────────────────────────────
  const updBtn = (id, active, icon, label, cls) => {
    const b = overlay.querySelector(id);
    if (!b) return;
    b.className = `pva${active?' '+cls:''}`;
    b.innerHTML = `<i class="fa-${active?'solid':'regular'} ${icon}"></i><span>${label}</span>`;
  };
  overlay.querySelector('#pva-star').onclick    = async () => { await toggleStar(folder.id,link); link.starred=!link.starred; updBtn('#pva-star',link.starred,'fa-star','Fav','pva-star'); };
  overlay.querySelector('#pva-like').onclick    = async () => { await toggleLike(folder.id,link); link.liked=!link.liked; if(link.liked)link.disliked=false; updBtn('#pva-like',link.liked,'fa-heart','Like','pva-like'); updBtn('#pva-dis',link.disliked,'fa-thumbs-down','Dislike','pva-dis'); };
  overlay.querySelector('#pva-dis').onclick     = async () => { await toggleDislike(folder.id,link); link.disliked=!link.disliked; if(link.disliked)link.liked=false; updBtn('#pva-dis',link.disliked,'fa-thumbs-down','Dislike','pva-dis'); updBtn('#pva-like',link.liked,'fa-heart','Like','pva-like'); };
  overlay.querySelector('#pva-copy').onclick    = async () => { await copyToClipboard(link.url); toast('Copied!','success'); };
  overlay.querySelector('#pva-open').onclick    = () => window.open(link.url,'_blank','noopener');
  overlay.querySelector('#pva-del').onclick     = async () => {
    const ok = await confirm('Delete Link',`Delete "${link.title||link.url}"?`,true);
    if (ok) { close(); deleteLink(folder.id, link); }
  };
}

// ══════════════════════════════════════════════════════════
// RECYCLE BIN
// ══════════════════════════════════════════════════════════
export function showRecycleBin() {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal mobile-full" style="max-width:520px;max-height:88vh">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-trash-can" style="color:var(--danger);margin-right:8px"></i>Recycle Bin</span>
        <button class="btn btn-ghost btn-icon rbc"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div id="rb-list" style="flex:1;overflow-y:auto;min-height:100px">
        <div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i>Loading…
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger btn-sm" id="rb-empty"><i class="fa-solid fa-trash"></i> Empty Bin</button>
        <button class="btn btn-secondary btn-sm rbc">Close</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  const close = () => bd.remove();
  bd.querySelectorAll('.rbc').forEach(b=>b.onclick=close);
  bd.addEventListener('click', e=>{ if(e.target===bd)close(); });

  // Load from Firebase
  import('./firebase-init.js').then(({db:fdb,ref:fref,onValue:fov,remove:frem,get:fget,set:fset}) => {
    const rbPath = `users/${uid()}/recycleBin`;
    fov(fref(fdb, rbPath), snap => {
      const list = document.getElementById('rb-list');
      if (!list) return;
      if (!snap.exists()) {
        list.innerHTML = `<div class="empty-state" style="padding:40px 20px"><div class="empty-state-icon"><i class="fa-solid fa-trash-can"></i></div><h3>Recycle bin is empty</h3><p>Deleted items appear here for 30 days</p></div>`;
        return;
      }
      const items = Object.values(snap.val()).sort((a,b)=>b.deletedAt-a.deletedAt);
      list.innerHTML = items.map(item=>`
        <div style="display:flex;align-items:center;gap:var(--sp-3);padding:12px var(--sp-4);border-bottom:1px solid var(--border);transition:background .1s" class="rb-row">
          <div style="width:36px;height:36px;border-radius:var(--r-sm);background:var(--surface-2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fa-solid ${item.type==='folder'?'fa-folder':'fa-link'}" style="color:var(--${item.type==='folder'?'warning':'primary'})"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.data?.name||item.data?.title||item.data?.url||'Unknown')}</div>
            <div style="font-size:var(--fs-xs);color:var(--text-subtle)">Deleted ${timeAgo(item.deletedAt)} · ${Math.max(0,Math.ceil((item.expireAt-Date.now())/86400000))}d left</div>
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="btn btn-ghost btn-sm rb-restore" data-rbid="${item.id}" data-type="${item.type}" title="Restore"><i class="fa-solid fa-rotate-left"></i></button>
            <button class="btn btn-ghost btn-sm rb-del" data-rbid="${item.id}" style="color:var(--danger)" title="Delete permanently"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>`).join('');

      // Hover
      list.querySelectorAll('.rb-row').forEach(r=>{ r.addEventListener('mouseover',()=>r.style.background='var(--surface-hover)'); r.addEventListener('mouseout',()=>r.style.background=''); });

      // Restore
      list.querySelectorAll('.rb-restore').forEach(btn=>btn.addEventListener('click',async()=>{
        const id=btn.dataset.rbid, type=btn.dataset.type;
        if(type==='folder'){
          const{restoreFolder}=await import('./folders.js');await restoreFolder(id);
        } else {
          const sn=await fget(fref(fdb,`${rbPath}/${id}`));
          if(sn.exists()){const{originalFid,originalLid,data}=sn.val();await fset(fref(fdb,`users/${uid()}/folders/${originalFid}/links/${originalLid}`),data);await frem(fref(fdb,`${rbPath}/${id}`));toast('Link restored','success');}
        }
      }));

      // Perm delete
      list.querySelectorAll('.rb-del').forEach(btn=>btn.addEventListener('click',async()=>{
        const ok=await confirm('Delete Permanently','This cannot be undone.',true);
        if(ok){await frem(fref(fdb,`${rbPath}/${btn.dataset.rbid}`));toast('Permanently deleted','info');}
      }));
    }, {onlyOnce:true});

    // Empty bin
    document.getElementById('rb-empty')?.addEventListener('click',async()=>{
      const ok=await confirm('Empty Recycle Bin','Permanently delete all items?',true);
      if(!ok)return;
      await frem(fref(fdb,`users/${uid()}/recycleBin`));
      toast('Recycle bin emptied','info');
    });
  });
}

// ── helpers ───────────────────────────────────────────────
function _hexRgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return`rgba(${r},${g},${b},${a})`;}
