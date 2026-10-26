/**
 * Linkivo — js/features/import/restore-popup.js  (v2.2.1)
 * Purpose: Settings > Import opens THIS one small popup (owner request): only a file exported by Linkivo itself can be added here, with the same
 *          choices as before (merge or new folders, skip, update or keep both for links already saved). Anything else is pointed to the Import page.
 *          A backup restores through the fast path: no extraction and no title fetching.
 * API: openRestorePopup({ engine, router?, file? }) -> Promise<job|null>
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { loadCss } from '../../core/css-loader.js';
import { getQueue } from '../../core/app-data.js';
import { readBackupText } from './native-import.js';
import { createBackupPanel, runRestore } from './import-backup.js';
import { openJobDetails } from './import-progress.js';

export async function openRestorePopup({ engine, router = null, file = null }) {
  await loadCss('/css/pages/data.css');
  const queue = getQueue();
  return new Promise((resolve) => {
    let job = null, backup = null, busy = false;
    const note = h('p', { class: 'help is-error', role: 'alert' });
    const panel = createBackupPanel();
    const input = h('input', { type: 'file', accept: '.json,.linkivo.json,application/json', hidden: true, on: { change: (e) => { read(e.target.files[0]); e.target.value = ''; } } });
    const drop = h('div', { class: 'imp-drop', tabindex: '0', role: 'button', 'aria-label': 'Choose a Linkivo backup file or drop it here',
      on: { click: () => input.click(), keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
        dragover: (e) => { e.preventDefault(); drop.classList.add('is-over'); }, dragleave: () => drop.classList.remove('is-over'),
        drop: (e) => { e.preventDefault(); drop.classList.remove('is-over'); read(e.dataTransfer?.files?.[0]); } } },
      icon('shield', { size: 28 }), h('strong', { text: 'Choose a Linkivo backup' }), h('span', { class: 'help', text: 'or drop the file here' }));
    const go = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, text: 'Restore backup', on: { click: start } });
    const other = h('a', { class: 'link-btn is-sm imp-other', href: '/import', text: 'Import links from other files', on: { click: (e) => { if (router) { e.preventDefault(); sheet.close(); router.navigate('/import'); } } } });

    async function read(f) {
      if (!f) return;
      note.textContent = ''; backup = null; panel.hide(); go.disabled = true;
      if (f.size > 200e6) { note.textContent = 'This file is too large to be a Linkivo backup.'; return; }
      try {
        const r = readBackupText(await f.text());
        if (!r.ok) { note.textContent = /JSON/.test(r.error || '') ? 'This is not a Linkivo backup. To import other files, use Import links.' : r.error; return; }
        backup = r.backup; panel.show(f.name, backup); go.disabled = false; drop.hidden = true;
      } catch { note.textContent = 'The file could not be read.'; }
    }
    async function start() {
      if (!backup || busy) return;
      busy = true; go.disabled = true;
      try { job = await runRestore({ engine, queue, backup, state: panel.state }); if (job) sheet.close(); } catch { toast('The restore could not start.', { type: 'error' }); }
      busy = false; go.disabled = !backup;
    }
    const sheet = openSheet({ title: 'Restore a Linkivo backup', body: h('div', { class: 'form' }, drop, input, panel.el, note, other, h('div', { class: 'imp-foot' }, go)), actions: [],   // v2.2.2: the link is small and left aligned, the button stays alone in the footer
      onClose: () => { if (job) openJobDetails({ queue, engine, router, jobId: job.id, autoClose: true }); resolve(job); } });
    if (file) read(file);
  });
}
