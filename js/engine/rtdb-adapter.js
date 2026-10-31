/**
 * Linkivo — js/engine/rtdb-adapter.js  (v2.1.0)
 * Purpose: the thin layer between the cloud engine and Firebase Realtime Database. The engine only knows this interface,
 *          so it can be unit-tested with a fake database.
 * Adapter interface:
 *   now() -> ms, corrected by the server clock (rules reject timestamps that are more than 60 s in the future, so a phone with
 *            a wrong clock must not use Date.now() directly)
 *   update({ "path/a": value|null, ... }) -> Promise   one multi-path write
 *   sync(path, sinceUp, { onUpsert(key, val), onRemove(key) }) -> Promise<{ unsubscribe() }>
 *            delivers every child with up >= sinceUp, resolves when that initial load is done, then keeps streaming changes
 *   watchValue(path, cb(value)) -> unsubscribe
 *   get(path) -> Promise<value|null>   (v2.2.2: one read, used for the devices list)
 *   recent(path, child, n) -> Promise<object|null>   (v2.4.1: the n children with the highest `child` value, newest first by the caller; History list)
 *   shallowKeys(path) -> Promise<string[]>   (REST "?shallow=true": keys only, tiny download)
 * API: createRtdbAdapter({ firebase, uid }) -> adapter   (firebase = result of loadFirebase())
 */
import { FIREBASE_CONFIG } from '../core/config.js';

export function createRtdbAdapter({ firebase }) {
  const { db, auth, mods } = firebase;
  const d = mods.database;
  let offset = 0;
  d.onValue(d.ref(db, '.info/serverTimeOffset'), (s) => { offset = Number(s.val()) || 0; });

  return {
    now: () => Date.now() + offset,
    update: (updates) => d.update(d.ref(db), updates),
    async sync(path, sinceUp, { onUpsert, onRemove }) {
      const q = d.query(d.ref(db, path), d.orderByChild('up'), d.startAt(sinceUp));
      const offs = [
        d.onChildAdded(q, (s) => onUpsert(s.key, s.val())),
        d.onChildChanged(q, (s) => onUpsert(s.key, s.val())),
        d.onChildRemoved(q, (s) => onRemove(s.key))
      ];
      await d.get(q); // resolves once the initial children have been delivered by the listeners above
      return { unsubscribe: () => offs.forEach((off) => off()) };
    },
    async get(path) { const snap = await d.get(d.ref(db, path)); return snap.val(); },
    async recent(path, child, n) { const snap = await d.get(d.query(d.ref(db, path), d.orderByChild(child), d.limitToLast(n))); return snap.val(); },
    watchValue(path, cb) { return d.onValue(d.ref(db, path), (s) => cb(s.val())); },
    async shallowKeys(path) {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${FIREBASE_CONFIG.databaseURL}/${path}.json?shallow=true&auth=${encodeURIComponent(token)}`);
      if (!res.ok) throw new Error(`shallow read failed (${res.status})`);
      const body = await res.json();
      return body ? Object.keys(body) : [];
    }
  };
}
