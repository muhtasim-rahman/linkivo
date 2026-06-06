// ============================================================
// Linkivo — folders.js  v1.4.5
// Folder CRUD, PIN session, blur locked content, tags
// ============================================================

import { db, ref, set, get, update, remove, onValue, serverTimestamp } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, genId, confirm, showDropdown, pinDialog, Storage, escapeHtml, uploadToImgbb, compressImage } from './utils.js';

const uid    = () => getCurrentUser()?.uid;
const fRef   = fid => ref(db, `users/${uid()}/folders/${fid}`);
const rbRef  = id  => ref(db, `users/${uid()}/recycleBin/${id}`);
const allRef = ()  => ref(db, `users/${uid()}/folders`);

// ── PIN session — unlocked for entire page session ────────
const _unlocked = new Set();
export const isFolderUnlocked    = fid  => _unlocked.has(fid);
export const unlockFolderSession = fid  => _unlocked.add(fid);
export const lockFolderSession   = fid  => _unlocked.delete(fid);

// ══════════════════════════════════════════════════════════
// FOLDER CRUD
// ══════════════════════════════════════════════════════════

export async function createFolder(name, opts = {}) {
  if (!name?.trim()) return null;
  const id   = genId('f_');
  const data = {
    id, name: name.trim(),
    description: opts.description || '',
    tags:        opts.tags || [],
    createdAt:   Date.now(), updatedAt: Date.now(),
    pinned: false, locked: false, pin: null,
    linkCount: 0,
    color: opts.color || _rndColor(),
    icon:  opts.icon  || 'fa-folder',
  };
  await set(fRef(id), data);
  return data;
}

export async function renameFolder(fid, newName) {
  if (!newName?.trim()) return;
  await update(fRef(fid), { name: newName.trim(), updatedAt: Date.now() });
  // Sync history entries
  try {
    const snap = await get(ref(db, `users/${uid()}/history`));
    if (!snap.exists()) return;
    for (const [key, val] of Object.entries(snap.val())) {
      if (val.folderId === fid) {
        await update(ref(db, `users/${uid()}/history/${key}`), { folderName: newName.trim() });
      }
    }
  } catch {}
}

export async function deleteFolder(fid) {
  const snap = await get(fRef(fid));
  if (!snap.exists()) return;
  const data = snap.val();
  await set(rbRef(genId('rb_')), { id: genId(), type: 'folder', originalId: fid, data, deletedAt: Date.now(), expireAt: Date.now()+30*24*60*60*1000 });
  await remove(fRef(fid));
  _unlocked.delete(fid);
  toast(`"${data.name}" moved to Recycle Bin`, 'success');
}

export async function restoreFolder(rbId) {
  const snap = await get(rbRef(rbId));
  if (!snap.exists()) return;
  const { data, originalId } = snap.val();
  await set(fRef(originalId), data);
  await remove(rbRef(rbId));
  toast(`"${data.name}" restored`, 'success');
}

export async function toggleFolderPin(fid, pinned) {
  await update(fRef(fid), { pinned: !pinned, updatedAt: Date.now() });
}

// ── Lock / Unlock ─────────────────────────────────────────
export async function setFolderLock(fid) {
  const pin1 = await pinDialog('Set Folder PIN', 'Choose a 6-digit PIN for this folder');
  if (!pin1) return;
  const pin2 = await pinDialog('Confirm PIN', 'Re-enter the PIN to confirm');
  if (!pin2) return;
  if (pin1 !== pin2) { toast('PINs do not match', 'error'); return; }
  await update(fRef(fid), { locked: true, pin: pin1, updatedAt: Date.now() });
  lockFolderSession(fid);
  toast('Folder locked', 'success');
}

export async function verifyAndUnlockFolder(folder) {
  if (_unlocked.has(folder.id)) return true;
  const entered = await pinDialog('Unlock Folder', `Enter PIN for "${folder.name}"`);
  if (!entered) return false;
  if (entered !== folder.pin) { toast('Wrong PIN', 'error'); return false; }
  unlockFolderSession(folder.id);
  return true;
}

export async function removeFolderLock(fid) {
  const snap = await get(fRef(fid));
  if (!snap.exists()) return;
  const ok = await verifyAndUnlockFolder(snap.val());
  if (!ok) return;
  await update(fRef(fid), { locked: false, pin: null, updatedAt: Date.now() });
  toast('Folder unlocked', 'success');
}

// ── Link count ────────────────────────────────────────────
export async function incrementLinkCount(fid, delta = 1) {
  const snap = await get(ref(db, `users/${uid()}/folders/${fid}/linkCount`));
  const cur  = snap.val() || 0;
  await set(ref(db, `users/${uid()}/folders/${fid}/linkCount`), Math.max(0, cur + delta));
  await set(ref(db, `users/${uid()}/folders/${fid}/updatedAt`), Date.now());
}

// ── Save links with progress ──────────────────────────────
export async function saveLinksToFolder(fid, links, { onProgress } = {}) {
  const lref   = ref(db, `users/${uid()}/folders/${fid}/links`);
  const snap   = await get(lref);
  const exist  = snap.val() || {};
  const existUrls = new Set(Object.values(exist).map(l => l.url));
  const toAdd  = links.filter(l => !existUrls.has(l.url));

  let added = 0;
  for (let i = 0; i < toAdd.length; i++) {
    const lid = genId('l_');
    await set(ref(db, `users/${uid()}/folders/${fid}/links/${lid}`), { ...toAdd[i], id: lid });
    added++;
    onProgress?.(i + 1, toAdd.length);
  }
  const total = Object.keys(exist).length + added;
  await update(fRef(fid), { linkCount: total, updatedAt: Date.now() });
  return added;
}

export async function getFolders() {
  const snap = await get(allRef());
  return snap.exists() ? Object.values(snap.val()) : [];
}

export function subscribeFolders(cb) {
  onValue(allRef(), snap => cb(snap.exists() ? _sort(Object.values(snap.val())) : []));
}

export function sortFolders(folders) { return _sort(folders); }

function _sort(f) {
  return [...f].sort((a,b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    return (b.updatedAt||0) - (a.updatedAt||0);
  });
}

function _rndColor() {
  return ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#06b6d4','#f97316','#6366f1','#14b8a6'][Math.floor(Math.random()*10)];
}

// ══════════════════════════════════════════════════════════
// HOME PAGE  — search/filter bar, redesigned cards, auto-close
// ══════════════════════════════════════════════════════════

let _foldersUnsub = null;
let _homeFilter   = '';
let _homeSort     = 'updatedAt'; // updatedAt | name | linkCount
let _allFolders   = [];

export function initHomePage() {
  const page = document.getElementById('page-home');
  if (!page) return;
  _ensureHomeToolbar(page);
  if (_foldersUnsub) _foldersUnsub();
  _foldersUnsub = onValue(allRef(), snap => {
    _allFolders = snap.exists() ? Object.values(snap.val()) : [];
    _renderFiltered();
  });
  const createBtn = document.getElementById('create-folder-btn');
  if (createBtn && !createBtn._bound) {
    createBtn._bound = true;
    createBtn.addEventListener('click', _showCreateFolderModal);
  }
  document.addEventListener('click', e => {
    if (e.target.closest('#home-import-empty')) _triggerImport();
  });
}

function _ensureHomeToolbar(page) {
  if (page.querySelector('#home-toolbar')) return;
  const tb = document.createElement('div');
  tb.id = 'home-toolbar';
  tb.innerHTML = `
    <div class="home-toolbar">
      <div class="home-search-wrap">
        <i class="fa-solid fa-magnifying-glass home-search-icon"></i>
        <input id="home-search" class="home-search-input" type="search"
          placeholder="Search folders…" autocomplete="off">
        <button id="home-search-clear" class="home-search-clear hidden">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <select id="home-sort" class="home-sort-select">
        <option value="updatedAt">Recent</option>
        <option value="name">Name A–Z</option>
        <option value="linkCount">Most links</option>
      </select>
    </div>`;
  const stats = page.querySelector('.folder-stats');
  if (stats) stats.after(tb); else page.querySelector('#folder-grid')?.before(tb);
  const inp   = tb.querySelector('#home-search');
  const clear = tb.querySelector('#home-search-clear');
  const sort  = tb.querySelector('#home-sort');
  if (inp.value !== _homeFilter) inp.value = _homeFilter;
  sort.value = _homeSort;
  inp.addEventListener('input', e => {
    _homeFilter = e.target.value.toLowerCase();
    clear.classList.toggle('hidden', !_homeFilter);
    _renderFiltered();
  });
  clear.addEventListener('click', () => {
    inp.value = ''; _homeFilter = '';
    clear.classList.add('hidden'); _renderFiltered();
  });
  sort.addEventListener('change', e => { _homeSort = e.target.value; _renderFiltered(); });
}

function _renderFiltered() {
  const grid = document.getElementById('folder-grid');
  if (!grid) return;
  let folders = [..._allFolders];
  if (_homeFilter) {
    folders = folders.filter(f =>
      f.name.toLowerCase().includes(_homeFilter) ||
      (f.description||'').toLowerCase().includes(_homeFilter)
    );
  }
  folders.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    if (_homeSort === 'name')      return a.name.localeCompare(b.name);
    if (_homeSort === 'linkCount') return (b.linkCount||0) - (a.linkCount||0);
    return (b.updatedAt||0) - (a.updatedAt||0);
  });
  _renderGrid(folders, grid);
}

async function _showCreateFolderModal() {
  const btn      = document.getElementById('create-folder-btn');
  const origHTML = btn?.innerHTML;
  const { prompt: uiPrompt } = await import('./utils.js');
  const name = await uiPrompt('New Folder', 'Folder name…', '');
  if (!name?.trim()) return;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; }
  try {
    const f = await createFolder(name.trim());
    if (f) toast(`"${f.name}" created`, 'success');
  } catch { toast('Failed to create folder', 'error'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = origHTML || '<i class="fa-solid fa-folder-plus"></i><span class="btn-text"> New Folder</span>'; } }
}

async function _triggerImport() {
  const { showImportModal } = await import('./import.js');
  const folders = await getFolders();
  showImportModal(folders, async (links, fTarget, isNew, opts) => {
    let fid = fTarget;
    if (isNew) { const nf = await createFolder(fTarget); fid = nf?.id; }
    if (!fid) return;
    const added = await saveLinksToFolder(fid, links, opts);
    toast(`${added} link${added!==1?'s':''} saved!`, 'success');
  });
}

function _renderGrid(folders, grid) {
  if (!folders.length) {
    const noFolders = !_homeFilter && !_allFolders.length;
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:var(--sp-12) var(--sp-5)">
        <div class="empty-state-icon"><i class="fa-solid fa-${_homeFilter?'magnifying-glass':'folder-open'}"></i></div>
        <h3>${_homeFilter ? 'No folders match' : 'No folders yet'}</h3>
        <p>${_homeFilter ? `No results for &ldquo;${escapeHtml(_homeFilter)}&rdquo;` : 'Create a folder or import from a file'}</p>
        ${noFolders ? '<button class="btn btn-primary" id="home-import-empty"><i class="fa-solid fa-file-import"></i> Import Links</button>' : ''}
      </div>`;
    return;
  }
  grid.innerHTML = '';
  folders.forEach(f => grid.appendChild(_mkCard(f)));
}

function _mkCard(folder) {
  const card     = document.createElement('div');
  const isLocked = folder.locked && !_unlocked.has(folder.id);
  const cnt      = folder.linkCount || 0;
  const color    = folder.color || '#3b82f6';
  const iconBg   = _hexRgba(color, 0.12);
  card.className = `folder-card${folder.pinned?' pinned':''}${isLocked?' locked':''}`;
  card.dataset.fid = folder.id;
  card.style.setProperty('--fc-color', color);

  if (isLocked) {
    card.innerHTML = `
      <div class="folder-card-accent"></div>
      <div class="folder-card-top">
        <div class="folder-card-icon" style="background:${iconBg};color:${color}">
          <i class="fa-solid fa-lock"></i>
        </div>
        <button class="folder-card-menu btn btn-ghost btn-icon" title="Options">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </div>
      <div class="folder-card-body">
        <div class="folder-card-name">${escapeHtml(folder.name)}</div>
        <div class="folder-card-locked-badge"><i class="fa-solid fa-lock"></i> Locked</div>
      </div>`;
  } else {
    const desc = folder.description || '';
    const icon = folder.iconUrl
      ? `<img src="${folder.iconUrl}" alt="" style="width:22px;height:22px;border-radius:4px;object-fit:cover">`
      : `<i class="${folder.icon||'fa-solid fa-folder'}"></i>`;
    card.innerHTML = `
      <div class="folder-card-accent"></div>
      <div class="folder-card-top">
        <div class="folder-card-icon" style="background:${iconBg};color:${color}">${icon}</div>
        ${folder.pinned?'<div class="folder-pin-badge" title="Pinned"><i class="fa-solid fa-thumbtack"></i></div>':''}
        <button class="folder-card-menu btn btn-ghost btn-icon" title="Options">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </div>
      <div class="folder-card-body">
        <div class="folder-card-name" title="${escapeHtml(folder.name)}">${escapeHtml(folder.name)}</div>
        ${desc ? `<div class="folder-card-desc">${escapeHtml(desc)}</div>` : '<div class="folder-card-desc folder-card-desc--empty"></div>'}
        <div class="folder-card-meta">
          <span><i class="fa-solid fa-link" style="font-size:9px;margin-right:3px;opacity:.6"></i>${cnt}</span>
          <span>${_ago(folder.updatedAt)}</span>
        </div>
      </div>
      <button class="fqa-random" title="Random discover this folder" data-fid="${folder.id}">
        <i class="fa-solid fa-shuffle"></i>
      </button>`;
  }

  card.addEventListener('click', e => {
    if (e.target.closest('.folder-card-menu,.fqa-random')) return;
    _openFolder(folder);
  });
  card.querySelector('.folder-card-menu')?.addEventListener('click', e => {
    e.stopPropagation(); _cardMenu(e.currentTarget, folder);
  });
  card.querySelector('.fqa-random')?.addEventListener('click', e => {
    e.stopPropagation();
    document.dispatchEvent(new CustomEvent('linkivo:openRandomWithFolder', { detail: { folderId: folder.id } }));
    window.Router?.go?.('random');
  });
  return card;
}

function _cardMenu(anchor, folder) {
  const isLocked = folder.locked && !_unlocked.has(folder.id);
  showDropdown(anchor, [
    { label: folder.pinned?'Unpin':'Pin to top', icon:'fa-solid fa-thumbtack', action:()=>toggleFolderPin(folder.id,folder.pinned) },
    { label:'Change icon', icon:'fa-solid fa-icons',
      action:()=>_showIconPicker(folder) },
    { label:'Rename',         icon:'fa-solid fa-pencil',
      action: async () => {
        const {prompt:uiP} = await import('./utils.js');
        const n = await uiP('Rename Folder','Folder name…',folder.name);
        if (n?.trim()) renameFolder(folder.id, n.trim());
      }},
    { label:'Edit description', icon:'fa-solid fa-align-left',
      action: async () => {
        const {prompt:uiP} = await import('./utils.js');
        const d = await uiP('Description','Short description…',folder.description||'');
        if (d !== null) await update(fRef(folder.id), { description:d, updatedAt:Date.now() });
      }},
    { label: isLocked?'Remove Lock':'Lock with PIN', icon:`fa-solid fa-${isLocked?'lock-open':'lock'}`,
      action:()=> isLocked ? removeFolderLock(folder.id) : setFolderLock(folder.id) },
    'divider',
    { label:'Open in Random Discover', icon:'fa-solid fa-shuffle',
      action:()=>{
        document.dispatchEvent(new CustomEvent('linkivo:openRandomWithFolder',{detail:{folderId:folder.id}}));
        window.Router?.go?.('random');
      }},
    { label:'Import to folder', icon:'fa-solid fa-file-import', action:_triggerImport },
    'divider',
    { label:'Delete', icon:'fa-solid fa-trash', danger:true,
      action: async () => {
        const ok = await confirm('Delete Folder',`Move "${folder.name}" to recycle bin?`,true);
        if (ok) deleteFolder(folder.id);
      }},
  ], { align:'right' });
}

async function _openFolder(folder) {
  if (folder.locked && !_unlocked.has(folder.id)) {
    const ok = await verifyAndUnlockFolder(folder);
    if (!ok) return;
  }
  window.Router?.go?.('folder', { folder });
  document.dispatchEvent(new CustomEvent('linkivo:openFolder', { detail: { folder } }));
}

// ── Icon picker ───────────────────────────────────────────
const PRESET_ICONS = [
  'fa-folder','fa-link','fa-star','fa-heart','fa-bookmark',
  'fa-code','fa-book','fa-music','fa-film','fa-gamepad',
  'fa-briefcase','fa-globe','fa-graduation-cap','fa-flask',
  'fa-plane','fa-cart-shopping','fa-camera','fa-palette',
];

async function _showIconPicker(folder) {
  // Build picker UI
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:340px">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-icons"></i> Choose Icon</span>
        <button class="btn btn-ghost btn-icon ip-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="padding:var(--sp-3)">
        <div class="ip-grid" id="ip-grid">
          ${PRESET_ICONS.map(ic => `
            <button class="ip-icon-btn${folder.icon===ic&&!folder.iconUrl?' ip-sel':''}" data-icon="${ic}" title="${ic}">
              <i class="${ic} fa-solid"></i>
            </button>`).join('')}
        </div>
        <div style="border-top:1px solid var(--border);margin:var(--sp-3) 0;padding-top:var(--sp-3)">
          <div style="font-size:var(--fs-xs);font-weight:700;color:var(--text-muted);margin-bottom:var(--sp-2);text-transform:uppercase;letter-spacing:.5px">
            Upload custom image
          </div>
          <label class="btn btn-secondary btn-sm" style="cursor:pointer;display:inline-flex;gap:6px;align-items:center">
            <i class="fa-solid fa-upload"></i> Choose image
            <input type="file" id="ip-file-input" accept="image/*" style="display:none">
          </label>
          ${folder.iconUrl ? `
            <button class="btn btn-ghost btn-sm" id="ip-remove-custom" style="color:var(--danger);margin-left:8px">
              <i class="fa-solid fa-trash"></i> Remove
            </button>` : ''}
        </div>
        <div id="ip-upload-status" style="font-size:var(--fs-xs);color:var(--text-muted);min-height:16px"></div>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelector('.ip-close').onclick = close;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  // Preset icon selection
  backdrop.querySelectorAll('.ip-icon-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      backdrop.querySelectorAll('.ip-icon-btn').forEach(b => b.classList.remove('ip-sel'));
      btn.classList.add('ip-sel');
      await update(fRef(folder.id), { icon: btn.dataset.icon, iconUrl: null, updatedAt: Date.now() });
      toast('Icon updated', 'success');
      close();
    });
  });

  // File upload
  backdrop.querySelector('#ip-file-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const status = backdrop.querySelector('#ip-upload-status');
    status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Compressing…';
    try {
      const compressed = await compressImage(file, { maxDim: 128, quality: 0.85 });
      status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading…';
      const uid = getCurrentUser()?.uid;
      const name = `linkivo-${uid}-folder-${folder.id}-${Date.now()}`;
      const url  = await uploadToImgbb(compressed, name);
      await update(fRef(folder.id), { iconUrl: url, icon: 'fa-folder', updatedAt: Date.now() });
      toast('Custom icon saved!', 'success');
      close();
    } catch (err) {
      status.innerHTML = `<span style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Upload failed</span>`;
      console.error('[IconPicker] Upload error:', err);
    }
  });

  // Remove custom icon
  backdrop.querySelector('#ip-remove-custom')?.addEventListener('click', async () => {
    await update(fRef(folder.id), { iconUrl: null, updatedAt: Date.now() });
    toast('Custom icon removed', 'info');
    close();
  });
}

// ── Helpers ───────────────────────────────────────────────
function _hexRgba(hex, a) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function _ago(ts) {
  if (!ts) return '';
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m`;
  if(s<86400)return`${Math.floor(s/3600)}h`;return`${Math.floor(s/86400)}d`;
}
