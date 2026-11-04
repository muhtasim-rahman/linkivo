/**
 * Linkivo — js/ui/lock-button.js  (v2.5.1)
 * Purpose: the small "Lock now" icon at the top of Library, Random and Menu on a phone (owner request). It is only on screen while the app lock is on, and it is hidden on a PC,
 *          where the same action lives in the sidebar. It uses the same lockNow() as Settings > Security, so the lock watch does the rest (page removed, data stopped, lock screen).
 * API: lockButton() -> HTMLButtonElement
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { getLock, subscribeLock, lockNow } from '../core/lock.js';

export function lockButton() {
  const b = h('button', { type: 'button', class: 'btn-icon lock-btn is-phone', 'aria-label': 'Lock now', 'data-tip': 'Lock now', on: { click: () => { lockNow().catch(() => {}); } } }, icon('lock', { size: 22 }));
  const sync = () => { b.hidden = !getLock().enabled; };
  sync();
  let seen = false;   // the lock state can change before the page is attached: only stop listening once the button has been on screen and left it
  const off = subscribeLock(() => { if (b.isConnected) { seen = true; sync(); } else if (seen) off(); else sync(); });
  return b;
}
