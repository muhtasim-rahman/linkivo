/**
 * Linkivo — js/ui/pull-refresh.js  (v2.2.1)
 * Purpose: pull down at the top of a page to refresh it (phones). The browser's own pull-to-refresh is disabled app-wide (it reloads the whole app and
 *          replays the splash), so the app provides its own in-app refresh. It only runs on pages that ask for it (`enabled()`), has no setting.
 * Design (v2.2.1, owner request): the PAGE STAYS STILL. Only a round indicator slides down from above the screen, following the finger with resistance.
 *   - while pulling, the refresh icon turns with the pull and a ring around it fills; past the threshold the ring completes and the indicator pops slightly
 *   - on release it settles at its resting spot and the icon spins THERE; when the refresh is done it slides back up and fades out
 *   (v2.1.4 moved the whole page down, which looked heavy and the icon barely moved.)
 * API: initPullRefresh({ scroller, onRefresh, enabled }) -> destroy()     pullDistance(dy, max) -> number (pure, tested)
 *      indicatorY(d, inset) -> px offset of the indicator (pure)      THRESHOLD, REST, MAX
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { layerCount } from '../core/nav-stack.js';
import { log } from '../core/logger.js';

export const THRESHOLD = 70, REST = 72, MAX = 130;
const CHIP = 40, HIDDEN = -(CHIP + 12);
/** Resistance curve: close to 1:1 at the start, then it stiffens and never passes `max`. */
export const pullDistance = (dy, max = MAX) => (dy <= 0 ? 0 : Math.min(max, max * (1 - Math.exp(-dy / 150))));
/** Vertical position of the indicator for a pull of `d` pixels: hidden above the screen at 0, below the status bar at the threshold. */
export const indicatorY = (d, inset = 0) => HIDDEN + inset + d * 0.95;

export function initPullRefresh({ scroller, onRefresh, enabled = () => true }) {
  const glyph = h('span', { class: 'ptr-glyph' }, icon('refresh', { size: 20 }));
  const ring = h('span', { class: 'ptr-ring' });
  const chip = h('div', { class: 'ptr', 'aria-hidden': 'true' }, ring, glyph);
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
  function place(y, { animate = false } = {}) {
    chip.style.transition = animate ? 'transform 300ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 200ms ease' : 'none';
    chip.style.transform = `translate3d(0, ${y}px, 0)`;
  }
  function render(d) {
    const p = Math.max(0, Math.min(1, d / THRESHOLD));
    place(indicatorY(d, inset));
    chip.style.setProperty('--p', p.toFixed(3));
    chip.style.setProperty('--turn', `${(p * 300).toFixed(0)}deg`);
    chip.classList.toggle('is-ready', p >= 1);
    chip.classList.toggle('is-on', d > 2);
  }
  function leave() {
    chip.classList.remove('is-loading', 'is-ready'); chip.classList.add('is-leaving');
    place(HIDDEN + inset - 8, { animate: true });
    setTimeout(() => { if (!busy && !tracking) { chip.classList.remove('is-on', 'is-leaving'); chip.style.setProperty('--p', '0'); place(HIDDEN, {}); } }, 320);
  }

  function onStart(e) {
    if (busy || !enabled() || layerCount() > 0 || e.touches.length !== 1 || scroller.scrollTop > 0) return;
    if (e.target.closest && e.target.closest('.sheet, .pop, input, textarea, .set-nav, .fade-x')) return;
    inset = measureInset();
    tracking = true; pull = 0; startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    chip.classList.remove('is-leaving');
  }
  function onMove(e) {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY, dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx > dy || scroller.scrollTop > 0) { tracking = false; leave(); return; }
    pull = pullDistance(dy);
    render(pull);
  }
  async function onEnd() {
    if (!tracking) return;
    tracking = false;
    if (pull < THRESHOLD) { leave(); return; }
    busy = true;
    chip.classList.add('is-loading');
    chip.style.setProperty('--p', '1');
    place(REST + inset - CHIP, { animate: true });          // settle at the resting spot; the icon spins right there
    try { await onRefresh(); } catch (e) { log.warn('pull-refresh', 'refresh failed', e); } // never an unhandled rejection from a touch handler
    finally { busy = false; leave(); }
  }
  place(HIDDEN);
  scroller.addEventListener('touchstart', onStart, { passive: true });
  scroller.addEventListener('touchmove', onMove, { passive: true });
  scroller.addEventListener('touchend', onEnd, { passive: true });
  scroller.addEventListener('touchcancel', () => { if (tracking) { tracking = false; leave(); } }, { passive: true });
  return () => { chip.remove(); };
}
