// ============================================================
// Linkivo — folders.js  v1.4.5
// Folder CRUD, PIN session, blur locked content, tags
// ============================================================

import { db, ref, set, get, update, remove, onValue, serverTimestamp } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, genId, confirm, showDropdown, pinDialog, Storage, escapeHtml } from './utils.js';

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
    color:   opts.color   || _rndColor(),
    icon:    opts.icon    || 'fa-solid fa-folder',
    iconUrl: opts.iconUrl || null,
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
  toast('Folder locked <i class="fa-solid fa-lock"></i>', 'success');
}

export async function verifyAndUnlockFolder(folder) {
  if (_unlocked.has(folder.id)) return true;
  const entered = await pinDialog('Unlock Folder', `Enter PIN for "${folder.name}"`);
  if (!entered) return false;
  if (entered !== folder.pin) { toast('Wrong PIN ❌', 'error'); return false; }
  unlockFolderSession(folder.id);
  return true;
}

export async function removeFolderLock(fid) {
  const snap = await get(fRef(fid));
  if (!snap.exists()) return;
  const ok = await verifyAndUnlockFolder(snap.val());
  if (!ok) return;
  await update(fRef(fid), { locked: false, pin: null, updatedAt: Date.now() });
  toast('Folder unlocked 🔓', 'success');
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
// HOME PAGE
// ══════════════════════════════════════════════════════════

let _foldersUnsub = null;

export function initHomePage() {
  const grid      = document.getElementById('folder-grid');
  const createBtn = document.getElementById('create-folder-btn');
  if (!grid) return;

  // Inject search bar above grid
  _ensureFolderSearchBar(grid);

  let _allFolders = [];
  let _searchQ    = '';

  // Real-time subscription
  if (_foldersUnsub) _foldersUnsub();
  onValue(allRef(), snap => {
    _allFolders = snap.exists() ? _sort(Object.values(snap.val())) : [];
    _applySearch();
  });

  function _applySearch() {
    const q = _searchQ.toLowerCase().trim();
    const filtered = q
      ? _allFolders.filter(f =>
          f.name?.toLowerCase().includes(q) ||
          f.description?.toLowerCase().includes(q) ||
          f.tags?.some(t => t.toLowerCase().includes(q))
        )
      : _allFolders;
    _renderGrid(filtered, grid);
  }

  // Listen to search input
  document.getElementById('folder-search-input')?.addEventListener('input', e => {
    _searchQ = e.target.value;
    _applySearch();
  });

  createBtn?.addEventListener('click', () => _showCreateFolderDialog());

  // Import button inside empty state
  document.addEventListener('click', e => {
    if (e.target.closest('#home-import-empty')) _triggerImport();
  });
}

function _ensureFolderSearchBar(grid) {
  if (document.getElementById('folder-search-bar')) return;
  const bar = document.createElement('div');
  bar.id = 'folder-search-bar';
  bar.className = 'folder-search-bar';
  bar.innerHTML = `
    <div class="folder-search-input-wrap">
      <i class="fa-solid fa-magnifying-glass"></i>
      <input type="text" id="folder-search-input" placeholder="Search folders…"
        data-search="folders" autocomplete="off">
    </div>`;
  grid.parentElement?.insertBefore(bar, grid);
}

async function _showCreateFolderDialog() {
  // Dedup guard
  if (document.getElementById('create-folder-backdrop')) return;

  const bd = document.createElement('div');
  bd.id = 'create-folder-backdrop';
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-folder-plus"></i> New Folder</span>
        <button class="btn btn-ghost btn-icon modal-close-x"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
        <input type="text" id="cf-name" class="form-input" placeholder="Folder name…" maxlength="60" autofocus>
        <textarea id="cf-desc" class="form-input" placeholder="Description (optional)…" rows="2"
          style="resize:vertical;font-size:var(--fs-sm)" maxlength="200"></textarea>

        <!-- Icon picker row -->
        <div>
          <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:6px;font-weight:600">ICON</div>
          <div class="cf-icon-grid" id="cf-icon-grid">
            ${[
              'fa-solid fa-folder','fa-solid fa-bookmark','fa-solid fa-star',
              'fa-solid fa-gamepad','fa-solid fa-briefcase','fa-solid fa-music',
              'fa-solid fa-book','fa-solid fa-palette','fa-solid fa-flask',
              'fa-solid fa-house','fa-solid fa-plane','fa-solid fa-globe'
            ].map(ic => `<button class="cf-icon-btn" data-icon="${ic}" title="${ic.split(' ').pop()}">
              <i class="${ic}"></i>
            </button>`).join('')}
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:8px">
            <button class="btn btn-secondary btn-sm" id="cf-upload-icon-btn">
              <i class="fa-solid fa-image"></i> Upload image
            </button>
            <input type="file" id="cf-upload-icon-input" accept="image/*"
              style="display:none">
            <span id="cf-upload-status" style="font-size:11px;color:var(--text-muted)"></span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm modal-close-x">Cancel</button>
        <button class="btn btn-primary btn-sm" id="cf-create-btn">Create Folder</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  window.Router?.pushModalState?.();

  const $ = id => bd.querySelector('#' + id);
  let _selIcon = 'fa-solid fa-folder';
  let _iconUrl = null;

  // Select first icon by default
  bd.querySelectorAll('.cf-icon-btn').forEach(b => {
    b.addEventListener('click', () => {
      bd.querySelectorAll('.cf-icon-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      _selIcon = b.dataset.icon;
      _iconUrl = null; // clear uploaded icon
      $('cf-upload-status').textContent = '';
    });
  });
  bd.querySelector('.cf-icon-btn')?.classList.add('active');

  // Upload image icon
  $('cf-upload-icon-btn')?.addEventListener('click', () => $('cf-upload-icon-input')?.click());
  $('cf-upload-icon-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const statusEl = $('cf-upload-status');
    statusEl.textContent = 'Uploading…';
    try {
      const url = await _uploadIcon(file, 'new_folder');
      if (url) {
        _iconUrl = url;
        statusEl.textContent = 'Image uploaded!';
        bd.querySelectorAll('.cf-icon-btn').forEach(x => x.classList.remove('active'));
      } else {
        statusEl.textContent = 'Upload failed';
      }
    } catch { statusEl.textContent = 'Upload failed'; }
  });

  const close = () => { bd.remove(); };
  bd.querySelectorAll('.modal-close-x').forEach(b => b.addEventListener('click', close));
  bd.addEventListener('click', e => { if (e.target === bd) close(); });

  $('cf-name')?.focus();

  $('cf-create-btn')?.addEventListener('click', async () => {
    const name = $('cf-name')?.value.trim();
    const desc = $('cf-desc')?.value.trim();
    if (!name) { $('cf-name')?.focus(); return; }

    $('cf-create-btn').disabled = true;
    $('cf-create-btn').textContent = 'Creating…';

    const f = await createFolder(name, { description: desc, icon: _selIcon, iconUrl: _iconUrl });
    if (f) {
      close(); // auto-close
      toast(`"${f.name}" created`, 'success');
    } else {
      $('cf-create-btn').disabled = false;
      $('cf-create-btn').textContent = 'Create Folder';
    }
  });

  // Enter key
  $('cf-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('cf-create-btn')?.click();
  });
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
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:var(--sp-12) var(--sp-5)">
        <div class="empty-state-icon"><i class="fa-solid fa-folder-open"></i></div>
        <h3>No folders yet</h3>
        <p>Create a folder to start saving links, or import from a file</p>
        <button class="btn btn-primary" id="home-import-empty">
          <i class="fa-solid fa-file-import"></i> Import Links
        </button>
      </div>`;
    return;
  }
  grid.innerHTML = '';
  folders.forEach(f => grid.appendChild(_mkCard(f)));
}

function _mkCard(folder) {
  const card = document.createElement('div');
  const isLocked = folder.locked && !_unlocked.has(folder.id);
  card.className = `folder-card${folder.pinned?' pinned':''}${isLocked?' folder-card-locked':''}`;
  card.dataset.fid = folder.id;
  card.style.setProperty('--card-accent', folder.color || 'var(--primary)');

  const iconBg = _hexRgba(folder.color||'#3b82f6', 0.14);
  const cnt    = folder.linkCount || 0;

  // Icon HTML: custom image → FA icon
  const iconHtml = folder.iconUrl
    ? `<img src="${escapeHtml(folder.iconUrl)}" width="22" height="22" style="border-radius:4px;object-fit:cover">`
    : `<i class="${isLocked ? 'fa-solid fa-lock' : (folder.icon||'fa-solid fa-folder')}"></i>`;

  if (isLocked) {
    // SECURE: no real content in DOM for locked folders
    card.innerHTML = `
      <div class="folder-card-top">
        <div class="folder-card-icon" style="background:${iconBg};color:${folder.color||'var(--primary)'}">
          <i class="fa-solid fa-lock"></i>
        </div>
        <button class="folder-card-menu btn btn-ghost btn-icon" title="Options" aria-label="Options">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </div>
      <div class="folder-card-body">
        <div class="folder-card-name">${escapeHtml(folder.name)}</div>
        <div class="folder-locked-hint">
          <i class="fa-solid fa-lock"></i> PIN required · tap to unlock
        </div>
      </div>`;
  } else {
    const desc = folder.description
      ? `<div class="folder-card-desc" title="${escapeHtml(folder.description)}">${escapeHtml(folder.description)}</div>`
      : '';
    const tags = folder.tags?.length
      ? `<div class="folder-tags">${folder.tags.slice(0,3).map(t=>`<span class="folder-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    card.innerHTML = `
      <div class="folder-card-top">
        <div class="folder-card-icon" style="background:${iconBg};color:${folder.color||'var(--primary)'}">
          ${iconHtml}
        </div>
        <div class="folder-card-actions">
          <button class="folder-random-btn btn btn-ghost btn-icon" title="Random link from this folder" aria-label="Random">
            <i class="fa-solid fa-shuffle"></i>
          </button>
          <button class="folder-card-menu btn btn-ghost btn-icon" title="Options" aria-label="Options">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>
      <div class="folder-card-body">
        <div class="folder-card-name" title="${escapeHtml(folder.name)}">
          ${escapeHtml(folder.name)}
          ${folder.pinned?'<i class="fa-solid fa-thumbtack folder-pin-icon"></i>':''}
        </div>
        ${desc}
        <div class="folder-card-meta">
          <span>${cnt} link${cnt!==1?'s':''}</span>
          <span>${_ago(folder.updatedAt)}</span>
        </div>
        ${tags}
      </div>`;
  }

  // Click → open folder (or PIN unlock)
  card.addEventListener('click', e => {
    if (e.target.closest('.folder-card-menu')) return;
    if (e.target.closest('.folder-random-btn')) return;
    _openFolder(folder);
  });

  // 3-dot menu
  card.querySelector('.folder-card-menu')?.addEventListener('click', e => {
    e.stopPropagation();
    _cardMenu(e.currentTarget, folder);
  });

  // Random button → random page with this folder pre-selected
  card.querySelector('.folder-random-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    window.Router?.go?.('random', { preselectedFolderId: folder.id, autoOpen: true });
  });

  return card;
}

function _cardMenu(anchor, folder) {
  const isLocked = folder.locked && !_unlocked.has(folder.id);
  showDropdown(anchor, [
    { label: folder.pinned?'Unpin':'Pin to top', icon:'fa-solid fa-thumbtack', action:()=>toggleFolderPin(folder.id,folder.pinned) },
    { label: 'Rename', icon:'fa-solid fa-pencil',
      action: async () => {
        const { prompt: uiP } = await import('./utils.js');
        const n = await uiP('Rename Folder','Folder name…',folder.name);
        if (n) renameFolder(folder.id, n);
      }},
    { label: 'Edit description', icon:'fa-solid fa-align-left',
      action: async () => {
        const { prompt: uiP } = await import('./utils.js');
        const d = await uiP('Description','Short description…',folder.description||'');
        if (d !== null) await update(fRef(folder.id), { description: d, updatedAt: Date.now() });
      }},
    { label: 'Change icon', icon:'fa-solid fa-icons',
      action: () => _showIconPicker(folder) },
    { label: isLocked?'Remove Lock':'Lock with PIN', icon:`fa-solid fa-${isLocked?'lock-open':'lock'}`,
      action: () => isLocked ? removeFolderLock(folder.id) : setFolderLock(folder.id) },
    'divider',
    { label:'Open in Random Discover', icon:'fa-solid fa-shuffle',
      action: () => {
        // Navigate to random page with this folder pre-selected
        document.dispatchEvent(new CustomEvent('linkivo:openRandomWithFolder', { detail: { folderId: folder.id } }));
        window.Router?.go?.('random');
      }},
    { label:'Import to folder', icon:'fa-solid fa-file-import', action: _triggerImport },
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
