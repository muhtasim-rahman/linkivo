/**
 * Linkivo — js/ui/brand.js  (v2.1.1)
 * Purpose: the logo and wordmark as elements that FOLLOW THE ACCENT COLOR (owner request): the logo is drawn through a CSS mask
 *          (assets/brand/logo-mask.svg) filled with the brand gradient, which is built from the chosen accent in css/core/tokens.css.
 * API: brandMark(size) -> Element     brandWord(cls) -> Element ("linkivo" with gradient i-letters)     logoTile(size) -> Element (white rounded tile)
 */
import { h } from '../core/dom.js';

export function brandMark(size = 32, cls = '') {
  return h('span', { class: ['brand-mark', cls], style: { width: Math.round(size * 1.092) + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
}
export function brandWord(cls = '') {
  return h('span', { class: ['brand-word', cls], 'aria-label': 'Linkivo' }, 'l', h('i', { text: 'i' }), 'nk', h('i', { text: 'i' }), 'vo');
}
/** White rounded tile so the gradient logo stays readable on dark backgrounds (login side panel, About). */
export function logoTile(size = 64) {
  return h('span', { class: 'logo-tile', style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' }, brandMark(Math.round(size * 0.5)));
}
