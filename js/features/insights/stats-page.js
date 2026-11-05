/**
 * Linkivo — js/features/insights/stats-page.js  (v2.5.2)
 * Purpose: /profile/stats — a quiet overview of the library: totals, links added per month (6 bars), biggest folders, most saved sites, most used tags. Reads only what the engine holds.
 *          Locked folders are never counted (they are not in the engine).
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../core/dom.js';
import { loadCss } from '../../core/css-loader.js';
import { emptyState } from '../../ui/empty-state.js';
import { getEngine } from '../../core/app-data.js';
import { plural } from '../../core/format.js';
import { computeStats } from './stats-core.js';

const stat = (n, label) => h('div', { class: 'st-stat' }, h('span', { class: 'st-n', text: String(n) }), h('span', { class: 'st-l', text: label }));
const list = (title, rows, empty) => h('section', { class: 'st-sec' }, h('h2', { class: 'st-h', text: title }), rows.length ? h('ol', { class: 'st-list' }, rows.map((r) => h('li', {}, h('span', { text: r.name }), h('span', { class: 'st-c', text: String(r.count) })))) : h('p', { class: 'help', text: empty }));

export async function mount(container) {
  await loadCss('/css/pages/pages.css');
  const engine = getEngine();
  const page = h('div', { class: 'page page-enter stats' }, h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Stats' })));
  container.appendChild(page);
  if (!engine) { page.appendChild(emptyState({ art: 'lost', title: 'Your data is not ready', text: 'Wait a moment and try again.', actions: [] })); return () => {}; }
  const body = h('div', { class: 'st-body' }); page.appendChild(body);
  const draw = () => {
    const s = computeStats(engine.listFolders(), engine.listLinks());
    if (!s.links) { body.replaceChildren(emptyState({ art: 'library', title: 'Nothing to count yet', text: 'Save or import some links and the numbers appear here.', actions: [{ label: 'Import links', href: '/import' }] })); return; }
    const max = Math.max(1, ...s.months.map((m) => m.count));
    body.replaceChildren(
      h('div', { class: 'st-grid' }, stat(s.folders, plural(s.folders, 'folder').replace(/^\d+ /, '')), stat(s.links, 'links'), stat(s.favourites, 'favourites'), stat(s.readLater, 'read later'), stat(s.tagged, 'tagged'), stat(s.dead, 'dead links')),
      h('section', { class: 'st-sec' }, h('h2', { class: 'st-h', text: 'Added in the last 6 months' }), h('div', { class: 'st-bars', role: 'img', 'aria-label': s.months.map((m) => `${m.label}: ${m.count}`).join(', ') }, s.months.map((m) => h('div', { class: 'st-bar' }, h('span', { class: 'st-fill', style: { height: `${Math.round((m.count / max) * 100)}%` } }), h('span', { class: 'st-m', text: m.label }))))),
      list('Biggest folders', s.topFolders, 'No folders yet.'), list('Most saved sites', s.topHosts, 'No sites yet.'), list('Most used tags', s.topTags, 'No tags yet.'));
  };
  draw(); const off = engine.subscribe((e) => { if (e.type === 'change' || e.type === 'ready') draw(); });
  return () => off();
}
