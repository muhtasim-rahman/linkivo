/**
 * Linkivo — js/features/settings/settings-page.js  (v2.1.1, rebuilt)
 * Purpose: Settings as ONE page with category headings (no separate tabs). PC: a category list stays fixed beside the content and follows the
 *          scroll; clicking a category scrolls to it. Phones: a sticky chip bar does the same. Driven by the registry (catalog.js).
 * Routes: /settings  and  /settings/:section (opens scrolled to that category)
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { attachScrollFade } from '../../ui/scroll-fade.js';
import { loadCss } from '../../core/css-loader.js';
import { SECTIONS, entriesFor } from './catalog.js';
import { renderControl } from './controls.js';
import { renderCustom } from './custom-rows.js';
import { renderAdvanced } from './advanced-tools.js';

const ADVANCED = new Set(['debug', 'reset', 'tester']);
const CARDS = new Set(['about', 'developer', 'legal']); // blocks that bring their own card, not rows in a group

export async function mount(container, ctx) {
  await loadCss('/css/pages/settings.css');
  const sections = new Map();
  let active = null, frame = 0;

  const links = SECTIONS.map((s) => h('button', { type: 'button', class: 'set-link', 'data-sec': s.id, 'aria-current': 'false', on: { click: () => goTo(s.id) } }, icon(s.icon, { size: 20 }), h('span', { text: s.label })));
  const chips = SECTIONS.map((s) => h('button', { type: 'button', class: 'chip', 'data-sec': s.id, 'aria-current': 'false', text: s.label, on: { click: () => goTo(s.id) } }));
  const chipsIn = h('div', { class: 'set-chips-in fade-x' }, chips);

  function renderSection(s) {
    const entries = entriesFor(s.id);
    const group = h('div', { class: 'group' });
    const cards = [];
    for (const e of entries) {
      const node = e.type === 'custom' ? (ADVANCED.has(e.custom) ? renderAdvanced(e.custom, { refresh: refreshAll }) : renderCustom(e.custom, { router: ctx.router })) : renderControl(e);
      const list = Array.isArray(node) ? node : [node];
      if (e.type === 'custom' && CARDS.has(e.custom)) cards.push(...list); else group.append(...list);
    }
    const el = h('section', { class: 'set-section', id: 'set-' + s.id, 'data-sec': s.id, 'aria-labelledby': 'set-h-' + s.id },
      h('div', { class: 'set-head' }, h('h2', { id: 'set-h-' + s.id, text: s.label }), h('p', { text: s.desc })),
      group.childNodes.length ? group : null, ...cards);
    sections.set(s.id, el);
    return el;
  }

  const body = h('div', { class: 'set-body' });
  const build = () => { sections.clear(); body.replaceChildren(...SECTIONS.map(renderSection)); };
  function refreshAll() { const y = container.scrollTop; build(); container.scrollTop = y; }
  build();

  function setActive(id) {
    if (active === id) return;
    active = id;
    for (const n of [...links, ...chips]) n.setAttribute('aria-current', String(n.dataset.sec === id));
    const chip = chips.find((c) => c.dataset.sec === id);
    if (chip && chip.scrollIntoView) { const box = chipsIn.getBoundingClientRect(), r = chip.getBoundingClientRect(); chipsIn.scrollLeft += r.left - box.left - 24; }
  }
  /** The last section whose top has passed the reading line (a third from the top) is the current one. */
  function spy() {
    frame = 0;
    const line = container.getBoundingClientRect().top + Math.max(96, container.clientHeight * 0.3);
    let cur = SECTIONS[0].id;
    for (const s of SECTIONS) if (sections.get(s.id).getBoundingClientRect().top <= line) cur = s.id;
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1].id; // bottom of the page = last category
    setActive(cur);
  }
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(spy); };
  function goTo(id, instant = false) {
    const el = sections.get(id);
    if (!el) return;
    setActive(id);
    if (el.scrollIntoView) el.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
  }

  container.addEventListener('scroll', onScroll, { passive: true });
  container.appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('div', { style: { flex: 1, minWidth: 0 } }, h('h1', { class: 'page-title', text: 'Settings' }), h('p', { class: 'page-sub', text: 'How Linkivo looks, behaves and stores your data.' }))),
    h('div', { class: 'settings' }, h('nav', { class: 'set-nav', 'aria-label': 'Settings categories' }, links), h('div', { style: { minWidth: 0 } }, h('div', { class: 'set-chips' }, chipsIn), body))));
  const detach = attachScrollFade(chipsIn);
  setActive(SECTIONS[0].id);
  if (ctx.params.section && sections.has(ctx.params.section)) setTimeout(() => goTo(ctx.params.section, true), 0);
  return () => { container.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); detach(); };
}
