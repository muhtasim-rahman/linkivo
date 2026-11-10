/**
 * Linkivo — js/ui/pull-refresh.js  (v2.2.1, v2.2.2)
 * Purpose: pull down at the top of a page to refresh it (phones). The browser's own pull-to-refresh is disabled app-wide (it reloads the whole app and
 *          replays the splash), so the app provides its own in-app refresh. It only runs on pages that ask for it (`enabled()`), has no setting.
 * Design (v2.2.1, owner request): the PAGE STAYS STILL. Only a round indicator slides down from above the screen, following the finger with resistance.
 *   - while pulling, the refresh icon turns with the pull and a ring around it fills; past the threshold the ring completes and the indicator pops slightly
 *   - on release it settles at its resting spot and the icon spins THERE; when the refresh is done it slides back up and fades out
 *   (v2.1.4 moved the whole page down, which looked heavy and the icon barely moved.)
 * v2.2.2 (owner request: more minimal): the indicator is a small 30px circle holding only a thin ring (no icon): the ring fills while pulling, grows a
 *          little when ready, and becomes a short spinning arc while refreshing.
 * v2.5.6 (owner): a SECOND, deliberate gesture. Pull all the way down (FULL) and keep holding: a second ring around the indicator starts to count down HOLD_MS (5 seconds). If the finger
 *          is still down and still pulled all the way when it ends, letting go RELOADS the whole app (a hard refresh, like the browser's own). Raising the finger a little (below FULL minus
 *          SLACK) cancels the countdown, and letting go before it ends is the normal in-app refresh. This replaces the v2.2.1 rule that the gesture never reloads (D-061 -> D-218).
 * API: initPullRefresh({ scroller, onRefresh, onReload, enabled }) -> destroy()     pullDistance(dy, max) -> number (pure, tested)
 *      indicatorY(d, inset) -> px offset of the indicator (pure)      THRESHOLD, REST, MAX
 *      FULL, SLACK, HOLD_MS     holdState({ pull, holding, elapsed }) -> { holding, progress, done } (pure, tested: the whole hold rule)
 */
import { h } from '../core/dom.js';
import { layerCount } from '../core/nav-stack.js';
import { log } from '../core/logger.js';

export const THRESHOLD = 70, REST = 72, MAX = 130;
/** v2.5.6: "pulled all the way" (the ordinary refresh needs only THRESHOLD), how far the finger may come back before the countdown is cancelled, and how long to hold. */
export const FULL = 110, SLACK = 8, HOLD_MS = 5000;
/**
 * The hold rule as a pure function. `pull` = current pull distance, `holding` = a countdown is running, `elapsed` = ms since it started.
 * Starts when pull reaches FULL; is cancelled when pull falls below FULL - SLACK (a small raise); `done` when HOLD_MS has passed while still held.
 */
export function holdState({ pull, holding = false, elapsed = 0 }) {
  if (!holding) return pull >= FULL ? { holding: true, progress: 0, done: false } : { holding: false, progress: 0, done: false };
  if (pull < FULL - SLACK) return { holding: false, progress: 0, done: false };
  const progress = Math.max(0, Math.min(1, elapsed / HOLD_MS));
  return { holding: true, progress, done: progress >= 1 };
}
const CHIP = 30, HIDDEN = -(CHIP + 12);
/** Resistance curve: close to 1:1 at the start, then it stiffens and never passes `max`. */
export const pullDistance = (dy, max = MAX) => (dy <= 0 ? 0 : Math.min(max, max * (1 - Math.exp(-dy / 150))));
/** Vertical position of the indicator for a pull of `d` pixels: hidden above the screen at 0, below the status bar at the threshold. */
export const indicatorY = (d, inset = 0) => HIDDEN + inset + d * 0.95;

export function initPullRefresh({ scroller, onRefresh, onReload = () => location.reload(), enabled = () => true }) {
  const ring = h('span', { class: 'ptr-ring' });
  const holdRing = h('span', { class: 'ptr-hold' });   // v2.5.6: the countdown ring around the indicator (conic fill like the first ring, driven by --h)
  const chip = h('div', { class: 'ptr', 'aria-hidden': 'true' }, ring, holdRing);
  document.body.appendChild(chip);
  let startY = 0, startX = 0, pull = 0, tracking = false, busy = false, inset = 0;
  let holding = false, holdStart = 0, holdTimer = 0, holdDone = false;   // v2.5.6: the 5 second hold

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
    chip.classList.toggle('is-ready', p >= 1);
    chip.classList.toggle('is-on', d > 2);
  }
  /** Clears the countdown ring and its timer. `keepDone` is for the moment the finger lifts after a completed hold (the reload decision is already taken). */
  function stopHold() {
    holding = false; holdDone = false; clearInterval(holdTimer); holdTimer = 0;
    chip.classList.remove('is-holding', 'is-holdready'); chip.style.setProperty('--h', '0');
  }
  /** Runs while the finger stays pulled all the way. A timer (not touch events) drives it, because a still finger sends no touchmove. */
  function startHold() {
    holding = true; holdStart = Date.now(); holdDone = false;
    chip.classList.add('is-holding'); chip.style.setProperty('--h', '0');
    clearInterval(holdTimer);
    holdTimer = setInterval(() => {
      if (!tracking) { stopHold(); return; }
      const st = holdState({ pull, holding: true, elapsed: Date.now() - holdStart });
      if (!st.holding) { stopHold(); return; }
      chip.style.setProperty('--h', st.progress.toFixed(3));
      if (st.done && !holdDone) { holdDone = true; chip.classList.add('is-holdready'); try { if (navigator.vibrate) navigator.vibrate(25); } catch { /* not every browser */ } }   // a short buzz: "let go now to reload"
    }, 50);
    if (holdTimer && typeof holdTimer.unref === 'function') holdTimer.unref();   // (tests in Node)
  }
  /** Called after every move: the pure rule decides whether a countdown starts or is cancelled. */
  function checkHold() {
    const st = holdState({ pull, holding, elapsed: holding ? Date.now() - holdStart : 0 });
    if (st.holding && !holding) startHold(); else if (!st.holding && holding) stopHold();
  }
  function leave() {
    stopHold();
    chip.classList.remove('is-loading', 'is-ready'); chip.classList.add('is-leaving');
    place(HIDDEN + inset - 8, { animate: true });
    setTimeout(() => { if (!busy && !tracking) { chip.classList.remove('is-on', 'is-leaving'); chip.style.setProperty('--p', '0'); place(HIDDEN, {}); } }, 320);
  }

  function onStart(e) {
    if (busy || !enabled() || layerCount() > 0 || e.touches.length !== 1 || scroller.scrollTop > 0) return;
    if (e.target.closest && e.target.closest('.sheet, .pop, input, textarea, .set-nav, .fade-x')) return;
    inset = measureInset(); stopHold();
    tracking = true; pull = 0; startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    chip.classList.remove('is-leaving');
  }
  function onMove(e) {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY, dx = Math.abs(e.touches[0].clientX - startX);
    if (dy <= 0 || dx > dy || scroller.scrollTop > 0) { tracking = false; leave(); return; }
    pull = pullDistance(dy);
    render(pull);
    checkHold();   // v2.5.6
  }
  async function onEnd() {
    if (!tracking) return;
    tracking = false;
    // v2.5.6 (owner): the countdown finished and the finger was still pulled all the way: reload the whole app
    if (holdDone && holding && holdState({ pull, holding: true, elapsed: Date.now() - holdStart }).done) { stopHold(); busy = true; chip.classList.add('is-loading'); try { onReload(); } catch (e) { log.warn('pull-refresh', 'reload failed', e); busy = false; leave(); } return; }
    stopHold();
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
  return () => { stopHold(); chip.remove(); };
}
