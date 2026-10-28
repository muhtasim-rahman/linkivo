/**
 * Linkivo — js/core/update.js  (v2.1.2)
 * Purpose: the app must never run stale code (ARCHITECTURE section 8).
 *  - Registers the service worker and asks it to look for a new version on launch, on tab focus and every 30 minutes.
 *  - Version beacon (v2.1.2): /app.json is fetched with no-store (Firebase Hosting serves it with no-cache headers, so it is always the
 *    deployed version) and compared with the version of the code that is running. This catches a stale copy that the service worker
 *    alone would not report (slow network fallback to cache, a page restored from the back-forward cache, an old installed app).
 *  - At LAUNCH a newer version is applied automatically (nothing is on screen worth protecting yet). While the app is in use, a newer
 *    version raises onAvailable() so the UI can offer an "Update now" popup; a running background job defers the reload.
 *  - applyUpdate(): ask the worker to update; if the page is still old after a few seconds, clear the app caches and hard reload.
 * v2.3.1 (owner): the automatic update tracker is OFF. It reloaded the app a second time after an update had already been applied, so it is parked until a
 *      better logic is designed (AUTO_UPDATE below). The service worker is still registered (it is network-first and skips waiting, so the next normal load gets
 *      the new files), but nothing here reloads the page, applies an update or opens the popup by itself. Manual helpers (clearCachesAndReload) still work.
 * API: initUpdates({ isBusy, onReady, onAvailable }) -> void     checkForUpdates({ launch }) -> Promise<'updating'|'available'|'current'|'unsupported'|'error'>
 *      applyUpdate() -> Promise<void>     clearCachesAndReload() -> Promise<void>     compareVersions(a, b) -> -1|0|1     updateState (store: { ready, checking, lastCheck, available })
 */
import { createStore } from './events.js';
import { prefs } from './local-prefs.js';
import { log } from './logger.js';
import app from './app-info.js';

/** ! v2.3.1: set to true to bring the automatic update tracker back (launch apply, popup, controllerchange reload, periodic checks). Off on purpose. */
export const AUTO_UPDATE = false;

export const updateState = createStore({ ready: false, checking: false, lastCheck: prefs.get('update.lastCheck', 0), available: null });
let registration = null;
let hadController = false;
let busyFn = () => false;
let readyFn = () => {};
let availableFn = () => {};
let waiting = null;

/** Numeric compare of "x.y.z" strings: 1 when a is newer, -1 when older, 0 when equal or unreadable. */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10)), pb = String(b).split('.').map((n) => parseInt(n, 10));
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return 0;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

/** The deployed version according to the server (never from a cache). null when offline or unreadable. */
async function fetchLatestVersion() {
  try {
    const res = await fetch('/app.json', { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j.version === 'string' ? j.version : null;
  } catch { return null; }
}

function reloadNow() { log.info('update', 'new version active, reloading'); location.reload(); }

function onNewVersion() {
  if (!AUTO_UPDATE) return;   // v2.3.1: no automatic reload
  if (!busyFn()) { reloadNow(); return; }
  if (waiting) return;
  updateState.set({ ready: true });
  readyFn();
  waiting = setInterval(() => { if (!busyFn()) { clearInterval(waiting); reloadNow(); } }, 2000);
}

/** Make this page run the newest code: worker first, then (if the page is still old) clear app caches and reload. */
export async function applyUpdate() {
  try {
    registration = registration || (await navigator.serviceWorker?.getRegistration?.());
    if (registration) await registration.update();
  } catch (e) { log.warn('update', 'worker update failed', e); }
  await new Promise((r) => setTimeout(r, 4000)); // a controllerchange in this window reloads the page by itself
  await clearCachesAndReload();
}

/** Delete the cached app files, drop the worker and reload: the next load fetches everything fresh (Settings > Advanced uses it too). */
export async function clearCachesAndReload() {
  try {
    for (const k of await caches.keys()) if (k.startsWith('linkivo-shell-')) await caches.delete(k);
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) await reg.unregister();
  } catch (e) { log.warn('update', 'cache clear failed', e); }
  location.reload();
}

export async function checkForUpdates({ launch = false } = {}) {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (!AUTO_UPDATE) return 'current';   // v2.3.1: the tracker is off (see the header)
  updateState.set({ checking: true });
  try {
    registration = registration || (await navigator.serviceWorker.getRegistration());
    if (registration) await registration.update();
    const now = Date.now();
    prefs.set('update.lastCheck', now);
    updateState.set({ lastCheck: now });
    // The version beacon decides first: a worker that is merely installing for the very first time must not hide a newer deployed version.
    const latest = await fetchLatestVersion();
    const newer = !!latest && compareVersions(latest, app.version) > 0;
    if (!newer) {
      updateState.set({ available: null });
      return registration && (registration.installing || registration.waiting) ? 'updating' : 'current';
    }
    updateState.set({ available: latest });
    // launch: apply at once, but at most once per version per 10 minutes so a stale CDN can never cause a reload loop
    const tried = prefs.get('update.autoTry', null);
    const recently = tried && tried.v === latest && Date.now() - tried.t < 10 * 60 * 1000;
    // setting "Update automatically" (default on): when off, even a launch check only raises the popup
    if (launch && !recently && true /* v2.2.2: the "Update automatically" setting was removed (owner): the website always updates itself */) { prefs.set('update.autoTry', { v: latest, t: Date.now() }); applyUpdate(); return 'updating'; }
    availableFn(latest);
    return 'available';
  } catch (e) { log.warn('update', 'update check failed', e); return 'error'; }
  finally { updateState.set({ checking: false }); }
}

export function initUpdates({ isBusy = () => false, onReady = () => {}, onAvailable = () => {} } = {}) {
  busyFn = isBusy; readyFn = onReady; availableFn = onAvailable;
  if (!('serviceWorker' in navigator)) return;
  hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // very first install: nothing to replace
    onNewVersion();
  });
  // The version beacon runs even when the worker could not register (private mode, blocked storage): the app can still tell the user.
  navigator.serviceWorker.register('/sw.js').then((reg) => { registration = reg; })
    .catch((e) => log.warn('update', 'service worker registration failed', e))
    .finally(() => { if (AUTO_UPDATE) checkForUpdates({ launch: true }); });
  if (!AUTO_UPDATE) return;   // ! v2.3.1: the listeners below belong to the parked tracker
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdates(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) checkForUpdates({ launch: true }); }); // restored from the back-forward cache
  setInterval(checkForUpdates, 30 * 60 * 1000);
}
