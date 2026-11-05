/**
 * Linkivo — js/features/lock/pin-sheet.js  (v2.5.0)
 * Purpose: popups that ask for a PIN. askPin: "enter your PIN" (the sensitive-action gate, turning the lock off, changing the PIN, deleting). createPin: choose a new PIN twice
 *          (a PIN that is all the same digit or a straight run is refused). Both return the PIN (or null when cancelled) and never keep it; checking it is the caller's job
 *          through core/lock.js, so the wrong-PIN and lockout messages come from one place (describeError).
 * API: askPin({ title, text, verify(pin) -> Promise }) -> Promise<string|null>      createPin({ title, text }) -> Promise<string|null>      describeError(e) -> { text, wait }
 */
import { h } from '../../core/dom.js';
import { loadCss } from '../../core/css-loader.js';
import { openSheet } from '../../ui/sheet.js';
import { buildPinPad, isWeakPin } from './pin-pad.js';
import { prefs } from '../../core/local-prefs.js';
import { getPinLen } from '../../core/lock.js';

/** v2.5.2 (owner 7): Settings > Security > "PIN gate": 'auto' (default) checks as soon as the PIN length is reached, 'submit' waits for the Submit key. Only the gate popups, never the lock screen. */
export const GATE_MODE_KEY = 'lock.gateMode';
export const gateMode = () => (prefs.get(GATE_MODE_KEY, 'auto') === 'submit' ? 'submit' : 'auto');

/** One place that turns an error from the Worker or the guest check into words. `wait` > 0 means the keypad should wait that many seconds. */
export function describeError(e) {
  const c = e && e.code, left = e && e.attemptsLeft;
  if (c === 'wrong_pin') return { text: left ? `That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left before a short wait.` : 'That PIN is not right.', wait: (e && e.retryAfter) || 0 };
  if (c === 'locked_out') return { text: 'Too many wrong PINs.', wait: (e && e.retryAfter) || 30 };
  if (c === 'rate_limited') return { text: 'Too many tries at once.', wait: (e && e.retryAfter) || 30 };
  if (c === 'no_pin') return { text: 'No PIN is set for this account. Use Forgot PIN to set one.', wait: 0 };
  if (c === 'not_configured') return { text: 'The PIN service is not set up on the server yet.', wait: 0 };
  if (c === 'reauth_required') return { text: 'Sign in again first.', wait: 0 };
  if (e && (e.status === undefined || e.status === 0 || e.name === 'TypeError')) return { text: 'Could not reach the server. Connect to the internet and try again.', wait: 0 };
  return { text: 'Something went wrong. Try again.', wait: 0 };
}

export async function askPin({ title = 'Enter your PIN', text = '', verify = null } = {}) {
  await loadCss('/css/pages/lock.css');
  return new Promise((resolve) => {
    let sheet = null, done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const auto = gateMode() === 'auto';
    const pad = buildPinPad({ submitLabel: 'Continue', autoAt: auto ? getPinLen : 0, autoMax: auto, onSubmit: async (pin) => {
      if (!verify) { finish(pin); sheet && sheet.close(); return; }
      try { await verify(pin); finish(pin); sheet && sheet.close(); }
      catch (e) { const d = describeError(e); pad.shake(); if (d.wait) pad.lockFor(d.wait, d.text); else pad.message(d.text, 'error'); }
    } });
    sheet = openSheet({ title, body: h('div', { class: 'pin-sheet' }, text ? h('p', { class: 'pin-text', text }) : null, pad.el), actions: [], onClose: () => { pad.destroy(); finish(null); } });
    requestAnimationFrame(() => pad.focus());
  });
}

export async function createPin({ title = 'Choose a PIN', text = 'Use 4 to 8 digits. Pick something others can not guess.' } = {}) {
  await loadCss('/css/pages/lock.css');
  return new Promise((resolve) => {
    let sheet = null, first = '', done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const lead = h('p', { class: 'pin-text', text });
    const pad = buildPinPad({ submitLabel: 'Continue', onSubmit: async (pin) => {
      if (!first) {
        if (isWeakPin(pin)) { pad.shake(); pad.message('Choose a PIN that is harder to guess (not 1111 or 1234).', 'error'); return; }
        first = pin; lead.textContent = 'Enter the same PIN again to confirm it.'; pad.message(''); return;
      }
      if (pin !== first) { first = ''; pad.shake(); lead.textContent = text; pad.message('The two PINs were different. Start again.', 'error'); return; }
      finish(pin); sheet && sheet.close();
    } });
    sheet = openSheet({ title, body: h('div', { class: 'pin-sheet' }, lead, pad.el), actions: [], onClose: () => { pad.destroy(); finish(null); } });
    requestAnimationFrame(() => pad.focus());
  });
}
