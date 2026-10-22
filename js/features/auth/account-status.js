/**
 * Linkivo — js/features/auth/account-status.js  (v2.1.0)
 * Purpose: the "account status hook". After sign-in it reads users/<uid>/profile: a deleted account (status written only by the
 *          Worker, v2.5.0) is routed to /reactivate; a brand-new account gets its profile record.
 * API: loadAccountStatus(firebase, user) -> Promise<'active'|'deleted'>
 */
import { log } from '../../core/logger.js';

export async function loadAccountStatus(fb, user) {
  const d = fb.mods.database;
  const base = `users/${user.uid}/profile`;
  try {
    const snap = await d.get(d.ref(fb.db, base));
    const profile = snap.val();
    if (profile && profile.status === 'deleted') return 'deleted';
    const now = Date.now();
    const updates = { [`${base}/lastLogin`]: now };
    if (!profile || !profile.createdAt) { updates[`${base}/createdAt`] = now; updates[`${base}/name`] = String(user.name || 'Account').slice(0, 60); }
    await d.update(d.ref(fb.db), updates);
    return 'active';
  } catch (e) {
    // Rules not deployed yet, or offline: do not lock the user out; data access is protected by rules anyway.
    log.warn('account', 'profile check failed', { code: e && e.code, message: e && e.message });
    return 'active';
  }
}
