/**
 * Linkivo — js/features/lock/lock-settings.js  (v2.5.0)
 * Purpose: the rows of Settings > Security: App lock (switch), Change PIN, Auto-lock after, Lock when you leave the app (this device), Lock now. The block redraws itself when the lock
 *          state changes. Changing anything goes through requireSensitive('security') first (the PIN, with the 5-minute window) and the Worker, which is the real check.
 * API: securityRows({ row }) -> Element     (row = the shared settings row builder from custom-rows.js)
 */
import { h } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { createSelect } from '../../ui/select.js';
import { prefs } from '../../core/local-prefs.js';
import { getLock, subscribeLock, setAutoLock, lockNow } from '../../core/lock.js';
import { requireSensitive } from '../../core/sensitive.js';
import { enableLockFlow, disableLockFlow, changePinFlow } from './lock-actions.js';
import { describeError } from './pin-sheet.js';

export const AUTO_LOCK = [{ value: '0', label: 'Only when I lock it' }, { value: '1', label: 'After 1 minute' }, { value: '5', label: 'After 5 minutes' }, { value: '15', label: 'After 15 minutes' }, { value: '30', label: 'After 30 minutes' }, { value: '60', label: 'After 1 hour' }];

export function securityRows({ row }) {
  const box = h('div');
  let busy = false;
  const guard = async (fn) => { if (busy) return; busy = true; try { await fn(); } finally { busy = false; draw(); } };
  const toggle = (label, on, flip) => {
    const sw = h('button', { type: 'button', class: 'switch-hit', role: 'switch', 'aria-label': label, 'aria-checked': String(on), on: { click: (e) => { e.stopPropagation(); flip(); } } }, h('span', { class: 'switch', 'aria-checked': String(on) }));
    return sw;
  };
  const withRow = (r, flip) => { r.classList.add('is-toggle'); r.addEventListener('click', (e) => { if (!e.target.closest('a, input, select, button.btn')) flip(); }); return r; };
  function draw() {
    const s = getLock(), kids = [];
    if (s.scope === 'none') { box.replaceChildren(row('App lock', 'Sign in or continue as a guest to use the lock.', null)); return; }
    const flipLock = () => guard(async () => { if (s.enabled) { await disableLockFlow(); } else if (await requireSensitive('security')) await enableLockFlow(); });
    kids.push(withRow(row('App lock', s.scope === 'guest' ? 'Asks for a PIN every time Linkivo opens. Your links on this device are stored encrypted with it.' : 'Asks for a PIN every time Linkivo opens. Your data is also closed on the server until the PIN is entered, and the copy on this device is encrypted.', toggle('App lock', s.enabled, flipLock)), flipLock));
    if (s.enabled) {
      kids.push(row('Change PIN', 'Choose a new 4 to 8 digit PIN.', h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => guard(async () => { if (await requireSensitive('security')) await changePinFlow(); }) } }, 'Change')));
      const sel = createSelect({ options: AUTO_LOCK, value: String(s.autoLock || 0), label: 'Auto-lock', align: 'end', onChange: async (v) => {
        try { if (await requireSensitive('security')) { await setAutoLock(Number(v)); toast('Auto-lock saved.'); } } catch (e) { toast(describeError(e).text, { type: 'error' }); } draw(); } });
      kids.push(row('Auto-lock', 'Locks when you have not touched Linkivo for this long.', sel));
      const hide = () => { prefs.set('lock.onHide', !prefs.get('lock.onHide', false)); draw(); };
      kids.push(withRow(row('Lock when I leave the app', 'Locks at once when you switch to another app or tab. This device only.', toggle('Lock when I leave the app', !!prefs.get('lock.onHide', false), hide)), hide));
      kids.push(row('Lock now', 'Closes your library until the PIN is entered again.', h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => lockNow() } }, 'Lock')));
    }
    box.replaceChildren(...kids);
  }
  draw(); const off = subscribeLock(() => { if (box.isConnected) draw(); else off(); });
  return box;
}
