/**
 * Linkivo — js/features/import/import-backup.js  (v2.2.1)
 * Purpose: everything about restoring a Linkivo backup file in one place, used by the Import page AND by the small Restore popup in Settings:
 *          the summary card with its two choices (what to do with folders and with links that already exist) and the function that plans and
 *          starts the restore job. (v2.2.0 had this inside the Import popup.)
 * API: createBackupPanel({ onChange }) -> { el, show(name, backup), hide(), state: { folderMode, duplicates } }
 *      runRestore({ engine, queue, backup, state }) -> Promise<job|null>      (toasts when there is nothing to restore)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { createSelect } from '../../ui/select.js';
import { plural } from '../../core/format.js';
import { describeBackup, planRestore } from './native-import.js';
import { startImport } from './import-job.js';

const FOLDER_MODES = [{ value: 'merge', label: 'Merge folders with the same name' }, { value: 'new', label: 'Always create new folders' }];
const DUP_MODES = [{ value: 'skip', label: 'Skip links I already have' }, { value: 'update', label: 'Update them from the backup' }, { value: 'both', label: 'Keep both copies' }];

export function createBackupPanel({ onChange = () => {} } = {}) {
  const state = { folderMode: 'merge', duplicates: 'skip' };
  const box = h('div', { class: 'imp-backup', hidden: true });
  const el = box;
  function show(name, backup) {
    const d = describeBackup(backup);
    const facts = [[d.folders, 'folder'], [d.links, 'link'], ...(d.tags ? [[d.tags, 'tag']] : [])].map(([n, w]) => h('span', { class: 'bk-fact' }, h('strong', { text: String(n) }), h('span', { text: n === 1 ? w : w + 's' })));
    box.hidden = false;
    box.replaceChildren(
      h('div', { class: 'bk-head' }, h('span', { class: 'bk-ic' }, icon('shield', { size: 20 })), h('div', { class: 'bk-title' }, h('strong', { text: 'Linkivo backup found' }), h('span', { class: 'help', text: name }))),
      h('div', { class: 'bk-facts' }, facts),
      h('div', { class: 'bk-opts' },
        createSelect({ options: FOLDER_MODES, value: state.folderMode, label: 'Folders', block: true, onChange: (v) => { state.folderMode = v; onChange(); } }),
        createSelect({ options: DUP_MODES, value: state.duplicates, label: 'Links already saved', block: true, onChange: (v) => { state.duplicates = v; onChange(); } })));
  }
  function hide() { box.hidden = true; box.replaceChildren(); }
  return { el, show, hide, state };
}

export async function runRestore({ engine, queue, backup, state }) {
  const plan = await planRestore(engine, backup, state);
  if (!plan.items.length && !plan.updates.length) { toast(plan.skipped ? 'Everything in this backup is already saved.' : 'The backup has no links to restore.'); return null; }
  let fid = plan.folderIds[0];
  if (!fid) { const f = await engine.createFolder({ name: 'Imported links', color: '#2563eb', icon: 'import', order: engine.listFolders().length }); fid = f.id; }
  return startImport({ queue, engine, items: plan.items, fid, updates: plan.updates, folderIds: plan.folderIds, title: `Restoring ${plural(plan.items.length + plan.updates.length, 'link')}`, options: { perItemFolder: true, kind: 'native', enrich: false, dedupe: state.duplicates !== 'both' } });
}
