// ============================================================
// Linkivo — folders.js  v1.4.4
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
  toast('Folder locked 🔒', 'success');
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

  // Real-time subscription
  if (_foldersUnsub) _foldersUnsub();
  onValue(allRef(), snap => {
    const folders = snap.exists() ? _sort(Object.values(snap.val())) : [];
    _renderGrid(folders, grid);
  });

  createBtn?.addEventListener('click', async () => {
    const { prompt: uiPrompt } = await import('./utils.js');
    const name = await uiPrompt('New Folder', 'Enter a folder name…', '');
    if (!name?.trim()) return;
    const f = await createFolder(name);
    if (f) toast(`Folder "${f.name}" created`, 'success');
  });

  // Import button inside empty state
  document.addEventListener('click', e => {
    if (e.target.closest('#home-import-empty')) _triggerImport();
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
  card.className = `folder-card${folder.pinned?' pinned':''}`;
  card.dataset.fid = folder.id;

  const isLocked = folder.locked && !_unlocked.has(folder.id);
  const iconBg   = _hexRgba(folder.color||'#3b82f6', 0.12);
  const cnt      = folder.linkCount || 0;

  if (isLocked) {
    // SECURE: don't put real content in DOM at all for locked folders.
    // Only show folder name (not sensitive), icon, and lock overlay.
    // Clicking the overlay triggers PIN prompt.
    card.innerHTML = `
      <div class="folder-card-top">
        <div class="folder-card-icon" style="background:${iconBg};color:${folder.color||'var(--primary)'}">
          <i class="fa-solid fa-lock"></i>
        </div>
        <button class="folder-card-menu btn btn-ghost btn-icon" title="Options">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </div>
      <div class="folder-card-body">
        <div class="folder-card-name">${escapeHtml(folder.name)}</div>
        <div class="folder-card-meta folder-locked-meta">
          <i class="fa-solid fa-lock" style="font-size:10px"></i>
          <span>Locked · tap to unlock</span>
        </div>
      </div>
      <div class="folder-locked-bar folder-locked-overlay">
        <i class="fa-solid fa-lock"></i> PIN required · tap to unlock
      </div>`;
  } else {
    card.innerHTML = `
      <div class="folder-card-top">
        <div class="folder-card-icon" style="background:${iconBg};color:${folder.color||'var(--primary)'}">
          <i class="${folder.icon||'fa-solid fa-folder'}"></i>
        </div>
        <button class="folder-card-menu btn btn-ghost btn-icon" title="Options">
          <i class="fa-solid fa-ellipsis-vertical"></i>
        </button>
      </div>
      <div class="folder-card-body">
        <div class="folder-card-name" title="${escapeHtml(folder.name)}">
          ${escapeHtml(folder.name)}
          ${folder.pinned?'<i class="fa-solid fa-thumbtack folder-pin-icon"></i>':''}
        </div>
        ${folder.description?`<div class="folder-card-desc">${escapeHtml(folder.description)}</div>`:''}
        <div class="folder-card-meta">
          <span>${cnt} link${cnt!==1?'s':''}</span>
          <span>${_ago(folder.updatedAt)}</span>
        </div>
        ${folder.tags?.length?`<div class="folder-tags">${folder.tags.map(t=>`<span class="folder-tag">${escapeHtml(t)}</span>`).join('')}</div>`:''}
      </div>`;
  }

  card.addEventListener('click', e => {
    if (e.target.closest('.folder-card-menu')) return;
    _openFolder(folder);
  });
  card.querySelector('.folder-card-menu')?.addEventListener('click', e => {
    e.stopPropagation();
    _cardMenu(e.currentTarget, folder);
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
