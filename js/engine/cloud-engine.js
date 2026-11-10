/**
 * Linkivo — js/engine/cloud-engine.js  (v2.1.0)
 * Purpose: account-mode engine. The local database (IndexedDB "linkivo-<uid>") is a cache that makes every start instant;
 *          Realtime Database is the source of truth. Strategy (ARCHITECTURE section 5):
 *   - writes: optimistic in memory, then per chunk: cache write -> outbox record -> ONE multi-path update() -> outbox cleared.
 *             If the network is down the outbox keeps the write and it is retried on "online" and every 30 s.
 *   - reads: delta sync. Only records with up >= lastSeen are streamed (index on "up"), later changes arrive live.
 *            Newer "up" wins (last write wins); our own echoes are ignored.
 *   - hard purges (Recycle Bin purge, other devices) are noticed through users/<uid>/meta/purgeEpoch and reconciled with a
 *     shallow key list.
 * API: createCloudEngine({ uid, adapter, db, sleep }) -> Promise<CloudEngine>   (cache loaded; sync runs in the background)
 *      engine.status() -> { kind, persistent, state: 'idle'|'syncing'|'offline'|'error', pending }   engine.flush()   engine.dispose()
 */
import { Engine } from './engine.js';
import { attachVault, detachVault, lockFolders, unlockFolders, reconcileVault } from './vault-layer.js';
import { sanitizePatch, LINK_META } from './schema.js';
import { openDbSafe } from './idb.js';
import { log } from '../core/logger.js';
import { withTimeout } from '../core/utils.js';

const TREES = ['folders', 'links'];
const RETRY_MS = 30000;
const SEND_WAIT_MS = 2500;   // v2.5.4: how long one write waits for the server before the action carries on (see _persistChunk)

export class CloudEngine extends Engine {
  constructor({ uid, adapter, db, sleep }) {
    super({ kind: 'cloud', db, now: () => adapter.now(), sleep });
    this.uid = uid;
    this.adapter = adapter;
    this.syncState = 'idle';
    this.pending = 0;
    this.since = { folders: 0, links: 0 };
    this.offs = [];
    this.seq = 0;
    this.retryTimer = null;
    this._onOnline = () => this.flush();
    this.vaultCapable = true;     // v2.5.3: an account can hold locked folders (a guest engine cannot)
    this.vmeta = new Map();       // page data of OPEN locked links: memory only
  }

  // ---- v2.5.3: locked folders (js/engine/vault-layer.js) -----------------------------------------------------------
  attachVault(data) { return attachVault(this, data); }
  detachVault() { return detachVault(this); }
  lockFolders(fids, onProgress) { return lockFolders(this, fids, onProgress); }
  unlockFolders(fids, onProgress) { return unlockFolders(this, fids, onProgress); }
  reconcileVault() { return reconcileVault(this); }
  isLocked(kind, id) { return this.lk[kind === 'folder' ? 'folders' : 'links'].has(id); }

  status() { return { kind: 'cloud', persistent: !!this.db.persistent, state: this.syncState, pending: this.pending, lastSync: this.lastSync || 0 }; }   // v2.2.4: lastSync = when a sync last finished
  _setState(state) { if (state !== this.syncState) { if (state === 'idle' && this.syncState === 'syncing') this.lastSync = Date.now(); this.syncState = state; this.bus.emit('event', { type: 'sync', state, pending: this.pending }); } }

  async _afterLoad() {
    const metas = await this.db.getAll('meta');
    for (const m of metas) if (m.key.startsWith('since.')) this.since[m.key.slice(6)] = m.value;
    this.purgeEpoch = (metas.find((m) => m.key === 'purgeEpoch') || {}).value ?? null;
    this.repaired = metas.some((m) => m.key === 'repair256');   // v2.5.6: the one-time clean-up of records that left this account's normal tree while this device was closed
    this.pending = (await this.db.getAll('outbox')).length;
    if (typeof window !== 'undefined') window.addEventListener('online', this._onOnline);
    this._syncPromise = this._startSync(); // background: the UI does not wait for the network
    this._syncPromise.catch(() => {});
  }

  dispose() {
    for (const off of this.offs) { try { off(); } catch { /* ignore */ } }
    this.offs = [];
    clearTimeout(this.retryTimer);
    if (typeof window !== 'undefined') window.removeEventListener('online', this._onOnline);
    super.dispose();
  }

  /** v2.3.0: extra page data is not synced down with the lists (it is heavy): read it from the database when this device has none, then keep it locally. */
  async getLinkMeta(id) {
    // v2.5.3: a locked link's page data never touches the cache or the normal tree. v2.5.6: it now lives in vault/<uid>/linkMeta (readable only with a vault session), is read
    // from there on demand while the vault is open and kept in memory only (vmeta) until the vault closes, so the saved picture survives a lock and an unlock.
    if (this.lk.links.has(id)) {
      const m = this.vmeta.get(id); if (m) return m;
      const rec = await this._metaIn(id, 'vault'); if (rec && this.lk.links.has(id)) this.vmeta.set(id, rec);
      return rec;
    }
    const local = await super.getLinkMeta(id); if (local) return local;
    if (!this.links.has(id) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    try { const v = await this.adapter.get(`linkMeta/${this.uid}/${id}`); if (!v || typeof v !== 'object') return null; const rec = { id, ...v }; await this.db.put('linkMeta', rec).catch(() => {}); return rec; } catch { return null; }
  }

  /** v2.5.6: the page data of a link in ONE named tree ('normal' | 'vault'), whatever the lk sets say right now (they flip before the chunks run while a link changes trees).
   *  Normal: this device's cache first, then the database. Vault: memory, then the database (needs the open session; null when it is not there). Never throws. */
  async _metaIn(id, tree) {
    try {
      if (tree === 'vault') {
        const m = this.vmeta.get(id); if (m) return m;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
        const v = await this.adapter.get(`vault/${this.uid}/linkMeta/${id}`);
        return v && typeof v === 'object' ? { id, ...v } : null;
      }
      const local = await this.db.get('linkMeta', id); if (local) return local;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
      const v = await this.adapter.get(`linkMeta/${this.uid}/${id}`);
      return v && typeof v === 'object' ? { id, ...v } : null;
    } catch { return null; }
  }

  async peekLinkMeta(id) { return this.lk.links.has(id) ? (this.vmeta.get(id) || null) : super.peekLinkMeta(id); }
  async saveLinkMeta(entries) {
    const mine = entries.filter(([id]) => this.lk.links.has(id)), rest = entries.filter(([id]) => !this.lk.links.has(id));
    let n = 0; const vrecs = [];
    for (const [id, raw] of mine) { if (!this.links.has(id)) continue; const { set } = sanitizePatch(LINK_META, { ...raw, checkedAt: this.now() }); if (Object.keys(set).length > 1) { const rec = { id, ...set }; this.vmeta.set(id, rec); n++; vrecs.push({ tree: 'linkMeta', id, rec: { ...rec, lk: true } }); } }
    if (vrecs.length) { try { await this._persistChunk(vrecs); } catch (e) { log.warn('cloud-engine', 'locked page data kept in memory only (could not save it in the vault)', e); } }   // v2.5.6: also at rest in the vault tree
    return n + (rest.length ? await super.saveLinkMeta(rest) : 0);
  }
  async _dropLinkMeta(ids) {
    const locked = ids.filter((id) => this.lk.links.has(id));
    for (const id of ids) this.vmeta.delete(id);
    if (locked.length) { try { await this._persistChunk(locked.map((id) => ({ tree: 'linkMeta', id, rec: null, from: 'vault' }))); } catch (e) { log.warn('cloud-engine', 'could not remove locked page data', e); } }   // v2.5.6: purge also clears the vault copy
    await super._dropLinkMeta(ids.filter((id) => !this.lk.links.has(id)));
  }

  // ---- writes ------------------------------------------------------------------------------------------------------
  /** v2.5.3: where does this entry go? `from` is explicit for the removal half of a cross-tree move; a write follows its own marker; a removal follows the lk sets. */
  _dest(e) { return e.from || (e.rec ? (e.rec.lk ? 'vault' : 'normal') : (((e.tree === 'linkMeta' ? this.lk.links : this.lk[e.tree]) || { has: () => false }).has(e.id) ? 'vault' : 'normal')); }
  _path(e, dest) { return dest === 'vault' ? `vault/${this.uid}/${e.tree}/${e.id}` : `${e.tree}/${this.uid}/${e.id}`; }

  async _persistChunk(entries) {
    const routed = entries.map((e) => ({ e, dest: this._dest(e) }));
    const normal = routed.filter((r) => r.dest === 'normal').map((r) => r.e);
    await super._persistChunk(normal); // local cache first (normal data only: a locked record is never written to this device)
    const updates = {}; let vault = false;
    for (const { e, dest } of routed) {
      if (dest === 'vault') vault = true;
      if (!e.rec) updates[this._path(e, dest)] = null;
      else { const { id, lk, ...value } = e.rec; updates[this._path(e, dest)] = value; }
    }
    if (vault) { await this._sendVault(updates); return; }   // vault writes need the live session: no outbox (it would outlive the session)
    const item = { id: `${String(this.now()).padStart(14, '0')}-${++this.seq}`, updates };
    await this.db.put('outbox', item); // durable before the network is touched
    this.pending++;
    // v2.5.4 (owner: offline, only some actions worked): the change is already safe on this device (cache and outbox). With the data connection on but no internet the send never answers, and every
    // action that awaited it hung. Wait a moment for the answer, then let the action finish; the send goes on in the background and the retry timer covers a failure.
    await new Promise((resolve) => { const t = setTimeout(resolve, SEND_WAIT_MS); if (t && t.unref) t.unref(); this._sendOutboxItem(item).catch(() => {}).finally(() => { clearTimeout(t); resolve(); }); });
  }

  async _sendVault(updates) {
    try { await this._withRetry(() => this.adapter.update(updates)); }
    catch (e) { log.warn('cloud', 'locked folders could not be saved', { code: e && e.code }); if (!this._vfail) { this._vfail = true; setTimeout(() => { this._vfail = false; }, 3000); this.bus.emit('event', { type: 'vault-failed', code: e && e.code }); } throw e; }   // once per burst: the chunk runner retries, the person should see ONE message
  }

  async _sendOutboxItem(item) {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
      await this._withRetry(() => this.adapter.update(item.updates));
      await this.db.deleteMany('outbox', [item.id]);
      this.pending = Math.max(0, this.pending - 1);
      if (this.pending === 0) this._setState('idle');
      return true;
    } catch (e) {
      this._setState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      log.warn('cloud', 'write queued for retry', { reason: e && e.message, code: e && e.code });
      this._scheduleRetry();
      return false; // stays in the outbox, so the caller does not see a failure
    }
  }

  async _withRetry(fn) {
    for (let t = 0; ; t++) {
      try { return await fn(); }
      catch (e) {
        if (t >= 1 || (e && e.code === 'PERMISSION_DENIED')) throw e;
        await (this.sleep ? this.sleep(400) : new Promise((r) => setTimeout(r, 400)));
      }
    }
  }

  /**
   * v2.4.1 (owner: "Last synced" kept showing the old time after Sync now). Root cause: flush() returns early when nothing waits in the outbox, so no
   * state change happened and `lastSync` was never touched; the settings row was also painted once and never again. Sync now sends what waits, proves the
   * connection with one tiny read, stamps `lastSync` and emits a sync event so the row repaints. Returns true when the account answered.
   */
  async syncNow() {
    // v2.4.2 (owner): offline showed "synced" and "just now". Firebase answers a read from its memory cache while offline, so the browser's own flag is
    // checked first, and the proving read gets a time limit (a half-dead connection would otherwise wait for ever).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this._setState('offline'); return false; }
    this._setState('syncing');
    if (!(await this.flush())) return false;   // flush() has already set offline or error
    try { await withTimeout(this._withRetry(() => this.adapter.get(`users/${this.uid}/meta/purgeEpoch`)), 8000, 'sync check'); }
    catch (e) { this._setState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error'); log.warn('cloud', 'sync now failed', { code: e && e.code }); return false; }
    this.lastSync = Date.now();
    if (this.syncState !== 'idle') this._setState('idle');
    this.bus.emit('event', { type: 'sync', state: 'idle', pending: this.pending, at: this.lastSync });   // always: the page repaints even when the state did not change
    return true;
  }

  _scheduleRetry() { clearTimeout(this.retryTimer); this.retryTimer = setTimeout(() => this.flush(), RETRY_MS); }

  /** Sends everything waiting in the outbox, oldest first (order matters when two writes touch one record). */
  async flush() {
    const items = (await this.db.getAll('outbox')).sort((a, b) => (a.id < b.id ? -1 : 1));
    this.pending = items.length;
    if (!items.length) return true;
    this._setState('syncing');
    for (const item of items) if (!(await this._sendOutboxItem(item))) return false;
    return true;
  }

  async _persistSetting(key, value) {
    try { await this.adapter.update({ [`users/${this.uid}/settings/${key}`]: value }); }
    catch (e) { log.warn('cloud', 'setting not synced', e); }
  }

  // ---- reads / delta sync ------------------------------------------------------------------------------------------
  async _startSync() {
    this._setState('syncing');
    try {
      await this.flush(); // our own pending writes go out before remote data comes in
      for (const tree of TREES) {
        const sub = await this.adapter.sync(`${tree}/${this.uid}`, this.since[tree] || 0, {
          onUpsert: (id, val) => this._applyRemote(tree, id, val),
          onRemove: (id) => this._applyRemoteRemoval(tree, id)
        });
        this.offs.push(sub.unsubscribe);
      }
      this.offs.push(this.adapter.watchValue(`users/${this.uid}/meta/purgeEpoch`, (v) => this._checkEpoch(v)));
      if (this.pending === 0) this._setState('idle');
      if (!this.repaired) this._repairOnce();   // v2.5.6: in the background, never blocks the start
    } catch (e) {
      log.warn('cloud', 'sync failed', { message: e && e.message, code: e && e.code });
      this._setState(e && e.code === 'PERMISSION_DENIED' ? 'error' : 'offline');
      this._scheduleRetry();
    }
  }

  _applyRemote(tree, id, val) {
    if (!val || typeof val !== 'object') return;
    if (this.lk[tree].has(id)) return;   // v2.5.3: this record lives in the vault tree now; a normal-tree event about the same id is the other half of a move
    const map = tree === 'folders' ? this.folders : this.links;
    const local = map.get(id);
    if (local && local.up >= val.up) return; // our own echo, or a newer local edit
    const rec = { id, ...val };
    if (tree === 'folders') this.folders.set(id, rec); else this._indexLink(rec);
    this.db.putMany(tree, [rec]).catch(() => {});
    if (val.up > (this.since[tree] || 0)) { this.since[tree] = val.up; this.db.put('meta', { key: `since.${tree}`, value: val.up }).catch(() => {}); }
    this._queueEvent(tree, id);
  }

  _applyRemoteRemoval(tree, id) {
    if (this.lk[tree].has(id)) return;   // v2.5.3: our own move into the vault removes the normal-tree record: the locked copy must stay in memory
    if (tree === 'folders') { if (!this.folders.delete(id)) return; } else { if (!this.links.has(id)) return; this._unindexLink(id); }
    this.db.deleteMany(tree, [id]).catch(() => {});
    this._queueEvent(tree, id);
  }

  /** Remote events arrive one by one; the UI gets them batched once per tick. */
  _queueEvent(tree, id) {
    (this._evq ||= { folders: new Set(), links: new Set() })[tree].add(id);
    if (this._evt) return;
    this._evt = setTimeout(() => {
      const q = this._evq; this._evq = null; this._evt = null;
      this.bus.emit('event', { type: 'change', folders: [...q.folders], links: [...q.links], remote: true });
    }, 0);
  }

  /** Removes from this device every normal-tree record the account no longer has (a shallow key list per tree: ids only, a few bytes each). Locked records (lk) are never touched. */
  async _reconcileAll() {
    for (const tree of TREES) {
      const keys = new Set(await this.adapter.shallowKeys(`${tree}/${this.uid}`));
      const map = tree === 'folders' ? this.folders : this.links;
      for (const id of [...map.keys()]) if (!keys.has(id)) this._applyRemoteRemoval(tree, id);
    }
  }

  async _checkEpoch(value) {
    if (value == null) return;
    if (value === this.purgeEpoch) return;
    // v2.5.6: a device that has NEVER seen a signal (stored value null) but already holds records can not know what happened before this first signal, so it reconciles once, like for any change.
    // (Until v2.5.5 it just adopted the value, which is exactly how a stale cache survived the first lock or purge on another device.) An empty device has nothing to clean.
    if (this.purgeEpoch === null && !this.folders.size && !this.links.size) { this.purgeEpoch = value; await this.db.put('meta', { key: 'purgeEpoch', value }); return; }
    try {
      await this._reconcileAll();
      this.purgeEpoch = value;
      await this.db.put('meta', { key: 'purgeEpoch', value });
    } catch (e) { log.warn('cloud', 'purge reconcile failed', e); }
  }

  /**
   * v2.5.6 (owner: after locking folders the PWA still counted the locked links in its total). A folder that moves into the vault, or a hard purge, REMOVES records from the normal tree.
   * A device that was closed at that moment never hears about a removal (delta sync only sees records that exist), so its cache kept them. The writer now bumps users/<uid>/meta/purgeEpoch;
   * every other device compares it on start and while open (watchValue) and runs _reconcileAll. The new value is also remembered here, so this device does not reconcile for its own change.
   * It goes through the outbox like any write (offline-safe) and is last in line, after the changes it announces.
   */
  async bumpEpoch() {
    const v = Math.max(this.now(), (Number(this.purgeEpoch) || 0) + 1);
    this.purgeEpoch = v;
    await this.db.put('meta', { key: 'purgeEpoch', value: v }).catch(() => {});
    const item = { id: `${String(this.now()).padStart(14, '0')}-${++this.seq}`, updates: { [`users/${this.uid}/meta/purgeEpoch`]: v } };
    try { await this.db.put('outbox', item); this.pending++; } catch (e) { log.warn('cloud', 'could not queue the purge signal', e); return; }
    this._sendOutboxItem(item).catch(() => {});
  }
  /** One-time repair for caches that already hold records the account lost earlier (v2.5.5 and before never sent the signal). Marked done only when it worked. */
  async _repairOnce() {
    try { await this._reconcileAll(); this.repaired = true; await this.db.put('meta', { key: 'repair256', value: 1 }); this.bus.emit('event', { type: 'change', folders: [], links: [], repair: true }); }
    catch (e) { log.warn('cloud', 'one-time clean-up not possible now, will retry next start', { code: e && e.code }); }
  }

  async purgeFolders(ids) { const n = await super.purgeFolders(ids); if (ids.length) await this.bumpEpoch(); return n; }   // v2.5.6: other devices drop them too
  async purgeLinks(ids) { const n = await super.purgeLinks(ids); if (ids.length) await this.bumpEpoch(); return n; }
}

export async function createCloudEngine({ uid, adapter, db, sleep }) {
  const engine = new CloudEngine({ uid, adapter, db: db || (await openDbSafe(`linkivo-${uid}`)), sleep });
  await engine.init();
  return engine;
}
