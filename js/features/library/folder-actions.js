/**
 * Linkivo — js/features/library/folder-actions.js  (v2.2.0)
 * Purpose: every action on a folder, used by the Library cards and the folder page header. Deleting goes to the Recycle Bin (15 days) and offers
 *          Undo; a folder with links asks for its name first (the PIN gate arrives with the app lock in v2.5.0).
 * API: folderMenuItems({ engine, router, folder, onSelectMode? }) -> menu items for openMenu()      togglePin(engine, folder)
 *      editFolder(engine, folder)  deleteFolder(engine, folder)  duplicateFolder(engine, folder)  mergeFolder(engine, folder)
 */
import { openSheet } from '../../ui/sheet.js';
import { h } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { plural } from '../../core/format.js';
import { logActivity } from '../../core/activity.js';
import { openFolderForm, openFolderPicker } from './pickers.js';
import { pref, LIB } from './lib-prefs.js';
import { requireSensitive } from '../../core/sensitive.js';
import { vaultOn, getVault, closeVault } from '../../core/vault.js';
import { getQueue, getHistory } from '../../core/app-data.js';
import { ensureVaultOpen } from '../vault/vault-unlock.js';
import { startVaultMove } from '../vault/lock-job.js';

export async function togglePin(engine, f) { await engine.updateFolder(f.id, { pinned: f.pinned ? null : true }); toast(f.pinned ? 'Unpinned.' : 'Pinned to the top.'); }
export const editFolder = (engine, f) => openFolderForm({ engine, folder: f });

export async function duplicateFolder(engine, f) {
  const copy = await engine.duplicateFolder(f.id);
  if (copy) { toast(`Duplicated as "${copy.name}".`); await logActivity(engine, 'duplicate', nameFor(f)); }
}

function typedConfirm(f) {
  return new Promise((resolve) => {
    let ok = false;
    const input = h('input', { class: 'input', placeholder: f.name, 'aria-label': 'Type the folder name', autocomplete: 'off' });
    const sheet = openSheet({ title: 'Delete this folder?', body: h('div', { class: 'form' },
      h('p', { text: `"${f.name}" and its ${plural(f.lc || 0, 'link')} move to the Recycle Bin. You can restore them for 15 days.` }), h('label', { class: 'label', text: `Type the folder name to confirm` }), input),
    actions: [{ label: 'Cancel', variant: 'quiet', closes: false, onClick: () => sheet.close() }, { label: 'Delete folder', variant: 'danger', closes: false, onClick: () => { if (input.value.trim().toLowerCase() !== f.name.trim().toLowerCase()) { toast('The name does not match.', { type: 'error' }); return; } ok = true; sheet.close(); } }], onClose: () => resolve(ok) });
    setTimeout(() => input.focus(), 60);
  });
}

/** v2.5.3: the Activity log is kept while the vault is locked, so it never records the NAME of a locked folder. */
const nameFor = (f) => (f && f.lk ? 'a locked folder' : f.name);

/** v2.5.3: lock a folder = a persisted job that moves the folder and its links behind the code. If the vault is closed the code is asked first and the vault closes again when the move is done,
 *  so the folder disappears at once (nothing stays visible just because it was locked). */
export async function lockFolderAction(engine, router, f) {
  const ok = await confirmDialog({ title: `Lock \"${f.name}\"?`, message: `The folder and its ${plural(f.lc || 0, 'link')} move behind your code. They disappear from Library, search, history and everywhere else until you unlock locked folders.`, confirmLabel: 'Lock folder' });
  if (!ok) return false;
  const gate = await ensureVaultOpen({ title: 'Enter your code to lock this folder' });
  if (!gate.ok) return false;
  try {
    const job = await startVaultMove({ queue: getQueue(), dir: 'lock', fids: [f.id], closeAfter: !gate.wasOpen, title: 'Locking a folder' });
    if (router.current()?.route.id === 'folder' && !gate.wasOpen) router.navigate('/library', { replace: true });
    toast(gate.wasOpen ? `Locking \"${f.name}\"...` : 'Locking the folder...');
    return !!job;
  } catch { if (!gate.wasOpen) await closeVault(); toast('Could not lock it. Nothing was lost: try again.', { type: 'error' }); return false; }
}

/** v2.5.3: take a folder out of the locked folders (back into the normal library). Only possible while they are unlocked. */
export async function removeLockAction(engine, router, f) {
  const ok = await confirmDialog({ title: `Remove the lock from \"${f.name}\"?`, message: 'The folder and its links go back to your normal library. They stay visible even when locked folders are locked.', confirmLabel: 'Remove lock' });
  if (!ok) return false;
  try { await startVaultMove({ queue: getQueue(), dir: 'unlock', fids: [f.id], title: 'Removing a lock' }); toast('Removing the lock...'); return true; }
  catch { toast('Could not remove the lock. Nothing was lost: try again.', { type: 'error' }); return false; }
}

let folderDeleteAsked = false;   // v2.5.2: the PIN gate for deleting a folder is asked the FIRST time after logging in (the 5-minute window then covers the rest); a page reload counts as a new login
export async function deleteFolder(engine, f) {
  if (!folderDeleteAsked) { if (!(await requireSensitive('delete-folder'))) return false; folderDeleteAsked = true; }
  const needsName = (f.lc || 0) > 0 && pref(LIB.confirmDelete);
  const ok = needsName ? await typedConfirm(f) : await confirmDialog({ title: 'Delete this folder?', message: `"${f.name}" moves to the Recycle Bin for 15 days.`, confirmLabel: 'Delete folder', danger: true });
  if (!ok) return false;
  await engine.deleteFolders([f.id]);
  await logActivity(engine, 'folder-delete', `${nameFor(f)} (${f.lc || 0} links)`);
  toast(`Deleted "${f.name}".`, { duration: 7000, action: { label: 'Undo', onClick: async () => { await engine.restoreFolders([f.id]); toast('Folder restored.'); } } });
  return true;
}

export async function mergeFolder(engine, f) {
  const target = await openFolderPicker({ engine, title: `Merge "${f.name}" into`, exclude: [f.id], allowNew: false });
  if (!target) return;
  const t = engine.getFolder(target);
  const ok = await confirmDialog({ title: 'Merge folders?', message: `All links of "${f.name}" move into "${t.name}". Links that are already there are dropped, and "${f.name}" goes to the Recycle Bin.`, confirmLabel: 'Merge', danger: true });
  if (!ok) return;
  const r = await engine.mergeFolders([f.id], target);
  await logActivity(engine, 'merge', `${nameFor(f)} into ${nameFor(t)}`);
  toast(`Merged: ${plural(r.moved, 'link')} moved${r.dropped ? `, ${r.dropped} duplicate${r.dropped === 1 ? '' : 's'} dropped` : ''}.`);
}

export function folderMenuItems({ engine, router, folder: f, onSelectMode = null }) {
  const locked = !!f.lk;
  return [
    { label: f.pinned ? 'Unpin' : 'Pin to top', icon: 'pin', onSelect: () => togglePin(engine, f) },
    { label: 'Rename, color and icon', icon: 'edit', onSelect: () => editFolder(engine, f) },
    !locked && { label: 'Import links here', icon: 'plus', onSelect: () => import('../import/import-sheet.js').then((m) => m.openImport({ engine, router, fid: f.id })) },   // v2.5.3: an import job is kept on this device while it runs, so locked folders are not import targets
    !locked && { label: 'Export this folder', icon: 'download', onSelect: () => import('../export/export-sheet.js').then((m) => m.openExport({ engine, scope: { type: 'folders', fids: [f.id] }, title: `Export \"${f.name}\"` })) },
    onSelectMode && { label: 'Select links', icon: 'check', onSelect: onSelectMode },
    { separator: true },
    !locked && { label: 'Duplicate', icon: 'copy', onSelect: () => duplicateFolder(engine, f) },
    { label: 'Merge into...', icon: 'merge', onSelect: () => mergeFolder(engine, f) },
    vaultOn() && (locked ? { label: 'Remove lock', icon: 'unlock', onSelect: () => removeLockAction(engine, router, f) } : { label: 'Lock folder', icon: 'lock', onSelect: () => lockFolderAction(engine, router, f) }),   // v2.5.3: no separate page: the lock is a property of the folder
    { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { if (await deleteFolder(engine, f) && router.current()?.route.id === 'folder') router.navigate('/library', { replace: true }); } }
  ].filter(Boolean);
}
