/**
 * Linkivo — js/ui/pull-refresh.js  (v2.1.2)
 * Purpose: pull down at the top of a page to refresh it (phones). The browser's own pull-to-refresh is disabled app-wide
 *          (overscroll-behavior: none on body, needed so the bottom bar and sheets behave), so the app provides its own.
 *          A small round indicator follows the finger; past the threshold, releasing runs onRefresh().
 * API: initPullRefresh({ scroller, onRefresh, enabled }) -> destroy()     pullDistance(dy) -> number (pure, tested)
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { layerCount } from '../core/nav-stack.js';

const THRESHOLD = 68, MAX = 96;
/** Rubber-band: the indicator moves at half the finger speed and stops at MAX. */
export const pullDistance = (dy) => Math.max(0, Math.min(MAX, dy * 0.5));

export function initPullRefresh({ scroller, onRefresh, enabled = () => true }) {
  const chip = h('div', { class: 'ptr', 'aria-hidden': 'true' }, icon('refresh', { size: 20 }));
  document.body.appendChild(chip);
  let startY = 0, startX = 0, pull = 0, tracking = false, busy = false;

  const show = (d, anim) => { chip.style.transition = anim ? '' : 'none'; chip.style.opacity = d > 4 ? '1' : '0'; chip.style.transform = `translateY(${d - 52}px) rotate(${d * 4}deg)`; };
  const hide = () => { chip.classList.remove('is-loading'); show(0, true); };

  function onStart(e) {
    if (busy || !enabled() || layerCount() > 0 || e.touches.length !== 1 || scroller.scrollTop > 0) return;
    if (e.target.closest && e.target.closest('.sheet, .pop, input, textarea')) return;
    tracking = true; pull = 0; startY = e.touches[0].clientY; startX = e.touches[0].clientX;
  }
  function onMove(e) {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY, dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx > dy || scroller.scrollTop > 0) { tracking = false; hide(); return; }
    pull = pullDistance(dy);
    show(pull, false);
  }
  async function onEnd() {
    if (!tracking) return;
    tracking = false;
    if (pull < THRESHOLD * 0.5) { hide(); return; } // pull is half the finger distance: 68 px of pull = about 136 px of finger travel
    busy = true; chip.classList.add('is-loading'); show(THRESHOLD * 0.6, true);
    try { await onRefresh(); } finally { busy = false; hide(); }
  }
  scroller.addEventListener('touchstart', onStart, { passive: true });
  scroller.addEventListener('touchmove', onMove, { passive: true });
  scroller.addEventListener('touchend', onEnd, { passive: true });
  scroller.addEventListener('touchcancel', () => { tracking = false; hide(); }, { passive: true });
  return () => { chip.remove(); };
}
