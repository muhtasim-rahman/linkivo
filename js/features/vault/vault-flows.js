/**
 * Linkivo — js/features/vault/vault-flows.js  (v2.5.2)
 * Purpose: the popups behind Settings > Security > Locked folders. Each flow is ONE popup (pin-flow.js) like the app-lock flows. The code is a separate six-digit code: it is never
 *          the app PIN, and the Worker (/vault/*) is the only place that checks it.
 * API: setupVaultFlow() changeVaultCodeFlow() removeVaultFlow() forgotVaultCodeFlow()   (each resolves true when it changed something)
 *      codeExample(prefix) -> "@482913"   (what the person types into the search box)
 */
import { toast } from '../../ui/toast.js';
import { getSession } from '../../core/session.js';
import { getLock, verifyPin } from '../../core/lock.js';
import { vaultCall, closeVault } from '../../core/vault.js';
import { describeError } from '../lock/pin-sheet.js';
import { openPinFlow, stagePad, stageCreate } from '../lock/pin-flow.js';
import { confirmItsYou } from '../lock/forgot-pin.js';

export const codeExample = (prefix = '@') => `${prefix}482913`;
const message = (e) => {
  if (e && e.code === 'vault_not_empty') return 'Move every locked folder out first, then turn locked folders off.';
  if (e && e.code === 'reauth_required') return 'Please try again: confirm it is you once more.';
  if (e && e.code === 'bad_pin') return 'That code is not allowed. Use six digits that are not all the same and not a straight run.';
  return describeError(e).text;
};

/** Turn locked folders on. With an app PIN the PIN is asked first (the Worker checks it); then the new six-digit code twice. */
export async function setupVaultFlow() {
  const flow = await openPinFlow({ title: 'Set up locked folders' });
  let current;
  if (getLock().hasPin) {
    current = await stagePad(flow, { text: 'Enter your app PIN to continue.', check: async (p) => { await verifyPin(p); return ''; } });
    if (!current) return false;
  }
  flow.setTitle('Choose a six-digit code');
  const prefix = getLock().vaultPrefix || '@';
  const code = await stageCreate(flow, { digits: 6, text: `Locked folders open when you type a symbol and this code into the search box, for example ${codeExample(prefix)}. It is not your app PIN.` });
  if (!code) return false;
  flow.working('Turning on locked folders...');
  try { await vaultCall('/vault/set', { code, current, prefix }); }
  catch (e) { await flow.finish(); toast(message(e), { type: 'error' }); return false; }
  await flow.finish(); toast('Locked folders are on.'); return true;
}

export async function changeVaultCodeFlow() {
  const flow = await openPinFlow({ title: 'Change the code' });
  const current = await stagePad(flow, { digits: 6, text: 'Enter your current six-digit code.' }); if (!current) return false;
  flow.setTitle('Choose a new code');
  const next = await stageCreate(flow, { digits: 6 }); if (!next) return false;
  flow.working('Changing the code...');
  try { await vaultCall('/vault/set', { code: next, current }); }
  catch (e) { await flow.finish(); toast(message(e), { type: 'error' }); return false; }
  await closeVault({ remote: false });   // the server ended the session; empty this device too
  await flow.finish(); toast('Code changed.'); return true;
}

export async function removeVaultFlow() {
  const flow = await openPinFlow({ title: 'Turn off locked folders' });
  const code = await stagePad(flow, { digits: 6, text: 'Enter your code. Locked folders must be empty: move every folder out first.' }); if (!code) return false;
  flow.working('Turning off...');
  try { await vaultCall('/vault/remove', { code }); }
  catch (e) { await flow.finish(); toast(message(e), { type: 'error' }); return false; }
  await closeVault({ remote: false });
  await flow.finish(); toast('Locked folders are off.'); return true;
}

/** Forgot the code: sign in again (password or Google), choose a new code. Every locked folder and link is kept. */
export async function forgotVaultCodeFlow() {
  const session = getSession(); if (session.mode !== 'account') return false;
  const flow = await openPinFlow({ title: 'Reset the code' });
  const ok = await confirmItsYou(flow, session.user, 'You will sign in again to prove it is you, then choose a new code. Your locked folders and links stay exactly as they are.');
  if (!ok) return false;
  flow.setTitle('Choose a new code');
  const code = await stageCreate(flow, { digits: 6 }); if (!code) return false;
  flow.working('Saving the new code...');
  try { await vaultCall('/vault/reset', { code }); }
  catch (e) { await flow.finish(); toast(message(e), { type: 'error' }); return false; }
  await closeVault({ remote: false });
  await flow.finish(); toast('Your code was reset.'); return true;
}
