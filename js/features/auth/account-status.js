/**
 * Linkivo — js/features/auth/account-status.js  (v2.1.0)
 * Purpose: the "account status hook". After sign-in it reads users/<uid>/profile: a deleted account (status written only by the
 *          Worker, v2.5.0) is routed to /reactivate; a brand-new account gets its profile record.
 * API: loadAccountStatus(firebase, user) -> Promise<'active'|'deleted'>
 */
import { log } from '../../core/logger.js';
import { withTimeout } from '../../core/utils.js';

/**
 * v2.4.2 (owner: an installed app opened offline stayed on the splash). Cause: this check is awaited by the boot sequence, and a Firebase read or update
 * made while offline never settles. Now: offline -> 'active' at once (the data rules still protect the data); online -> the read has a 4 s limit and the
 * lastLogin write is sent without waiting for it.
 */
export async function loadAccountStatus(fb, user) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'active';
  const d = fb.mods.database;
  const base = `users/${user.uid}/profile`;
  try {
    const snap = await withTimeout(d.get(d.ref(fb.db, base)), 4000, 'account status');
    const profile = snap.val();
    if (profile && profile.status === 'deleted') return 'deleted';
    const now = Date.now();
    const updates = { [`${base}/lastLogin`]: now };
    if (!profile || !profile.createdAt) { updates[`${base}/createdAt`] = now; updates[`${base}/name`] = String(user.name || 'Account').slice(0, 60); }
    d.update(d.ref(fb.db), updates).catch((e) => log.warn('account', 'profile write failed', { code: e && e.code }));   // not awaited: it settles only when the server answers
    return 'active';
  } catch (e) {
    // Rules not deployed yet, offline or slow: do not lock the user out; data access is protected by rules anyway.
    log.warn('account', 'profile check failed', { code: e && e.code, message: e && e.message });
    return 'active';
  }
}
