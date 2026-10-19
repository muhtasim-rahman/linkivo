/**
 * Linkivo — js/engine/engine.js  (v2.1.0)
 * Purpose: the Engine interface and its shared implementation. UI code talks ONLY to an Engine, so guest mode (local engine)
 *          and account mode (cloud engine) behave the same. The Engine keeps every folder and link in memory (instant search,
 *          sort and random later), applies changes optimistically, then persists them in chunks of 100, several in parallel.
 *          Subclasses only decide WHERE data is persisted: _persistChunk(chunk).
 * Records in memory carry their id: { id, ...fields }. The id is the database key and is stripped before writing.
 * Reads:  listFolders({deleted}) getFolder(id) listLinks({fid, deleted}) getLink(id) findByUrl(url) counts() status()
 * Writes: createFolder(data) updateFolder(id, patch) deleteFolders(ids) restoreFolders(ids) purgeFolders(ids)
 *         addLinks(items, {fid, imp, dedupe}) updateLinks(ids, patchOrFn) deleteLinks(ids) restoreLinks(ids) moveLinks(ids, fid) purgeLinks(ids)
 *         getSetting(key, fallback) setSetting(key, value)
 * Events: subscribe(fn) -> off ; fn({type:'change', folders:[ids], links:[ids]} | {type:'ready'} | {type:'sync', state, pending})
 * Deleting is SOFT (field "del" = time, kept 15 days in the Recycle Bin). A folder delete also marks its links with the same time,
 * so restoring the folder brings back exactly those links. Folder link counts ("lc") are written as absolute values.
 */
import { createEmitter } from '../core/events.js';
import { newId } from '../core/utils.js';
import { dedupeKey, hostOf } from '../core/url-tools.js';

import { chunk, runParallel } from './chunker.js';
import { FOLDER, LINK, sanitizeFolder, sanitizeLink, sanitizePatch } from './schema.js';

export const CHUNK_SIZE = 100;

export class Engine {
  constructor({ kind, db, now = Date.now, sleep }) {
    this.kind = kind;
    this.db = db;
    this.now = now;
    this.sleep = sleep;
    this.folders = new Map();
    this.links = new Map();
    this.keyIndex = new Map(); // dedupe key -> link id (live links only)
    this.settings = new Map();
    this.bus = createEmitter();
    this.ready = false;
    this._chain = Promise.resolve();
  }

  // ---- lifecycle ---------------------------------------------------------------------------------------------------
  async init() {
    for (const f of await this.db.getAll('folders')) this.folders.set(f.id, f);
    for (const l of await this.db.getAll('links')) this._indexLink(l);
    for (const s of await this.db.getAll('settings')) this.settings.set(s.key, s.value);
    await this._afterLoad();
    this.ready = true;
    this.bus.emit('event', { type: 'ready' });
  }
  async _afterLoad() { /* subclass hook */ }
  dispose() { this.bus.clear(); }
  subscribe(fn) { return this.bus.on('event', fn); }
  status() { return { kind: this.kind, persistent: !!this.db.persistent, state: 'idle', pending: 0 }; }

  // ---- reads -------------------------------------------------------------------------------------------------------
  listFolders({ deleted = false } = {}) {
    return [...this.folders.values()].filter((f) => !!f.del === deleted)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  }
  getFolder(id) { return this.folders.get(id) || null; }
  listLinks({ fid = null, deleted = false } = {}) {
    const out = [];
    for (const l of this.links.values()) if (!!l.del === deleted && (fid == null || l.fid === fid)) out.push(l);
    return out;
  }
  getLink(id) { return this.links.get(id) || null; }
  findByUrl(url) { const k = dedupeKey(url); const id = k && this.keyIndex.get(k); return id ? this.links.get(id) : null; }
  counts() {
    let links = 0, deletedLinks = 0;
    for (const l of this.links.values()) l.del ? deletedLinks++ : links++;
    const folders = [...this.folders.values()].filter((f) => !f.del).length;
    return { folders, links, deletedFolders: this.folders.size - folders, deletedLinks };
  }
  getSetting(key, fallback = null) { return this.settings.has(key) ? this.settings.get(key) : fallback; }
  async setSetting(key, value) {
    this.settings.set(key, value);
    await this.db.put('settings', { key, value });
    await this._persistSetting(key, value);
  }
  async _persistSetting() { /* subclass hook */ }

  // ---- internal index helpers --------------------------------------------------------------------------------------
  _indexLink(l) {
    const old = this.links.get(l.id);
    if (old && !old.del) { const k = dedupeKey(old.url); if (k && this.keyIndex.get(k) === old.id) this.keyIndex.delete(k); }
    this.links.set(l.id, l);
    if (!l.del) { const k = dedupeKey(l.url); if (k) this.keyIndex.set(k, l.id); }
  }
  _unindexLink(id) {
    const old = this.links.get(id);
    if (old && !old.del) { const k = dedupeKey(old.url); if (k && this.keyIndex.get(k) === id) this.keyIndex.delete(k); }
    this.links.delete(id);
  }
  _newChanges() { return { folders: new Map(), links: new Map() }; }
  _putFolder(ch, rec) { this.folders.set(rec.id, rec); ch.folders.set(rec.id, rec); }
  _putLink(ch, rec) { this._indexLink(rec); ch.links.set(rec.id, rec); }

  /** Writes the real link count of every folder touched by this batch (absolute value, never incremented). */
  _recount(ch, fids) {
    const wanted = new Set([...fids].filter((f) => this.folders.has(f)));
    if (!wanted.size) return;
    const counts = new Map();
    for (const l of this.links.values()) if (!l.del && wanted.has(l.fid)) counts.set(l.fid, (counts.get(l.fid) || 0) + 1);
    const t = this.now();
    for (const fid of wanted) {
      const f = this.folders.get(fid);
      const lc = counts.get(fid) || 0;
      if ((f.lc || 0) !== lc) this._putFolder(ch, { ...f, lc, up: t });
    }
  }

  async _finish(ch, fids = new Set()) {
    this._recount(ch, fids);
    const ids = { folders: [...ch.folders.keys()], links: [...ch.links.keys()] };
    if (!ids.folders.length && !ids.links.length) return;
    this.bus.emit('event', { type: 'change', ...ids }); // optimistic: the UI updates now, persistence follows
    await this._commit(ch);
  }

  /** Commits run one after another (so two writes to the same record keep their order); chunks inside a commit run in parallel. */
  _commit(ch) {
    const entries = [];
    for (const [id, rec] of ch.folders) entries.push({ tree: 'folders', id, rec });
    for (const [id, rec] of ch.links) entries.push({ tree: 'links', id, rec });
    const run = async () => {
      const res = await runParallel(chunk(entries, CHUNK_SIZE), (c) => this._persistChunk(c), { concurrency: 4, sleep: this.sleep });
      if (res.failed.length) { const e = new Error(`${res.failed.length} chunk(s) could not be saved`); e.failed = res.failed; throw e; }
    };
    const p = this._chain.then(run);
    this._chain = p.catch(() => {});
    return p;
  }

  /** Default persistence = the local database. Subclasses extend this (cloud: also the remote database). */
  async _persistChunk(entries) {
    for (const tree of ['folders', 'links']) {
      const puts = entries.filter((e) => e.tree === tree && e.rec).map((e) => e.rec);
      const dels = entries.filter((e) => e.tree === tree && !e.rec).map((e) => e.id);
      if (puts.length) await this.db.putMany(tree, puts);
      if (dels.length) await this.db.deleteMany(tree, dels);
    }
  }

  // ---- folders -----------------------------------------------------------------------------------------------------
  async createFolder(data) {
    const t = this.now();
    const rec = { id: newId(t), ...sanitizeFolder(data, t) };
    const ch = this._newChanges();
    this._putFolder(ch, rec);
    await this._finish(ch);
    return rec;
  }

  async updateFolder(id, patch) {
    const f = this.folders.get(id);
    if (!f) return null;
    const { set, unset } = sanitizePatch(FOLDER, patch);
    const rec = { ...f, ...set, up: this.now() };
    for (const k of unset) delete rec[k];
    const ch = this._newChanges();
    this._putFolder(ch, rec);
    await this._finish(ch);
    return rec;
  }

  async deleteFolders(ids) {
    const t = this.now();
    const set = new Set(ids);
    const ch = this._newChanges();
    for (const id of set) { const f = this.folders.get(id); if (f && !f.del) this._putFolder(ch, { ...f, del: t, up: t }); }
    for (const l of [...this.links.values()]) if (set.has(l.fid) && !l.del) this._putLink(ch, { ...l, del: t, up: t });
    await this._finish(ch, set);
    return ch.folders.size;
  }

  async restoreFolders(ids) {
    const t = this.now();
    const ch = this._newChanges();
    const delAt = new Map();
    for (const id of ids) { const f = this.folders.get(id); if (f && f.del) { delAt.set(id, f.del); const { del, ...rest } = f; this._putFolder(ch, { ...rest, up: t }); } }
    for (const l of [...this.links.values()]) if (delAt.has(l.fid) && l.del === delAt.get(l.fid)) { const { del, ...rest } = l; this._putLink(ch, { ...rest, up: t }); }
    await this._finish(ch, new Set(delAt.keys()));
    return delAt.size;
  }

  /** Permanent removal (Recycle Bin "delete forever" and the 15-day purge). Links of the folder go with it. */
  async purgeFolders(ids) {
    const set = new Set(ids);
    const ch = this._newChanges();
    for (const id of set) if (this.folders.has(id)) { this.folders.delete(id); ch.folders.set(id, null); }
    for (const l of [...this.links.values()]) if (set.has(l.fid)) { this._unindexLink(l.id); ch.links.set(l.id, null); }
    await this._finish(ch);
    return ch.folders.size;
  }

  // ---- links -------------------------------------------------------------------------------------------------------
  /** items: [{ url, title?, desc?, tags?, ts?, ... }]. Returns { added:[links], skipped:n, invalid:n }. */
  async addLinks(items, { fid, imp = null, dedupe = true } = {}) {
    if (!this.folders.has(fid)) throw new Error('Folder not found');
    const t = this.now();
    const ch = this._newChanges();
    const added = [];
    let skipped = 0, invalid = 0;
    for (const item of items) {
      const key = dedupeKey(item.url);
      if (!key) { invalid++; continue; }
      if (dedupe && this.keyIndex.has(key)) { skipped++; continue; }
      let rec;
      try { rec = { id: newId(t), ...sanitizeLink({ host: hostOf(item.url), ...item, fid, imp: imp || item.imp }, t) }; } catch { invalid++; continue; }
      this._putLink(ch, rec);
      added.push(rec);
    }
    await this._finish(ch, new Set([fid]));
    return { added, skipped, invalid };
  }

  /** patch is an object or a function(link) -> object. null removes a field. */
  async updateLinks(ids, patch) {
    const t = this.now();
    const ch = this._newChanges();
    for (const id of ids) {
      const l = this.links.get(id);
      if (!l) continue;
      const { set, unset } = sanitizePatch(LINK, typeof patch === 'function' ? patch(l) : patch);
      const rec = { ...l, ...set, up: t };
      for (const k of unset) delete rec[k];
      this._putLink(ch, rec);
    }
    await this._finish(ch);
    return ch.links.size;
  }

  async deleteLinks(ids) {
    const t = this.now();
    const ch = this._newChanges();
    const fids = new Set();
    for (const id of ids) { const l = this.links.get(id); if (l && !l.del) { fids.add(l.fid); this._putLink(ch, { ...l, del: t, up: t }); } }
    await this._finish(ch, fids);
    return ch.links.size;
  }

  async restoreLinks(ids) {
    const t = this.now();
    const ch = this._newChanges();
    const fids = new Set();
    for (const id of ids) { const l = this.links.get(id); if (l && l.del) { fids.add(l.fid); const { del, ...rest } = l; this._putLink(ch, { ...rest, up: t }); } }
    await this._finish(ch, fids);
    return ch.links.size;
  }

  async moveLinks(ids, fid) {
    if (!this.folders.has(fid)) throw new Error('Folder not found');
    const t = this.now();
    const ch = this._newChanges();
    const fids = new Set([fid]);
    for (const id of ids) { const l = this.links.get(id); if (l && l.fid !== fid) { fids.add(l.fid); this._putLink(ch, { ...l, fid, up: t }); } }
    await this._finish(ch, fids);
    return ch.links.size;
  }

  async purgeLinks(ids) {
    const ch = this._newChanges();
    const fids = new Set();
    for (const id of ids) { const l = this.links.get(id); if (l) { fids.add(l.fid); this._unindexLink(id); ch.links.set(id, null); } }
    await this._finish(ch, fids);
    return ch.links.size;
  }

  /** Recycle Bin purge on app open: removes everything deleted more than `days` ago. */
  async purgeExpired(days = 15) {
    const cutoff = this.now() - days * 86400000;
    const f = [...this.folders.values()].filter((x) => x.del && x.del < cutoff).map((x) => x.id);
    const l = [...this.links.values()].filter((x) => x.del && x.del < cutoff && !f.includes(x.fid)).map((x) => x.id);
    if (f.length) await this.purgeFolders(f);
    if (l.length) await this.purgeLinks(l);
    return f.length + l.length;
  }
}

