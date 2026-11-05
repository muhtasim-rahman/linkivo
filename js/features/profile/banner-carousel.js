/**
 * Linkivo — js/features/profile/banner-carousel.js  (v2.5.2)
 * Purpose: the banner picker of Edit profile (owner 3). The SELECTED banner always sits in the centre of the row, the others are laid out to its left and right, smaller and quieter.
 *          The left and right arrow buttons (and the Left/Right keys, and a short swipe) move the choice by exactly ONE banner; a click on a banner picks it. The row never
 *          jumps: only the track slides under a fixed window. Ends are real ends (the arrow turns off), nothing wraps around.
 * API: buildBannerCarousel({ ids, urlOf(id), get() -> id, set(id) }) -> { el, mark(), layout(), destroy() }
 *      stepIndex(index, dir, count) -> number   (pure, tested: one step, clamped)      trackOffset(viewW, itemW, gap, index) -> px   (pure, tested: keeps the item centred)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';

export const stepIndex = (index, dir, count) => Math.max(0, Math.min(count - 1, index + (dir < 0 ? -1 : 1)));
export const trackOffset = (viewW, itemW, gap, index) => Math.round(viewW / 2 - (index * (itemW + gap) + itemW / 2));

export function buildBannerCarousel({ ids, urlOf, get, set }) {
  const idx = () => Math.max(0, ids.indexOf(get()));
  const items = ids.map((id, i) => h('button', { type: 'button', class: 'pe-banner', role: 'radio', tabindex: '-1', 'aria-label': `Banner ${i + 1} of ${ids.length}`, style: { backgroundImage: `url(${urlOf(id)})` }, on: { click: () => pick(i) } }));
  const track = h('div', { class: 'pe-car-track' }, ...items);
  const view = h('div', { class: 'pe-car-view' }, track);
  const nav = (dir, label, name) => h('button', { type: 'button', class: ['btn-icon', 'pe-car-nav', dir < 0 ? 'is-prev' : 'is-next'], 'aria-label': label, on: { click: () => pick(stepIndex(idx(), dir, ids.length)) } }, icon(name, { size: 20 }));
  const prev = nav(-1, 'Previous banner', 'chevron-left'), next = nav(1, 'Next banner', 'chevron-right');
  const el = h('div', { class: 'pe-car', role: 'radiogroup', 'aria-label': 'Banner', tabindex: '0' }, prev, view, next);

  function pick(i) { if (i === idx() && ids[i] === get()) { mark(); return; } set(ids[i]); mark(); }
  function layout() {
    const i = idx(), w = items[0] ? items[0].offsetWidth : 0, gap = parseFloat((typeof getComputedStyle === 'function' && getComputedStyle(track).columnGap) || '10') || 10;
    if (view.clientWidth > 0 && w > 0) track.style.transform = `translateX(${trackOffset(view.clientWidth, w, gap, i)}px)`;
  }
  function mark() {
    const i = idx();
    items.forEach((b, k) => { const on = k === i; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); });
    prev.disabled = i <= 0; next.disabled = i >= ids.length - 1;
    layout();
  }
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); pick(stepIndex(idx(), e.key === 'ArrowLeft' ? -1 : 1, ids.length)); }
  });
  // a short swipe moves one banner (never a fling across several)
  let x0 = null;
  view.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  view.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) pick(stepIndex(idx(), dx < 0 ? 1 : -1, ids.length)); });
  view.addEventListener('pointercancel', () => { x0 = null; });
  const onResize = () => layout();
  addEventListener('resize', onResize);
  let ro = null; if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(onResize); ro.observe(view); }
  requestAnimationFrame(layout);   // the popup is attached after this runs: measure again once it is on screen
  mark();
  return { el, mark, layout, destroy() { removeEventListener('resize', onResize); ro && ro.disconnect(); } };
}
