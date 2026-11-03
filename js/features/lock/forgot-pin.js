/**
 * Linkivo — js/features/lock/forgot-pin.js  (v2.5.0)
 * Purpose: "Forgot PIN?". ACCOUNT: sign in again (password, or the Google window) to prove it is the owner, choose a new PIN, done. Folders, links, tags and the vault are NOT touched:
 *          the PIN only gates the data, it does not encrypt it on the server. The copy on this device was made with the old PIN's key, so the device throws it away and downloads it
 *          again. GUEST: there is no server and the device copy is encrypted with the PIN, so without it the data can not be read: the only way forward is to erase it (clearly said).
 * API: runForgotPin({ session, router }) -> Promise<boolean>  (true = the PIN was reset or erased and the app can open now)
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { resetPin, eraseGuestLock } from '../../core/lock.js';
import { openDbSafe, STORES } from '../../engine/idb.js';
import { GUEST_DB } from '../../engine/local-engine.js';
import { reauthenticate, freshIdToken, hasPassword, friendlyAuthError, sendReset } from '../auth/auth-service.js';
import { createPin, describeError } from './pin-sheet.js';

/** Asks for the account password in a small popup; resolves with the password, '' for Google accounts (the window opens later), or null when cancelled. */
function askPassword(user) {
  return new Promise((resolve) => {
    if (!hasPassword(user)) { resolve(''); return; }
    let sheet = null, done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const err = h('p', { class: 'help is-error', role: 'alert' });
    const input = h('input', { class: 'input', id: 'fp-pass', type: 'password', autocomplete: 'current-password', placeholder: 'Your account password', spellcheck: 'false' });
    const go = h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => { if (!input.value) { err.textContent = 'Enter your password.'; return; } finish(input.value); sheet.close(); } } }, 'Continue');
    const forgot = h('button', { type: 'button', class: 'link', on: { click: async () => { try { await sendReset(user.email); toast('Reset link sent.'); } catch (e) { err.textContent = friendlyAuthError(e) || ''; } } } }, 'Forgot password?');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
    sheet = openSheet({ title: 'Confirm it is you', body: h('div', { class: 'acc-form' }, h('div', { class: 'acc-field' }, h('label', { class: 'acc-label', for: 'fp-pass', text: 'Password' }), input, forgot), err), actions: [go], onClose: () => finish(null) });
    requestAnimationFrame(() => input.focus());
  });
}

async function eraseGuestData() {
  const db = await openDbSafe(GUEST_DB);
  for (const store of Object.keys(STORES)) await db.clear(store);
  db.close && db.close();
}

export async function runForgotPin({ session }) {
  if (session.mode === 'guest') {
    const ok = await confirmDialog({ title: 'Erase this device\'s data?', danger: true, confirmLabel: 'Erase and remove the lock',
      message: 'Guest data only exists on this device and is protected by your PIN. Without the PIN it can not be read, so the only way to open Linkivo again is to erase it. This can not be undone. Log in to an account next time to keep your links safe.' });
    if (!ok) return false;
    try { await eraseGuestData(); eraseGuestLock(); toast('Guest data erased. The lock is off.'); return true; } catch { toast('Could not erase the data. Try again.', { type: 'error' }); return false; }
  }
  const ok = await confirmDialog({ title: 'Reset your PIN?', confirmLabel: 'Continue', message: 'You will sign in again to prove it is you, then choose a new PIN. Your folders, links and everything else stay exactly as they are.' });
  if (!ok) return false;
  const password = await askPassword(session.user); if (password === null) return false;
  try { await reauthenticate(password || undefined); await freshIdToken(); } catch (e) { toast(friendlyAuthError(e) || 'Could not confirm it is you.', { type: 'error' }); return false; }
  const pin = await createPin({ title: 'Choose a new PIN' }); if (!pin) return false;
  try { await resetPin(pin); toast('Your PIN was reset.'); return true; }
  catch (e) { toast(e && e.code === 'reauth_required' ? 'Please try again: confirm it is you once more.' : describeError(e).text, { type: 'error' }); return false; }
}
