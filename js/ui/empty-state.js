/**
 * Linkivo — js/ui/empty-state.js  (v2.1.0)
 * Purpose: designed empty and error states (every list has one: RULES section 5). The small ring drawings are SVG files in assets/art/;
 *          each variant is arranged differently so empty pages do not look copy-pasted.
 * API: emptyState({ art, title, text, actions:[{label, href, onClick, primary}] }) -> Element
 *      renderLoadError(container, retry)      ART_VARIANTS
 */
import { h } from '../core/dom.js';

export const ART_VARIANTS = ['library', 'random', 'import', 'search', 'menu', 'profile', 'settings', 'lost', 'error'];

/** The drawings are files in /assets/art/empty-<name>.svg, used as a mask so they take the accent color. */
function art(variant) {
  const v = ART_VARIANTS.includes(variant) ? variant : 'library';
  return h('span', { class: 'empty-art', style: { '--art': `url("/assets/art/empty-${v}.svg")` }, 'aria-hidden': 'true' });
}

export function emptyState({ art: variant = 'library', title, text = '', actions = [] }) {
  return h('section', { class: 'empty' },
    art(variant),
    h('h2', { class: 'empty-title', text: title }),
    text && h('p', { class: 'empty-text', text }),
    actions.length > 0 && h('div', { class: 'empty-actions' }, actions.map((a) => a.href
      ? h('a', { class: ['btn', a.primary && 'btn-primary'], href: a.href, text: a.label })
      : h('button', { type: 'button', class: ['btn', a.primary && 'btn-primary'], text: a.label, on: { click: a.onClick } }))));
}

export function renderLoadError(container, retry) {
  container.replaceChildren(h('div', { class: 'page' }, emptyState({
    art: 'error', title: 'This page did not load',
    text: 'Check your connection, then try again. If it keeps happening, reload the app.',
    actions: [{ label: 'Try again', primary: true, onClick: retry }]
  })));
}
