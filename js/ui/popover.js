/**
 * Linkivo — js/ui/popover.js  (v2.2.1, v2.2.2)
 * Purpose: anchored menu (three-dot menus, dropdown lists). Keyboard: arrows, Home/End, Enter, Escape. Closes on outside click, scroll, resize
 *          and Back (registers a back layer).
 * API: openMenu(anchor, items, { align:'end'|'start', onClose, minWidth }) -> { close(), isOpen() }   (onClose runs once when the menu has closed)
 *      Pressing the anchor again is NOT an outside click: the caller toggles with isOpen() (v2.1.2).
 *   items: [{ label, icon?, danger?, disabled?, onSelect() }] | { separator: true } | { heading: 'Group name' }
 *   v2.2.1: an item with `checked` (true/false) is a choice row with a check mark on the left (role menuitemradio, or menuitemcheckbox when `multi`).
 *           `keepOpen: true` toggles `checked` in place and calls onSelect(checked) without closing (multi-select lists).
 *           No fixed max-height any more: the menu only limits itself to the screen, and flips above the anchor when there is more room there.
 *   v2.2.2: a long menu (the link menu) is capped (css .pop max-height) and scrolls inside itself with a thin scrollbar. On phones the address bar
 *           shrinks and grows while you scroll, which fires \"resize\": that used to close the menu in the middle of a scroll. Only a change of WIDTH
 *           (rotation, window resize) closes it now; a change of height just places it again.
 */
import { h } from '../core/dom.js';
import { pushLayer } from '../core/nav-stack.js';
import { icon } from './icons.js';

export function openMenu(anchor, items, { align = 'end', onClose, minWidth = 0 } = {}) {
  const returnTo = document.activeElement;
  let layer;
  const build = (it) => {
    if (it.separator) return h('div', { class: 'pop-sep', role: 'separator' });
    if (it.heading) return h('div', { class: 'pop-head', role: 'presentation', text: it.heading });
    const checkable = it.checked !== undefined;
    const mark = checkable ? h('span', { class: 'pop-mark', 'aria-hidden': 'true' }, it.checked ? icon('check', { size: 16 }) : null) : null;
    const btn = h('button', { type: 'button', role: checkable ? (it.multi ? 'menuitemcheckbox' : 'menuitemradio') : 'menuitem', class: ['pop-item', it.danger && 'is-danger', checkable && 'is-check'], disabled: it.disabled === true,
      'aria-checked': checkable ? String(!!it.checked) : null,
      on: { click: () => {
        if (it.disabled) return;
        if (it.keepOpen) { it.checked = !it.checked; btn.setAttribute('aria-checked', String(it.checked)); mark.replaceChildren(...(it.checked ? [icon('check', { size: 16 })] : [])); it.onSelect?.(it.checked); return; }
        close(); it.onSelect?.();
      } } }, mark, !checkable && it.icon && icon(it.icon, { size: 18 }), h('span', { class: 'pop-label', text: it.label }));
    return btn;
  };
  const menu = h('div', { class: 'pop', role: 'menu' }, items.map(build));

  function place() {
    const r = anchor.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    menu.style.minWidth = Math.max(minWidth, 0) + 'px';
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = align === 'end' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, vw - mw - 8));
    const below = vh - r.bottom - 14, above = r.top - 14;
    let top, origin;
    if (mh <= below || below >= above) { top = r.bottom + 6; origin = align === 'end' ? 'top right' : 'top left'; }
    else { top = r.top - mh - 6; origin = align === 'end' ? 'bottom right' : 'bottom left'; }
    top = Math.max(8, Math.min(top, vh - mh - 8));          // never off screen; the CSS max-height scrolls the rare menu that is taller than the screen
    menu.style.left = left + 'px'; menu.style.top = top + 'px'; menu.style.setProperty('--ox', origin);
  }
  function onDown(e) { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); }
  function onKey(e) {
    const btns = [...menu.querySelectorAll('.pop-item:not(:disabled)')];
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (!btns.length) return;
    else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); btns[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); btns[btns.length - 1].focus(); }
    else if (e.key === 'Tab') close();
  }
  const w0 = innerWidth;
  function onResize() { if (innerWidth !== w0) close(); else place(); }
  function onScroll(e) { if (!menu.contains(e.target)) close(); }   // v2.2.1: scrolling INSIDE a long menu must not close it
  function close() {
    if (!menu.isConnected) return;
    layer?.remove();
    menu.remove();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
    document.removeEventListener('scroll', onScroll, true);
    if (returnTo && returnTo.isConnected && returnTo.focus) returnTo.focus({ preventScroll: true });
    if (onClose) onClose();
  }
  document.body.appendChild(menu);
  place();
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', onResize);
  document.addEventListener('scroll', onScroll, true);
  layer = pushLayer(() => { layer = null; close(); });
  (menu.querySelector('.pop-item[aria-checked="true"]') || menu.querySelector('.pop-item'))?.focus({ preventScroll: true });
  return { close, isOpen: () => menu.isConnected };
}
