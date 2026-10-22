/**
 * Linkivo — js/ui/pull-refresh.js  (v2.1.1)
 * Purpose: pull-to-refresh for phones. The page area is its own scroller with overscroll disabled (so the browser's own pull does not
 *          work in an installed app); this restores it. Pull down from the very top, a ring fills, release past the threshold to reload.
 *          Off with Settings > Controls > Pull to refresh. Never starts while an overlay is open or while background jobs run.
 * API: initPullRefresh({ root, enabled(), canRefresh(), onRefresh() }) -> destroy()     pullProgress(dy, threshold) -> 0..1 (pure, tested)
 */
import { h } from '../core/dom.js';

export const THRESHOLD = 72;
export function pullProgress(dy, threshold = THRESHOLD) { return Math.max(0, Math.min(1, dy / threshold)); }

export function initPullRefresh({ root, enabled = () => true, canRefresh = () => true, onRefresh = () => location.reload() }) {
  const ring = h('span', { class: 'ring' });
  const box = h('div', { class: 'ptr', 'aria-hidden': 'true' }, ring);
  document.body.appendChild(box);
  let startY = 0, dy = 0, active = false;

  const place = (y, show) => { box.style.transform = `translate(-50%, ${y}px)`; box.style.opacity = show ? '1' : '0'; };
  const reset = () => { box.classList.remove('is-pulling'); place(-56, false); ring.classList.remove('is-spin'); };

  function onStart(e) {
    if (e.touches.length !== 1 || !enabled() || root.scrollTop > 0 || document.querySelector('.overlay, .pop')) return;
    startY = e.touches[0].clientY; dy = 0; active = true;
  }
  function onMove(e) {
    if (!active) return;
    const d = e.touches[0].clientY - startY;
    if (d <= 0 || root.scrollTop > 0) { if (dy) { dy = 0; reset(); } active = d > 0 ? active : false; return; }
    dy = d * 0.55;
    if (e.cancelable) e.preventDefault(); // stop the page from rubber-banding while we show our own indicator
    box.classList.add('is-pulling');
    ring.style.setProperty('--p', String(Math.round(pullProgress(dy) * 100)));
    place(Math.min(dy, 96) - 44, true);
  }
  function onEnd() {
    if (!active) return;
    active = false;
    if (dy >= THRESHOLD && canRefresh()) { ring.classList.add('is-spin'); place(24, true); setTimeout(onRefresh, 260); }
    else reset();
    dy = 0;
  }
  root.addEventListener('touchstart', onStart, { passive: true });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onEnd, { passive: true });
  root.addEventListener('touchcancel', onEnd, { passive: true });
  reset();
  return () => { root.removeEventListener('touchstart', onStart); root.removeEventListener('touchmove', onMove); root.removeEventListener('touchend', onEnd); root.removeEventListener('touchcancel', onEnd); box.remove(); };
}
