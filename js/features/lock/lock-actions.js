/**
 * Linkivo — js/features/lock/lock-actions.js  (v2.5.0)
 * Purpose: the flows behind Settings > Security: turn the app lock on, turn it off, change the PIN. Each one asks for the PIN(s), talks to core/lock.js, then re-encrypts the copy of the
 *          library kept on this device (the data layer is stopped first so nothing writes while it is rewritten) and starts the app again. Errors become one short toast.
 * API: enableLockFlow() disableLockFlow() changePinFlow()   (each resolves true when it changed something)
 */
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { getSession } from '../../core/session.js';
import { enableLock, disableLock, changePin, verifyPin } from '../../core/lock.js';
import { teardownData } from '../../core/app-data.js';
import { openDbSafe } from '../../engine/idb.js';
import { GUEST_DB } from '../../engine/local-engine.js';
import { decryptAll, rekey } from '../../engine/encrypted-db.js';
import { createPin, askPin, describeError } from './pin-sheet.js';
import { reinitApp, markVerified } from './lock-controller.js';

const rawDb = () => { const s = getSession(); return openDbSafe(s.mode === 'guest' ? GUEST_DB : `linkivo-${s.user.uid}`); };
const fail = (e) => { toast(describeError(e).text, { type: 'error' }); return false; };

export async function enableLockFlow() {
  const s = getSession();
  if (s.mode === 'guest') {
    const ok = await confirmDialog({ title: 'Lock this device?', confirmLabel: 'Choose a PIN', message: 'The PIN protects the links saved on this device. As a guest there is no account to recover them with: if you forget the PIN the only way back in is to erase this device\'s data. Log in to an account for the safest setup.' });
    if (!ok) return false;
  }
  const pin = await createPin({ title: 'Turn on app lock' }); if (!pin) return false;
  try { await enableLock(pin); } catch (e) { return fail(e); }
  try { await teardownData(); await reinitApp(); markVerified(); toast('App lock is on.'); return true; }
  catch { toast('The lock is on, but the app could not restart. Reload the page.', { type: 'error' }); return true; }
}

export async function disableLockFlow() {
  const pin = await askPin({ title: 'Turn off app lock', text: 'Enter your PIN to turn the lock off.', verify: verifyPin }); if (!pin) return false;
  try {
    await teardownData();
    const old = await disableLock(pin);
    if (old) { const db = await rawDb(); await decryptAll(db, old); db.close && db.close(); }   // the device copy is stored plain again
  } catch (e) { await reinitApp().catch(() => {}); return fail(e); }
  await reinitApp().catch(() => {}); toast('App lock is off.'); return true;
}

export async function changePinFlow() {
  const current = await askPin({ title: 'Change PIN', text: 'Enter your current PIN.', verify: verifyPin }); if (!current) return false;
  const next = await createPin({ title: 'Choose a new PIN' }); if (!next) return false;
  try {
    await teardownData();
    const { oldBox, newBox } = await changePin(current, next);
    if (oldBox && newBox) { const db = await rawDb(); await rekey(db, oldBox, newBox); db.close && db.close(); }
  } catch (e) { await reinitApp().catch(() => {}); return fail(e); }
  await reinitApp().catch(() => {}); markVerified(); toast('PIN changed.'); return true;
}
