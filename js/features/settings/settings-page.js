/**
 * Linkivo — js/features/settings/settings-page.js  (v2.1.0)
 * Purpose: Settings shell driven by the registry (catalog.js). Phones: an index of sections, then one section at a time.
 *          Wide screens: index on the left, the section on the right (so /settings opens Appearance there).
 * Routes: /settings  and  /settings/:section
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { SECTIONS, findSection, entriesFor } from './catalog.js';
import { renderControl } from './controls.js';
import { renderCustom } from './custom-rows.js';
import { renderAdvanced } from './advanced-tools.js';

const ADVANCED = new Set(['debug', 'reset', 'tester']);
const wideQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 900px)') : { matches: false, addEventListener() {}, removeEventListener() {} };

export async function mount(container, ctx) {
  await loadCss('/css/pages/settings.css');
  const section = findSection(ctx.params.section);
  if (!section && wideQuery.matches) { ctx.router.navigate('/settings/' + SECTIONS[0].id); return; }

  const nav = h('nav', { class: 'set-nav', 'aria-label': 'Settings sections' }, SECTIONS.map((s) => h('a', { class: 'row', href: '/settings/' + s.id, 'aria-current': section && section.id === s.id ? 'page' : null },
    h('span', { class: 'row-ic' }, icon(s.icon)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: s.label }), h('span', { class: 'row-desc', text: s.desc })), h('span', { class: 'row-end' }, icon('chevron-right')))));

  const pane = h('div', { class: 'set-pane' });
  const view = h('div', { class: 'settings', 'data-view': section ? 'detail' : 'index' }, nav, pane);

  function renderPane() {
    pane.replaceChildren();
    if (!section) return;
    const group = h('div', { class: 'group' });
    for (const e of entriesFor(section.id)) {
      const node = e.type === 'custom' ? (ADVANCED.has(e.custom) ? renderAdvanced(e.custom, { refresh }) : renderCustom(e.custom, { router: ctx.router })) : renderControl(e);
      if (Array.isArray(node)) group.append(...node); else group.appendChild(node);
    }
    pane.append(
      h('div', { class: 'set-back' }, h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Back to settings', on: { click: () => ctx.router.back() } }, icon('arrow-left'))),
      h('div', { class: 'set-head' }, h('h2', { class: 'page-title', style: { fontSize: 'var(--fs-lg)' }, text: section.label }), h('p', { class: 'page-sub', text: section.desc })), group);
  }
  function refresh() { renderPane(); }
  renderPane();

  container.appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: section && !wideQuery.matches ? section.label : 'Settings' })),
    view));

  const onResize = () => { if (wideQuery.matches && !findSection(ctx.params.section)) ctx.router.navigate('/settings/' + SECTIONS[0].id); };
  wideQuery.addEventListener('change', onResize);
  return () => wideQuery.removeEventListener('change', onResize);
}
