// ============================================================
// Linkivo — folders.js  v1.3.0
// Folder CRUD: create, rename, delete→recycle, pin, lock/unlock
// ============================================================

import {
  db, ref, set, get, update, remove,
  push, onValue, serverTimestamp
} from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, genId, confirm, showDropdown, pinDialog, Storage } from './utils.js';
import { showImportModal } from './import.js';

// ── DB helpers ────────────────────────────────────────────
const uid  = () => getCurrentUser()?.uid;
const fRef = (fid)  => ref(db, `users/${uid()}/folders/${fid}`);
const rbRef = (id)  => ref(db, `users/${uid()}/recycleBin/${id}`);
const allFoldersRef = () => ref(db, `users/${uid()}/folders`);

// ══════════════════════════════════════════════════════════
// FOLDER OPERATIONS
// ══════════════════════════════════════════════════════════

export async function createFolder(name) {
  if (!name?.trim()) return null;
  const id    = genId('f_');
  const data  = {
    id,
    name:      name.trim(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pinned:    false,
    locked:    false,
    pin:       null,
    linkCount: 0,
    color:     randomFolderColor(),
    icon:      'fa-folder',
  };
  await set(fRef(id), data);
  return data;
}

export async function renameFolder(fid, newName) {
  if (!newName?.trim()) return;
  await update(fRef(fid), { name: newName.trim(), updatedAt: Date.now() });
}

export async function deleteFolder(fid, folderName) {
  // Move to recycle bin
  const snap = await get(fRef(fid));
  if (!snap.exists()) return;
  const data = snap.val();

  const rbId   = genId('rb_');
  const rbData = {
    id:         rbId,
    type:       'folder',
    originalId: fid,
    data,
    deletedAt:  Date.now(),
    expireAt:   Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  await set(rbRef(rbId), rbData);
  await remove(fRef(fid));
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

export async function permanentDeleteFolder(rbId) {
  await remove(rbRef(rbId));
  toast('Permanently deleted', 'info');
}

export async function togglePin(fid, currentPinned) {
  await update(fRef(fid), { pinned: !currentPinned, updatedAt: Date.now() });
}

// ── Lock folder (set PIN) ─────────────────────────────────
export async function lockFolder(fid) {
  const pin = await pinDialog('Set Folder PIN', 'Enter a 6-digit PIN to lock this folder');
  if (!pin) return;
  const confirm2 = await pinDialog('Confirm PIN', 'Re-enter your PIN to confirm');
  if (!confirm2) return;
  if (pin !== confirm2) { toast('PINs do not match', 'error'); return; }
  await update(fRef(fid), { locked: true, pin, updatedAt: Date.now() });
  toast('Folder locked 🔒', 'success');
}

// ── Unlock folder (verify PIN) ────────────────────────────
export async function unlockFolder(fid) {
  const snap = await get(fRef(fid));
  if (!snap.exists()) return false;
  const folder = snap.val();
  const entered = await pinDialog('Unlock Folder', `Enter PIN for "${folder.name}"`);
  if (!entered) return false;
  if (entered !== folder.pin) { toast('Wrong PIN', 'error'); return false; }
  return true;
}

// ── Remove lock ───────────────────────────────────────────
export async function removeLock(fid) {
  const unlocked = await unlockFolder(fid);
  if (!unlocked) return;
  await update(fRef(fid), { locked: false, pin: null, updatedAt: Date.now() });
  toast('Folder unlocked 🔓', 'success');
}

// ── Increment link count ──────────────────────────────────
export async function incrementLinkCount(fid, delta = 1) {
  const snap = await get(ref(db, `users/${uid()}/folders/${fid}/linkCount`));
  const cur  = snap.val() || 0;
  await set(ref(db, `users/${uid()}/folders/${fid}/linkCount`), Math.max(0, cur + delta));
  await set(ref(db, `users/${uid()}/folders/${fid}/updatedAt`), Date.now());
}

// ── Save links into folder ────────────────────────────────
export async function saveLinksToFolder(fid, links) {
  const linksRef = ref(db, `users/${uid()}/folders/${fid}/links`);
  // Get existing to deduplicate
  const snap     = await get(linksRef);
  const existing = snap.val() || {};
  const existingUrls = new Set(Object.values(existing).map(l => l.url));

  let added = 0;
  for (const link of links) {
    if (existingUrls.has(link.url)) continue;
    existingUrls.add(link.url);
    const lid = genId('l_');
    await set(ref(db, `users/${uid()}/folders/${fid}/links/${lid}`), { ...link, id: lid });
    added++;
  }
  // Update link count
  const total = Object.keys(existing).length + added;
  await update(fRef(fid), { linkCount: total, updatedAt: Date.now() });
  return added;
}

// ── Fetch all folders once ────────────────────────────────
export async function getFolders() {
  const snap = await get(allFoldersRef());
  if (!snap.exists()) return [];
  return Object.values(snap.val() || {});
}

// ── Subscribe to folders (realtime) ──────────────────────
export function subscribeFolders(callback) {
  const r = allFoldersRef();
  const handler = (snap) => {
    const folders = snap.exists() ? Object.values(snap.val()) : [];
    callback(sortFolders(folders));
  };
  onValue(r, handler);
  return () => { /* unsubscribe on cleanup */ };
}

// ── Sort: pinned first, then by updatedAt desc ────────────
export function sortFolders(folders) {
  return [...folders].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

// ── Random color for folder ───────────────────────────────
function randomFolderColor() {
  const colors = [
    '#3b82f6','#8b5cf6','#ec4899','#f59e0b',
    '#10b981','#ef4444','#06b6d4','#f97316',
    '#6366f1','#14b8a6',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ══════════════════════════════════════════════════════════
// HOME PAGE — Folder Manager UI
// ══════════════════════════════════════════════════════════

let _unsubFolders = null;

export function initHomePage() {
  const grid       = document.getElementById('folder-grid');
  const createBtn  = document.getElementById('create-folder-btn');
  const importBtn  = document.getElementById('home-import-btn');
  const sidebarImp = document.getElementById('sidebar-import-btn');
  const fabImp     = document.getElementById('fab-import-btn');

  if (!grid) return;

  // Subscribe to realtime folder updates
  if (_unsubFolders) _unsubFolders();
  _unsubFolders = (() => {
    const r = allFoldersRef();
    onValue(r, (snap) => {
      const folders = snap.exists() ? sortFolders(Object.values(snap.val())) : [];
      renderFolderGrid(folders, grid);
    });
  })();

  // Create folder
  createBtn?.addEventListener('click', () => promptCreateFolder());
  importBtn?.addEventListener('click', () => openImportModal());
  sidebarImp?.addEventListener('click', () => openImportModal());
  fabImp?.addEventListener('click', () => openImportModal());
}

// ── Prompt & create folder ────────────────────────────────
async function promptCreateFolder() {
  const name = await import('./utils.js').then(u => u.prompt('New Folder', 'Folder name…', ''));
  if (!name) return;
  const folder = await createFolder(name);
  if (folder) toast(`Folder "${folder.name}" created`, 'success');
}

// ── Open Import Modal ──────────────────────────────────────
async function openImportModal() {
  const folders = await getFolders();
  showImportModal(folders, async (links, folderTarget, isNew) => {
    let fid = folderTarget;
    if (isNew) {
      const newFolder = await createFolder(folderTarget);
      if (!newFolder) { toast('Failed to create folder', 'error'); return; }
      fid = newFolder.id;
    }
    const added = await saveLinksToFolder(fid, links);
    toast(`${added} link${added !== 1 ? 's' : ''} saved!`, 'success');
  });
}

// ── Render folder grid ────────────────────────────────────
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
    document.getElementById('home-import-btn')?.addEventListener('click', openImportModal);
    return;
  }

  grid.innerHTML = '';
  folders.forEach(folder => {
    const card = createFolderCard(folder);
    grid.appendChild(card);
  });
}

// ── Folder Card ───────────────────────────────────────────
function createFolderCard(folder) {
  const card = document.createElement('div');
  card.className = `folder-card${folder.pinned ? ' pinned' : ''}`;
  card.dataset.fid = folder.id;

  const iconBg = hexToRgba(folder.color || '#3b82f6', 0.12);
  const count  = folder.linkCount || 0;

  card.innerHTML = `
    <div class="folder-card-top">
      <div class="folder-card-icon" style="background:${iconBg};color:${folder.color}">
        ${folder.locked
          ? '<i class="fa-solid fa-lock"></i>'
          : `<i class="${folder.icon || 'fa-solid fa-folder'}"></i>`}
      </div>
      <button class="folder-card-menu" data-fid="${folder.id}" title="Options">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
    </div>
    <div class="folder-card-body">
      <div class="folder-card-name" title="${escHtml(folder.name)}">
        ${escHtml(folder.name)}
        ${folder.pinned ? '<i class="fa-solid fa-thumbtack folder-pin-icon"></i>' : ''}
      </div>
      <div class="folder-card-meta">
        <span>${count} link${count !== 1 ? 's' : ''}</span>
        <span>${timeAgoShort(folder.updatedAt)}</span>
      </div>
    </div>
    ${folder.locked ? '<div class="folder-locked-bar"><i class="fa-solid fa-lock"></i> Locked</div>' : ''}
  `;

  // Click to open folder
  card.addEventListener('click', (e) => {
    if (e.target.closest('.folder-card-menu')) return;
    openFolder(folder);
  });

  // Three-dot menu
  card.querySelector('.folder-card-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    showFolderMenu(e.currentTarget, folder);
  });

  return card;
}

// ── Folder three-dot menu ─────────────────────────────────
function showFolderMenu(anchor, folder) {
  const items = [
    {
      label:  folder.pinned ? 'Unpin' : 'Pin to top',
      icon:   'fa-solid fa-thumbtack',
      action: () => togglePin(folder.id, folder.pinned),
    },
    {
      label:  'Rename',
      icon:   'fa-solid fa-pencil',
      action: async () => {
        const name = await import('./utils.js').then(u => u.prompt('Rename Folder', 'Folder name…', folder.name));
        if (name) renameFolder(folder.id, name);
      },
    },
    {
      label:  folder.locked ? 'Remove Lock' : 'Lock with PIN',
      icon:   folder.locked ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock',
      action: () => folder.locked ? removeLock(folder.id) : lockFolder(folder.id),
    },
    'divider',
    {
      label:  'Import to folder',
      icon:   'fa-solid fa-file-import',
      action: async () => {
        const folders = await getFolders();
        showImportModal(folders, async (links, fTarget, isNew) => {
          let fid = isNew ? (await createFolder(fTarget))?.id : fTarget;
          if (!fid) return;
          const added = await saveLinksToFolder(fid || folder.id, links);
          toast(`${added} link${added !== 1 ? 's' : ''} saved!`, 'success');
        });
      },
    },
    'divider',
    {
      label:  'Delete',
      icon:   'fa-solid fa-trash',
      danger: true,
      action: async () => {
        const ok = await confirm('Delete Folder', `Move "${folder.name}" to recycle bin?`, true);
        if (ok) deleteFolder(folder.id, folder.name);
      },
    },
  ];

  showDropdown(anchor, items, { align: 'right' });
}

// ── Open a folder ─────────────────────────────────────────
async function openFolder(folder) {
  if (folder.locked) {
    const ok = await unlockFolder(folder.id);
    if (!ok) return;
  }
  // Navigate via router
  window.Router?.go?.('folder', { folder });
  // Fallback: dispatch event
  document.dispatchEvent(new CustomEvent('linkivo:openFolder', { detail: { folder } }));
}

// ── Helpers ───────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function timeAgoShort(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
