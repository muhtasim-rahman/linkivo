/**
 * Linkivo — js/ui/sheet.js  (v2.1.0)
 * Purpose: the one overlay component. A bottom sheet on phones, a centred dialog on wide screens. Focus is trapped and
 *          restored, Escape and the scrim close it, and it registers a back layer so the Back button closes it first.
 *          v2.2.1: on phones the sheet follows the finger when its top bar (grab handle or title row) is dragged down and closes when released low
 *          enough or flicked; a shorter drag springs back. It is never full height (CSS caps it at 82% of the screen; the body scrolls).
 *          `beforeClose` (async, returns false to keep it open) guards Escape, the scrim, the close button, the drag and Back: used when typed input would be lost.
 *          v2.3.1: `scrimClose: false` keeps the close button, Escape and Back but ignores a click on the dark area outside (risky popups such as Delete account).
 * API: openSheet({ title, body, actions, wide, dismissible, scrimClose, beforeClose, onClose, role }) -> { el, close(result), requestClose(), setBusy(bool), body }
 *      dragOutcome(dy, dt, height) -> 'close'|'back' (pure, tested)
 *   body: Node | string | (api) => Node          actions: [{ label, variant:'primary'|'danger'|'quiet', onClick(api), closes=true }]
 *   While any sheet is open the page behind it is inert (not focusable, hidden from screen readers).
 */
import { h } from '../core/dom.js';
import { pushLayer } from '../core/nav-stack.js';
import { icon } from './icons.js';

let openCount = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Release rule of the drag: far enough down (a quarter of the sheet, at least 80px) or a quick flick closes it. */
export const dragOutcome = (dy, dt, height) => (dy > Math.max(80, height * 0.25) || (dy > 24 && dy / Math.max(1, dt) > 0.6) ? 'close' : 'back');

export function openSheet({ title = '', body = null, actions = [], wide = false, dismissible = true, scrimClose = true, beforeClose = null, onClose = null, role = 'dialog' } = {}) {
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
    async requestClose() { if (closed) return; if (beforeClose && (await beforeClose()) === false) return; api.close(); },
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
      dismissible && h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Close', on: { click: () => api.requestClose() } }, icon('close'))),
    bodyEl, foot);
  const overlay = h('div', { class: 'overlay', on: { mousedown: (e) => { if (e.target === overlay && dismissible && scrimClose) api.requestClose(); } } }, sheet);
  api.el = sheet; api.body = bodyEl;

  function onKey(e) {
    if (e.key === 'Escape' && dismissible) { e.stopPropagation(); api.requestClose(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheet.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) { e.preventDefault(); sheet.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /** Drag the top bar down (phones). Pointer events cover touch and pen; the mouse can do it too, harmlessly. */
  function attachDrag() {
    const handles = [sheet.querySelector('.sheet-grab'), sheet.querySelector('.sheet-head')].filter(Boolean);
    let startY = 0, t0 = 0, dy = 0, active = false;
    const wideScreen = () => typeof matchMedia === 'function' && matchMedia('(min-width: 720px)').matches;
    const down = (e) => { if (wideScreen() || e.target.closest('button')) return; active = true; startY = e.clientY; t0 = performance.now(); dy = 0; sheet.style.transition = 'none'; e.currentTarget.setPointerCapture?.(e.pointerId); };
    const move = (e) => { if (!active) return; dy = Math.max(0, e.clientY - startY); sheet.style.transform = `translateY(${dy}px)`; overlay.style.opacity = String(Math.max(0.35, 1 - dy / (sheet.offsetHeight * 1.2))); };
    const up = async () => {
      if (!active) return; active = false;
      const out = dragOutcome(dy, performance.now() - t0, sheet.offsetHeight);
      sheet.style.transition = 'transform 200ms var(--ease)'; overlay.style.transition = 'opacity 200ms var(--ease)';
      if (out === 'close' && dismissible) { sheet.style.transform = 'translateY(100%)'; overlay.style.opacity = '0'; setTimeout(async () => { if (beforeClose && (await beforeClose()) === false) { sheet.style.transform = ''; overlay.style.opacity = ''; return; } api.close(); }, 180); }
      else { sheet.style.transform = ''; overlay.style.opacity = ''; }
    };
    for (const hd of handles) { hd.classList.add('is-draggable'); hd.addEventListener('pointerdown', down); hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up); }
  }

  document.body.appendChild(overlay);
  if (openCount++ === 0 && app) app.inert = true;
  document.addEventListener('keydown', onKey, true);
  // Back button: closes the sheet; with a beforeClose guard the layer is put back first, so a refused close keeps Back working
  const onBack = () => {
    layer = null;
    if (!dismissible) { layer = pushLayer(onBack); return; }
    if (!beforeClose) { api.close(); return; }
    layer = pushLayer(onBack); api.requestClose();
  };
  layer = pushLayer(onBack);
  attachDrag();
  queueMicrotask(() => (sheet.querySelector('[autofocus], input, select, textarea') || sheet.querySelector('.sheet-foot .btn-primary') || sheet).focus({ preventScroll: true }));
  return api;
}
