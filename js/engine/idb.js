/**
 * Linkivo — js/engine/idb.js  (v2.1.0)
 * Purpose: small promise wrapper over IndexedDB plus an in-memory twin with the same API (used by tests and as the
 *          fallback when IndexedDB is blocked, for example private windows). Both return plain copies of the stored data.
 * Db API: get(store,key) getAll(store) put(store,value) putMany(store,values) deleteMany(store,keys) clear(store) close()  persistent
 * API: STORES   openDb(name) -> Db   createMemoryDb()   openDbSafe(name) -> Db (never throws)
 */
import { log } from '../core/logger.js';

/** All stores live in one database per scope ("linkivo-guest" or "linkivo-<uid>"). */
export const STORES = Object.freeze({
  folders: 'id', links: 'id', linkMeta: 'id', meta: 'key', settings: 'key', outbox: 'id', jobs: 'id', history: 'id'   // v2.4.1: history (this device's History list); the database version went 2 -> 3.  // v2.2.1: linkMeta (extra page data per link); the database version went 1 -> 2 so existing browsers add the store
});

export function createMemoryDb() {
  const data = new Map(Object.keys(STORES).map((s) => [s, new Map()]));
  const clone = (v) => (v === undefined ? v : structuredClone(v));
  const keyOf = (store, v) => v[STORES[store]];
  return {
    persistent: false,
    async get(store, key) { return clone(data.get(store).get(key)); },
    async getAll(store) { return [...data.get(store).values()].map(clone); },
    async put(store, value) { data.get(store).set(keyOf(store, value), clone(value)); },
    async putMany(store, values) { for (const v of values) data.get(store).set(keyOf(store, v), clone(v)); },
    async deleteMany(store, keys) { for (const k of keys) data.get(store).delete(k); },
    async clear(store) { data.get(store).clear(); },
    close() {}
  };
}

export function openDb(name) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
    const req = indexedDB.open(name, 3);
    req.onupgradeneeded = () => { for (const [store, keyPath] of Object.entries(STORES)) if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store, { keyPath }); };
    req.addEventListener('error', () => reject(req.error));
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    req.onsuccess = () => {
      const idb = req.result;
      idb.onversionchange = () => idb.close();
      const run = (store, mode, fn) => new Promise((res, rej) => {
        const tx = idb.transaction(store, mode);
        const os = tx.objectStore(store);
        let result;
        try { result = fn(os); } catch (e) { rej(e); return; }
        tx.addEventListener('complete', () => res(result && 'result' in result ? result.result : undefined));
        tx.addEventListener('error', () => rej(tx.error));
        tx.addEventListener('abort', () => rej(tx.error || new Error('transaction aborted')));
      });
      resolve({
        persistent: true,
        get: (store, key) => run(store, 'readonly', (os) => os.get(key)),
        getAll: (store) => run(store, 'readonly', (os) => os.getAll()),
        put: (store, value) => run(store, 'readwrite', (os) => { os.put(value); }),
        putMany: (store, values) => run(store, 'readwrite', (os) => { for (const v of values) os.put(v); }),
        deleteMany: (store, keys) => run(store, 'readwrite', (os) => { for (const k of keys) os.delete(k); }),
        clear: (store) => run(store, 'readwrite', (os) => { os.clear(); }),
        close: () => idb.close()
      });
    };
  });
}

export async function openDbSafe(name) {
  try { return await openDb(name); } catch (e) { log.warn('idb', 'falling back to memory storage', e); return createMemoryDb(); }
}
