/**
 * Linkivo — js/core/admin.js  (v2.3.1)
 * Purpose: the admin list and the daily screenshot allowance. An admin is an account whose uid is listed under `admins/<uid>: true` in the Realtime Database
 *          (set by hand in the console; the rules let a signed-in user read ONLY their own entry and nobody write it, so a user can not make themselves admin).
 *          Admins get the higher limits and the fastest services first. The setting "View the app as" (Admin or Normal user) lets an admin test what a normal
 *          user sees; it only LOWERS the privileges of this device, it can never raise them.
 *          Screenshots: thum.io first (normal users 10 a day, admins no limit), then WordPress mShots. The count is kept per UTC day on this device.
 * API: loadAdmin(adapter, uid) -> Promise<boolean>   clearAdmin()   isAdminAccount() -> boolean (listed as admin)   isAdminView() -> boolean (listed AND view = admin)
 *      adminView() / setAdminView('admin'|'normal') (v2.4.0)   subscribeAdmin(fn) -> off      SHOT_DAILY (10)      shotQuota() -> { used, limit|null, left|null, day }      canUseThum() -> boolean      countThum()
 */
import { prefs } from './local-prefs.js';
import { createStore } from './events.js';
import { log } from './logger.js';

export const SHOT_DAILY = 10;
const K_SHOT = 'shot.day';
// v2.4.0 (owner): the view switch is for testing only and lives in memory: a reload always returns to Admin. (To be removed when the app is complete.)
const state = createStore({ listed: false, view: 'admin' });
// v2.3.2: the badge CSS reads <html data-admin="true"> so every avatar and card shows it without each one subscribing
// v2.4.0 (owner): choosing "User" in the view switch hides the badge too, so the whole app can be tested as a normal user
state.subscribe((v) => { try { if (v && v.listed && v.view !== 'normal') document.documentElement.dataset.admin = 'true'; else delete document.documentElement.dataset.admin; } catch { /* no document */ } });
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

export async function loadAdmin(adapter, uid) {
  try { const v = await adapter.get(`admins/${uid}`); state.set({ listed: v === true }); return v === true; }
  catch (e) { log.debug?.('admin', 'admin list not readable', e); state.set({ listed: false }); return false; }   // an older rules file: simply a normal user
}
export const clearAdmin = () => state.set({ listed: false });
export const isAdminAccount = () => state.get().listed;
export const isAdminView = () => state.get().listed && state.get().view !== 'normal';
/** The switch in Settings > Account (admins only). Firebase (`admins/<uid>`) stays the source of truth: this can only LOWER what this device sees. */
export const adminView = () => (state.get().view === 'normal' ? 'normal' : 'admin');
export function setAdminView(v) { state.set({ view: v === 'normal' ? 'normal' : 'admin' }); }
export const subscribeAdmin = (fn) => state.subscribe(fn);

export function shotQuota(now = Date.now()) {
  const st = prefs.get(K_SHOT, null), day = dayOf(now), used = st && st.day === day ? Math.max(0, Number(st.used) || 0) : 0;
  if (isAdminView()) return { used, limit: null, left: null, day };
  return { used, limit: SHOT_DAILY, left: Math.max(0, SHOT_DAILY - used), day };
}
export const canUseThum = (now = Date.now()) => { const q = shotQuota(now); return q.limit === null || q.left > 0; };
export function countThum(now = Date.now()) { const q = shotQuota(now); prefs.set(K_SHOT, { day: q.day, used: q.used + 1 }); state.set({ shotTick: now }); }   // the tick lets the counter in Settings update
