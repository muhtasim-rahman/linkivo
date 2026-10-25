/**
 * Linkivo — js/core/settings-sync.js  (v2.2.1)
 * Purpose: a signed-in user's settings follow the account (owner request). The browser keeps its own copy (local-prefs, so the app starts instantly and works
 *          offline); this module mirrors it to users/<uid>/settings in the Realtime Database.
 *   - A change made on this device is marked "dirty" (the list is saved in local-prefs, so it survives a closed tab) and pushed in one multi-path write.
 *     Offline or refused: it stays dirty and is pushed again when the connection returns, when the app is opened, and when the tab becomes visible.
 *   - Changes made on another device arrive live through watchValue and are written into local-prefs (a change that is still waiting to be pushed wins).
 *   - The first time (nothing stored remotely yet) the values this device already customised are uploaded.
 *   Database rules already allow settings/<key> with a scalar value of up to 200 characters; the key may not contain a dot, so "ui.theme" is stored
 *   as "ui_theme". Which preferences sync is decided by the settings catalog (the keys of its entries).
 *   Guests have no account: nothing syncs, their settings stay on the device.
 * API: createSettingsSync({ adapter, uid, store, keys, now? }) -> { start(), push(), dispose(), state() }
 *      encodeKey(key) -> string   toRemote(value) -> scalar|null   fromRemote(value, fallback) -> any   buildKeyTable(keys) -> Map(encoded -> key)
 */
import { log } from './logger.js';

export const encodeKey = (key) => String(key).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
export function buildKeyTable(keys) {
  const t = new Map();
  for (const k of keys) { const e = encodeKey(k); if (t.has(e) && t.get(e) !== k) log.warn('settings-sync', `key clash ${e}`); else t.set(e, k); }
  return t;
}
/** Database values are scalars up to 200 characters; arrays and objects travel as JSON text. Returns null when the value can not be stored. */
export function toRemote(v) {
  if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
  if (typeof v === 'string') return v.length <= 200 ? v : null;
  if (v && typeof v === 'object') { try { const s = JSON.stringify(v); return s.length <= 200 ? s : null; } catch { return null; } }
  return null;
}
export function fromRemote(v, fallback) {
  if (fallback && typeof fallback === 'object' && typeof v === 'string') { try { return JSON.parse(v); } catch { return fallback; } }
  return v;
}
const same = (a, b) => (a && typeof a === 'object') || (b && typeof b === 'object') ? JSON.stringify(a) === JSON.stringify(b) : a === b;

const DIRTY = 'sync.dirty';          // { <encodedKey>: version } waiting to be pushed
export function createSettingsSync({ adapter, uid, store, keys, defaults = {} }) {
  const table = buildKeyTable(keys);
  const dirty = new Map(Object.entries(store.get(DIRTY, {}) || {}));   // encoded -> change counter
  let applying = false, timer = 0, running = false, disposed = false, status = 'idle', offs = [], counter = 0, lastError = null;
  const saveDirty = () => { if (dirty.size) store.set(DIRTY, Object.fromEntries(dirty)); else store.remove(DIRTY); };
  const mark = (enc) => { dirty.set(enc, ++counter); saveDirty(); schedule(); };
  const schedule = (ms = 800) => { clearTimeout(timer); timer = setTimeout(push, ms); };

  async function push() {
    if (disposed || running || !dirty.size) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { status = 'waiting'; return; }   // pushed again by the online event
    running = true; status = 'syncing';
    const sent = new Map(dirty), updates = {};
    for (const [enc] of sent) {
      const key = table.get(enc); if (!key) { dirty.delete(enc); continue; }
      const v = store.get(key, undefined);
      if (v === undefined || v === null) updates[`users/${uid}/settings/${enc}`] = null;
      else { const r = toRemote(v); if (r === null) { dirty.delete(enc); continue; } updates[`users/${uid}/settings/${enc}`] = r; }
    }
    try {
      if (Object.keys(updates).length) await adapter.update(updates);
      for (const [enc, ver] of sent) if (dirty.get(enc) === ver) dirty.delete(enc);   // changed again while sending: stays dirty
      saveDirty(); status = dirty.size ? 'waiting' : 'synced'; lastError = null;
    } catch (e) { status = 'waiting'; lastError = e; log.warn('settings-sync', 'push failed, will retry', e); schedule(30000); }
    running = false;
    if (dirty.size && status !== 'waiting') schedule(200);
  }

  function applyRemote(remote) {
    applying = true;
    try {
      for (const [enc, v] of Object.entries(remote || {})) {
        const key = table.get(enc); if (!key || dirty.has(enc)) continue;     // a change not yet pushed wins over what the server has
        const val = fromRemote(v, defaults[key]);
        if (!same(store.get(key, undefined), val)) store.set(key, val);
      }
      // first upload: keys this device customised that the account does not have yet
      for (const [enc, key] of table) if (!(enc in (remote || {})) && !dirty.has(enc) && store.has(key)) { dirty.set(enc, ++counter); }
      if (dirty.size) { saveDirty(); schedule(300); }
    } finally { applying = false; }
  }

  const onOnline = () => schedule(200);
  const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') schedule(200); };
  return {
    start() {
      for (const [enc, key] of table) offs.push(store.onChange(key, () => { if (!applying) mark(enc); }));
      offs.push(adapter.watchValue(`users/${uid}/settings`, (remote) => { if (!disposed) applyRemote(remote || {}); }));
      if (typeof addEventListener === 'function') { addEventListener('online', onOnline); }
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
      if (dirty.size) schedule(1500);
    },
    push,
    state: () => ({ status, pending: dirty.size, error: lastError }),
    dispose() {
      disposed = true; clearTimeout(timer); for (const o of offs) { try { o?.(); } catch { /* ignore */ } } offs = [];
      if (typeof removeEventListener === 'function') removeEventListener('online', onOnline);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    }
  };
}
