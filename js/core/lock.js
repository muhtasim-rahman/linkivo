/**
 * Linkivo — js/core/lock.js  (v2.5.0)
 * Purpose: the app lock, without any screen. Two kinds, one API:
 *          ACCOUNT  the PIN is checked by the Worker (/pin/*): it never leaves the phone in the clear, never sits in the database, and a correct PIN opens a server session that the
 *                   database rules check on every read and write. The Worker also counts wrong PINs and locks out. The device additionally derives a key from the PIN (crypto-box.js)
 *                   to keep its stored copy of the library encrypted.
 *          GUEST    there is no server: the PIN is checked on the device (a derived verifier) and the device copy is encrypted with the same kind of key. A guest who forgets the PIN
 *                   loses the local data (the screen offers a backup first).
 *          Every page load starts LOCKED while the lock is on (the server session is shared by all devices of an account, so it alone can not tell that THIS tab has the PIN).
 *          The key lives in memory only. State: { scope, ready, enabled, hasPin, vaultSep, hideVault, away, open }.
 * API: loadLock(session, adapter) -> state   getLock() subscribeLock(fn)   isLocked() getBox()
 *      unlock(pin)   verifyPin(pin)   lockNow()   extendSession()   enableLock(pin)   disableLock(pin) -> oldBox   changePin(current, next) -> { oldBox, newBox }   resetPin(next)   setAutoLock(min)
 *      resetLock()   eraseGuestLock()   (errors from the Worker carry code / retryAfter / attemptsLeft; a wrong guest PIN throws the same shape)
 */
import { createStore } from './events.js';
import { prefs } from './local-prefs.js';
import { securePost } from './worker-client.js';
import { deriveBox, newSalt } from './crypto-box.js';
import { lockoutMs } from './lockout.js';
import { log } from './logger.js';

const GUEST = 'guest.lock', cacheKey = (uid) => `lock.cache.${uid}`, saltKey = (uid) => `lock.salt.${uid}`;
/** Auto-lock choices in seconds (the Worker accepts the same list). 0 = right after the app is left, -1 = never. Default 1 minute. */
export const AWAY_CHOICES = [0, 30, 60, 300, 600, 900, 1800, -1];
export const DEFAULT_AWAY = 60;
const normAway = (v) => (v !== undefined && v !== null && AWAY_CHOICES.includes(Number(v)) ? Number(v) : DEFAULT_AWAY);
const store = createStore({ scope: 'none', uid: '', ready: false, enabled: false, hasPin: false, vaultSep: false, hideVault: false, away: DEFAULT_AWAY, open: true });
let box = null;
export const getLock = () => store.get();
export const subscribeLock = (fn) => store.subscribe(fn);
export const isLocked = () => { const s = store.get(); return s.enabled && !s.open; };
export const getBox = () => box;
const fail = (code, extra = {}) => Object.assign(new Error(code), { code }, extra);
const guestRec = () => prefs.get(GUEST, null);
const accountSalt = (uid) => { let s = prefs.get(saltKey(uid), ''); if (!s) { s = newSalt(); prefs.set(saltKey(uid), s); } return s; };

/** Reads the lock settings of the signed-in person (the account's `lockState`, or the guest's own record) and starts LOCKED when the lock is on. Offline: the last known state. */
export async function loadLock(session, adapter = null) {
  box = null;
  if (session.mode === 'guest') {
    const g = guestRec(); store.set({ scope: 'guest', uid: '', ready: true, enabled: !!(g && g.verifier), hasPin: !!(g && g.verifier), vaultSep: false, hideVault: false, away: normAway(g && g.away), open: !(g && g.verifier) });
    return store.get();
  }
  if (session.mode !== 'account') { store.set({ scope: 'none', uid: '', ready: true, enabled: false, hasPin: false, open: true }); return store.get(); }
  const uid = session.user.uid; let v = null;
  try { v = adapter ? await adapter.get(`users/${uid}/lockState`) : null; if (v) prefs.set(cacheKey(uid), v); else if (adapter) prefs.remove(cacheKey(uid)); }
  catch (e) { log.warn('lock', 'lock state not read, using the copy on this device', e); v = prefs.get(cacheKey(uid), null); }
  const L = v || {};
  store.set({ scope: 'account', uid, ready: true, enabled: L.app === true, hasPin: L.pin === true, vaultSep: L.vaultSep === true, hideVault: L.hideVault === true, away: normAway(L.away), open: L.app !== true });
  return store.get();
}

const wait = (n) => lockoutMs(n);
async function guestCheck(pin) {                         // a guest's PIN: lockout, then compare the derived verifier
  const g = guestRec(); if (!g) throw fail('no_pin');
  const now = Date.now(); if ((g.until || 0) > now) throw fail('locked_out', { retryAfter: Math.ceil((g.until - now) / 1000) });
  const b = await deriveBox(pin, g.salt);
  if (b.verifier === g.verifier) { if (g.att || g.until) prefs.set(GUEST, { ...g, att: 0, until: 0 }); return b; }
  const att = (g.att || 0) + 1, w = wait(att); prefs.set(GUEST, { ...g, att, until: w ? now + w : 0 });
  throw fail('wrong_pin', { attemptsLeft: att < 5 ? 5 - att : 0, retryAfter: Math.ceil(w / 1000) });
}

/** Checks a PIN without changing anything (the 5-minute window of sensitive actions, changing settings). Same errors as unlock(). */
export async function verifyPin(pin) {
  const s = store.get();
  if (s.scope === 'guest') await guestCheck(pin); else await securePost('/pin/verify', { pin, scope: 'app' });
  return true;
}
/** v2.5.1: the PIN of the GUEST lock, checked on this device only (used by the guest-to-account transfer while an account is signed in). Resolves with the key, throws wrong_pin / locked_out. */
export const guestBoxFor = (pin) => guestCheck(pin);
/** v2.5.1: is there a guest lock record on this device? (the guest copy is encrypted then) */
export const guestHasLock = () => !!(guestRec() && guestRec().verifier);
/** v2.5.1: forget the guest lock record (after the guest data was moved to an account). Does not touch the lock state of the signed-in session. */
export const dropGuestLockRecord = () => { prefs.remove(GUEST); };
export async function unlock(pin) {
  const s = store.get();
  if (s.scope === 'guest') box = await guestCheck(pin);
  else { await securePost('/pin/verify', { pin, scope: 'app' }); box = await deriveBox(pin, accountSalt(s.uid)); }
  store.set({ open: true }); return true;
}
/** Ends the session on the server (best effort) and forgets the key. The caller clears the screen and the data layer. */
export async function lockNow() {
  const s = store.get(); box = null; store.set({ open: false });
  if (s.scope === 'account') { try { await securePost('/lock', { scope: 'all' }); } catch (e) { log.warn('lock', 'the server session could not be ended', e); } }
}
export async function extendSession() {
  const s = store.get(); if (s.scope !== 'account' || !s.enabled || !s.open) return true;
  try { await securePost('/lock/extend'); return true; }
  catch (e) { if (e && e.code === 'locked') return false; return true; }   // a network error is not a lock
}
export async function enableLock(pin) {
  const s = store.get();
  if (s.scope === 'guest') { const salt = newSalt(); box = await deriveBox(pin, salt); prefs.set(GUEST, { salt, verifier: box.verifier, away: s.away, att: 0, until: 0 }); store.set({ enabled: true, hasPin: true, open: true }); return; }
  if (!s.hasPin) await securePost('/pin/set', { pin, enable: true }); else { await securePost('/pin/verify', { pin, scope: 'app' }); await securePost('/lock/config', { app: true }); }
  box = await deriveBox(pin, accountSalt(s.uid)); store.set({ enabled: true, hasPin: true, open: true });
}
export async function disableLock(pin) {
  const s = store.get(), old = box;
  if (s.scope === 'guest') { await guestCheck(pin); prefs.remove(GUEST); } else await securePost('/lock/config', { app: false, pin });
  box = null; store.set({ enabled: false, open: true, ...(s.scope === 'guest' ? { hasPin: false } : {}) });
  return old;
}
export async function changePin(current, next) {
  const s = store.get(), oldBox = box;
  if (s.scope === 'guest') { await guestCheck(current); const salt = newSalt(); box = await deriveBox(next, salt); prefs.set(GUEST, { ...guestRec(), salt, verifier: box.verifier, att: 0, until: 0 }); return { oldBox, newBox: box }; }
  await securePost('/pin/change', { kind: 'main', current, pin: next });
  const salt = newSalt(); prefs.set(saltKey(s.uid), salt); box = await deriveBox(next, salt); return { oldBox, newBox: box };
}
/** Forgot PIN (accounts): the Worker needs a fresh sign-in. The stored copy was made with the old key, so the device discards it and downloads again. */
export async function resetPin(next) {
  const s = store.get(); if (s.scope !== 'account') throw fail('guest_cannot_reset');
  await securePost('/pin/reset', { pin: next });
  const salt = newSalt(); prefs.set(saltKey(s.uid), salt); box = await deriveBox(next, salt); store.set({ hasPin: true, vaultSep: false, open: true });
}
/** v2.5.1 (owner): ONE auto-lock setting. `sec` = how long the app may be minimized or on another tab before it locks (0 = at once, -1 = never). Saved with the account (all devices) or this guest. */
export async function setAway(sec) {
  const s = store.get(); if (!AWAY_CHOICES.includes(sec)) throw fail('bad_request');
  if (s.scope === 'guest') { const g = guestRec(); if (g) prefs.set(GUEST, { ...g, away: sec }); } else await securePost('/lock/config', { away: sec });
  store.set({ away: sec });
}
/** Signed out: forget the key and the state, so the next sign-in starts from a clean lock. */
export function resetLock() { box = null; store.set({ scope: 'none', uid: '', ready: false, enabled: false, hasPin: false, vaultSep: false, hideVault: false, away: DEFAULT_AWAY, open: true }); }
export function eraseGuestLock() { prefs.remove(GUEST); box = null; store.set({ enabled: false, hasPin: false, open: true }); }
