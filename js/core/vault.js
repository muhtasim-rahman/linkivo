/**
 * Linkivo — js/core/vault.js  (v2.5.3, rewritten: locked folders are part of the normal library while open)
 * Purpose: the SESSION of the locked folders ("vault"). A separate code (a prefix symbol plus six digits, e.g. @000000) is checked by the Worker, which opens a vault session that the
 *          database rules require for everything under vault/<uid>. This module opens and closes that session and hands the data to the engine: open = the locked folders and links
 *          appear everywhere (Library, folder view, search, Random, Preview, Profile, Stats) with a small lock icon; closed = they are not in memory at all. The data is never written
 *          to this device (no cache, no index, no history, no export). Accounts only: a guest has no server to hold the session.
 *          How long it stays open is the person's choice (setting `vault.keep`): until the app is closed or reloaded, or 2 / 5 / 10 / 20 / 30 / 60 minutes. The app lock, logout and a
 *          failed keep-alive close it at once.
 * API: VAULT_PREFIXES  KEEP_OPTIONS  keepSetting()  vaultCodeMatch(text, prefix) -> six digits | null   vaultOn() -> boolean   bindVaultEngine(engine)
 *      getVault() -> { open, exp }   subscribeVault(fn)   openVault(code) -> true (throws on a wrong code: callers must NOT say why)   closeVault({ remote })   closeVaultLocal()
 *      onVaultOpen(fn) -> off   (jobs that were waiting for the vault resume here)   vaultCall(path, body)
 */
import { createStore } from './events.js';
import { getLock, applyServerLock } from './lock.js';
import { securePost } from './worker-client.js';
import { prefs } from './local-prefs.js';
import { log } from './logger.js';

export const VAULT_PREFIXES = ['@', '#', '%', '$', '!'];
export const KEEP_KEY = 'vault.keep';
/** How long the vault stays open after the code (owner, v2.5.3). 'reload' = until the app is closed or reloaded. */
export const KEEP_OPTIONS = [{ value: 'reload', label: 'Until I close or reload the app' }, { value: '2', label: '2 minutes' }, { value: '5', label: '5 minutes' }, { value: '10', label: '10 minutes' }, { value: '20', label: '20 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '1 hour' }];
export const keepSetting = () => { const v = String(prefs.get(KEEP_KEY, '10')); return KEEP_OPTIONS.some((o) => o.value === v) ? v : '10'; };

const KEEP_ALIVE_MS = 60000;
const mem = createStore({ open: false, exp: 0 });
const openHooks = new Set();
let eng = null, keepAlive = null, expiryTimer = null, visHandler = null;
export const getVault = () => mem.get();
export const subscribeVault = (fn) => mem.subscribe(fn);
export const onVaultOpen = (fn) => { openHooks.add(fn); return () => openHooks.delete(fn); };
/** The data layer tells this module which engine holds the records. */
export function bindVaultEngine(engine) { eng = engine && engine.vaultCapable ? engine : null; }

/** True when this person can use locked folders at all: a signed-in account that has set a code. Guests: never. */
export const vaultOn = () => { const l = getLock(); return l.scope === 'account' && l.vaultSep === true; };

/** The shape check that decides whether a search text is a code: exactly <prefix><six digits>. Local, no network, no side effects. */
export function vaultCodeMatch(text, prefix = '@') {
  const t = String(text ?? '');
  if (t.length !== 7 || t[0] !== prefix) return null;
  const digits = t.slice(1);
  return /^\d{6}$/.test(digits) ? digits : null;
}

function stopTimers() {
  clearInterval(keepAlive); keepAlive = null; clearTimeout(expiryTimer); expiryTimer = null;
  if (visHandler && typeof document !== 'undefined') { document.removeEventListener('visibilitychange', visHandler); visHandler = null; }
}

/** Forgets everything on this device (also called by the app lock and by logout). Does not talk to the server. */
export function closeVaultLocal() {
  stopTimers();
  if (eng) { try { eng.detachVault(); } catch (e) { log.warn('vault', 'detach failed', e); } }
  mem.set({ open: false, exp: 0 });
}

/** Locks the vault: memory first (so nothing stays on screen while the network answers), then the server session. */
export async function closeVault({ remote = true } = {}) {
  const was = mem.get().open; closeVaultLocal();
  if (remote && was) { try { await securePost('/lock', { scope: 'vault' }); } catch (e) { log.warn('vault', 'vault session not closed on the server (it expires by itself)', e); } }
}

const rec = (id, r) => ({ id, ...r });
async function load(engine) {
  const uid = getLock().uid;
  const [f, l] = await Promise.all([engine.adapter.get(`vault/${uid}/folders`), engine.adapter.get(`vault/${uid}/links`)]);
  engine.attachVault({ folders: Object.entries(f || {}).map(([id, r]) => rec(id, r)), links: Object.entries(l || {}).map(([id, r]) => rec(id, r)) });
}

/** Verifies the code with the Worker (a wrong one counts toward the lockout like any PIN), loads the vault into the engine and starts the timers. Throws on a wrong code. */
export async function openVault(code) {
  if (!eng) throw Object.assign(new Error('vault_unsupported'), { code: 'unsupported' });
  const r = await securePost('/vault/open', { code });
  try { await load(eng); } catch (e) { closeVaultLocal(); throw e; }
  stopTimers();
  const keep = keepSetting(), exp = keep === 'reload' ? 0 : Date.now() + Number(keep) * 60000;
  mem.set({ open: true, exp, serverExp: r.vaultExp || 0 });
  if (exp) expiryTimer = setTimeout(() => closeVault(), exp - Date.now());
  keepAlive = setInterval(async () => { try { await securePost('/vault/extend'); } catch { closeVaultLocal(); } }, KEEP_ALIVE_MS);   // the session ends by itself when the app stops asking
  if (typeof document !== 'undefined') {
    // a phone may suspend the timers: when the page is visible again the session is checked at once (a dead session closes the vault) and a passed expiry time is honoured
    visHandler = async () => { if (document.hidden || !mem.get().open) return; const e = mem.get().exp; if (e && Date.now() >= e) { closeVault(); return; } try { await securePost('/vault/extend'); } catch { closeVaultLocal(); } };
    document.addEventListener('visibilitychange', visHandler);
  }
  eng.reconcileVault().catch((e) => log.warn('vault', 'unfinished move not completed', e));
  eng.purgeExpired().catch(() => {});   // locked items deleted more than 15 days ago go for good, like everything else
  for (const fn of [...openHooks]) { try { fn(); } catch (e) { log.warn('vault', 'open hook failed', e); } }
  return true;
}

/** The Worker call for every vault change that needs it; keeps the lock store in step. */
export async function vaultCall(path, body) { const r = await securePost(path, body); if (r && r.lock) applyServerLock(r.lock); return r; }
