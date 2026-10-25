/**
 * Linkivo — js/features/settings/settings-page.js  (v2.1.3)
 * Purpose: Settings as ONE page driven by the registry (catalog.js): a heading per category, every setting below it. On wide screens
 *          a fixed category list sits on the left and follows the scroll (scroll-spy); clicking an entry scrolls to its heading.
 *          Phones (v2.1.3): the same list is a sticky horizontal bar under the top edge: it scrolls left and right, fades at the edges and keeps
 *          the current category centred.
 *          v2.2.1: the bar sits on a fully opaque background (a wrapper), the fade is drawn on the chips only, and the mouse can drag it.
 *          /settings/:section opens the page scrolled to that category (deep link).
 * Routes: /settings  and  /settings/:section
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { attachScrollRow } from '../../ui/scroll-row.js';
import { SECTIONS, findSection, entriesFor } from './catalog.js';
import { renderControl } from './controls.js';
import { renderCustom } from './custom-rows.js';
import { renderAdvanced } from './advanced-tools.js';

const ADVANCED = new Set(['debug', 'reset', 'tester', 'clearCache']);

/** Pure: which section is "current" given each section's distance from the top of the scroller (negative = already passed). */
export function activeSection(tops, atBottom, offset = 120) {
  if (!tops.length) return null;
  if (atBottom) return tops[tops.length - 1].id;
  let cur = tops[0].id;
  for (const t of tops) if (t.top <= offset) cur = t.id;
  return cur;
}

export async function mount(container, ctx) {
  await loadCss('/css/pages/settings.css');
  const target = findSection(ctx.params.section);

  const body = h('div', { class: 'set-body' });
  const navLinks = new Map();
  const nav = h('nav', { class: 'set-nav fade-x', 'aria-label': 'Settings categories' }, SECTIONS.map((s) => {
    const b = h('button', { type: 'button', class: 'set-nav-item', on: { click: () => scrollTo(s.id, true) } }, icon(s.icon, { size: 20 }), h('span', { text: s.label }));
    navLinks.set(s.id, b);
    return b;
  }));

  function renderSections() {
    body.replaceChildren(...SECTIONS.map((s) => {
      const group = h('div', { class: 'group' });
      for (const e of entriesFor(s.id)) {
        const node = e.type === 'custom' ? (ADVANCED.has(e.custom) ? renderAdvanced(e.custom, { refresh: renderSections }) : renderCustom(e.custom, { router: ctx.router })) : renderControl(e);
        if (Array.isArray(node)) group.append(...node); else group.appendChild(node);
      }
      return h('section', { class: 'set-sec', id: 'sec-' + s.id, 'aria-labelledby': 'h-' + s.id },
        h('header', { class: 'set-sec-head' }, h('h2', { class: 'set-h', id: 'h-' + s.id }, h('span', { class: 'set-h-ic' }, icon(s.icon, { size: 20 })), s.label), h('p', { class: 'set-sub', text: s.desc })), group);
    }));
  }
  renderSections();

  function scrollTo(id, smooth) {
    const el = document.getElementById('sec-' + id);
    if (!el) return;
    // keep the heading clear of the sticky category bar (phones): scroll-margin-top carries the bar height
    const gap = (typeof getComputedStyle === 'function' && parseFloat(getComputedStyle(el).scrollMarginTop)) || 16;
    const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - gap;
    if (typeof container.scrollTo === 'function') container.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' }); else container.scrollTop = Math.max(0, top);
  }

  // scroll-spy: the category list marks the section that is at the top of the page
  let frame = 0, current = null;
  function spy() {
    frame = 0;
    const base = container.getBoundingClientRect().top;
    const tops = SECTIONS.map((s) => { const el = document.getElementById('sec-' + s.id); return { id: s.id, top: el ? el.getBoundingClientRect().top - base : Infinity }; });
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4 && container.scrollTop > 0;
    const id = activeSection(tops, atBottom);
    if (id === current) return;
    current = id;
    for (const [k, b] of navLinks) { if (k === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
    // phones: slide the bar so the current chip is in view (horizontal only; scrollIntoView would also move the page)
    const chip = navLinks.get(id);
    if (chip && nav.scrollWidth > nav.clientWidth && typeof nav.scrollTo === 'function') nav.scrollTo({ left: chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' });
  }
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(spy); };
  container.addEventListener('scroll', onScroll, { passive: true });

  container.appendChild(h('div', { class: 'page is-wide' },
    h('header', { class: 'page-head is-stack' }, h('h1', { class: 'page-title', text: 'Settings' }), h('p', { class: 'page-sub', text: 'Make Linkivo look and behave the way you like.' })),
    h('div', { class: 'settings' }, h('div', { class: 'set-navwrap' }, nav), body)));

  const detachFade = attachScrollRow(nav, { arrows: false });   // v2.2.1: edge fades, touch scroll and mouse drag
  spy();
  if (target) requestAnimationFrame(() => { scrollTo(target.id, false); spy(); });
  return () => { container.removeEventListener('scroll', onScroll); detachFade(); if (frame) cancelAnimationFrame(frame); };
}
