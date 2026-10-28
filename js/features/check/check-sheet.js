/**
 * Linkivo — js/features/check/check-sheet.js  (v2.3.0)
 * Purpose: the dead-link checker's own popup. runCheck() starts a check job and opens it; openCheckSheet() reopens it from the task chip. While it runs the
 *          popup shows live progress (it can be closed: the job continues in the task chip); when it ends it shows how many links are fine, dead and unsure,
 *          and lists the dead ones with Open preview, plus "Delete dead links", "Keep them" (clears the flag) and "Check again".
 *          A link is flagged dead only for a real "gone" answer (404, 410, the domain does not exist); unsure answers never change a link.
 * API: runCheck({ engine, queue, router, ids, title? }) -> Promise<void>      openCheckSheet({ engine, queue, router, jobId }) -> sheet api
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { plural } from '../../core/format.js';
import { linkTitle, safeHref } from '../library/folder-style.js';
import { bulk } from '../library/link-actions.js';
import { startCheck, statsOf } from './check-job.js';

export async function runCheck({ engine, queue, router, ids, title }) {
  if (!queue) { toast('Checking links is not ready yet. Try again in a moment.', { type: 'error' }); return; }
  const live = ids.filter((id) => { const l = engine.getLink(id); return l && !l.del; });
  if (!live.length) { toast('There are no links to check.'); return; }
  const job = await startCheck({ queue, engine, ids: live, title });
  openCheckSheet({ engine, queue, router, jobId: job.id });
}

export function openCheckSheet({ engine, queue, router, jobId }) {
  const body = h('div', { class: 'chk' });
  let sheet = null, off = () => {};
  const job = () => queue.get(jobId);
  const stat = (n, label, tone) => h('div', { class: ['chk-stat', tone] }, h('b', { text: String(n) }), h('span', { text: label }));

  function paint() {
    const j = job();
    if (!j) { body.replaceChildren(h('p', { text: 'This check is no longer available.' })); return; }
    const s = statsOf(j), total = j.total || (j.params && j.params.ids.length) || 0, pct = total ? Math.round(((j.done || 0) / total) * 100) : 0;
    const running = j.status === 'running' || j.status === 'queued', paused = j.status === 'paused';
    const kids = [];
    if (running || paused) {
      kids.push(h('div', { class: 'chk-prog', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) }, h('i', { style: { width: pct + '%' } })),
        h('p', { class: 'chk-line', text: `${paused ? 'Paused. ' : ''}Checked ${j.done || 0} of ${plural(total, 'link')}` }));
    }
    if (j.status === 'failed') kids.push(h('p', { class: 'help is-error', role: 'alert', text: j.error || 'The check stopped. Try again.' }));
    kids.push(h('div', { class: 'chk-stats' }, stat(s.ok, 'Working', 'is-ok'), stat(s.dead, 'Dead', 'is-dead'), stat(s.unsure + s.invalid, 'Unsure', 'is-unsure')));
    if (!running && !paused) kids.push(h('p', { class: 'chk-note', text: s.unsure + s.invalid ? 'Unsure means the site did not answer clearly (it may block robots or be slow). Those links were left as they are.' : 'Links marked dead are only those the site says are gone.' }));
    const dead = s.deadIds.map((id) => engine.getLink(id)).filter((l) => l && !l.del && l.dd);
    if (dead.length) {
      kids.push(h('h3', { class: 'chk-h', text: `Dead links (${dead.length})` }),
        h('ul', { class: 'chk-list' }, dead.slice(0, 50).map((l) => h('li', null, h('a', { class: 'chk-item', href: `/link/${encodeURIComponent(l.id)}`, on: { click: () => sheet && sheet.close() } }, h('span', { class: 'chk-t', text: linkTitle(l) }), h('span', { class: 'chk-u', text: l.url })), h('a', { class: 'btn-icon', href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Open ${linkTitle(l)} in a new tab`, 'data-tip': 'Open in new tab' }, icon('external', { size: 18 }))))),
        dead.length > 50 && h('p', { class: 'chk-note', text: `Showing 50 of ${dead.length}. Use the Dead links filter in the folder to see them all.` }));
    }
    const acts = [];
    if (running || paused) { acts.push(h('button', { type: 'button', class: 'btn', on: { click: () => { queue.stop(jobId); } } }, 'Stop'), h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => sheet.close() } }, 'Run in background')); }
    else {
      if (dead.length) acts.push(h('button', { type: 'button', class: 'btn btn-danger', on: { click: async () => { if (await confirmDialog({ title: `Delete ${plural(dead.length, 'dead link')}?`, message: 'They move to the Recycle Bin and stay there for 15 days.', confirmLabel: 'Delete', danger: true })) { await bulk.remove(engine, dead.map((l) => l.id)); paint(); } } } }, icon('trash', { size: 16 }), 'Delete dead links'),
        h('button', { type: 'button', class: 'btn', on: { click: async () => { await engine.updateLinks(dead.map((l) => l.id), { dd: null }); toast('Dead flags cleared.'); paint(); } } }, 'Keep them'));
      acts.push(h('button', { type: 'button', class: 'btn', on: { click: () => { sheet.close(); runCheck({ engine, queue, router, ids: j.params.ids, title: 'Checking links' }); } } }, icon('refresh', { size: 16 }), 'Check again'), h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => sheet.close() } }, 'Done'));
    }
    kids.push(h('div', { class: 'chk-foot' }, acts));
    body.replaceChildren(...kids);
  }

  sheet = openSheet({ title: 'Check links', body, actions: [], wide: true, onClose: () => off() });
  off = queue.subscribe((j) => { if (j.id === jobId) paint(); });
  paint();
  return sheet;
}
