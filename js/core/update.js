/**
 * Linkivo — js/core/update.js  (v2.1.0)
 * Purpose: the app must never run stale code (ARCHITECTURE section 8). Registers the service worker, checks for a new one on
 *          launch, on tab focus and every 30 minutes. When a new worker takes control the page reloads by itself, unless a
 *          background job is running: then a quiet "Update ready" state is raised and the reload happens once the app is idle.
 * API: initUpdates({ isBusy, onReady }) -> void     checkForUpdates() -> Promise<'updating'|'current'|'unsupported'|'error'>
 *      updateState (store: { ready, checking, lastCheck })     APP_VERSION (from the running worker, may be null)
 */
import { createStore } from './events.js';
import { prefs } from './local-prefs.js';
import { log } from './logger.js';

export const updateState = createStore({ ready: false, checking: false, lastCheck: prefs.get('update.lastCheck', 0) });
let registration = null;
let hadController = false;
let busyFn = () => false;
let readyFn = () => {};
let waiting = null;

function reloadNow() { log.info('update', 'new version active, reloading'); location.reload(); }

function onNewVersion() {
  if (!busyFn()) { reloadNow(); return; }
  if (waiting) return;
  updateState.set({ ready: true });
  readyFn();
  waiting = setInterval(() => { if (!busyFn()) { clearInterval(waiting); reloadNow(); } }, 2000);
}

export async function checkForUpdates() {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  updateState.set({ checking: true });
  try {
    registration = registration || (await navigator.serviceWorker.getRegistration());
    if (!registration) return 'current';
    await registration.update();
    const now = Date.now();
    prefs.set('update.lastCheck', now);
    updateState.set({ lastCheck: now });
    return registration.installing || registration.waiting ? 'updating' : 'current';
  } catch (e) { log.warn('update', 'update check failed', e); return 'error'; }
  finally { updateState.set({ checking: false }); }
}

export function initUpdates({ isBusy = () => false, onReady = () => {} } = {}) {
  busyFn = isBusy; readyFn = onReady;
  if (!('serviceWorker' in navigator)) return;
  hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; return; } // very first install: nothing to replace
    onNewVersion();
  });
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    registration = reg;
    reg.update().catch(() => {});
  }).catch((e) => log.warn('update', 'service worker registration failed', e));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdates(); });
  setInterval(checkForUpdates, 30 * 60 * 1000);
}
