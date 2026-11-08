/**
 * Linkivo — js/features/lock/lock-actions.js  (v2.5.1)
 * v2.5.1 (owner: the page jumped or the popup closed after PIN popups): every flow is now ONE popup (pin-flow.js) and the page is restarted only AFTER the popup is gone and its history
 *          entry has settled. Before, the app restarted while popups were closing: the router's navigation wiped the popup's back entry, which caused jumps and odd Back behavior.
 * Purpose: the flows behind Settings > Security: turn the app lock on, turn it off, change the PIN. Each one asks for the PIN(s), talks to core/lock.js, then re-encrypts the copy of the
 *          library kept on this device (the data layer is stopped first so nothing writes while it is rewritten) and starts the app again. Errors become one short toast.
 * API: enableLockFlow() disableLockFlow() changePinFlow()   (each resolves true when it changed something)
 */
import { toast } from '../../ui/toast.js';
import { getSession } from '../../core/session.js';
import { enableLock, disableLock, changePin, verifyPin } from '../../core/lock.js';
import { teardownData } from '../../core/app-data.js';
import { openDbSafe } from '../../engine/idb.js';
import { GUEST_DB } from '../../engine/local-engine.js';
import { decryptAll, rekey } from '../../engine/encrypted-db.js';
import { describeError } from './pin-sheet.js';
import { openPinFlow, stagePad, stageCreate, stageForm } from './pin-flow.js';
import { reinitApp, markVerified } from './lock-controller.js';

const rawDb = () => { const s = getSession(); return openDbSafe(s.mode === 'guest' ? GUEST_DB : `linkivo-${s.user.uid}`); };
const fail = (e) => { toast(describeError(e).text, { type: 'error' }); return false; };

export async function enableLockFlow() {
  const s = getSession();
  const flow = await openPinFlow({ title: 'Turn on app lock' });
  if (s.mode === 'guest') {
    const go = await stageForm(flow, { text: 'The PIN protects the links saved on this device. As a guest there is no account to recover them with: if you forget the PIN the only way back in is to erase this device\'s data. Log in to an account for the safest setup.', go: { label: 'Choose a PIN', onClick: async () => true } });
    if (!go) return false;
  }
  const pin = await stageCreate(flow); if (!pin) return false;
  flow.working('Turning on the lock...');
  try { await enableLock(pin); await teardownData(); } catch (e) { await flow.finish(); await reinitApp().catch(() => {}); return fail(e); }
  await flow.finish();
  try { await reinitApp(); markVerified(); toast('App lock is on.'); return true; }
  catch { toast('The lock is on, but the app could not restart. Reload the page.', { type: 'error' }); return true; }
}

export async function disableLockFlow() {
  const flow = await openPinFlow({ title: 'Turn off app lock' });
  const pin = await stagePad(flow, { text: 'Enter your PIN to turn the lock off.', known: true, check: async (p) => { await verifyPin(p); return ''; } }); if (!pin) return false;
  flow.working('Turning off the lock...');
  try {
    await teardownData();
    const old = await disableLock(pin);
    if (old) { const db = await rawDb(); await decryptAll(db, old); db.close && db.close(); }   // the device copy is stored plain again
  } catch (e) { await flow.finish(); await reinitApp().catch(() => {}); return fail(e); }
  await flow.finish(); await reinitApp().catch(() => {}); toast('App lock is off.'); return true;
}

export async function changePinFlow() {
  const flow = await openPinFlow({ title: 'Change PIN' });
  const current = await stagePad(flow, { text: 'Enter your current PIN.', known: true, check: async (p) => { await verifyPin(p); return ''; } }); if (!current) return false;
  flow.setTitle('Choose a new PIN');
  const next = await stageCreate(flow); if (!next) return false;
  flow.working('Changing your PIN...');
  try {
    await teardownData();
    const { oldBox, newBox } = await changePin(current, next);
    if (oldBox && newBox) { const db = await rawDb(); await rekey(db, oldBox, newBox); db.close && db.close(); }
  } catch (e) { await flow.finish(); await reinitApp().catch(() => {}); return fail(e); }
  await flow.finish(); await reinitApp().catch(() => {}); markVerified(); toast('PIN changed.'); return true;
}
