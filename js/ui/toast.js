/**
 * Linkivo — js/ui/toast.js  (v2.1.0)
 * Purpose: minimal toasts (DESIGN section 4): one line, 2.5 s, never more than two on screen, optional action (Undo).
 * API: toast(message, { type: 'info'|'error', action: { label, onClick }, duration, points }) -> dismiss()
 *      v2.3.1: `points` (a number) adds a small diamond icon and the new points value after the text.
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';

const MAX = 2;

export function toast(message, { type = 'info', action = null, duration = 2500, points = null } = {}) {
  const host = document.getElementById('toast-host');
  if (!host) return () => {};
  while (host.children.length >= MAX) host.firstElementChild.remove();
  let timer = null;
  const el = h('div', { class: ['toast', type === 'error' && 'is-error'], role: type === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-text', text: message }),
    points != null && h('span', { class: 'toast-pts', 'aria-label': `${points} points` }, icon('points', { size: 14 }), h('span', { text: String(points) })),
    action && h('button', { class: 'toast-action', type: 'button', text: action.label, on: { click: () => { dismiss(); action.onClick?.(); } } }));
  function dismiss() {
    clearTimeout(timer);
    if (!el.isConnected) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 170);
  }
  host.appendChild(el);
  timer = setTimeout(dismiss, action ? Math.max(duration, 5000) : duration);
  return dismiss;
}
