/**
 * Linkivo — js/ui/empty-state.js  (v2.1.2)
 * Purpose: designed empty and error states (every list has one: RULES section 5). The small ring drawings are SVG files
 *          under assets/art, each arranged differently so empty pages do not look copy-pasted.
 * API: emptyState({ art, title, text, actions:[{label, href, onClick, primary}] }) -> Element
 *      renderLoadError(container, retry)      ART_VARIANTS
 */
import { h } from '../core/dom.js';

// Artwork lives as SVG files in assets/art (RULES section 9) and is painted with the brand gradient through a CSS mask.
export const ART_VARIANTS = ['library', 'import', 'random', 'search', 'menu', 'profile', 'settings', 'lost', 'error'];

function art(variant) {
  const v = ART_VARIANTS.includes(variant) ? variant : 'library';
  return h('span', { class: 'empty-art', 'aria-hidden': 'true', style: { '--art': `url(/assets/art/${v}.svg)` } });
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
