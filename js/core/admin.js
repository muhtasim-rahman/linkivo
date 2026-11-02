/**
 * Linkivo — js/core/admin.js  (v2.3.1)
 * Purpose: the admin list and the daily screenshot allowance. An admin is an account whose uid is listed under `admins/<uid>: true` in the Realtime Database
 *          (set by hand in the console; the rules let a signed-in user read ONLY their own entry and nobody write it, so a user can not make themselves admin).
 *          Admins get the higher limits and the fastest services first. The control "View the app as" (Settings > Account, admins only; v2.4.4: choosing Normal user hides every admin feature on this device until /admin-reset is visited) lets an admin test what a normal
 *          user sees; it only LOWERS the privileges of this device, it can never raise them.
 *          Screenshots: thum.io first (normal users 10 a day, admins no limit), then WordPress mShots. The count is kept per UTC day on this device.
 * API: setAdminView('admin'|'normal') getAdminViewMode()   loadAdmin(adapter, uid) -> Promise<boolean>   clearAdmin()   isAdminAccount() -> boolean (listed as admin)   isAdminView() -> boolean (listed AND view = admin)
 *      subscribeAdmin(fn) -> off      SHOT_DAILY (10)      shotQuota() -> { used, limit|null, left|null, day }      canUseThum() -> boolean      countThum()
 */
import { prefs } from './local-prefs.js';
import { createStore } from './events.js';
import { log } from './logger.js';

export const SHOT_DAILY = 10;
const K_SHOT = 'shot.day', K_OFF = 'admin.off';
// v2.4.4 (owner): Normal user is a device flag (key admin.off), see loadAdmin.
const state = createStore({ listed: false, view: 'admin', off: false });
// v2.3.2: the badge CSS reads <html data-admin="true"> so every avatar and card shows it without each one subscribing
state.subscribe((v) => { try { if (v && v.listed) document.documentElement.dataset.admin = 'true'; else delete document.documentElement.dataset.admin; } catch { /* no document */ } });   // in Normal view the badge is gone too: the app looks like an ordinary account
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

export async function loadAdmin(adapter, uid) {
  // v2.4.4 (owner): "Normal user" is a DEVICE flag (admin.off). While it is set the account is simply treated as not an admin: the admin list is not even read,
  // no admin feature and no badge shows, a page switch or a reload changes nothing. Only visiting /admin-reset clears it.
  if (prefs.get(K_OFF, false) === true) { state.set({ listed: false, view: 'admin', uid, off: true }); return false; }
  try { const v = await adapter.get(`admins/${uid}`); state.set({ listed: v === true, view: 'admin', uid, off: false }); return v === true; }
  catch (e) { log.debug?.('admin', 'admin list not readable', e); state.set({ listed: false, view: 'admin', uid, off: false }); return false; }
}
export const clearAdmin = () => state.set({ listed: false, view: 'admin', uid: null, off: prefs.get(K_OFF, false) === true });   // log out; the device flag stays (only /admin-reset clears it)
export const isAdminAccount = () => state.get().listed;
/** Admin features are on only while the account is listed AND this device has not chosen Normal user. */
export const isAdminView = () => state.get().listed;
export const getAdminViewMode = () => (state.get().off ? 'normal' : 'admin');
export const isAdminHidden = () => prefs.get(K_OFF, false) === true;
/** Settings > Account "Normal user": the flag is stored on this device and the admin features go away at once. */
export const hideAdmin = () => { prefs.set(K_OFF, true); state.set({ listed: false, off: true }); };
/** /admin-reset: clears the flag and reads the admin list again. Resolves true when the account is an admin. */
export async function resetAdmin(adapter, uid) { prefs.remove(K_OFF); state.set({ off: false }); return adapter && uid ? loadAdmin(adapter, uid) : false; }
export const setAdminView = (v) => { if (v === 'normal' && state.get().listed) hideAdmin(); };   // (going back is /admin-reset: the switch itself is gone in Normal user)
export const subscribeAdmin = (fn) => state.subscribe(fn);

export function shotQuota(now = Date.now()) {
  const st = prefs.get(K_SHOT, null), day = dayOf(now), used = st && st.day === day ? Math.max(0, Number(st.used) || 0) : 0;
  if (isAdminView()) return { used, limit: null, left: null, day };
  return { used, limit: SHOT_DAILY, left: Math.max(0, SHOT_DAILY - used), day };
}
export const canUseThum = (now = Date.now()) => { const q = shotQuota(now); return q.limit === null || q.left > 0; };
export function countThum(now = Date.now()) { const q = shotQuota(now); prefs.set(K_SHOT, { day: q.day, used: q.used + 1 }); state.set({ shotTick: now }); }   // the tick lets the counter in Settings update
