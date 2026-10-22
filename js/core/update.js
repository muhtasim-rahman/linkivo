/**
 * Linkivo — js/core/update.js  (v2.1.1)
 * Purpose: the app must never run stale code (ARCHITECTURE section 8). Two layers:
 *   1. Service worker: registered on launch, re-checked on tab focus and every 30 minutes. When a new worker takes control the page
 *      reloads by itself (when no background job is running). This is the "auto update".
 *   2. Version check (v2.1.1): the page also asks the server for /app.json (never cached) and compares `version` with the running one.
 *      If a newer version exists and the service worker did not switch within 10 seconds, or the user turned automatic updates off,
 *      onPrompt() shows an "Update now" popup. "Update now" clears the service worker and caches and reloads (hardUpdate).
 *   Settings > App > "Install updates automatically" (app.autoUpdate, default on) decides between reloading by itself and asking.
 * API: initUpdates({ isBusy, onReady, onPrompt }) -> void     checkForUpdates() -> 'updating'|'available'|'current'|'unsupported'|'error'
 *      checkRemoteVersion() -> { latest, newer }     compareVersions(a, b) -> -1|0|1     hardUpdate() -> Promise<void>     updateState (store)
 */
import { createStore } from './events.js';
import { prefs } from './local-prefs.js';
import { log } from './logger.js';
import app from './app-info.js';

export const updateState = createStore({ ready: false, checking: false, lastCheck: prefs.get('update.lastCheck', 0), latest: null, available: false });
let registration = null, hadController = false, busyFn = () => false, readyFn = () => {}, promptFn = () => {}, waiting = null, fallbackTimer = null, promptedFor = null;
const autoUpdate = () => prefs.get('app.autoUpdate', true) !== false;

export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0), pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

export async function checkRemoteVersion() {
  const res = await fetch(`/app.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`app.json ${res.status}`);
  const { version } = await res.json();
  return { latest: String(version), newer: compareVersions(version, app.version) > 0 };
}

/** Last resort: remove the service worker and every cache, then reload. User data (IndexedDB) is not touched. */
export async function hardUpdate() {
  try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister(); } catch { /* ignore */ }
  try { for (const k of (await caches.keys())) await caches.delete(k); } catch { /* ignore */ }
  location.reload();
}

function askUser(info) {
  if (promptedFor === info.latest) return;
  promptedFor = info.latest;
  log.info('update', 'asking the user to update', info);
  promptFn(info);
}

function onNewWorker() {
  if (!autoUpdate()) { updateState.set({ ready: true }); readyFn(); askUser({ latest: updateState.get().latest || 'new', hard: false }); return; }
  if (!busyFn()) { log.info('update', 'new version active, reloading'); location.reload(); return; }
  if (waiting) return;
  updateState.set({ ready: true }); readyFn();
  waiting = setInterval(() => { if (!busyFn()) { clearInterval(waiting); location.reload(); } }, 2000);
}

export async function checkForUpdates() {
  updateState.set({ checking: true });
  let result = 'current';
  try {
    if ('serviceWorker' in navigator) {
      registration = registration || (await navigator.serviceWorker.getRegistration());
      if (registration) { await registration.update(); if (registration.installing || registration.waiting) result = 'updating'; }
    } else result = 'unsupported';
    const now = Date.now();
    prefs.set('update.lastCheck', now); updateState.set({ lastCheck: now });
    const remote = await checkRemoteVersion().catch(() => null);
    if (remote) {
      updateState.set({ latest: remote.latest, available: remote.newer });
      if (remote.newer) {
        if (!autoUpdate()) askUser({ latest: remote.latest, hard: result !== 'updating' });
        else if (result !== 'updating') { // the browser has not picked the new worker up: ask after 10 s if the page is still old
          clearTimeout(fallbackTimer);
          fallbackTimer = setTimeout(() => askUser({ latest: remote.latest, hard: true }), 10000);
          result = 'available';
        }
      }
    }
    return result;
  } catch (e) { log.warn('update', 'update check failed', e); return 'error'; }
  finally { updateState.set({ checking: false }); }
}

export function initUpdates({ isBusy = () => false, onReady = () => {}, onPrompt = () => {} } = {}) {
  busyFn = isBusy; readyFn = onReady; promptFn = onPrompt;
  if ('serviceWorker' in navigator) {
    hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController) { hadController = true; return; } onNewWorker(); });
    navigator.serviceWorker.register('/sw.js').then((reg) => { registration = reg; }).catch((e) => log.warn('update', 'service worker registration failed', e));
  }
  const auto = () => { if (autoUpdate() || document.visibilityState === 'visible') checkForUpdates(); };
  setTimeout(checkForUpdates, 1500); // right after launch: the app is open and online, so a newer version is found now
  const every = setInterval(checkForUpdates, 30 * 60 * 1000);
  if (every && every.unref) every.unref(); // (Node tests) a background timer must not keep the process alive
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') auto(); });
  window.addEventListener('online', checkForUpdates);
}
