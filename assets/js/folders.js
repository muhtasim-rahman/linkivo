// ============================================================
// Linkivo — folders.js  v1.4.0
// Folder CRUD, PIN lock with session, tag system, description
// ============================================================

import { db, ref, set, get, update, remove, push, onValue, serverTimestamp } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, genId, confirm, showDropdown, pinDialog, Storage, escapeHtml } from './utils.js';
import { showImportModal } from './import.js';

const uid      = () => getCurrentUser()?.uid;
const fRef     = (fid) => ref(db, `users/${uid()}/folders/${fid}`);
const rbRef    = (id)  => ref(db, `users/${uid()}/recycleBin/${id}`);
const allFRef  = ()    => ref(db, `users/${uid()}/folders`);

// ── PIN session (unlocked folders persist until reload) ───
const _unlockedFolders = new Set();
export function isFolderUnlocked(fid) { return _unlockedFolders.has(fid); }
export function lockFolderSession(fid) { _unlockedFolders.delete(fid); }
export function unlockFolderSession(fid) { _unlockedFolders.add(fid); }

// ══════════════════════════════════════════════════════════
// FOLDER CRUD
// ══════════════════════════════════════════════════════════

export async function createFolder(name, opts = {}) {
  if (!name?.trim()) return null;
  const id   = genId('f_');
  const data = {
    id,
    name:        name.trim(),
    description: opts.description || '',
    tags:        opts.tags || [],
    createdAt:   Date.now(),
    updatedAt:   Date.now(),
    pinned:      false,
    locked:      false,
    pin:         null,
    linkCount:   0,
    color:       opts.color || _randomColor(),
    icon:        opts.icon  || 'fa-folder',
  };
  await set(fRef(id), data);
  return data;
}

export async function renameFolder(fid, newName) {
  if (!newName?.trim()) return;
  await update(fRef(fid), { name: newName.trim(), updatedAt: Date.now() });
  // Also update history entries with old folder name
  try {
    const hSnap = await get(ref(db, `users/${uid()}/history`));
    if (hSnap.exists()) {
      const entries = Object.entries(hSnap.val());
      const toUpdate = entries.filter(([,v]) => v.folderId === fid);
      for (const [key] of toUpdate) {
        await update(ref(db, `users/${uid()}/history/${key}`), { folderName: newName.trim() });
      }
    }
  } catch {}
}

export async function deleteFolder(fid) {
  const snap = await get(fRef(fid));
  if (!snap.exists()) return;
  const data = snap.val();
  const rbId = genId('rb_');
  await set(rbRef(rbId), {
    id: rbId, type: 'folder', originalId: fid, data,
    deletedAt: Date.now(),
    expireAt:  Date.now() + 30 * 24 * 60 * 60 * 1000,
  });
  await remove(fRef(fid));
  _unlockedFolders.delete(fid);
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

export async function togglePin(fid, currentPinned) {
  await update(fRef(fid), { pinned: !currentPinned, updatedAt: Date.now() });
}

// ── Lock/Unlock with proper UI ────────────────────────────
export async function setFolderLock(fid) {
  const pin1 = await pinDialog('Set Folder PIN', 'Choose a 6-digit PIN to lock this folder');
  if (!pin1) return;
  const pin2 = await pinDialog('Confirm PIN', 'Re-enter the PIN to confirm');
  if (!pin2) return;
  if (pin1 !== pin2) { toast('PINs do not match', 'error'); return; }
  await update(fRef(fid), { locked: true, pin: pin1, updatedAt: Date.now() });
  lockFolderSession(fid);
  toast('Folder locked 🔒', 'success');
}

export async function verifyAndUnlockFolder(folder) {
  // Already unlocked this session?
  if (_unlockedFolders.has(folder.id)) return true;
  const entered = await pinDialog('Unlock Folder', `Enter PIN for "${folder.name}"`);
  if (!entered) return false;
  if (entered !== folder.pin) { toast('Wrong PIN ❌', 'error'); return false; }
  unlockFolderSession(folder.id);
  return true;
}

export async function removeFolderLock(fid) {
  const snap = await get(fRef(fid));
  if (!snap.exists()) return;
  const folder = snap.val();
  const ok = await verifyAndUnlockFolder(folder);
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

// ── Save links to folder (with progress callback) ────────
export async function saveLinksToFolder(fid, links, { onProgress } = {}) {
  const linksRef = ref(db, `users/${uid()}/folders/${fid}/links`);
  const snap     = await get(linksRef);
  const existing = snap.val() || {};
  const existingUrls = new Set(Object.values(existing).map(l => l.url));

  let added = 0;
  const toAdd = links.filter(l => !existingUrls.has(l.url));

  for (let i = 0; i < toAdd.length; i++) {
    const link = toAdd[i];
    const lid  = genId('l_');
    await set(ref(db, `users/${uid()}/folders/${fid}/links/${lid}`), { ...link, id: lid });
    added++;
    onProgress?.(i + 1, toAdd.length);
  }

  const total = Object.keys(existing).length + added;
  await update(fRef(fid), { linkCount: total, updatedAt: Date.now() });
  return added;
}

export async function getFolders() {
  const snap = await get(allFRef());
  return snap.exists() ? Object.values(snap.val()) : [];
}

export function subscribeFolders(callback) {
  onValue(allFRef(), (snap) => {
    const folders = snap.exists() ? Object.values(snap.val()) : [];
    callback(sortFolders(folders));
  });
}

export function sortFolders(folders) {
  return [...folders].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function _randomColor() {
  const c = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#ef4444','#06b6d4','#f97316','#6366f1','#14b8a6'];
  return c[Math.floor(Math.random() * c.length)];
}

// ══════════════════════════════════════════════════════════
// HOME PAGE — Folder Manager
// ══════════════════════════════════════════════════════════

let _unsubFolders = null;

export function initHomePage() {
  const grid      = document.getElementById('folder-grid');
  const createBtn = document.getElementById('create-folder-btn');
  if (!grid) return;

  // Real-time subscription
  if (_unsubFolders) _unsubFolders();
  onValue(allFRef(), (snap) => {
    const folders = snap.exists() ? sortFolders(Object.values(snap.val())) : [];
    renderFolderGrid(folders, grid);
  });

  createBtn?.addEventListener('click', _promptCreateFolder);
  document.getElementById('home-import-btn')?.addEventListener('click', _openImportModal);
}

async function _promptCreateFolder() {
  const { prompt: uiPrompt } = await import('./utils.js');
  const name = await uiPrompt('New Folder', 'Folder name…', '');
  if (!name) return;
  const folder = await createFolder(name);
  if (folder) toast(`Folder "${folder.name}" created`, 'success');
}

async function _openImportModal() {
  const folders = await getFolders();
  showImportModal(folders, async (links, fTarget, isNew, { onProgress } = {}) => {
    let fid = fTarget;
    if (isNew) { const nf = await createFolder(fTarget); if (!nf) { toast('Failed to create folder','error'); return; } fid = nf.id; }
    const added = await saveLinksToFolder(fid, links, { onProgress });
    toast(`${added} link${added!==1?'s':''} saved!`, 'success');
  });
}

// Export for app.js usage
export { _openImportModal as triggerImportModal };

function renderFolderGrid(folders, grid) {
  if (!folders.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-icon"><i class="fa-solid fa-folder-open"></i></div>
        <h3>No folders yet</h3>
        <p>Create a folder to start saving links, or import from a file.</p>
        <button class="btn btn-primary" id="home-import-btn">
          <i class="fa-solid fa-file-import"></i> Import Links
        </button>
      </div>`;
    document.getElementById('home-import-btn')?.addEventListener('click', _openImportModal);
    return;
  }
  grid.innerHTML = '';
  folders.forEach(folder => grid.appendChild(_createFolderCard(folder)));
}

function _createFolderCard(folder) {
  const card = document.createElement('div');
  card.className = `folder-card${folder.pinned?' pinned':''}`;
  card.dataset.fid = folder.id;

  const isLocked   = folder.locked && !_unlockedFolders.has(folder.id);
  const iconBg     = _hexRgba(folder.color||'#3b82f6', 0.12);
  const count      = folder.linkCount || 0;

  card.innerHTML = `
    <div class="folder-card-top">
      <div class="folder-card-icon" style="background:${iconBg};color:${folder.color||'var(--primary)'}">
        ${isLocked ? '<i class="fa-solid fa-lock"></i>' : `<i class="${folder.icon||'fa-solid fa-folder'}"></i>`}
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
        <span>${count} link${count!==1?'s':''}</span>
        <span>${_timeAgoShort(folder.updatedAt)}</span>
      </div>
      ${folder.tags?.length?`<div class="folder-tags">${folder.tags.map(t=>`<span class="folder-tag">${escapeHtml(t)}</span>`).join('')}</div>`:''}
    </div>
    ${isLocked?'<div class="folder-locked-bar"><i class="fa-solid fa-lock"></i> Locked</div>':''}
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.folder-card-menu')) return;
    _openFolder(folder);
  });

  card.querySelector('.folder-card-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    _showFolderMenu(e.currentTarget, folder);
  });

  return card;
}

function _showFolderMenu(anchor, folder) {
  const isLocked = folder.locked && !_unlockedFolders.has(folder.id);
  showDropdown(anchor, [
    { label: folder.pinned?'Unpin':'Pin to top', icon:'fa-solid fa-thumbtack',
      action: () => togglePin(folder.id, folder.pinned) },
    { label: 'Rename', icon:'fa-solid fa-pencil',
      action: async () => {
        const { prompt: uiPrompt } = await import('./utils.js');
        const name = await uiPrompt('Rename Folder','Folder name…',folder.name);
        if (name) renameFolder(folder.id, name);
      }},
    { label: 'Edit description', icon:'fa-solid fa-align-left',
      action: async () => {
        const { prompt: uiPrompt } = await import('./utils.js');
        const desc = await uiPrompt('Folder Description','Short description…',folder.description||'');
        if (desc !== null) await update(fRef(folder.id), { description: desc });
      }},
    { label: isLocked?'Remove Lock':'Lock with PIN', icon:`fa-solid fa-${isLocked?'lock-open':'lock'}`,
      action: () => isLocked ? removeFolderLock(folder.id) : setFolderLock(folder.id) },
    'divider',
    { label: 'Open in Random Discover', icon:'fa-solid fa-shuffle',
      action: () => {
        // Navigate to random with this folder pre-selected
        document.dispatchEvent(new CustomEvent('linkivo:openRandomWithFolder', { detail: { folderId: folder.id } }));
        window.Router?.go?.('random');
      }},
    { label: 'Import to folder', icon:'fa-solid fa-file-import',
      action: async () => {
        const folders = await getFolders();
        showImportModal(folders, async (links, fTarget, isNew, opts) => {
          let fid = isNew ? (await createFolder(fTarget))?.id : fTarget;
          if (!fid) return;
          const added = await saveLinksToFolder(fid||folder.id, links, opts);
          toast(`${added} link${added!==1?'s':''} saved!`,'success');
        });
      }},
    'divider',
    { label: 'Delete', icon:'fa-solid fa-trash', danger:true,
      action: async () => {
        const ok = await confirm('Delete Folder', `Move "${folder.name}" to recycle bin?`, true);
        if (ok) deleteFolder(folder.id);
      }},
  ], { align:'right' });
}

async function _openFolder(folder) {
  if (folder.locked && !_unlockedFolders.has(folder.id)) {
    const ok = await verifyAndUnlockFolder(folder);
    if (!ok) return;
  }
  window.Router?.go?.('folder', { folder });
  document.dispatchEvent(new CustomEvent('linkivo:openFolder', { detail: { folder } }));
}

// ── Helpers ───────────────────────────────────────────────
function _hexRgba(hex, alpha) {
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function _timeAgoShort(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now()-ts)/1000);
  if (s<60)    return 'just now';
  if (s<3600)  return `${Math.floor(s/60)}m`;
  if (s<86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}
