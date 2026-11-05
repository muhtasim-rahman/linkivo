/**
 * Linkivo — js/core/vault.js  (v2.5.2)
 * Purpose: the vault ("locked folders"). Its data lives in its own database tree (vault/<uid>/...) which the rules open only while a vault session is on, and on the device it exists
 *          ONLY in this module's memory: no IndexedDB, no cache, no search index, no export, no DOM unless the vault page is open. Closing the vault (button, app lock, logout,
 *          a long time in the background, a failed keep-alive) empties the memory.
 *          The code is a prefix symbol plus six digits typed into the search box (for example @482913). `vaultCodeMatch` recognises that SHAPE locally; nothing is sent
 *          anywhere until it matches. Accounts only: a guest has no server to hold the vault session.
 * API: VAULT_PREFIXES  vaultCodeMatch(text, prefix) -> six digits | null   vaultOn() -> boolean
 *      getVault() subscribeVault(fn)   openVault(code, ctx) -> true   closeVault({ remote })   closeVaultLocal()   (ctx = { adapter, uid })
 *      vaultFolders() vaultLinks(fid)   moveIntoVault(fid, ctx, engine, onProgress) -> n   moveOutOfVault(fid, ctx, onProgress) -> n   deleteInVault(ids, ctx)   renameVaultFolder(fid, name, ctx)
 *      Moves are ATOMIC per chunk of 100 (the copy and the removal are one multi-path update), run in parallel, and remove the original folder last: an interrupted move never loses a link; running it again finishes it.
 */
import { createStore } from './events.js';
import { getLock, applyServerLock } from './lock.js';
import { securePost } from './worker-client.js';
import { chunk, runParallel } from '../engine/chunker.js';
import { log } from './logger.js';

export const VAULT_PREFIXES = ['@', '#', '%', '$', '!'];
const KEEP_ALIVE_MS = 60000, BACKGROUND_CLOSE_MS = 120000;
const mem = createStore({ open: false, exp: 0, folders: [], links: [] });
export const getVault = () => mem.get();
export const subscribeVault = (fn) => mem.subscribe(fn);

/** True when this person can use a vault at all: a signed-in account that has set a vault code. Guests: never. */
export const vaultOn = () => { const l = getLock(); return l.scope === 'account' && l.vaultSep === true; };

/** The shape check that decides whether a search text is a vault code: exactly <prefix><six digits>. Local, no network, no side effects. */
export function vaultCodeMatch(text, prefix = '@') {
  const t = String(text ?? '');
  if (t.length !== 7 || t[0] !== prefix) return null;
  const digits = t.slice(1);
  return /^\d{6}$/.test(digits) ? digits : null;
}

let keepAlive = null, hiddenTimer = null, visHandler = null;
const stopTimers = () => { clearInterval(keepAlive); keepAlive = null; clearTimeout(hiddenTimer); hiddenTimer = null; if (visHandler && typeof document !== 'undefined') { document.removeEventListener('visibilitychange', visHandler); visHandler = null; } };

/** Forgets everything on this device (also called by the app lock and by logout). Does not talk to the server. */
export function closeVaultLocal() { stopTimers(); mem.set({ open: false, exp: 0, folders: [], links: [] }); }

/** Locks the vault: memory first (so nothing stays on screen while the network answers), then the server session. */
export async function closeVault({ remote = true } = {}) {
  const was = mem.get().open; closeVaultLocal();
  if (remote && was) { try { await securePost('/lock', { scope: 'vault' }); } catch (e) { log.warn('vault', 'vault session not closed on the server (it expires by itself)', e); } }
}

const rec = (id, r) => ({ id, ...r });
async function load({ adapter, uid }) {
  const [f, l] = await Promise.all([adapter.get(`vault/${uid}/folders`), adapter.get(`vault/${uid}/links`)]);
  mem.set({ folders: Object.entries(f || {}).map(([id, r]) => rec(id, r)).filter((x) => !x.del), links: Object.entries(l || {}).map(([id, r]) => rec(id, r)).filter((x) => !x.del) });
}

/** Verifies the code with the Worker (a wrong one counts toward the lockout like any PIN), then loads the vault into memory. Throws on a wrong code; callers must NOT show why. */
export async function openVault(code, ctx) {
  const r = await securePost('/vault/open', { code });
  mem.set({ open: true, exp: r.vaultExp || 0 });
  try { await load(ctx); } catch (e) { closeVaultLocal(); throw e; }
  stopTimers();
  keepAlive = setInterval(async () => { try { await securePost('/vault/extend'); } catch { closeVaultLocal(); } }, KEEP_ALIVE_MS);   // the session ends by itself when the app stops asking
  if (typeof document !== 'undefined') {
    visHandler = () => { if (document.hidden) hiddenTimer = setTimeout(() => closeVault(), BACKGROUND_CLOSE_MS); else { clearTimeout(hiddenTimer); hiddenTimer = null; } };
    document.addEventListener('visibilitychange', visHandler);
  }
  return true;
}

export const vaultFolders = () => (mem.get().open ? mem.get().folders.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name))) : []);
export const vaultLinks = (fid) => (mem.get().open ? mem.get().links.filter((l) => l.fid === fid) : []);

const strip = ({ id, ...r }) => r;
const requireOpen = () => { if (!mem.get().open) throw Object.assign(new Error('vault_locked'), { code: 'locked' }); };

/** Shared engine of both moves. Every chunk (100 links) is ONE multi-path update that writes the copies AND removes the originals, and carries the folder record too (idempotent),
 *  so chunks can run in parallel and in any order. The original FOLDER is removed last, only when no chunk failed; a failure therefore leaves everything still reachable. */
async function moveChunks({ links, folderPath, folderRec, folderGone, toPath, fromPath, extraFrom = [], adapter, onProgress }) {
  const now = adapter.now(), parts = chunk(links, 100), total = links.length; let done = 0;
  const jobs = parts.length ? parts : [[]];
  const res = await runParallel(jobs, async (part) => {
    const up = { [folderPath]: { ...folderRec, up: now } };
    for (const l of part) { up[toPath(l.id)] = { ...strip(l), up: now }; up[fromPath(l.id)] = null; for (const x of extraFrom) up[x(l.id)] = null; }
    await adapter.update(up); done += part.length; onProgress(done, total);
  });
  if (res.failed.length) throw Object.assign(new Error('move_failed'), { code: 'move_failed', failed: res.failed.length });
  await adapter.update({ [folderGone]: null });
  return total;
}

/** Normal folder (with its links) -> vault. Its page data (linkMeta) is dropped: it would be a readable trace of a locked link. */
export async function moveIntoVault(fid, ctx, engine, onProgress = () => {}) {
  requireOpen();
  const { adapter, uid } = ctx, folder = engine.getFolder(fid); if (!folder) return 0;
  const n = await moveChunks({ links: engine.listLinks({ fid }), folderPath: `vault/${uid}/folders/${fid}`, folderRec: strip(folder), folderGone: `folders/${uid}/${fid}`,
    toPath: (id) => `vault/${uid}/links/${id}`, fromPath: (id) => `links/${uid}/${id}`, extraFrom: [(id) => `linkMeta/${uid}/${id}`], adapter, onProgress });
  await load(ctx); return n;
}

/** Vault folder (with its links) -> the normal library. */
export async function moveOutOfVault(fid, ctx, onProgress = () => {}) {
  requireOpen();
  const { adapter, uid } = ctx, folder = mem.get().folders.find((f) => f.id === fid); if (!folder) return 0;
  const n = await moveChunks({ links: mem.get().links.filter((l) => l.fid === fid), folderPath: `folders/${uid}/${fid}`, folderRec: strip(folder), folderGone: `vault/${uid}/folders/${fid}`,
    toPath: (id) => `links/${uid}/${id}`, fromPath: (id) => `vault/${uid}/links/${id}`, adapter, onProgress });
  await load(ctx); return n;
}

/** Permanent removal inside the vault (there is no Recycle Bin for locked data: a bin would be a second copy outside the code). */
export async function deleteInVault(ids, ctx) {
  requireOpen(); const { adapter, uid } = ctx, up = {};
  for (const id of ids) up[`vault/${uid}/links/${id}`] = null;
  for (const part of chunk(Object.keys(up), 100)) await adapter.update(Object.fromEntries(part.map((k) => [k, null])));
  await load(ctx);
}

export async function renameVaultFolder(fid, name, ctx) {
  requireOpen(); const f = mem.get().folders.find((x) => x.id === fid); if (!f) return;
  await ctx.adapter.update({ [`vault/${ctx.uid}/folders/${fid}`]: { ...strip(f), name: String(name).slice(0, 80), up: ctx.adapter.now() } });
  await load(ctx);
}

/** The Worker call for every vault change that needs it; keeps the lock store in step. */
export async function vaultCall(path, body) { const r = await securePost(path, body); if (r && r.lock) applyServerLock(r.lock); return r; }
