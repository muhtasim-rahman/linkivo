/**
 * Linkivo — js/core/clear-local.js  (v2.2.3)
 * Purpose: "Clear local storage data" (Settings > Danger zone, owner request). Erases everything this browser holds for Linkivo and starts the app
 *          again from nothing: every saved setting and flag (local-prefs, both storages), every IndexedDB database of the app and of the sign-in
 *          library (so an account is signed out; a guest loses ALL guest data), the saved copy of the app files (Cache Storage) and the service worker.
 *          Nothing in the user's cloud account is touched. The caller asks for confirmation first and signs an account out properly before calling this.
 * API: clearLocalData({ reload? }) -> Promise<{ prefs, databases, caches }>   counts, for tests and logs
 *      isAppDatabase(name) -> boolean   (pure: which IndexedDB names belong to Linkivo or to Firebase's sign-in storage)
 */
import { prefs, sessionPrefs } from './local-prefs.js';
import { teardownData } from './app-data.js';
import { log } from './logger.js';

const KNOWN = ['firebaseLocalStorageDb', 'firebase-heartbeat-database', 'firebase-installations-database'];
/** Pure: true for the app's own databases (linkivo-<uid>, the guest database) and for Firebase's sign-in storage. */
export const isAppDatabase = (name) => typeof name === 'string' && (/^linkivo/i.test(name) || /^firebase/i.test(name) || /guest/i.test(name));

const deleteDb = (name) => new Promise((resolve) => {
  if (typeof indexedDB === 'undefined') return resolve(false);
  // a blocked delete finishes when the open connections close (the app closes them on versionchange), so wait a little and move on
  const timer = setTimeout(() => resolve(false), 2500);
  try {
    const req = indexedDB.deleteDatabase(name);
    req.addEventListener('success', () => { clearTimeout(timer); resolve(true); });
    req.addEventListener('error', () => { clearTimeout(timer); resolve(false); });
    // 'blocked' needs no handler: the timer ends the wait and the delete finishes by itself once the open connections close
  } catch { clearTimeout(timer); resolve(false); }
});

export async function clearLocalData({ reload = true } = {}) {
  const out = { prefs: 0, databases: 0, caches: 0 };
  try { await teardownData(); } catch (e) { log.warn('clear-local', 'data layer did not stop cleanly', e); }
  for (const store of [prefs, sessionPrefs]) { const keys = store.keys(''); out.prefs += keys.length; store.removePrefix(''); }
  try {
    let names = [];
    try { names = ((await indexedDB.databases?.()) || []).map((d) => d.name); } catch { /* older browsers: use the known names */ }
    const all = [...new Set([...names.filter(isAppDatabase), ...KNOWN])];
    for (const n of all) if (await deleteDb(n)) out.databases++;
  } catch (e) { log.warn('clear-local', 'databases not cleared', e); }
  try {
    if (typeof caches !== 'undefined') for (const k of await caches.keys()) if (await caches.delete(k)) out.caches++;
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.unregister();
  } catch (e) { log.warn('clear-local', 'app cache not cleared', e); }
  if (reload) location.replace('/');
  return out;
}
