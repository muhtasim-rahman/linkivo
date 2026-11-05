/**
 * Linkivo — js/features/lock/pin-flow.js  (v2.5.1)
 * Purpose: ONE popup for a whole PIN flow (change PIN, turn the lock on or off, Forgot PIN). The steps swap inside the same popup; it never closes and re-opens between steps.
 *          Why (owner: "after a PIN popup the page jumps / the button closes the popup instead of resetting"): every popup pushes and later removes a browser history entry, and
 *          chaining several of them (close one, open the next 160 ms later, re-start the app in between) raced with those entries. One popup = one entry, and the work that
 *          restarts the page happens only after the popup is gone and its history entry has settled (flow.finish()).
 * API: openPinFlow({ title }) -> Promise<flow>
 *        flow.setTitle(text)  flow.show(node)  flow.working(text)  flow.closed (Promise, resolves with the popup's end)  flow.isOpen()
 *        flow.finish() -> Promise  closes the popup and waits until it is gone and the history entry has settled (use before restarting the page)
 *      stagePad(flow, { text, notice, submitLabel, check(pin) -> Promise<string|''> }) -> Promise<string|null>   (null = the popup was closed)
 *      stageCreate(flow, { text }) -> Promise<string|null>    choose a PIN twice; weak PINs are refused
 *      stageForm(flow, { text, kids, go: { label, onClick(api) }, cancelLabel }) -> Promise<boolean>   a text step with Continue / Cancel (true = Continue pressed and onClick passed)
 */
import { h } from '../../core/dom.js';
import { loadCss } from '../../core/css-loader.js';
import { openSheet } from '../../ui/sheet.js';
import { buildPinPad, isWeakPin } from './pin-pad.js';
import { describeError } from './pin-sheet.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openPinFlow({ title = '' } = {}) {
  await loadCss('/css/pages/lock.css');
  let sheet = null, locked = false, open = true, current = null;
  const body = h('div', { class: 'pf-body' });
  const listeners = [];
  const closed = new Promise((resolve) => {
    sheet = openSheet({ title, body, actions: [], scrimClose: false, beforeClose: () => !locked, onClose: () => { open = false; if (current) current.destroy(); current = null; listeners.splice(0).forEach((f) => f()); resolve(); } });   // a tap outside never closes it
  });
  const flow = {
    closed, isOpen: () => open,
    setTitle(t) { const el = sheet.el.querySelector('.sheet-title'); if (el) el.textContent = t; },
    onClose(fn) { if (open) listeners.push(fn); else fn(); },
    /** Replaces the content. `pad` (optional) is a PIN pad to destroy when the content is replaced or the popup ends. */
    show(node, pad = null) { if (current) current.destroy(); current = pad; locked = false; body.replaceChildren(node); },
    working(text = 'Working...') { if (current) current.destroy(); current = null; locked = true; body.replaceChildren(h('div', { class: 'pf-work', role: 'status' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', { text }))); },
    async finish() { locked = false; sheet.close(); await closed; await sleep(90); }   // 90 ms: the history entry of the popup is removed in the next tick and its popstate has to pass first
  };
  return flow;
}

export function stagePad(flow, { text = '', notice = '', submitLabel = 'Continue', check = null, digits = 0 } = {}) {   // digits: a fixed length (the 6-digit vault code, v2.5.2)
  return new Promise((resolve) => {
    const lead = h('p', { class: 'pin-text', text });
    let settled = false;
    const end = (v) => { if (!settled) { settled = true; resolve(v); } };
    const pad = buildPinPad({ submitLabel, min: digits || 4, max: digits || 8, onSubmit: async (pin) => {
      try {
        const bad = check ? await check(pin) : '';
        if (bad) { pad.shake(); pad.message(bad, 'error'); return; }
        end(pin);
      } catch (e) { const d = describeError(e); pad.shake(); if (d.wait) pad.lockFor(d.wait, d.text); else pad.message(d.text, 'error'); }
    } });
    flow.onClose(() => end(null));
    flow.show(h('div', { class: 'pin-sheet' }, lead, pad.el), pad);
    if (notice) pad.message(notice, 'error');
    requestAnimationFrame(() => pad.focus());
  });
}

export async function stageCreate(flow, { text = 'Use 4 to 8 digits. Pick something others can not guess.', digits = 0 } = {}) {
  let notice = '';
  for (;;) {
    const first = await stagePad(flow, { text, notice, digits, check: async (p) => (isWeakPin(p) ? 'Choose a PIN that is harder to guess (not 1111 or 1234).' : '') });
    if (first === null) return null;
    notice = '';
    let mismatch = false;
    const again = await stagePad(flow, { text: 'Enter the same PIN again to confirm it.', digits, check: async (p) => { if (p !== first) { mismatch = true; return ''; } return ''; } });
    if (again === null) return null;
    if (!mismatch && again === first) return first;
    notice = 'The two PINs were different. Start again.';
  }
}

export function stageForm(flow, { text = '', kids = [], go, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let settled = false; const end = (v) => { if (!settled) { settled = true; resolve(v); } };
    const err = h('p', { class: 'help is-error', role: 'alert' });
    const api = { error: (m) => { err.textContent = m || ''; }, busy: (b) => { for (const x of node.querySelectorAll('button')) x.disabled = !!b; } };
    const goBtn = h('button', { type: 'button', class: 'btn btn-primary pf-go', text: go.label, on: { click: async () => {
      err.textContent = ''; api.busy(true);
      try { const r = await go.onClick(api); if (r !== false) { end(true); return; } } catch (e) { err.textContent = (e && e.message) || 'Something went wrong. Try again.'; }
      api.busy(false);
    } } });
    const cancel = h('button', { type: 'button', class: 'btn', text: cancelLabel, on: { click: () => { end(false); flow.finish(); } } });
    const node = h('div', { class: 'pf-body' }, text ? h('p', { class: 'pin-text', text }) : null, ...kids, err, h('div', { class: 'pf-actions' }, cancel, goBtn));
    flow.onClose(() => end(false));
    flow.show(node);
    const first = node.querySelector('input'); if (first) requestAnimationFrame(() => first.focus({ preventScroll: true }));
  });
}
