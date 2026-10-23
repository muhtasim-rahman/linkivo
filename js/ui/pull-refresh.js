/**
 * Linkivo — js/ui/pull-refresh.js  (v2.1.4)
 * Purpose: pull down at the top of a page to refresh it (phones). The browser's own pull-to-refresh is disabled app-wide
 *          (overscroll-behavior: none on html, contain on the page scroller; the browser's version reloads the whole app and replays the
 *          splash), so the app provides its own in-app refresh. It only runs on pages that ask for it (`enabled()`), has no setting.
 * Design (v2.1.4, redesigned after owner feedback):
 *   - the whole page follows the finger down with resistance, and a round indicator sits in the space that opens up
 *   - a ring around the indicator fills as you pull; past the threshold the arrow turns up ("release")
 *   - on release the page settles at a hold position and the ring SPINS RIGHT THERE (v2.1.3 sent the indicator back to the top first and
 *     only then spun it, which looked wrong)
 *   - when the refresh is done, page and indicator go back together
 * API: initPullRefresh({ scroller, onRefresh, enabled }) -> destroy()     pullDistance(dy, max) -> number (pure, tested)
 *      THRESHOLD, HOLD, MAX (pull units, pixels the page has moved down; the phone's top safe-area inset is added on top)
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { layerCount } from '../core/nav-stack.js';
import { log } from '../core/logger.js';

export const THRESHOLD = 64, HOLD = 60, MAX = 112;
/** Resistance curve: close to 1:1 at the start, then it stiffens and never passes `max`. */
export const pullDistance = (dy, max = MAX) => (dy <= 0 ? 0 : Math.min(max, max * (1 - Math.exp(-dy / 150))));

export function initPullRefresh({ scroller, onRefresh, enabled = () => true }) {
  const ring = h('span', { class: 'ptr-ring' });
  const arrow = h('span', { class: 'ptr-arrow' }, icon('arrow-left', { size: 18 })); // rotated by CSS: points down, then up
  const chip = h('div', { class: 'ptr', 'aria-hidden': 'true' }, ring, arrow);
  document.body.appendChild(chip);
  let startY = 0, startX = 0, pull = 0, tracking = false, busy = false, inset = 0;

  /** The phone's top safe-area inset in pixels (notch / status bar); measured with a probe because env() is not readable directly. */
  function measureInset() {
    const probe = h('div', { style: { position: 'fixed', top: '0', visibility: 'hidden', paddingTop: 'var(--safe-t)' } });
    document.body.appendChild(probe);
    const px = parseFloat(typeof getComputedStyle === 'function' ? getComputedStyle(probe).paddingTop : '0') || 0;
    probe.remove();
    return px;
  }

  // d = how far the page has moved down; the indicator lives below the inset, so progress counts from the inset
  function render(d, { animate = false } = {}) {
    const span = Math.max(1, THRESHOLD);
    const p = Math.max(0, Math.min(1, (d - inset) / (span + inset * 0.2)));
    scroller.style.transition = animate ? 'transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1)' : 'none';
    scroller.style.transform = d > 0 ? `translate3d(0, ${d}px, 0)` : '';
    chip.style.setProperty('--p', p.toFixed(3));
    chip.style.setProperty('--ty', `${inset}px`);
    chip.classList.toggle('is-ready', p >= 1);
    chip.classList.toggle('is-on', p > 0.02);
  }
  function reset() {
    chip.classList.remove('is-loading', 'is-ready', 'is-on');
    chip.classList.add('is-leaving');
    render(0, { animate: true });
    setTimeout(() => { if (!busy && !tracking) { scroller.style.transition = ''; scroller.style.transform = ''; chip.classList.remove('is-leaving'); chip.style.setProperty('--p', '0'); } }, 300);
  }

  function onStart(e) {
    if (busy || !enabled() || layerCount() > 0 || e.touches.length !== 1 || scroller.scrollTop > 0) return;
    if (e.target.closest && e.target.closest('.sheet, .pop, input, textarea, .set-nav')) return;
    inset = measureInset();
    tracking = true; pull = 0; startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    chip.classList.remove('is-leaving');
  }
  function onMove(e) {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY, dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx > dy || scroller.scrollTop > 0) { tracking = false; reset(); return; }
    pull = pullDistance(dy, MAX + inset);
    render(pull);
  }
  async function onEnd() {
    if (!tracking) return;
    tracking = false;
    if (pull - inset < THRESHOLD) { reset(); return; }
    busy = true;
    chip.classList.add('is-loading');
    render(HOLD + inset, { animate: true }); // settle where the ring already is; the ring spins in place
    try { await onRefresh(); } catch (e) { log.warn('pull-refresh', 'refresh failed', e); } // never an unhandled rejection from a touch handler
    finally { busy = false; reset(); }
  }
  scroller.addEventListener('touchstart', onStart, { passive: true });
  scroller.addEventListener('touchmove', onMove, { passive: true });
  scroller.addEventListener('touchend', onEnd, { passive: true });
  scroller.addEventListener('touchcancel', () => { if (tracking) { tracking = false; reset(); } }, { passive: true });
  return () => { chip.remove(); scroller.style.transform = ''; scroller.style.transition = ''; };
}
