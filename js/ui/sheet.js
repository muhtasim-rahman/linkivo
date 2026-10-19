/**
 * Linkivo — js/ui/sheet.js  (v2.1.0)
 * Purpose: the one overlay component. A bottom sheet on phones, a centred dialog on wide screens. Focus is trapped and
 *          restored, Escape and the scrim close it, and it registers a back layer so the Back button closes it first.
 * API: openSheet({ title, body, actions, wide, dismissible, onClose, role }) -> { el, close(result), setBusy(bool), body }
 *   body: Node | string | (api) => Node          actions: [{ label, variant:'primary'|'danger'|'quiet', onClick(api), closes=true }]
 *   While any sheet is open the page behind it is inert (not focusable, hidden from screen readers).
 */
import { h } from '../core/dom.js';
import { pushLayer } from '../core/nav-stack.js';
import { icon } from './icons.js';

let openCount = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openSheet({ title = '', body = null, actions = [], wide = false, dismissible = true, onClose = null, role = 'dialog' } = {}) {
  const returnTo = document.activeElement;
  const app = document.getElementById('app');
  let closed = false;
  let layer = null;
  const titleId = 'sheet-title-' + Math.random().toString(36).slice(2, 8);

  const api = {
    el: null, body: null,
    close(result) {
      if (closed) return;
      closed = true;
      layer?.remove();
      overlay.classList.add('is-leaving');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => {
        overlay.remove();
        if (--openCount === 0 && app) app.inert = false;
        if (returnTo && returnTo.isConnected && returnTo.focus) returnTo.focus({ preventScroll: true });
        onClose?.(result);
      }, 160);
    },
    setBusy(busy) { for (const b of overlay.querySelectorAll('.sheet-foot button')) b.disabled = !!busy; }
  };

  const content = typeof body === 'function' ? body(api) : body;
  const bodyEl = h('div', { class: 'sheet-body' }, typeof content === 'string' ? h('p', { text: content }) : content);
  const foot = actions.length ? h('div', { class: 'sheet-foot' }, actions.map((a) => h('button', {
    type: 'button', class: ['btn', a.variant === 'primary' && 'btn-primary', a.variant === 'danger' && 'btn-danger', a.variant === 'danger' && a.primary !== false && 'btn-primary', a.variant === 'quiet' && 'btn-quiet'],
    text: a.label, on: { click: async () => { const r = a.onClick ? await a.onClick(api) : undefined; if (a.closes !== false && r !== false) api.close(a.value ?? r); } }
  }))) : null;

  const sheet = h('div', { class: ['sheet', wide && 'is-wide'], role, 'aria-modal': 'true', 'aria-labelledby': title ? titleId : null, tabindex: '-1' },
    h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }),
    (title || dismissible) && h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title', id: titleId, text: title }),
      dismissible && h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Close', on: { click: () => api.close() } }, icon('close'))),
    bodyEl, foot);
  const overlay = h('div', { class: 'overlay', on: { mousedown: (e) => { if (e.target === overlay && dismissible) api.close(); } } }, sheet);
  api.el = sheet; api.body = bodyEl;

  function onKey(e) {
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); api.close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheet.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) { e.preventDefault(); sheet.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  document.body.appendChild(overlay);
  if (openCount++ === 0 && app) app.inert = true;
  document.addEventListener('keydown', onKey, true);
  layer = pushLayer(() => { if (dismissible) { layer = null; api.close(); } else { layer = pushLayer(() => {}); } });
  queueMicrotask(() => (sheet.querySelector('[autofocus], input, select, textarea') || sheet.querySelector('.sheet-foot .btn-primary') || sheet).focus({ preventScroll: true }));
  return api;
}
