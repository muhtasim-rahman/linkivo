/**
 * Linkivo — js/features/lock/forgot-pin.js  (v2.5.1)
 * v2.5.1 (owner): (1) the "Continue" button of the password popup closed it instead of going on: the old code passed a button element where openSheet wants an action object, so the sheet made its
 *          own blank button that only closes (blank = invisible in the light theme). (2) "Forgot password?" sent the reset email at once; it now asks first, inside the popup.
 *          (3) The whole account flow (explain, confirm it is you, choose a PIN) is ONE popup now (pin-flow.js).
 * Purpose: "Forgot PIN?". ACCOUNT: sign in again (password, or the Google window) to prove it is the owner, choose a new PIN, done. Folders, links, tags and the vault are NOT touched:
 *          the PIN only gates the data, it does not encrypt it on the server. The copy on this device was made with the old PIN's key, so the device throws it away and downloads it
 *          again. GUEST: there is no server and the device copy is encrypted with the PIN, so without it the data can not be read: the only way forward is to erase it (clearly said).
 * API: runForgotPin({ session, router }) -> Promise<boolean>  (true = the PIN was reset or erased and the app can open now)
 */
import { h } from '../../core/dom.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { resetPin, eraseGuestLock } from '../../core/lock.js';
import { openDbSafe, STORES } from '../../engine/idb.js';
import { GUEST_DB } from '../../engine/local-engine.js';
import { reauthenticate, freshIdToken, hasPassword, friendlyAuthError, sendReset } from '../auth/auth-service.js';
import { describeError } from './pin-sheet.js';
import { openPinFlow, stageCreate, stageForm } from './pin-flow.js';
import { maskEmail } from '../../core/mask.js';
import { sendAllowed, friendlyWait } from '../../core/send-limit.js';

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
  const flow = await openPinFlow({ title: 'Reset your PIN' });
  const user = session.user, usesPassword = hasPassword(user);
  // step 1: what happens, then confirm it is the owner (password, or the Google window)
  const pass = h('input', { class: 'input', id: 'fp-pass', type: 'password', autocomplete: 'current-password', placeholder: 'Your account password', spellcheck: 'false', 'aria-label': 'Account password' });
  const ask = h('div', { class: 'pf-ask', hidden: true });
  const forgot = h('button', { type: 'button', class: 'link', text: 'Forgot password?' });
  forgot.addEventListener('click', () => {   // v2.5.1: ask first, then send
    const mail = maskEmail(user.email);
    const yes = h('button', { type: 'button', class: 'btn btn-sm btn-primary', text: 'Send link' }), no = h('button', { type: 'button', class: 'btn btn-sm', text: 'Cancel' });
    no.addEventListener('click', () => { ask.hidden = true; });
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      const g = sendAllowed('reset', user.email);
      if (!g.ok) toast(`A link was sent recently. Try again in ${friendlyWait(g.waitMs)}.`, { type: 'error' });
      else { try { await sendReset(user.email); toast(`Reset link sent to ${mail}.`); } catch (e) { toast(friendlyAuthError(e) || 'Could not send the link.', { type: 'error' }); } }
      ask.hidden = true;
    });
    ask.replaceChildren(h('p', { text: `Send a password reset link to ${mail}?` }), h('div', { class: 'pf-actions' }, no, yes)); ask.hidden = false;
  });
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.closest('.pf-body').querySelector('.pf-go').click(); } });
  const verified = await stageForm(flow, {
    text: 'You will sign in again to prove it is you, then choose a new PIN. Your folders, links and everything else stay exactly as they are.',
    kids: usesPassword ? [h('div', { class: 'acc-field' }, h('label', { class: 'acc-label', for: 'fp-pass', text: 'Password' }), pass, forgot), ask] : [h('p', { class: 'pin-text', text: 'This account signs in with Google. A Google window opens to confirm it is you.' })],
    go: { label: usesPassword ? 'Continue' : 'Continue with Google', onClick: async (api) => {
      if (usesPassword && !pass.value) { api.error('Enter your password.'); return false; }
      try { await reauthenticate(usesPassword ? pass.value : undefined); await freshIdToken(); }
      catch (e) { api.error(friendlyAuthError(e) || 'Could not confirm it is you.'); return false; }
      return true;
    } }
  });
  if (!verified) return false;
  // step 2: the new PIN (twice), then the Worker resets it
  flow.setTitle('Choose a new PIN');
  const pin = await stageCreate(flow); if (!pin) return false;
  flow.working('Saving your new PIN...');
  try { await resetPin(pin); }
  catch (e) { await flow.finish(); toast(e && e.code === 'reauth_required' ? 'Please try again: confirm it is you once more.' : describeError(e).text, { type: 'error' }); return false; }
  await flow.finish(); toast('Your PIN was reset.'); return true;
}
