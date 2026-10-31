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
import { openDbSafe } from './idb.js';
import { log } from '../core/logger.js';

const TREES = ['folders', 'links'];
const RETRY_MS = 30000;

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
  }

  status() { return { kind: 'cloud', persistent: !!this.db.persistent, state: this.syncState, pending: this.pending, lastSync: this.lastSync || 0 }; }   // v2.2.4: lastSync = when a sync last finished
  _setState(state) { if (state !== this.syncState) { if (state === 'idle' && this.syncState === 'syncing') this.lastSync = Date.now(); this.syncState = state; this.bus.emit('event', { type: 'sync', state, pending: this.pending }); } }

  async _afterLoad() {
    const metas = await this.db.getAll('meta');
    for (const m of metas) if (m.key.startsWith('since.')) this.since[m.key.slice(6)] = m.value;
    this.purgeEpoch = (metas.find((m) => m.key === 'purgeEpoch') || {}).value ?? null;
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
    const local = await super.getLinkMeta(id); if (local) return local;
    if (!this.links.has(id) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
    try { const v = await this.adapter.get(`linkMeta/${this.uid}/${id}`); if (!v || typeof v !== 'object') return null; const rec = { id, ...v }; await this.db.put('linkMeta', rec).catch(() => {}); return rec; } catch { return null; }
  }

  // ---- writes ------------------------------------------------------------------------------------------------------
  async _persistChunk(entries) {
    await super._persistChunk(entries); // local cache first: a reload right now must not lose anything
    const updates = {};
    for (const e of entries) {
      if (!e.rec) updates[`${e.tree}/${this.uid}/${e.id}`] = null;
      else { const { id, ...value } = e.rec; updates[`${e.tree}/${this.uid}/${e.id}`] = value; }
    }
    const item = { id: `${String(this.now()).padStart(14, '0')}-${++this.seq}`, updates };
    await this.db.put('outbox', item); // durable before the network is touched
    this.pending++;
    await this._sendOutboxItem(item);
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
    this._setState('syncing');
    if (!(await this.flush())) return false;   // flush() has already set offline or error
    try { await this._withRetry(() => this.adapter.get(`users/${this.uid}/meta/purgeEpoch`)); }
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
    } catch (e) {
      log.warn('cloud', 'sync failed', { message: e && e.message, code: e && e.code });
      this._setState(e && e.code === 'PERMISSION_DENIED' ? 'error' : 'offline');
      this._scheduleRetry();
    }
  }

  _applyRemote(tree, id, val) {
    if (!val || typeof val !== 'object') return;
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

  async _checkEpoch(value) {
    if (value == null) return;
    if (this.purgeEpoch === null) { this.purgeEpoch = value; await this.db.put('meta', { key: 'purgeEpoch', value }); return; }
    if (value === this.purgeEpoch) return;
    try {
      for (const tree of TREES) {
        const keys = new Set(await this.adapter.shallowKeys(`${tree}/${this.uid}`));
        const map = tree === 'folders' ? this.folders : this.links;
        for (const id of [...map.keys()]) if (!keys.has(id)) this._applyRemoteRemoval(tree, id);
      }
      this.purgeEpoch = value;
      await this.db.put('meta', { key: 'purgeEpoch', value });
    } catch (e) { log.warn('cloud', 'purge reconcile failed', e); }
  }
}

export async function createCloudEngine({ uid, adapter, db, sleep }) {
  const engine = new CloudEngine({ uid, adapter, db: db || (await openDbSafe(`linkivo-${uid}`)), sleep });
  await engine.init();
  return engine;
}
