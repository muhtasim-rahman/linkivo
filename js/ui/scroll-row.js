/**
 * Linkivo — js/ui/scroll-row.js  (v2.2.1)
 * Purpose: every left-right scrollable row (settings categories, domain chips, filters) behaves the same (owner request):
 *          edge fades where more content is hidden (ui/scroll-fade.js), touch scrolls natively, the MOUSE can drag the row, and on wide screens
 *          small arrow buttons appear at an edge that can still scroll. Arrows are optional because a row inside a sticky bar may not have room.
 * API: attachScrollRow(el, { arrows = true, step = 0.8 }) -> detach()      el must have the class "fade-x"
 *      dragDelta(startX, x, startScroll) -> new scrollLeft (pure, tested)      shouldDrag(moved) -> boolean (pure: a drag of a few pixels is still a click)
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { attachScrollFade } from './scroll-fade.js';

export const dragDelta = (startX, x, startScroll) => startScroll - (x - startX);
export const shouldDrag = (moved) => Math.abs(moved) > 5;

export function attachScrollRow(el, { arrows = true, step = 0.8 } = {}) {
  const offFade = attachScrollFade(el);
  let down = false, startX = 0, startScroll = 0, dragged = false;
  const onDown = (e) => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; dragged = false; startX = e.clientX; startScroll = el.scrollLeft; };
  const onMove = (e) => {
    if (!down) return;
    if (!dragged && shouldDrag(e.clientX - startX)) { dragged = true; el.classList.add('is-dragging'); }
    if (dragged) el.scrollLeft = dragDelta(startX, e.clientX, startScroll);
  };
  const onUp = () => { if (!down) return; down = false; el.classList.remove('is-dragging'); };
  const onClickCapture = (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }; // the end of a drag must not click a chip
  el.addEventListener('pointerdown', onDown); addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); el.addEventListener('click', onClickCapture, true);

  let prev = null, next = null, ro = null;
  const sync = () => { if (!prev) return; const max = el.scrollWidth - el.clientWidth; prev.hidden = el.scrollLeft <= 2; next.hidden = max - el.scrollLeft <= 2; };
  if (arrows && el.parentElement) {
    const host = el.parentElement; host.classList.add('srow');
    const go = (dir) => el.scrollBy({ left: dir * el.clientWidth * step, behavior: 'smooth' });
    prev = h('button', { type: 'button', class: 'srow-btn is-prev', 'aria-label': 'Scroll left', tabindex: '-1', on: { click: () => go(-1) } }, icon('chevron-left', { size: 18 }));
    next = h('button', { type: 'button', class: 'srow-btn is-next', 'aria-label': 'Scroll right', tabindex: '-1', on: { click: () => go(1) } }, icon('chevron-right', { size: 18 }));
    host.append(prev, next);
    el.addEventListener('scroll', sync, { passive: true });
    ro = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null; ro?.observe(el);
    sync();
  }
  return () => {
    offFade(); el.removeEventListener('pointerdown', onDown); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); el.removeEventListener('click', onClickCapture, true);
    el.removeEventListener('scroll', sync); ro?.disconnect(); prev?.remove(); next?.remove();
  };
}
