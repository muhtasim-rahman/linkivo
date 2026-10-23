/**
 * Linkivo — js/ui/tooltip.js  (v2.1.3)
 * Purpose: one tooltip for the whole app (owner request, v2.1.3).
 *   - Mouse: hover an element for about half a second and its details appear (keyboard focus shows it at once).
 *   - Touch: LONG-PRESS an element and its name appears above the finger (this is how the mobile bottom bar shows the name of each tab).
 *     The tap that ends a long press does not open the link.
 *   Text comes from `data-tip`; icon-only buttons fall back to their `aria-label`, so every icon button gets a tooltip for free.
 *   Add `data-tip-pos="right|top|bottom"` to force a side (the collapsed sidebar uses right).
 * Safe by construction: the text is set with textContent. One element, role="tooltip", never takes pointer events.
 * API: initTooltips() -> destroy()     tipTextOf(el) -> string (pure, tested)     TIP_SELECTOR
 */
const HOVER_DELAY = 450, LONG_PRESS_MS = 420, TOUCH_SHOW_MS = 1600, MOVE_CANCEL_PX = 10;
export const TIP_SELECTOR = '[data-tip], .btn-icon[aria-label], .bar-item[aria-label], .swatch[aria-label], .switch-hit[aria-label]';

/** The text to show for an element: data-tip first, then the aria-label of icon-only controls. */
export function tipTextOf(el) {
  if (!el || !el.getAttribute) return '';
  const t = el.getAttribute('data-tip');
  if (t) return t.trim();
  return (el.getAttribute('aria-label') || '').trim();
}

export function initTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'lk-tip';
  document.body.appendChild(tip);
  let target = null, hoverTimer = 0, hideTimer = 0, press = null, swallowClick = false;

  const find = (node) => (node && node.closest ? node.closest(TIP_SELECTOR) : null);

  function place(el) {
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 8;
    let side = el.getAttribute('data-tip-pos') || (el.closest('.sidebar') ? 'right' : el.closest('.bar') ? 'top' : 'bottom');
    let left, top;
    if (side === 'right') { left = r.right + gap; top = r.top + (r.height - th) / 2; }
    else if (side === 'top') { left = r.left + (r.width - tw) / 2; top = r.top - th - gap; }
    else { left = r.left + (r.width - tw) / 2; top = r.bottom + gap; }
    if (side === 'bottom' && top + th > innerHeight - 4) top = r.top - th - gap;
    if (side === 'top' && top < 4) top = r.bottom + gap;
    tip.style.left = Math.round(Math.max(6, Math.min(left, innerWidth - tw - 6))) + 'px';
    tip.style.top = Math.round(Math.max(6, Math.min(top, innerHeight - th - 6))) + 'px';
  }

  function show(el) {
    const text = tipTextOf(el);
    if (!text) return;
    clearTimeout(hideTimer);
    target = el;
    tip.textContent = text;
    tip.classList.add('is-on');
    place(el);
    el.setAttribute('aria-describedby', 'lk-tip');
  }
  function hide() {
    clearTimeout(hoverTimer); clearTimeout(hideTimer);
    tip.classList.remove('is-on');
    if (target) { target.removeAttribute('aria-describedby'); target = null; }
  }

  // ---- mouse and keyboard
  function onOver(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const el = find(e.target);
    if (!el || el === target) return;
    hide();
    hoverTimer = setTimeout(() => show(el), HOVER_DELAY);
  }
  function onOut(e) { const el = find(e.target); if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) hide(); }
  function onFocusIn(e) { const el = find(e.target); if (el && el.matches(':focus-visible')) { hide(); show(el); } }

  // ---- touch: long-press
  function onDown(e) {
    if (e.pointerType === 'mouse') return;
    const el = find(e.target);
    if (!el) return;
    press = { el, x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => { press.fired = true; swallowClick = true; show(el); }, LONG_PRESS_MS) };
  }
  function onMove(e) { if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_CANCEL_PX) { clearTimeout(press.timer); press = null; } }
  function onUp() {
    if (!press) return;
    clearTimeout(press.timer);
    if (press.fired) { clearTimeout(hideTimer); hideTimer = setTimeout(hide, TOUCH_SHOW_MS); setTimeout(() => { swallowClick = false; }, 350); }
    press = null;
  }
  function onClickCapture(e) { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } else if (target) hide(); }

  const on = (t, ev, fn, o) => t.addEventListener(ev, fn, o);
  on(document, 'pointerover', onOver); on(document, 'pointerout', onOut); on(document, 'focusin', onFocusIn); on(document, 'focusout', hide);
  on(document, 'pointerdown', onDown, { passive: true }); on(document, 'pointermove', onMove, { passive: true });
  on(document, 'pointerup', onUp); on(document, 'pointercancel', () => { clearTimeout(press?.timer); press = null; });
  on(document, 'click', onClickCapture, true);
  on(document, 'keydown', (e) => { if (e.key === 'Escape') hide(); });
  on(document, 'scroll', hide, true); on(window, 'resize', hide);

  return () => { hide(); tip.remove(); document.removeEventListener('pointerover', onOver); document.removeEventListener('pointerout', onOut); document.removeEventListener('click', onClickCapture, true); };
}
