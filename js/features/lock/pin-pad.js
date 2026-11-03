/**
 * Linkivo — js/features/lock/pin-pad.js  (v2.5.0)
 * Purpose: the PIN keypad used by the lock screen and by every place that asks for a PIN (4 to 8 digits). Big round keys (56px, comfortable for a thumb), dots that grow as digits
 *          are typed, a check key (or Enter, or the 8th digit) to send, backspace, and the physical keyboard works too. After a wrong PIN the dots shake once; while the app is
 *          locked out the keys are disabled and a countdown is shown. The PIN is only ever held in memory here, in a variable that is cleared after use.
 * API: buildPinPad({ onSubmit(pin) -> Promise, min = 4, max = 8, submitLabel }) -> { el, reset(), message(text, kind?), shake(), lockFor(seconds, text?), setBusy(bool), focus() }
 *      isWeakPin(pin) -> boolean   (pure, tested: all the same digit, or a straight run up or down)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { formatWait } from '../../core/lockout.js';

export function isWeakPin(pin) {
  const p = String(pin); if (p.length < 4) return true;
  if (/^(\d)\1+$/.test(p)) return true;
  const d = [...p].map(Number); const step = d[1] - d[0];
  return (step === 1 || step === -1) && d.every((v, i) => i === 0 || v - d[i - 1] === step);
}

export function buildPinPad({ onSubmit, min = 4, max = 8, submitLabel = 'Unlock' } = {}) {
  let value = '', busy = false, until = 0, timer = 0;
  const dots = h('div', { class: 'pin-dots', role: 'img' });
  const msg = h('p', { class: 'pin-msg', role: 'status', 'aria-live': 'polite' });
  const keys = [];
  const key = (label, cls, fn, aria) => { const b = h('button', { type: 'button', class: ['pin-key', cls], 'aria-label': aria || String(label), on: { click: fn } }, typeof label === 'string' || typeof label === 'number' ? h('span', { text: String(label) }) : label); keys.push(b); return b; };
  const digit = (n) => key(n, 'is-digit', () => add(String(n)));
  const back = key(icon('arrow-left', { size: 22 }), 'is-aux', () => { value = value.slice(0, -1); paint(); }, 'Delete the last digit');
  const go = key(icon('check', { size: 24 }), 'is-go', () => submit(), submitLabel);
  const grid = h('div', { class: 'pin-grid' }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(digit), back, digit(0), go);
  const el = h('div', { class: 'pin', tabindex: '-1' }, dots, msg, grid);

  function paint() {
    const n = Math.max(min, value.length);
    dots.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', { class: ['pin-dot', i < value.length && 'is-on'] })));
    dots.setAttribute('aria-label', `${value.length} digit${value.length === 1 ? '' : 's'} entered, at least ${min}`);
    const off = busy || until > Date.now();
    for (const k of keys) k.disabled = off;
    go.disabled = off || value.length < min; back.disabled = off || !value.length;
  }
  function add(d) { if (busy || until > Date.now() || value.length >= max) return; value += d; message(''); paint(); if (value.length === max) submit(); }
  async function submit() {
    if (busy || value.length < min || until > Date.now()) return;
    const pin = value; busy = true; paint();
    try { await onSubmit(pin); } finally { busy = false; value = ''; paint(); }   // the digits are dropped whatever happened
  }
  function message(text, kind = '') { msg.textContent = text || ''; msg.className = ['pin-msg', kind && `is-${kind}`].filter(Boolean).join(' '); }
  function shake() { dots.classList.remove('is-shake'); void dots.offsetWidth; dots.classList.add('is-shake'); }
  function lockFor(seconds, text = 'Too many wrong PINs.') {
    clearInterval(timer); until = Date.now() + seconds * 1000;
    const tick = () => { const left = Math.ceil((until - Date.now()) / 1000); if (left <= 0) { clearInterval(timer); until = 0; message(''); paint(); return; } message(`${text} Try again in ${formatWait(left)}.`, 'error'); };
    tick(); paint(); timer = setInterval(tick, 1000);
  }
  el.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); add(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); value = value.slice(0, -1); paint(); } else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  paint();
  return { el, reset() { value = ''; paint(); }, message, shake, lockFor, setBusy(b) { busy = !!b; paint(); }, focus() { el.focus({ preventScroll: true }); }, destroy() { clearInterval(timer); } };
}
