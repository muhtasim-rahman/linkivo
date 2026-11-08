/**
 * Linkivo — js/ui/unlock-burst.js  (v2.5.3)
 * Purpose: the short "unlocked" animation shown on the search page next to the toast when the search-box code opens the locked folders: a padlock whose shackle lifts,
 *          with a soft ring that spreads. Pure CSS (css/components/unlock-burst.css), about 1.4 seconds, removes itself. With reduced motion it is a still padlock that fades.
 * API: playUnlockBurst(container, { inline }) -> Promise (resolves when it is gone)
 *      v2.5.4 (owner): `inline: true` plays it INSIDE `container` (the icon slot of the search placeholder) instead of over the whole screen; the slot's own icon is hidden meanwhile.
 */
import { h } from '../core/dom.js';
import { loadCss } from '../core/css-loader.js';

export async function playUnlockBurst(container, { inline = false } = {}) {
  if (!container) return;
  await loadCss('/css/components/unlock-burst.css');
  const svg = 'http://www.w3.org/2000/svg';
  const lock = document.createElementNS(svg, 'svg');
  lock.setAttribute('viewBox', '0 0 48 48'); lock.setAttribute('class', 'ub-svg'); lock.setAttribute('aria-hidden', 'true');
  lock.innerHTML = '<path class="ub-shackle" d="M16 22v-6a8 8 0 0 1 16 0v6" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><rect x="10" y="22" width="28" height="20" rx="5" fill="currentColor"/><circle cx="24" cy="31" r="2.6" fill="var(--bg)"/>';   // safe: a fixed string, nothing from the user
  const node = h('div', { class: ['ub', inline && 'is-inline'], role: 'img', 'aria-label': 'Unlocked' }, h('span', { class: 'ub-ring' }), h('span', { class: 'ub-ring is-late' }), lock);
  if (inline) container.classList.add('is-unlocking');
  container.append(node);
  return new Promise((resolve) => { setTimeout(() => { node.classList.add('is-out'); setTimeout(() => { node.remove(); if (inline) container.classList.remove('is-unlocking'); resolve(); }, 260); }, 1300); });
}
