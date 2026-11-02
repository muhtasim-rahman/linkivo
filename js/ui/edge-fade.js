/**
 * Linkivo — js/ui/edge-fade.js  (v2.4.4)
 * Purpose: a thin helper over ui/scroll-fade.js (the one fade implementation, class `fade-x`): it adds the class, and also refreshes the fades when the row gets new
 *          content after it was built (the Profile sliders fill in a moment later) or when its size changes.
 * API: attachFade(el) -> { update(), destroy() }
 */
import { attachScrollFade } from './scroll-fade.js';

export function attachFade(el) {
  el.classList.add('fade-x');
  const detach = attachScrollFade(el);
  const update = () => el.dispatchEvent(new Event('scroll'));   // scroll-fade recomputes both edges on every scroll event
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(() => requestAnimationFrame(update)) : null;
  if (mo) mo.observe(el, { childList: true });
  requestAnimationFrame(update);
  return { update, destroy() { detach(); if (mo) mo.disconnect(); } };
}
