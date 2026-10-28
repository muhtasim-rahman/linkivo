/**
 * Linkivo — js/ui/motion.js  (v2.3.1)
 * Purpose: the few reusable "smooth change" helpers (owner: v2.3.0 felt like hard cuts). Each one honours the Motion setting and the system's
 *          reduced-motion choice, and falls back to an instant change where the Web Animations API is missing (old browsers, jsdom).
 * API: motionOk() -> boolean
 *      swapContent(host, render, { dir = 1, out = 110, grow = 240 }) -> Promise<void>   the old content slides out, `render()` fills the host, the host's height
 *          grows or shrinks to the new content while the new content slides in from the side `dir` points to (1 = forward, -1 = back)
 *      staggerIn(nodes, { step = 24, max = 12 })   a short rise-and-fade, one after another (search results, lists that just arrived)
 *      flashRow(el, { ms = 2600 })   a calm outline pulse that marks "this is the row you were sent to"
 */
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
export function motionOk() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.motion === 'reduce') return false;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
const canAnimate = (el) => motionOk() && el && typeof el.animate === 'function';

export async function swapContent(host, render, { dir = 1, out = 110, grow = 240 } = {}) {
  if (!canAnimate(host) || !host.firstElementChild) { render(); return; }
  const from = host.offsetHeight;
  host.style.overflow = 'hidden'; host.style.height = from + 'px';
  try { await host.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-dir * 14}px)` }], { duration: out, easing: 'ease-in', fill: 'forwards' }).finished; } catch { /* cancelled: carry on */ }
  render();
  host.style.height = 'auto'; const to = host.offsetHeight; host.style.height = from + 'px';
  host.getAnimations().forEach((a) => a.cancel());
  void host.offsetHeight;
  const a1 = host.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: grow, easing: EASE });
  const a2 = host.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: grow, easing: EASE });
  host.style.height = to + 'px';
  try { await Promise.all([a1.finished, a2.finished]); } catch { /* cancelled */ }
  host.style.height = ''; host.style.overflow = '';
}

export function staggerIn(nodes, { step = 24, max = 12 } = {}) {
  let i = 0;
  for (const n of nodes) {
    if (!canAnimate(n)) return;
    if (i >= max) break;
    n.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: i * step, easing: EASE, fill: 'backwards' });
    i++;
  }
}

export function flashRow(el, { ms = 2600 } = {}) {
  if (!el) return;
  el.classList.remove('is-flash'); void el.offsetWidth;
  el.classList.add('is-flash');
  setTimeout(() => el.classList.remove('is-flash'), ms);
}
