/**
 * Linkivo — js/features/lock/lock-controller.js  (v2.5.0)
 * Purpose: runs the app lock around the app.
 *          ensureUnlocked(session): called by boot BEFORE the data layer starts. Reads the lock state (account: the Worker-written `lockState`; guest: this device), and when the lock
 *            is on shows the lock screen and waits for the PIN. Every page load starts locked. Resolves true when the app may start, false when the person left instead (log out).
 *          startLockWatch({ router, reinit }): while the app runs: lock now / auto-lock after the idle time / lock when the app goes to the background (a device setting) /
 *            the keep-alive that extends the server session / another device locking the account. When it locks it removes the page from the DOM (router.suspend), stops the data
 *            layer (teardownData: nothing of the library stays in memory) and shows the lock screen; after the PIN it starts everything again (reinit).
 *          installSensitiveGate(): requireSensitive() asks for the PIN, then remembers it for 5 minutes (the Worker's session stays the real protection).
 * API: ensureUnlocked(session) -> Promise<boolean>   startLockWatch({ router, reinit }) -> stop()   installSensitiveGate()   lockApp()   markVerified()
 */
import { subscribeSession, getSession } from '../../core/session.js';
import { prefs } from '../../core/local-prefs.js';
import { loadLock, getLock, subscribeLock, isLocked, lockNow, extendSession, verifyPin, resetLock } from '../../core/lock.js';
import { setSensitiveVerifier } from '../../core/sensitive.js';
import { teardownData } from '../../core/app-data.js';
import { loadFirebase } from '../../core/firebase-loader.js';
import { createRtdbAdapter } from '../../engine/rtdb-adapter.js';
import { toast } from '../../ui/toast.js';
import { endSplash } from '../splash/splash.js';
import { showLockScreen } from './lock-screen.js';
import { askPin } from './pin-sheet.js';

const WINDOW_MS = 5 * 60 * 1000, TICK_MS = 15000, KEEP_ALIVE_MS = 60000;
let screen = null, loadedKey = '', verifiedAt = 0, reinitFn = null;
/** Starts the data layer and the page again (after the lock was turned on or off, or the PIN changed): used by Settings > Security. */
export const reinitApp = async () => { if (reinitFn) await reinitFn(); };
const keyOf = (s) => `${s.mode}:${s.user ? s.user.uid : ''}`;
export const markVerified = () => { verifiedAt = Date.now(); };
export const hideLockSetting = () => prefs.get('lock.onHide', false);

export async function ensureUnlocked(session) {
  if (session.mode !== 'account' && session.mode !== 'guest') { if (loadedKey) { loadedKey = ''; resetLock(); } return true; }
  const key = keyOf(session);
  if (loadedKey !== key) {
    let adapter = null;
    if (session.mode === 'account') { try { adapter = createRtdbAdapter({ firebase: await loadFirebase() }); } catch { adapter = null; } }
    await loadLock(session, adapter); loadedKey = key;
  }
  if (!isLocked()) return true;
  endSplash();   // the lock screen is the first thing seen
  return new Promise((resolve) => {
    let settled = false, off = () => {};
    const done = (v) => { if (settled) return; settled = true; off(); resolve(v); };
    off = subscribeSession((s) => { if (keyOf(s) !== key) { screen && screen.dispose(); screen = null; loadedKey = ''; done(false); } });   // logged out from the lock screen
    showLockScreen({ session, router: null, onUnlocked: () => { markVerified(); screen = null; done(true); } }).then((s) => { screen = s; });
  });
}

/** Locks the app right now (the Lock button, the idle timer, leaving the app, another device). Idempotent. */
export async function lockApp(router, reinit) {
  const st = getLock(); if (!st.enabled || screen) return;
  if (st.open) await lockNow();   // (Settings > Lock now already did this; the page and data still have to go)
  router.suspend(); await teardownData();
  const session = getSession();
  screen = await showLockScreen({ session, router, onUnlocked: async () => { markVerified(); screen = null; await reinit(); } });
}

export function startLockWatch({ router, reinit }) {
  reinitFn = reinit;
  let last = Date.now(), lastKeep = Date.now(), busy = false;
  const touch = () => { last = Date.now(); };
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  for (const e of events) document.addEventListener(e, touch, { capture: true, passive: true });
  const lockIt = async () => { if (busy) return; busy = true; try { await lockApp(router, reinit); } finally { busy = false; } };
  const tick = async () => {
    const s = getLock(); if (!s.enabled || !s.open || busy) return;
    const now = Date.now();
    if (s.autoLock > 0 && now - last >= s.autoLock * 60000) { await lockIt(); return; }
    if (now - lastKeep >= KEEP_ALIVE_MS && now - last < 2 * KEEP_ALIVE_MS) { lastKeep = now; if (!(await extendSession())) await lockIt(); }   // the server session is gone: lock this tab too
  };
  const timer = setInterval(tick, TICK_MS);
  if (timer && typeof timer === 'object' && timer.unref) timer.unref();   // (tests in Node: this timer must not keep the process alive)
  const onVis = () => { if (document.visibilityState === 'hidden') { if (hideLockSetting() && getLock().enabled) lockIt(); } else tick(); };
  document.addEventListener('visibilitychange', onVis);
  const offLock = subscribeLock((s, prev) => { if (prev && prev.open && !s.open && s.enabled && !screen) lockIt(); });   // lockNow() called from a Settings button
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); for (const e of events) document.removeEventListener(e, touch, { capture: true }); offLock(); };
}

const REASONS = { logout: 'to log out', 'reset-settings': 'to reset your settings', 'clear-local': 'to clear data on this device', 'delete-account': 'to delete your account', 'password-change': 'to change your password', 'password-add': 'to add a password', 'email-change': 'to change your email', 'google-unlink': 'to unlink Google', 'password-reset': 'to reset your password', 'device-logout': 'to log out a device', 'delete-folder': 'to delete this folder', security: 'to change security settings' };
export function installSensitiveGate() {
  setSensitiveVerifier(async (reason) => {
    if (!getLock().enabled) return true;
    if (Date.now() - verifiedAt < WINDOW_MS) return true;
    const pin = await askPin({ title: 'Enter your PIN', text: `Your PIN is needed ${REASONS[reason] || 'for this'}.`, verify: verifyPin });
    if (!pin) return false;
    markVerified(); return true;
  });
}
