/**
 * Linkivo — js/engine/vault-layer.js  (v2.5.3)
 * Purpose: locked folders as part of the normal engine. While the vault is OPEN its folders and links sit in the engine's maps next to the normal ones (marker `lk: true`, in memory
 *          only), so Library, folder view, search, Random, Preview, Profile and Stats treat them like any other data. While it is CLOSED they are simply not in memory at all:
 *          nothing to list, search, count or leave in a cache. At rest they live only under vault/<uid>/..., which the database rules open for a vault session.
 * API (all take the cloud engine first):
 *      attachVault(engine, { folders, links })     put the vault's records into the maps (call after the Worker opened the session)
 *      detachVault(engine)                         take every locked record out of the maps and forget their page data
 *      lockFolders(engine, fids, onProgress) -> n  normal folder(s) + their links -> vault (ONE update per chunk: copy and removal together; the folder goes last)
 *      unlockFolders(engine, fids, onProgress) -> n  vault folder(s) -> the normal library (the same, the other way)
 *      reconcileVault(engine) -> n                 finishes a move that was interrupted: normal links whose folder is locked go into the vault
 *      vaultEntries(engine) -> { folders: n, links: n }
 * Safety rules: a record is written to its new tree in the SAME multi-path update that removes it from the old one, so an interrupted move never loses a link; the old folder
 *      record is removed only after every chunk worked. Page data (linkMeta: title, picture, description) moves WITH its link (v2.5.6): into vault/<uid>/linkMeta
 *      when locked, back into linkMeta/<uid> when unlocked, in the same atomic update; while the vault is open it is read on demand and held in memory only.
 *      (Until v2.5.5 it was deleted at lock time, so a link came back from the vault without its saved picture.)
 */
import { runParallel } from './chunker.js';
import { packGroups, CHUNK_SIZE } from './engine.js';

export function attachVault(engine, { folders = [], links = [] } = {}) {
  detachVault(engine, { silent: true });
  const dupNormal = [];
  for (const f of folders) { if (engine.folders.has(f.id) && !engine.lk.folders.has(f.id)) dupNormal.push(f.id); engine.folders.set(f.id, { ...f, lk: true }); engine.lk.folders.add(f.id); }
  for (const l of links) { if (engine.links.has(l.id) && !engine.lk.links.has(l.id)) engine._unindexLink(l.id); engine._indexLink({ ...l, lk: true }); engine.lk.links.add(l.id); }
  engine._dupNormalFolders = dupNormal;   // a folder id that exists in BOTH trees = a move that was interrupted; reconcileVault() deletes the normal copy
  engine.bus.emit('event', { type: 'change', folders: [...engine.lk.folders], links: [...engine.lk.links], vault: true });
  engine.bus.emit('event', { type: 'vault', open: true });
}

export function detachVault(engine, { silent = false } = {}) {
  const f = [...engine.lk.folders], l = [...engine.lk.links];
  for (const id of f) engine.folders.delete(id);
  for (const id of l) engine._unindexLink(id);
  engine.lk.folders.clear(); engine.lk.links.clear();
  if (engine.vmeta) engine.vmeta.clear();
  engine._dupNormalFolders = [];
  if (!silent && (f.length || l.length)) { engine.bus.emit('event', { type: 'change', folders: f, links: l, vault: true }); }
  if (!silent) engine.bus.emit('event', { type: 'vault', open: false });
}

/** v2.5.6: the page-data half of a move, as two entries (write, remove) that `withMeta` turns into real ones just before the chunk is saved (the data is read per chunk, not for all links up front). */
const metaMove = (id, toVault) => [{ tree: 'linkMeta', id, rec: null, _mv: toVault }, { tree: 'linkMeta', id, rec: null, from: toVault ? 'normal' : 'vault' }];
/** Reads the page data of the placeholder entries (small parallel batches), swaps each for a real write into the other tree, and keeps the memory copy (vmeta) in step. */
export async function withMeta(engine, entries) {
  const want = entries.filter((e) => '_mv' in e);
  if (!want.length) return entries;
  const found = new Map();
  for (let i = 0; i < want.length; i += 8) await Promise.all(want.slice(i, i + 8).map(async (e) => { const m = await engine._metaIn(e.id, e._mv ? 'normal' : 'vault'); if (m) found.set(e.id, m); }));
  const out = [];
  for (const e of entries) {
    if (!('_mv' in e)) { out.push(e); continue; }
    const m = found.get(e.id); if (!m) continue;               // this link had no page data: only the removal entry remains
    const { lk, ...plain } = m;
    if (e._mv) { engine.vmeta.set(e.id, plain); out.push({ tree: 'linkMeta', id: e.id, rec: { ...plain, lk: true } }); }
    else { engine.vmeta.delete(e.id); out.push({ tree: 'linkMeta', id: e.id, rec: plain }); }
  }
  return out;
}

export const vaultEntries = (engine) => ({ folders: engine.lk.folders.size, links: engine.lk.links.size });

/** Shared body of both moves. `toVault` true = lock. Returns the number of links moved. */
async function moveFolders(engine, fids, toVault, onProgress = () => {}) {
  if (!engine.vaultCapable) throw Object.assign(new Error('vault_unsupported'), { code: 'unsupported' });
  const set = new Set(fids.filter((id) => { const f = engine.folders.get(id); return f && !!f.lk !== toVault; }));
  if (!set.size) return 0;
  if (typeof engine.flush === 'function' && !(await engine.flush())) throw Object.assign(new Error('sync_first'), { code: 'sync_first' });   // an outbox entry could name a record that is about to change trees
  const t = engine.now(), folderRecs = [], linkEntries = [];
  const strip = ({ lk, ...r }) => r;
  for (const id of set) {
    const f = engine.folders.get(id);
    folderRecs.push({ id, from: toVault ? 'normal' : 'vault', rec: toVault ? { ...f, lk: true, up: t } : { ...strip(f), up: t } });
  }
  const moving = [...engine.links.values()].filter((l) => set.has(l.fid));
  const total = moving.length; let done = 0;
  // 1) memory first (the UI shows the lock icon at once); the lk sets decide where later writes of these records go
  for (const fr of folderRecs) { engine.folders.set(fr.id, fr.rec); if (toVault) engine.lk.folders.add(fr.id); else engine.lk.folders.delete(fr.id); }
  const groups = [];
  for (const l of moving) {
    const rec = toVault ? { ...l, lk: true, up: t } : { ...strip(l), up: t };
    if (toVault) engine.lk.links.add(l.id); else engine.lk.links.delete(l.id);
    engine._indexLink(rec);
    groups.push([{ tree: 'links', id: l.id, rec }, { tree: 'links', id: l.id, rec: null, from: toVault ? 'normal' : 'vault' }, ...metaMove(l.id, toVault)]);   // v2.5.6: page data travels with its link
  }
  engine.bus.emit('event', { type: 'change', folders: [...set], links: moving.map((l) => l.id), vault: true });
  // 2) (a link is 4 entries: copy, removal, page data copy, page data removal: 100 links = 400 entries per chunk) the folder record goes to its new tree first (idempotent), the old one is removed LAST
  await engine._persistChunk(folderRecs.map((f) => ({ tree: 'folders', id: f.id, rec: f.rec })));
  const res = await runParallel(packGroups(groups, CHUNK_SIZE * 4), async (c) => { await engine._persistChunk(await withMeta(engine, c)); done += c.filter((e) => e.tree === 'links' && e.rec).length; onProgress(done, total); }, { concurrency: 4, sleep: engine.sleep });
  if (res.failed.length) throw Object.assign(new Error('move_failed'), { code: 'move_failed', failed: res.failed.length });
  await engine._persistChunk(folderRecs.map((f) => ({ tree: 'folders', id: f.id, rec: null, from: f.from })));
  if (toVault) { engine.bus.emit('event', { type: 'change', folders: [...set], links: [], vault: true }); if (typeof engine.bumpEpoch === 'function') await engine.bumpEpoch(); }   // v2.5.6: tell the other devices the normal tree lost these records
  return total;
}

export const lockFolders = (engine, fids, onProgress) => moveFolders(engine, fids, true, onProgress);
export const unlockFolders = (engine, fids, onProgress) => moveFolders(engine, fids, false, onProgress);

/** After attach: finish what an interrupted lock left behind (links still in the normal tree whose folder already is locked; a folder id present in both trees). */
export async function reconcileVault(engine) {
  const stray = [...engine.links.values()].filter((l) => !l.lk && engine.lk.folders.has(l.fid));
  const dup = engine._dupNormalFolders || []; engine._dupNormalFolders = [];
  if (!stray.length && !dup.length) return 0;
  const t = engine.now(), groups = [];
  for (const l of stray) { const rec = { ...l, lk: true, up: t }; engine.lk.links.add(l.id); engine._indexLink(rec); groups.push([{ tree: 'links', id: l.id, rec }, { tree: 'links', id: l.id, rec: null, from: 'normal' }, ...metaMove(l.id, true)]); }
  if (stray.length) engine.bus.emit('event', { type: 'change', folders: [], links: stray.map((l) => l.id), vault: true });
  const res = await runParallel(packGroups(groups, CHUNK_SIZE * 4), async (c) => engine._persistChunk(await withMeta(engine, c)), { concurrency: 4, sleep: engine.sleep });
  if (res.failed.length) throw Object.assign(new Error('move_failed'), { code: 'move_failed' });
  if (dup.length) await engine._persistChunk(dup.map((id) => ({ tree: 'folders', id, rec: null, from: 'normal' })));
  if (typeof engine.bumpEpoch === 'function') await engine.bumpEpoch();   // v2.5.6
  return stray.length;
}
