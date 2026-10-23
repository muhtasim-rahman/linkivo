/**
 * Linkivo — js/ui/popover.js  (v2.1.3)
 * Purpose: anchored menu (three-dot menus). Keyboard: arrows, Home/End, Enter, Escape. Closes on outside click, scroll, resize
 *          and Back (registers a back layer).
 * API: openMenu(anchor, items, { align:'end'|'start', onClose }) -> { close(), isOpen() }   (onClose runs once when the menu has closed, v2.1.3)
 *      Pressing the anchor again is NOT an outside click: the caller toggles with isOpen() (v2.1.2).
 *   items: [{ label, icon?, danger?, onSelect() }] or { separator: true }
 */
import { h } from '../core/dom.js';
import { pushLayer } from '../core/nav-stack.js';
import { icon } from './icons.js';

export function openMenu(anchor, items, { align = 'end', onClose } = {}) {
  const returnTo = document.activeElement;
  let layer;
  const menu = h('div', { class: 'pop', role: 'menu' }, items.map((it) => it.separator ? h('div', { class: 'pop-sep', role: 'separator' }) :
    h('button', { type: 'button', role: 'menuitem', class: ['pop-item', it.danger && 'is-danger'], on: { click: () => { close(); it.onSelect?.(); } } }, it.icon && icon(it.icon, { size: 18 }), h('span', { text: it.label }))));

  function place() {
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight, vw = innerWidth, vh = innerHeight;
    let left = align === 'end' ? r.right - mw : r.left;
    left = Math.max(8, Math.min(left, vw - mw - 8));
    let top = r.bottom + 6, origin = align === 'end' ? 'top right' : 'top left';
    if (top + mh > vh - 8) { top = Math.max(8, r.top - mh - 6); origin = align === 'end' ? 'bottom right' : 'bottom left'; }
    menu.style.left = left + 'px'; menu.style.top = top + 'px'; menu.style.setProperty('--ox', origin);
  }
  function onDown(e) { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); }
  function onKey(e) {
    const btns = [...menu.querySelectorAll('.pop-item')];
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); btns[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); btns[btns.length - 1].focus(); }
    else if (e.key === 'Tab') close();
  }
  function close() {
    if (!menu.isConnected) return;
    layer?.remove();
    menu.remove();
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', close);
    document.removeEventListener('scroll', close, true);
    if (returnTo && returnTo.isConnected && returnTo.focus) returnTo.focus({ preventScroll: true });
    if (onClose) onClose();
  }
  document.body.appendChild(menu);
  place();
  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', close);
  document.addEventListener('scroll', close, true);
  layer = pushLayer(() => { layer = null; close(); });
  menu.querySelector('.pop-item')?.focus({ preventScroll: true });
  return { close, isOpen: () => menu.isConnected };
}
