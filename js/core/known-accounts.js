/**
 * Linkivo — js/core/known-accounts.js  (v2.3.1)
 * Purpose: the accounts that signed in on THIS device, for the "Switch account" popup. Only what is needed to show a row and to offer the right sign-in is kept
 *          (uid, email, name, photo address, sign-in methods, last time used). No password, no token: Firebase Auth keeps one signed-in user per browser, so
 *          switching means signing in again as the other account; this list just makes that a tap away. "Remove" forgets an entry on this device.
 * API: listAccounts(store) -> [{ uid, email, name, photo, providers, last }] newest first      rememberAccount(user, store, now?)      forgetAccount(uid, store)
 *      stashPrefill(store, { email, google }) / takePrefill(store) -> { email, google } | null   (a one-time hand-over to the login page; never put in a URL)
 */
const KEY = 'accounts.known', MAX = 8, PREFILL = 'login.prefill';
const clean = (a) => a && typeof a.uid === 'string' && typeof a.email === 'string';
export function listAccounts(store) {
  const v = store.get(KEY, []);
  return (Array.isArray(v) ? v.filter(clean) : []).sort((a, b) => (b.last || 0) - (a.last || 0));
}
export function rememberAccount(user, store, now = Date.now()) {
  if (!user || !user.uid || !user.email) return;
  const rest = listAccounts(store).filter((a) => a.uid !== user.uid);
  const one = { uid: user.uid, email: String(user.email).slice(0, 120), name: String(user.name || '').slice(0, 80), photo: String(user.photo || '').slice(0, 300), providers: Array.isArray(user.providers) ? user.providers.slice(0, 4) : [], last: now };
  store.set(KEY, [one, ...rest].slice(0, MAX));
}
export const forgetAccount = (uid, store) => store.set(KEY, listAccounts(store).filter((a) => a.uid !== uid));
export const stashPrefill = (store, p) => store.set(PREFILL, p);
export function takePrefill(store) { const p = store.get(PREFILL, null); if (p) store.remove(PREFILL); return p && typeof p.email === 'string' ? p : null; }
