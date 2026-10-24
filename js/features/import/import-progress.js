/**
 * Linkivo — js/features/import/import-progress.js  (v2.2.0)
 * Purpose: the details sheet of a background job (import, restore, title fetch): progress bar, speed and time left, counters, the links being
 *          saved right now, Pause / Resume / Stop / Retry, Minimize (the task chip keeps showing it), and after an import: Undo and Open folder.
 *          The task chip calls openJobDetails() when tapped.
 * API: openJobDetails({ queue, engine, router?, jobId }) -> sheet api | null      etaText(done, total, startedAt, now) -> string
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { plural } from '../../core/format.js';
import { undoImport } from './import-job.js';

export function etaText(done, total, startedAt, now = Date.now()) {
  const s = Math.max(1, (now - startedAt) / 1000);
  if (!done || done >= total) return '';
  const rate = done / s, left = Math.ceil((total - done) / rate);
  return `${Math.round(rate)} links/s  \u00b7  about ${left < 60 ? left + ' s' : Math.ceil(left / 60) + ' min'} left`;
}
const LABEL = { queued: 'Waiting to start', running: 'Working', paused: 'Paused', stopped: 'Stopped', failed: 'Stopped by an error', done: 'Finished' };

export function openJobDetails({ queue, engine, router = null, jobId }) {
  const first = queue.get(jobId); if (!first) return null;
  const bar = h('div', { class: 'jp-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i'));
  const state = h('p', { class: 'jp-state', 'aria-live': 'polite' }), eta = h('p', { class: 'help' }), stats = h('div', { class: 'jp-stats' }), live = h('ul', { class: 'jp-live', 'aria-label': 'Links being saved' }), err = h('p', { class: 'help is-error', role: 'alert' }), btns = h('div', { class: 'imp-foot' });
  const body = h('div', { class: 'form jp' }, state, bar, eta, stats, live, err, btns);

  function render(j) {
    const pct = j.total ? Math.min(100, Math.round((j.done / j.total) * 100)) : j.status === 'done' ? 100 : 0;
    bar.firstChild.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct));
    state.textContent = `${LABEL[j.status] || j.status}${j.total ? `: ${j.done} of ${j.total} (${pct}%)` : ''}`;
    eta.textContent = j.status === 'running' && j.startedAt ? etaText(j.done, j.total, j.startedAt) : '';
    err.textContent = j.error || '';
    const s = j.stats;
    stats.replaceChildren(...(s ? [['Saved', s.saved], ['Skipped duplicates', s.skipped], ['Invalid', s.invalid]] : [['Done', j.done], ['Failed', j.failed || 0]]).map(([l, n]) => h('div', { class: 'jp-stat' }, h('strong', { text: String(n) }), h('span', { text: l }))));
    live.replaceChildren(...(j.status === 'running' && j.live ? j.live.map((u) => h('li', { text: u })) : []));
    const b = (label, fn, cls = '') => h('button', { type: 'button', class: ['btn', cls], on: { click: fn } }, label);
    const items = [];
    if (j.status === 'running') items.push(b('Pause', () => queue.pause(j.id)), b('Stop', async () => { if (await confirmDialog({ title: 'Stop this import?', message: 'Links already saved stay. You can undo them afterwards.', confirmLabel: 'Stop', danger: true })) queue.stop(j.id); }), b('Minimize', () => sheet.close(), 'btn-primary'));
    else if (j.status === 'paused' || j.status === 'queued') items.push(b('Resume', () => queue.resume(j.id), 'btn-primary'), b('Stop', () => queue.stop(j.id)), b('Minimize', () => sheet.close()));
    else {
      if ((j.status === 'failed' || j.status === 'stopped') && j.type !== 'enrich') items.push(b('Retry', () => queue.retry(j.id), 'btn-primary'));
      if (j.type === 'import' && (j.status === 'done' || j.status === 'stopped' || j.status === 'failed') && j.params?.imp && engine.linksOfImport(j.params.imp).length) items.push(b('Undo import', async () => { const n = await undoImport(engine, j.params.imp); toast(`Moved ${plural(n, 'link')} to the Recycle Bin.`); sheet.close(); }));
      if (j.status === 'done' && j.params?.fid && router && engine.getFolder(j.params.fid)) items.push(b('Open folder', () => { sheet.close(); router.navigate(`/folder/${j.params.fid}`); }, 'btn-primary'));
      items.push(b('Close', () => sheet.close()));
    }
    btns.replaceChildren(...items);
  }
  const off = queue.subscribe((j) => { if (j.id === jobId) render(j); });
  const sheet = openSheet({ title: first.title || 'Background task', wide: false, body, actions: [], onClose: () => off() });
  render(first);
  return sheet;
}
