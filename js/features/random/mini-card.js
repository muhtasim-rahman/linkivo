/**
 * Linkivo — js/features/random/mini-card.js  (v2.5.6)
 * Purpose: the thin "Surprise me" bar of Random Discover on phones (owner request). The big card at the top of the hub scrolls away; at that moment a compact, thin version of it
 *          slides in under the top edge and stays there (sticky). Scrolling back up makes the big card reappear and the thin one slides out again. Wide screens never show it
 *          (the left column is already sticky there; css hides the host).
 *          The bar holds the number of links in play and the same start button. It takes no space in the page (a zero-height sticky host), so nothing jumps when it appears.
 * API: miniShouldShow({ cardBottom, rootTop, hubHidden }) -> boolean   (pure, tested)
 *      createMiniCard({ scroller, card, hub, onGo }) -> { el, paint(n, seen), sync(), destroy() }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';

/** The card counts as "gone" once its bottom edge is above the top of the scrolling area (a few pixels of slack so it does not flicker at the edge). */
export const MINI_SLACK = 4;
export const miniShouldShow = ({ cardBottom, rootTop, hubHidden = false }) => !hubHidden && cardBottom < rootTop + MINI_SLACK;

export function createMiniCard({ scroller, card, hub, onGo }) {
  const count = h('strong', { class: 'rnd-mini-n', text: '0' });
  const label = h('span', { class: 'rnd-mini-l', text: ' links in play' });
  const go = h('button', { type: 'button', class: 'btn btn-primary rnd-mini-go', on: { click: () => onGo() } }, icon('random', { size: 18 }), h('span', { text: 'Surprise me' }));
  const bar = h('div', { class: 'rnd-mini', role: 'region', 'aria-label': 'Surprise me' }, h('span', { class: 'rnd-mini-die', 'aria-hidden': 'true' }, icon('random', { size: 16 })), h('span', { class: 'rnd-mini-t' }, count, label), go);
  const el = h('div', { class: 'rnd-minihost', 'aria-hidden': 'true' }, bar);
  /** `inert` as property AND attribute (older browsers and test DOMs only know the attribute): a hidden bar can not take focus. */
  const setInert = (v) => { el.inert = v; if (v) el.setAttribute('inert', ''); else el.removeAttribute('inert'); };
  setInert(true);
  let raf = 0, on = false;

  /** Shows or hides the bar from the card's position. Cheap: one rect read per scroll frame. */
  function sync() {
    const c = card.getBoundingClientRect(), r = scroller.getBoundingClientRect();
    const want = miniShouldShow({ cardBottom: c.bottom, rootTop: r.top, hubHidden: !!hub.hidden });
    if (want === on) return;
    on = want; el.classList.toggle('is-on', want);
    setInert(!want); if (want) el.removeAttribute('aria-hidden'); else el.setAttribute('aria-hidden', 'true');   // a hidden bar can not take focus or be read out
  }
  const onScroll = () => { if (raf) return; raf = (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 16))(() => { raf = 0; sync(); }); };
  scroller.addEventListener('scroll', onScroll, { passive: true });

  return {
    el,
    /** n = links in play, seen = links already shown this time */
    paint(n, seen = 0) { count.textContent = n.toLocaleString(); label.textContent = (n === 1 ? ' link in play' : ' links in play') + (seen ? ` \u00b7 ${seen} seen` : ''); go.disabled = n === 0; go.lastChild.textContent = seen ? 'Again' : 'Surprise me'; sync(); },
    sync,
    destroy() { scroller.removeEventListener('scroll', onScroll); if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); raf = 0; }
  };
}
