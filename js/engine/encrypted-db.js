/**
 * Linkivo — js/engine/encrypted-db.js  (v2.5.0)
 * Purpose: wraps the IndexedDB layer (engine/idb.js) so every record is stored encrypted while the app lock is on. The engines do not know: they get the same get / getAll / put /
 *          putMany / deleteMany / clear API. An encrypted record keeps its key (the keyPath) in the clear and moves the rest into `iv` and `ct`. A marker record in the `meta` store
 *          ("enc-check") tells whether the stored copy belongs to the current key.
 *          openEncryptedDb: right key -> use it; plain copy (the lock was just turned on) -> encrypt it in place; copy of ANOTHER key (the PIN was reset) -> account: throw it away,
 *          it is downloaded again; guest: refuse (the guest's copy is the only one).   decryptAll: turning the lock off. rekey: changing the PIN.
 * API: wrapDb(inner, box) -> Db   openEncryptedDb(inner, box, { discardUnreadable }) -> Promise<Db>   decryptAll(inner, box) -> Promise<void>   rekey(inner, oldBox, newBox) -> Promise<void>
 */
import { STORES } from './idb.js';

const CHECK = { store: 'meta', key: 'enc-check', value: 'linkivo' };
const isEnc = (r) => !!(r && r.__e === 1);
const keyPath = (store) => STORES[store];
async function seal(box, store, rec) { const { iv, ct } = await box.encrypt(rec); return { [keyPath(store)]: rec[keyPath(store)], __e: 1, iv, ct }; }
const open = async (box, rec) => (isEnc(rec) ? box.decrypt(rec) : rec);

export function wrapDb(inner, box) {
  return {
    persistent: inner.persistent, encrypted: true, inner,
    get: async (s, k) => open(box, await inner.get(s, k)),
    getAll: async (s) => Promise.all((await inner.getAll(s)).map((r) => open(box, r))),
    put: async (s, v) => inner.put(s, await seal(box, s, v)),
    putMany: async (s, vs) => inner.putMany(s, await Promise.all(vs.map((v) => seal(box, s, v)))),
    deleteMany: (s, ks) => inner.deleteMany(s, ks),
    clear: (s) => inner.clear(s),
    close: () => inner.close && inner.close()
  };
}
async function hasAnything(inner) { for (const s of Object.keys(STORES)) if ((await inner.getAll(s)).some((r) => !(s === CHECK.store && r[keyPath(s)] === CHECK.key))) return true; return false; }
async function wipe(inner) { for (const s of Object.keys(STORES)) await inner.clear(s); }
async function transform(inner, fn) {                      // rewrites every record of every store with fn(store, record) -> record
  for (const s of Object.keys(STORES)) { const all = await inner.getAll(s); if (all.length) await inner.putMany(s, await Promise.all(all.map((r) => fn(s, r)))); }
}

export async function openEncryptedDb(inner, box, { discardUnreadable = true } = {}) {
  const w = wrapDb(inner, box);
  const mark = await inner.get(CHECK.store, CHECK.key);
  if (isEnc(mark)) {
    try { const m = await box.decrypt(mark); if (m && m.value === CHECK.value) return w; } catch { /* another key */ }
    if (!discardUnreadable) throw Object.assign(new Error('stored copy is locked with another PIN'), { code: 'decrypt' });
    await wipe(inner);                                   // account: the server has everything, it is downloaded again
  } else if (await hasAnything(inner)) {
    await transform(inner, async (s, r) => (isEnc(r) ? r : seal(box, s, r)));   // the lock was just turned on: encrypt what is there
  }
  await w.put(CHECK.store, { [keyPath(CHECK.store)]: CHECK.key, value: CHECK.value });
  return w;
}
export async function decryptAll(inner, box) {
  await transform(inner, async (s, r) => (isEnc(r) ? box.decrypt(r) : r));
  await inner.deleteMany(CHECK.store, [CHECK.key]);
}
export async function rekey(inner, oldBox, newBox) {
  await transform(inner, async (s, r) => seal(newBox, s, isEnc(r) ? await oldBox.decrypt(r) : r));
  await inner.put(CHECK.store, await seal(newBox, CHECK.store, { [keyPath(CHECK.store)]: CHECK.key, value: CHECK.value }));
}
