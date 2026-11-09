/**
 * Linkivo — js/core/lock-resume.js  (v2.5.5)
 * Purpose: lets the app lock skip the PIN after a RELOAD, when "Ask for the PIN on every reload" is OFF (App lock popup; this is the DEFAULT). Everything else about the lock stays the same.
 *          What is kept, on THIS device only, in a tiny IndexedDB of its own:
 *            - the encryption key of the stored library copy, as a NON-EXTRACTABLE CryptoKey (its bytes can never be read by any script, it can only be used on this browser profile),
 *            - the PIN verifier (already a derived value, never the PIN),
 *            - `seen`: the last time the app was on screen (refreshed every few seconds, and when the app is left).
 *          It is used only while `seen` is newer than the Auto lock time (0 = never resume, -1 = never auto lock, capped at 7 days), and it is deleted when the app locks, the PIN or
 *          the lock changes, the person logs out, or "Ask for the PIN on every reload" is turned back on. The server session (account) is checked too: no session, no resume.
 *          Honest limit: with this option off, someone who gets to this unlocked browser profile within the Auto lock time can open the app without the PIN. That is what the option means.
 * API: resumeAllowed({ away, seen, now }) -> boolean (pure)     saveResume(scope, box)   readResume(scope) -> { key, verifier, seen } | null   touchResume(scope)   clearResume()
 *      Every function resolves quietly (never throws): a failure just means the PIN is asked.
 */
const DB = 'linkivo-resume', STORE = 'r', ID = 'current', MAX_MS = 7 * 24 * 3600 * 1000;

/** Pure: may a record last seen at `seen` be used now? `away` is the Auto lock setting in seconds (0 = at once, -1 = never). */
export function resumeAllowed({ away, seen, now = Date.now() }) {
  const idle = now - Number(seen || 0);
  if (!seen || idle < 0 || idle > MAX_MS) return false;
  if (away === 0) return false;
  return away < 0 ? true : idle <= away * 1000;
}

const on = (target, type, fn) => target.addEventListener(type, fn);
const open = () => new Promise((resolve) => {
  try {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const rq = indexedDB.open(DB, 1);
    on(rq, 'upgradeneeded', () => { if (!rq.result.objectStoreNames.contains(STORE)) rq.result.createObjectStore(STORE); });
    on(rq, 'success', () => resolve(rq.result));
    on(rq, 'error', () => resolve(null));
    on(rq, 'blocked', () => resolve(null));
  } catch { resolve(null); }
});
const run = async (mode, fn) => {
  const db = await open(); if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode), st = tx.objectStore(STORE); let out = null;
      const rq = fn(st); if (rq) on(rq, 'success', () => { out = rq.result ?? null; });
      const end = (v) => () => { db.close(); resolve(v); };
      on(tx, 'complete', () => { db.close(); resolve(out); }); on(tx, 'error', end(null)); on(tx, 'abort', end(null));
    } catch { try { db.close(); } catch { /* ignore */ } resolve(null); }
  });
};

export const saveResume = (scope, box) => (box && box.key ? run('readwrite', (st) => st.put({ scope, key: box.key, verifier: box.verifier, seen: Date.now() }, ID)) : Promise.resolve(null));
export async function readResume(scope) { const r = await run('readonly', (st) => st.get(ID)); return r && r.scope === scope && r.key && r.verifier ? r : null; }
export async function touchResume(scope) {
  const db = await open(); if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE), g = st.get(ID);
      on(g, 'success', () => { const r = g.result; if (r && r.scope === scope) st.put({ ...r, seen: Date.now() }, ID); });
      const end = () => { db.close(); resolve(); };
      on(tx, 'complete', end); on(tx, 'error', end); on(tx, 'abort', end);
    } catch { try { db.close(); } catch { /* ignore */ } resolve(); }
  });
}
export const clearResume = () => run('readwrite', (st) => st.delete(ID)).then(() => null);
