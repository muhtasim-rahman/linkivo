/**
 * Linkivo — js/ui/empty-state.js  (v2.1.0)
 * Purpose: designed empty and error states (every list has one: RULES section 5). The small ring drawings are built from
 *          the brand's ring shape; each variant is arranged differently so empty pages do not look copy-pasted.
 * API: emptyState({ art, title, text, actions:[{label, href, onClick, primary}] }) -> Element
 *      renderLoadError(container, retry)      ART_VARIANTS
 */
import { h } from '../core/dom.js';

const SHAPES = {
  library: [['c', 40, 52, 26], ['c', 70, 52, 26], ['l', 24, 88, 100, 88], ['l', 24, 14, 60, 14]],
  random: [['c', 66, 48, 30], ['c', 66, 48, 14, 1], ['c', 104, 22, 5, 2], ['c', 24, 76, 4, 2]],
  import: [['c', 66, 52, 28], ['l', 66, 18, 66, 50], ['l', 54, 38, 66, 50], ['l', 78, 38, 66, 50]],
  search: [['c', 56, 46, 28], ['l', 76, 66, 104, 90], ['c', 56, 46, 12, 1]],
  menu: [['c', 36, 48, 20], ['c', 66, 48, 20], ['c', 96, 48, 20]],
  profile: [['c', 66, 36, 18], ['c', 66, 100, 40], ['c', 66, 36, 26, 1]],
  settings: [['l', 20, 30, 112, 30], ['c', 88, 30, 9, 3], ['l', 20, 66, 112, 66], ['c', 44, 66, 9, 3]],
  lost: [['c', 50, 48, 28], ['c', 86, 48, 28, 1], ['l', 66, 20, 66, 76, 1]],
  error: [['c', 66, 48, 30, 1], ['l', 66, 32, 66, 52], ['c', 66, 63, 2, 2]]
};
export const ART_VARIANTS = Object.keys(SHAPES);

function art(variant) {
  const parts = (SHAPES[variant] || SHAPES.library).map(([t, a, b, c, d, e]) => {
    if (t === 'l') return h('line', { x1: a, y1: b, x2: c, y2: d, 'stroke-dasharray': e ? '3 5' : null });
    // c: cx, cy, r, mode (1 = dashed ring, 2 = filled dot, 3 = filled ring knob)
    const mode = d;
    return h('circle', { cx: a, cy: b, r: c, fill: mode === 2 ? 'currentColor' : mode === 3 ? 'var(--surface)' : 'none', 'stroke-dasharray': mode === 1 ? '4 6' : null, opacity: mode === 1 ? 0.55 : 1 });
  });
  return h('svg', { class: 'empty-art', viewBox: '0 0 132 100', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' }, parts);
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
