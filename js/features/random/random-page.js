/**
 * Linkivo — js/features/random/random-page.js  (v2.4.0)
 * Purpose: /random — Random Discover's start page: ONE panel for folders and filters (random-panel.js), then "Open a random link" opens the Preview
 *          embedded in random mode (/link/:lid?random=1) where an icon asks for the next link. `/random?folder=<id>` (folder menu) starts with that folder.
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { emptyState } from '../../ui/empty-state.js';
import { toast } from '../../ui/toast.js';
import { loadCss } from '../../core/css-loader.js';
import { getEngine } from '../../core/app-data.js';
import { buildPanel } from './random-panel.js';
import { session, startFor, nextLink, resetSeen } from './random-session.js';

export async function mount(container, ctx) {
  await loadCss('/css/pages/random.css');
  const engine = getEngine(), router = ctx.router;
  const page = h('div', { class: 'page rnd page-enter' });
  container.appendChild(page);
  if (!engine || !engine.listLinks().length) {
    page.append(h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Random Discover' })),
      emptyState({ art: 'search', title: 'Nothing to discover yet', text: 'Save some links first, then come back for a surprise.', actions: [{ label: 'Import links', href: '/import', primary: true }] }));
    return () => {};
  }
  if (ctx.query.folder) startFor(ctx.query.folder); else if (!session.active) resetSeen();
  async function start() {
    const l = await nextLink(engine);
    if (!l) { toast('No link matches these filters.'); return; }
    router.navigate(`/link/${encodeURIComponent(l.id)}?random=1`);
  }
  const panel = buildPanel({ engine, onStart: start });
  page.append(h('header', { class: 'page-head is-stack' }, h('h1', { class: 'page-title', text: 'Random Discover' }),
    h('p', { class: 'page-sub', text: 'Pick folders and filters, then open a link you may have forgotten. Opening one by Random costs it 10 points; like it to give them back.' })), panel.el);
  const off = engine.subscribe((e) => { if (e.type === 'change' || e.type === 'ready') panel.refresh(); });
  return () => { off(); };
}
