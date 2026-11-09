/**
 * Linkivo — js/core/vault.js  (v2.5.3, rewritten: locked folders are part of the normal library while open)
 * Purpose: the SESSION of the locked folders ("vault"). A separate code (a prefix symbol plus six digits, e.g. %000000) is checked by the Worker, which opens a vault session that the
 *          database rules require for everything under vault/<uid>. This module opens and closes that session and hands the data to the engine: open = the locked folders and links
 *          appear everywhere (Library, folder view, search, Random, Preview, Profile, Stats) with a small lock icon; closed = they are not in memory at all. The data is never written
 *          to this device (no cache, no index, no history, no export). Accounts only: a guest has no server to hold the session.
 *          v2.5.5 (owner): there is NO "stay unlocked for" setting any more. The vault locks WHEN THE APP LOCKS (the app lock, its Auto lock time, Lock now, logout, another device locking the account).
 *          Where the app lock is OFF on this device the vault locks on a reload and after VAULT_IDLE_MS (15 minutes) without any touch, key or scroll (a hidden app counts as idle).
 *          A reload always closes it: the data is memory only, and a session left open on the server by the old page is ended at the next start (closeStaleVaultSession).
 *          A failed keep-alive (the server session is gone) also closes it at once.
 * API: VAULT_IDLE_MS  VAULT_PREFIXES  closeStaleVaultSession()  vaultCodeMatch(text, prefix) -> six digits | null   vaultOn() -> boolean   bindVaultEngine(engine)
 *      getVault() -> { open, reason }   subscribeVault(fn)   openVault(code) -> true (throws on a wrong code: callers must NOT say why)   closeVault({ remote })   closeVaultLocal()
 *      onVaultOpen(fn) -> off   (jobs that were waiting for the vault resume here)   vaultCall(path, body)
 */
import { createStore } from './events.js';
import { getLock, applyServerLock } from './lock.js';
import { securePost } from './worker-client.js';
import { prefs } from './local-prefs.js';
import { log } from './logger.js';

export const VAULT_PREFIXES = ['%', '@', '#', '$', '!'];   // v2.5.4 (owner): % is the default symbol (first in the list)
/** ! v2.5.5: the old "Stay unlocked for" setting (stored as `vault.keep`) and its helper code were removed. The stored value is deleted at the first open. */
const KEEP_ALIVE_MS = 60000;
const mem = createStore({ open: false, reason: '' });   // v2.5.5: `reason` = 'idle' when the 15 minute rule closed it (boot.js says so once)
const openHooks = new Set();
let eng = null, keepAlive = null, idleTimer = null, visHandler = null, lastActive = 0, actHandler = null;
/** v2.5.5 (owner): without an app lock on this device the vault closes after this long without any use (a phone app that is paused or hidden counts as unused). */
export const VAULT_IDLE_MS = 15 * 60 * 1000;
export const getVault = () => mem.get();
export const subscribeVault = (fn) => mem.subscribe(fn);
export const onVaultOpen = (fn) => { openHooks.add(fn); return () => openHooks.delete(fn); };
/** The data layer tells this module which engine holds the records. */
export function bindVaultEngine(engine) { eng = engine && engine.vaultCapable ? engine : null; }

/** True when this person can use locked folders at all: a signed-in account that has set a code. Guests: never. */
export const vaultOn = () => { const l = getLock(); return l.scope === 'account' && l.vaultSep === true; };

/** The shape check that decides whether a search text is a code: exactly <prefix><six digits>. Local, no network, no side effects. */
export function vaultCodeMatch(text, prefix = '%') {
  const t = String(text ?? '');
  if (t.length !== 7 || t[0] !== prefix) return null;
  const digits = t.slice(1);
  return /^\d{6}$/.test(digits) ? digits : null;
}

function stopTimers() {
  clearInterval(keepAlive); keepAlive = null; clearInterval(idleTimer); idleTimer = null;
  if (typeof document !== 'undefined') {
    if (visHandler) { document.removeEventListener('visibilitychange', visHandler); if (typeof window !== 'undefined') window.removeEventListener('pageshow', visHandler); visHandler = null; }
    if (actHandler) { for (const t of ACTIVITY) document.removeEventListener(t, actHandler, true); actHandler = null; }
  }
}
const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
/** True when this device has the app lock on: then the vault follows the app lock and has no timer of its own. */
const followsAppLock = () => getLock().enabled === true;

/** Forgets everything on this device (also called by the app lock and by logout). Does not talk to the server. */
export function closeVaultLocal(reason = '') {
  stopTimers();
  if (eng) { try { eng.detachVault(); } catch (e) { log.warn('vault', 'detach failed', e); } }
  mem.set({ open: false, reason });
}

/** Locks the vault: memory first (so nothing stays on screen while the network answers), then the server session. */
export async function closeVault({ remote = true, reason = '' } = {}) {
  const was = mem.get().open; closeVaultLocal(reason);
  if (remote && was) { try { await securePost('/lock', { scope: 'vault' }); } catch (e) { log.warn('vault', 'vault session not closed on the server (it expires by itself)', e); } }
}

const rec = (id, r) => ({ id, ...r });
async function load(engine) {
  const uid = getLock().uid;
  const [f, l] = await Promise.all([engine.adapter.get(`vault/${uid}/folders`), engine.adapter.get(`vault/${uid}/links`)]);
  engine.attachVault({ folders: Object.entries(f || {}).map(([id, r]) => rec(id, r)), links: Object.entries(l || {}).map(([id, r]) => rec(id, r)) });
}

/** Verifies the code with the Worker (a wrong one counts toward the lockout like any PIN), loads the vault into the engine and starts the timers. Throws on a wrong code. */
/** `quiet: true` (v2.5.4, owner) opens ONLY the server session, for locking a folder: the folders that are already locked are not loaded, so they do not appear for a second or two and vanish again. */
export async function openVault(code, { quiet = false } = {}) {
  if (!eng) throw Object.assign(new Error('vault_unsupported'), { code: 'unsupported' });
  const r = await securePost('/vault/open', { code });
  if (!quiet) { try { await load(eng); } catch (e) { closeVaultLocal(); throw e; } }
  stopTimers(); prefs.remove('vault.keep');   // v2.5.5: the removed setting
  mem.set({ open: true, quiet, reason: '', serverExp: r.vaultExp || 0 });
  keepAlive = setInterval(async () => { try { await securePost('/vault/extend'); } catch { closeVaultLocal(); } }, KEEP_ALIVE_MS);   // the session ends by itself when the app stops asking
  if (typeof document !== 'undefined') {
    // v2.5.5 (owner): no timer of its own while the app lock is on. Without it: 15 minutes without use (touch, key, scroll) closes it. A phone may pause the timers of a hidden app, so the idle time is also
    // measured when the page is visible again; a dead server session closes the vault in every case.
    lastActive = Date.now();
    actHandler = () => { lastActive = Date.now(); };
    for (const t of ACTIVITY) document.addEventListener(t, actHandler, { capture: true, passive: true });
    const idleCheck = () => { if (mem.get().open && !followsAppLock() && Date.now() - lastActive >= VAULT_IDLE_MS) { closeVault({ reason: 'idle' }); return true; } return false; };
    idleTimer = setInterval(idleCheck, 30000);
    visHandler = async () => {
      if (document.hidden || !mem.get().open) return;
      if (idleCheck()) return;
      try { await securePost('/vault/extend'); } catch { closeVaultLocal(); }
    };
    document.addEventListener('visibilitychange', visHandler);
    if (typeof window !== 'undefined') window.addEventListener('pageshow', visHandler);
  }
  if (!quiet) {
    eng.reconcileVault().catch((e) => log.warn('vault', 'unfinished move not completed', e));
    eng.purgeExpired().catch(() => {});   // locked items deleted more than 15 days ago go for good, like everything else
  }
  for (const fn of [...openHooks]) { try { fn(); } catch (e) { log.warn('vault', 'open hook failed', e); } }
  return true;
}

/** v2.5.5: a reload always ends the vault on this device (memory only), so a server session left open by the page that was reloaded is ended at the start. Best effort, never throws; offline it is skipped (the session expires by itself). */
export async function closeStaleVaultSession() {
  if (!vaultOn() || mem.get().open) return;
  try { if (typeof navigator !== 'undefined' && navigator.onLine === false) return; await securePost('/lock', { scope: 'vault' }); } catch { /* it expires by itself */ }
}

/** The Worker call for every vault change that needs it; keeps the lock store in step. */
export async function vaultCall(path, body) { const r = await securePost(path, body); if (r && r.lock) applyServerLock(r.lock); return r; }
