/**
 * Linkivo — js/ui/scroll-fade.js  (v2.1.0)
 * Purpose: edge fades for horizontally scrollable bars (filters, tabs, chips). The fade only shows on a side that can scroll.
 * API: attachScrollFade(el) -> detach()      (el must have the class "fade-x")
 */
export function attachScrollFade(el) {
  const update = () => {
    const max = el.scrollWidth - el.clientWidth;
    el.style.setProperty('--fl', el.scrollLeft > 2 ? '1' : '0');
    el.style.setProperty('--fr', max - el.scrollLeft > 2 ? '1' : '0');
  };
  el.addEventListener('scroll', update, { passive: true });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
  ro?.observe(el);
  update();
  return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
}
