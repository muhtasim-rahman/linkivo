/**
 * Linkivo — js/ui/paged.js  (v2.4.3)
 * Purpose: "load 100 at a time" for long lists (owner: a folder with thousands of links, History and the Recycle Bin must not render everything at once).
 *          The page keeps ALL its rows in memory (they are already local) but only hands the first `limit()` of them to its list; when the person scrolls
 *          near the bottom the limit grows by one page and the page paints again. A small "Show more" button is the fallback (keyboard, no scroll).
 * API: PAGE_SIZE (100)   nextLimit(limit, total, size) -> number   (pure, tested)
 *      createPager({ scroller, size?, onGrow, noun? }) -> { el, limit(), reset(), setTotal(n), setLimit(n), destroy() }
 *        el is the footer to place under the list; it hides itself when everything is shown. onGrow() runs after the limit grew.
 */
import { h } from '../core/dom.js';

export const PAGE_SIZE = 100;
export const nextLimit = (limit, total, size = PAGE_SIZE) => Math.min(Math.max(total, 0), limit + size);

export function createPager({ scroller, size = PAGE_SIZE, onGrow, noun = 'items' }) {
  let lim = size, total = 0, raf = 0, dead = false;
  const label = h('span', { class: 'pg-l' });
  const btn = h('button', { type: 'button', class: 'btn btn-quiet btn-sm pg-b', text: 'Show more' });
  const el = h('div', { class: 'pg', role: 'status', hidden: true }, label, btn);
  const grow = () => { if (dead || lim >= total) return; lim = nextLimit(lim, total, size); paint(); onGrow(); };
  function paint() {
    el.hidden = lim >= total;
    label.textContent = `Showing ${Math.min(lim, total).toLocaleString()} of ${total.toLocaleString()} ${noun}`;
    schedule();
  }
  // near the bottom (within 700px)? then the next page is added; checked again after every paint until the list is full or the bottom is far away
  function near() { if (dead || el.hidden || !el.isConnected) return false; const r = el.getBoundingClientRect(), s = scroller && scroller.getBoundingClientRect ? scroller.getBoundingClientRect() : { bottom: window.innerHeight }; return r.top < s.bottom + 700; }
  function schedule() { if (raf || dead) return; raf = requestAnimationFrame(() => { raf = 0; if (near()) grow(); }); }
  btn.addEventListener('click', grow);
  const onScroll = () => schedule();
  (scroller || window).addEventListener('scroll', onScroll, { passive: true });
  return {
    el,
    limit: () => lim,
    reset() { lim = size; paint(); },
    setTotal(n) { total = n; if (lim > Math.max(size, n)) lim = Math.max(size, n); paint(); },
    setLimit(n) { lim = Math.max(size, n); paint(); },
    destroy() { dead = true; cancelAnimationFrame(raf); (scroller || window).removeEventListener('scroll', onScroll); },
  };
}
