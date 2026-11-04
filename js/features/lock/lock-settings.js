/**
 * Linkivo — js/features/lock/lock-settings.js  (v2.5.0, v2.5.1)
 * Purpose: the rows of Settings > Security: App lock (switch), Change PIN, Auto lock (one setting since v2.5.1), Lock now. The block redraws itself when the lock
 *          state changes. Changing anything goes through requireSensitive('security') first (the PIN, with the 5-minute window) and the Worker, which is the real check.
 * API: securityRows({ row }) -> Element     (row = the shared settings row builder from custom-rows.js)
 */
import { h } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { createSelect } from '../../ui/select.js';
import { getLock, subscribeLock, setAway, lockNow } from '../../core/lock.js';
import { requireSensitive } from '../../core/sensitive.js';
import { enableLockFlow, disableLockFlow, changePinFlow } from './lock-actions.js';
import { describeError } from './pin-sheet.js';

/** v2.5.1 (owner): one Auto lock setting. The time counts while Linkivo is minimized or another tab/app is in front. Values are seconds (-1 = never). */
export const AUTO_LOCK = [{ value: '0', label: 'Right after closing the app' }, { value: '30', label: '30 seconds after closing' }, { value: '60', label: '1 minute after closing' }, { value: '300', label: '5 minutes after closing' }, { value: '600', label: '10 minutes after closing' }, { value: '900', label: '15 minutes after closing' }, { value: '1800', label: '30 minutes after closing' }, { value: '-1', label: 'Never' }];

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
    const flipLock = () => guard(async () => { if (getLock().enabled) { await disableLockFlow(); } else if (await requireSensitive('security')) await enableLockFlow(); });
    kids.push(withRow(row('App lock', s.scope === 'guest' ? 'Asks for a PIN every time Linkivo opens. Your links on this device are stored encrypted with it.' : 'Asks for a PIN every time Linkivo opens. Your data is also closed on the server until the PIN is entered, and the copy on this device is encrypted.', toggle('App lock', s.enabled, flipLock)), flipLock));
    if (s.enabled) {
      kids.push(row('Change PIN', 'Choose a new 4 to 8 digit PIN.', h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => guard(async () => { if (await requireSensitive('security')) await changePinFlow(); }) } }, 'Change')));
      const sel = createSelect({ options: AUTO_LOCK, value: String(s.away), label: 'Auto lock', align: 'end', onChange: async (v) => {
        try { if (await requireSensitive('security')) { await setAway(Number(v)); toast('Auto lock saved.'); } } catch (e) { toast(describeError(e).text, { type: 'error' }); } draw(); } });
      kids.push(row('Auto lock', 'Locks after Linkivo has been minimized or on another tab for this long. It follows your account on every device.', sel));
      kids.push(row('Lock now', 'Closes your library until the PIN is entered again.', h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => lockNow() } }, 'Lock')));
    }
    box.replaceChildren(...kids);
  }
  // v2.5.1 (owner: "the other options do not show until I refresh"): the old check unsubscribed when the first notice arrived before the page was attached. Now it only stops
  // after the block has been on screen and then left it.
  let seen = false; draw();
  const off = subscribeLock(() => { if (box.isConnected) { seen = true; draw(); } else if (seen) off(); else draw(); });
  return box;
}
