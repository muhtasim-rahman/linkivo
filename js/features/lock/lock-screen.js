/**
 * Linkivo — js/features/lock/lock-screen.js  (v2.5.0)
 * Purpose: the full-screen lock. It covers everything (the page behind has already been removed from the DOM by router.suspend, or was never mounted at start), asks for the PIN
 *          and offers "Forgot PIN?" and "Log out". Wrong PINs, the countdown of a lockout and "no connection" are shown on the keypad (describeError). The screen holds no data of
 *          the library: only the person's name and masked email.
 * API: showLockScreen({ session, onUnlocked, router }) -> { dispose() }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { maskEmail } from '../../core/mask.js';
import { shownUser } from '../../core/profile-data.js';
import { unlock } from '../../core/lock.js';
import { buildPinPad } from './pin-pad.js';
import { describeError } from './pin-sheet.js';

export async function showLockScreen({ session, onUnlocked, router = null }) {
  await loadCss('/css/pages/lock.css');
  document.getElementById('lock-screen')?.remove();
  const guest = session.mode === 'guest', who = guest ? 'This device' : `${shownUser(session.user).name} (${maskEmail(session.user.email)})`;
  const pad = buildPinPad({ onSubmit: async (pin) => {
    try { await unlock(pin); pad.message(''); dispose(true); onUnlocked(); }
    catch (e) { const d = describeError(e); pad.shake(); if (d.wait) pad.lockFor(d.wait, d.text); else pad.message(d.text, 'error'); }
  } });
  const forgot = h('button', { type: 'button', class: 'lock-link', on: { click: async () => { const m = await import('./forgot-pin.js'); if (await m.runForgotPin({ session, router })) { dispose(true); onUnlocked(); } } } }, 'Forgot PIN?');
  const out = h('button', { type: 'button', class: 'lock-link is-quiet', on: { click: async () => { const m = await import('../shell/shell-parts.js'); m.logOut(router, { guest, skipPin: true }); } } }, guest ? 'Leave guest mode' : 'Log out');
  const el = h('div', { id: 'lock-screen', class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Linkivo is locked' },
    h('div', { class: 'lock-card' }, h('span', { class: 'lock-mark', 'aria-hidden': 'true' }, icon('lock', { size: 30 })), h('h1', { class: 'lock-title', text: 'Linkivo is locked' }), h('p', { class: 'lock-who', text: who }), pad.el,
      h('div', { class: 'lock-links' }, forgot, out)));
  document.body.appendChild(el);
  document.documentElement.dataset.locked = '1';
  requestAnimationFrame(() => pad.focus());
  function dispose(animate = false) {
    pad.destroy(); delete document.documentElement.dataset.locked;
    if (animate) { el.classList.add('is-out'); setTimeout(() => el.remove(), 260); } else el.remove();
  }
  return { dispose };
}
