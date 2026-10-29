/**
 * Linkivo — js/ui/toast.js  (v2.1.0, reworked v2.3.2)
 * Purpose: minimal toasts (DESIGN section 4): one line, never more than two on screen, optional action (Undo).
 * API: toast(message, { type: 'info'|'error', action: { label, onClick }, duration, points }) -> dismiss()
 *      v2.3.1: `points` (a number) adds a small diamond icon and the new points value after the text.
 *      v2.3.2 (owner): the SAME message shown again while its toast is still on screen does not add a second toast: the first one gets a count in brackets
 *      ("Points up. (3)"), shows the newest points and starts its timer again; when the toast is gone the count starts over. Every toast has a small close
 *      button and can be swiped away (left, right or down). The time on screen comes from the setting `toast.duration` (default 2.5 s) unless the caller sets one.
 */
import { h } from '../core/dom.js';
import { prefs } from '../core/local-prefs.js';
import { icon } from './icons.js';

const MAX = 2;
export const TOAST_DEFAULT_MS = 2500;
const SWIPE_X = 70, SWIPE_Y = 36;
export const toastMs = () => { const v = Number(prefs.get('toast.duration', TOAST_DEFAULT_MS)); return v >= 500 && v <= 30000 ? v : TOAST_DEFAULT_MS; };

export function toast(message, { type = 'info', action = null, duration = null, points = null } = {}) {
  const host = document.getElementById('toast-host');
  if (!host) return () => {};
  const base = duration == null ? toastMs() : duration, life = action ? Math.max(base, 5000) : base, key = type + '|' + message;
  // the same toast is still there: count it instead of stacking a copy
  const same = [...host.children].find((c) => c._key === key && !c.classList.contains('is-leaving'));
  if (same) { same._bump(points, action, life); return same._dismiss; }
  while (host.children.length >= MAX) host.firstElementChild.remove();
  let timer = null, count = 1, startX = 0, startY = 0, dx = 0, dy = 0, drag = false;
  const text = h('span', { class: 'toast-text', text: message });
  const pts = h('span', { class: 'toast-pts', hidden: points == null }, icon('points', { size: 14 }), h('span', { text: points == null ? '' : String(points) }));
  const actionBtn = h('button', { class: 'toast-action', type: 'button', hidden: !action, text: action ? action.label : '' });
  let act = action;
  actionBtn.addEventListener('click', () => { dismiss(); act && act.onClick && act.onClick(); });
  const close = h('button', { class: 'toast-x', type: 'button', 'aria-label': 'Close', on: { click: () => dismiss() } }, icon('close', { size: 14 }));
  const el = h('div', { class: ['toast', type === 'error' && 'is-error'], role: type === 'error' ? 'alert' : 'status' }, text, pts, actionBtn, close);
  function dismiss(dir = 'down') {
    clearTimeout(timer);
    if (!el.isConnected || el.classList.contains('is-leaving')) return;
    el.style.setProperty('--out', dir === 'left' ? '-60px 0' : dir === 'right' ? '60px 0' : '0 14px');
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 180);
  }
  const arm = (ms) => { clearTimeout(timer); timer = setTimeout(dismiss, ms); };
  el._key = key; el._dismiss = dismiss;
  el._bump = (p, a, ms) => {
    count++; text.textContent = `${message} (${count})`;
    if (p != null) { pts.hidden = false; pts.lastChild.textContent = String(p); }
    if (a) { act = a; actionBtn.hidden = false; actionBtn.textContent = a.label; }
    el.classList.remove('is-bump'); void el.offsetWidth; el.classList.add('is-bump');
    arm(ms);
  };
  // swipe away: sideways or down; a short drag springs back
  el.addEventListener('pointerdown', (e) => { if (e.target.closest('button') || e.pointerType === 'mouse') return; startX = e.clientX; startY = e.clientY; dx = dy = 0; drag = true; clearTimeout(timer); el.classList.add('is-drag'); try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
  el.addEventListener('pointermove', (e) => { if (!drag) return; dx = e.clientX - startX; dy = Math.max(0, e.clientY - startY); el.style.transform = `translate(${dx}px, ${dy}px)`; el.style.opacity = String(Math.max(0.35, 1 - Math.max(Math.abs(dx) / 220, dy / 120))); });
  const end = () => {
    if (!drag) return; drag = false; el.classList.remove('is-drag');
    if (Math.abs(dx) > SWIPE_X) { dismiss(dx < 0 ? 'left' : 'right'); return; }
    if (dy > SWIPE_Y) { dismiss('down'); return; }
    el.style.transform = ''; el.style.opacity = ''; arm(life);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  host.appendChild(el);
  arm(life);
  return dismiss;
}
