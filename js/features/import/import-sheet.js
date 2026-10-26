/**
 * Linkivo — js/features/import/import-sheet.js  (v2.2.1)
 * Purpose: "Import links here" from any page other than /import. Same form as the Import page (import-form.js), compact, in a dialog on wide screens.
 *          On phones there is NO bottom popup (owner request): they are taken to the /import page with the folder preselected, and files that came
 *          with the call wait for that page. The v2.2.0 popup code (two sheets, review step) was replaced by import-form.js and is gone from this file.
 * API: openImport({ engine, router?, fid?, files? }) -> Promise<job|null>       collectWarnings (re-exported for older callers and tests)
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { confirmDialog } from '../../ui/confirm.js';
import { loadCss } from '../../core/css-loader.js';
import { getQueue } from '../../core/app-data.js';
import { createImportForm, collectWarnings, stashFiles } from './import-form.js';
import { openJobDetails } from './import-progress.js';

export { collectWarnings };
const isWide = () => typeof matchMedia === 'function' && matchMedia('(min-width: 900px)').matches;

export async function openImport({ engine, router = null, fid = null, files = [] }) {
  if (!isWide() && router) {
    if (files.length) stashFiles(files);
    router.navigate(`/import${fid ? `?fid=${encodeURIComponent(fid)}` : ''}`);
    return null;
  }
  await loadCss('/css/pages/data.css');
  const queue = getQueue();
  return new Promise((resolve) => {
    let job = null;
    const form = createImportForm({ engine, router, fid, files, compact: true });
    form.onStarted((j) => { job = j; sheet.close(); });
    const sheet = openSheet({ title: 'Import links', wide: true, body: h('div', { class: 'form imp-dialog' }, form.el, form.dockEl), actions: [],
      beforeClose: async () => !form.dirty() || confirmDialog({ title: 'Discard this import?', message: 'The pasted text and chosen files will be lost.', confirmLabel: 'Discard', danger: true }),
      onClose: () => { form.destroy(); if (job) openJobDetails({ queue, engine, router, jobId: job.id, autoClose: true }); resolve(job); } });
    setTimeout(() => form.focus(), 80);
  });
}
