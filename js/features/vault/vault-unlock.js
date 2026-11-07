/**
 * Linkivo — js/features/vault/vault-unlock.js  (v2.5.3)
 * Purpose: the ways to open the locked folders: the code pad popup (Menu / Settings card, and before locking a folder) and the search-box code. Success tells the person with a toast
 *          (the search page adds a small unlock animation). A wrong code says nothing about WHY (it counts toward the lockout like a wrong PIN).
 * API: unlockFlow({ title }) -> Promise<boolean>   ensureVaultOpen({ title }) -> Promise<{ ok, wasOpen }>   tryCode(code) -> Promise<boolean>   remainingText() -> string
 */
import { toast } from '../../ui/toast.js';
import { getVault, openVault } from '../../core/vault.js';
import { openPinFlow, stagePad } from '../lock/pin-flow.js';

/** The code pad. Resolves true when the vault is open afterwards. */
export async function unlockFlow({ title = 'Unlock locked folders' } = {}) {
  if (getVault().open) return true;
  const flow = await openPinFlow({ title });
  const done = await stagePad(flow, { digits: 6, text: 'Enter your six-digit code.', submitLabel: 'Unlock', check: async (code) => { await openVault(code); return ''; } });   // a wrong code throws: the pad shows the same message as a wrong PIN
  if (!done) return false;
  await flow.finish(); toast('Locked folders are unlocked.'); return true;
}

/** For actions that need the vault (locking a folder): opens it when it is closed and says whether it was open before (the caller closes it again afterwards). */
export async function ensureVaultOpen({ title } = {}) {
  const wasOpen = getVault().open;
  if (wasOpen) return { ok: true, wasOpen: true };
  const flow = await openPinFlow({ title: title || 'Enter your code' });
  const done = await stagePad(flow, { digits: 6, text: 'Enter your six-digit code to continue.', submitLabel: 'Continue', check: async (code) => { await openVault(code); return ''; } });
  if (!done) return { ok: false, wasOpen: false };
  await flow.finish(); return { ok: true, wasOpen: false };
}

/** The search box: a complete code was typed and Enter pressed. Silent failure on purpose. */
export async function tryCode(code) {
  if (getVault().open) return true;
  try { await openVault(code); return true; } catch { return false; }
}

/** "Unlocked until 14:32" / "Unlocked until you close the app". */
export function remainingText() {
  const v = getVault(); if (!v.open) return '';
  if (!v.exp) return 'Stays unlocked until you close or reload the app.';
  const m = Math.max(1, Math.ceil((v.exp - Date.now()) / 60000));
  return `Locks again in about ${m} minute${m === 1 ? '' : 's'}.`;
}
