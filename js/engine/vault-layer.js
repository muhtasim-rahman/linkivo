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
 *      record is removed only after every chunk worked. Page data (linkMeta) of a locked link is deleted when it is locked and kept in memory only while open.
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
    const g = [{ tree: 'links', id: l.id, rec }, { tree: 'links', id: l.id, rec: null, from: toVault ? 'normal' : 'vault' }];
    if (toVault) g.push({ tree: 'linkMeta', id: l.id, rec: null, from: 'normal' });   // its page data would be a readable trace of a locked link
    groups.push(g);
  }
  engine.bus.emit('event', { type: 'change', folders: [...set], links: moving.map((l) => l.id), vault: true });
  // 2) (a link is 3 entries: copy, removal, page data: 100 links = 300 entries per chunk) the folder record goes to its new tree first (idempotent), the old one is removed LAST
  await engine._persistChunk(folderRecs.map((f) => ({ tree: 'folders', id: f.id, rec: f.rec })));
  const res = await runParallel(packGroups(groups, CHUNK_SIZE * 3), async (c) => { await engine._persistChunk(c); done += c.filter((e) => e.rec).length; onProgress(done, total); }, { concurrency: 4, sleep: engine.sleep });
  if (res.failed.length) throw Object.assign(new Error('move_failed'), { code: 'move_failed', failed: res.failed.length });
  await engine._persistChunk(folderRecs.map((f) => ({ tree: 'folders', id: f.id, rec: null, from: f.from })));
  if (toVault) engine.bus.emit('event', { type: 'change', folders: [...set], links: [], vault: true });
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
  for (const l of stray) { const rec = { ...l, lk: true, up: t }; engine.lk.links.add(l.id); engine._indexLink(rec); groups.push([{ tree: 'links', id: l.id, rec }, { tree: 'links', id: l.id, rec: null, from: 'normal' }, { tree: 'linkMeta', id: l.id, rec: null, from: 'normal' }]); }
  if (stray.length) engine.bus.emit('event', { type: 'change', folders: [], links: stray.map((l) => l.id), vault: true });
  const res = await runParallel(packGroups(groups, CHUNK_SIZE * 3), (c) => engine._persistChunk(c), { concurrency: 4, sleep: engine.sleep });
  if (res.failed.length) throw Object.assign(new Error('move_failed'), { code: 'move_failed' });
  if (dup.length) await engine._persistChunk(dup.map((id) => ({ tree: 'folders', id, rec: null, from: 'normal' })));
  return stray.length;
}
