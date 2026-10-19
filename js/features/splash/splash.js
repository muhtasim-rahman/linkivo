/**
 * Linkivo — js/features/splash/splash.js  (v2.1.0)
 * Purpose: drives the splash defined in index.html + css/pages/splash.css (spec: DESIGN section 6).
 *          First run: the full logo animation (about 1.4 s). Later runs: a 0.6 s fade-in of the finished logo.
 *          Reduced motion: the finished logo at once. The splash ends when the app is ready; if loading outlasts the animation,
 *          three loading dots appear (the animation itself is never stretched).
 * API: startSplash() -> void     endSplash() -> Promise<void> (call when the first page is mounted)
 */
import { prefs } from '../../core/local-prefs.js';
import { sleep } from '../../core/utils.js';

const MIN_MS = { full: 1450, short: 600, still: 300 };
let el, mode = 'still', startedAt = 0, ended = false;

export async function startSplash() {
  el = document.getElementById('splash');
  if (!el) return;
  const reduce = (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || prefs.get('ui.reduceMotion', 'system') === 'reduce';
  mode = reduce ? 'still' : prefs.get('splash.seen', false) ? 'short' : 'full';
  // The wordmark uses Outfit: give the font a moment so the letters do not swap mid-animation.
  if (mode === 'full' && document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(450)]);
  el.dataset.mode = mode;
  startedAt = performance.now();
  requestAnimationFrame(() => el.classList.add('run'));
  setTimeout(() => { if (!ended) document.getElementById('splash-dots')?.classList.add('show'); }, MIN_MS[mode] + 80);
}

export async function endSplash() {
  if (!el || ended) return;
  const remaining = MIN_MS[mode] - (performance.now() - startedAt);
  if (remaining > 0) await sleep(remaining);
  ended = true;
  prefs.set('splash.seen', true);
  el.classList.add('out');
  setTimeout(() => el.remove(), 360);
}
