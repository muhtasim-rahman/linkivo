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

export async function togglePin(engine, f) { await engine.updateFolder(f.id, { pinned: f.pinned ? null : true }); toast(f.pinned ? 'Unpinned.' : 'Pinned to the top.'); }
export const editFolder = (engine, f) => openFolderForm({ engine, folder: f });

export async function duplicateFolder(engine, f) {
  const copy = await engine.duplicateFolder(f.id);
  if (copy) { toast(`Duplicated as "${copy.name}".`); await logActivity(engine, 'duplicate', f.name); }
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

export async function deleteFolder(engine, f) {
  const needsName = (f.lc || 0) > 0 && pref(LIB.confirmDelete);
  const ok = needsName ? await typedConfirm(f) : await confirmDialog({ title: 'Delete this folder?', message: `"${f.name}" moves to the Recycle Bin for 15 days.`, confirmLabel: 'Delete folder', danger: true });
  if (!ok) return false;
  await engine.deleteFolders([f.id]);
  await logActivity(engine, 'folder-delete', `${f.name} (${f.lc || 0} links)`);
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
  await logActivity(engine, 'merge', `${f.name} into ${t.name}`);
  toast(`Merged: ${plural(r.moved, 'link')} moved${r.dropped ? `, ${r.dropped} duplicate${r.dropped === 1 ? '' : 's'} dropped` : ''}.`);
}

export function folderMenuItems({ engine, router, folder: f, onSelectMode = null }) {
  return [
    { label: f.pinned ? 'Unpin' : 'Pin to top', icon: 'pin', onSelect: () => togglePin(engine, f) },
    { label: 'Rename, color and icon', icon: 'edit', onSelect: () => editFolder(engine, f) },
    { label: 'Import links here', icon: 'plus', onSelect: () => import('../import/import-sheet.js').then((m) => m.openImport({ engine, router, fid: f.id })) },
    { label: 'Export this folder', icon: 'download', onSelect: () => import('../export/export-sheet.js').then((m) => m.openExport({ engine, scope: { type: 'folders', fids: [f.id] }, title: `Export "${f.name}"` })) },
    onSelectMode && { label: 'Select links', icon: 'check', onSelect: onSelectMode },
    { separator: true },
    { label: 'Duplicate', icon: 'copy', onSelect: () => duplicateFolder(engine, f) },
    { label: 'Merge into...', icon: 'merge', onSelect: () => mergeFolder(engine, f) },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: async () => { if (await deleteFolder(engine, f) && router.current()?.route.id === 'folder') router.navigate('/library', { replace: true }); } }
  ].filter(Boolean);
}
