/**
 * Linkivo — js/ui/skeleton.js  (v2.1.0)
 * Purpose: loading placeholders. Skeleton rows for lists, three loading dots for short waits.
 * API: skeletonList(rows=5) -> Element    loadingDots() -> Element
 */
import { h } from '../core/dom.js';

export function skeletonList(rows = 5) {
  const widths = [62, 48, 72, 55, 66, 44, 58];
  return h('div', { class: 'skel-list', 'aria-busy': 'true', 'aria-label': 'Loading' },
    Array.from({ length: rows }, (_, i) => h('div', { class: 'skel-row' },
      h('div', { class: 'skel', style: { width: '28px', height: '28px', borderRadius: '8px' } }),
      h('div', { class: 'skel', style: { width: widths[i % widths.length] + '%' } }))));
}

export const loadingDots = () => h('span', { class: 'dots', role: 'status', 'aria-label': 'Loading' }, h('i'), h('i'), h('i'));
