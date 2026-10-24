/**
 * Linkivo — js/features/import/import-page.js  (v2.2.0)
 * Purpose: /import — the page behind the Import popup. It opens the popup at once (unless ?noopen=1), accepts files dropped anywhere on the page,
 *          lists recent imports and background tasks (status, details, Undo through the details sheet) and explains what can be imported.
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { emptyState } from '../../ui/empty-state.js';
import { loadCss } from '../../core/css-loader.js';
import { getEngine, getQueue } from '../../core/app-data.js';
import { plural, relativeTime } from '../../core/format.js';
import { FORMATS } from './parsers.js';
import { openImport } from './import-sheet.js';
import { openJobDetails } from './import-progress.js';

const STATUS = { queued: 'Waiting', running: 'Working', paused: 'Paused', stopped: 'Stopped', failed: 'Failed', done: 'Finished' };

export async function mount(container, ctx) {
  if (!getEngine()) { container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'Your data is not ready', text: 'Wait a moment and try again, or reload the app.', actions: [{ label: 'Open library', href: '/library', primary: true }] }))); return () => {}; }
  await loadCss('/css/pages/data.css');
  const engine = getEngine(), queue = getQueue(), router = ctx.router;
  const page = h('div', { class: 'page imp-page page-enter' }); container.appendChild(page);
  const list = h('div', { class: 'imp-jobs', role: 'list' });
  const open = (files = []) => openImport({ engine, router, files });
  page.append(
    h('header', { class: 'page-head is-stack' }, h('h1', { class: 'page-title', text: 'Import links' }), h('p', { class: 'page-sub', text: 'Paste text or add files. Linkivo finds every link, skips duplicates and saves them in the background.' })),
    h('div', { class: 'imp-hero' }, h('div', { class: 'imp-hero-art', 'aria-hidden': 'true' }, icon('upload', { size: 30 })),
      h('div', { class: 'imp-hero-text' }, h('strong', { text: 'Drop files anywhere on this page' }), h('span', { class: 'help', text: `${FORMATS.length} file types, plus a Linkivo backup that restores in seconds.` })),
      h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => open() } }, icon('plus', { size: 18 }), 'Import links')),
    h('section', { 'aria-labelledby': 'imp-recent' }, h('h2', { class: 'imp-h2', id: 'imp-recent', text: 'Recent imports' }), list));

  function renderJobs() {
    const jobs = queue.list().filter((j) => j.type === 'import' || j.type === 'enrich').sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
    if (!jobs.length) { list.replaceChildren(h('p', { class: 'help imp-none', text: 'Nothing imported yet. Your imports and title fetches will be listed here.' })); return; }
    list.replaceChildren(...jobs.map((j) => h('div', { class: 'imp-job', role: 'listitem' }, icon(j.type === 'enrich' ? 'refresh' : 'import', { size: 20 }),
      h('span', { class: 'ltext' }, h('span', { class: 'ltitle', text: j.title || 'Task' }), h('span', { class: 'lsub', text: `${STATUS[j.status] || j.status}${j.total ? `  \u00b7  ${plural(j.done, 'item')} of ${j.total}` : ''}  \u00b7  ${relativeTime(j.createdAt)}` })),
      h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => openJobDetails({ queue, engine, router, jobId: j.id }) } }, 'Details'),
      ['done', 'stopped', 'failed'].includes(j.status) && h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Remove from the list', on: { click: () => queue.remove(j.id) } }, icon('close', { size: 16 })))));
  }
  const offJob = queue.subscribe(() => renderJobs()), offRem = queue.onRemoved(() => renderJobs());
  renderJobs();

  const over = (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); page.classList.add('is-over'); } };
  const leave = () => page.classList.remove('is-over');
  const drop = (e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); leave(); open(e.dataTransfer.files); } };
  page.addEventListener('dragover', over); page.addEventListener('dragleave', leave); page.addEventListener('drop', drop);
  if (ctx.query.noopen !== '1') setTimeout(() => open(), 60);
  return () => { offJob(); offRem?.(); };
}
