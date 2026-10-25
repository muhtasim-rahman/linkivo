/**
 * Linkivo — js/ui/refresh-button.js  (v2.2.1)
 * Purpose: wide screens cannot pull down to refresh, so pages that can change get a refresh icon in their header (owner request). Hidden on phones, where
 *          pull-to-refresh does the same job. The icon spins while the refresh runs and the button ignores taps until it is done.
 * API: refreshButton(run) -> Element      run: async () => void   (usually the page's own refresh function)
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { log } from '../core/logger.js';

export function refreshButton(run) {
  let busy = false;
  const btn = h('button', { type: 'button', class: 'btn-icon only-wide', 'aria-label': 'Refresh', 'data-tip': 'Refresh', on: { click: async () => {
    if (busy) return; busy = true; btn.classList.add('is-spinning');
    try { await Promise.all([run(), new Promise((r) => setTimeout(r, 450))]); } catch (e) { log.warn('refresh', 'refresh button failed', e); }
    busy = false; btn.classList.remove('is-spinning');
  } } }, icon('refresh', { size: 20 }));
  return btn;
}
