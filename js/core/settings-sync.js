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
 *   v2.5.7 (owner: "settings sync has many problems, make sure everything syncs, and live, without a reload"):
 *   - a setting that was RESET (removed) on one device is now removed on the others. Before, the other device kept its value and uploaded it again, so the reset came back.
 *     Each device remembers which keys it has already seen in the account (`sync.known.<uid>`): a key that was known and is now gone was deleted elsewhere; a key never seen is a first upload.
 *   - the live listener is started again when the database cancels it (the app lock closing the data, a dropped session), and the settings are read once more when the app comes back to the
 *     front, so a phone whose socket slept still catches up. `pull()` does that read on demand (pull-down refresh uses it).
 *   - the list of changes waiting to be pushed belongs to ONE account (`sync.dirty.uid`): after a log out and a login as someone else it is dropped instead of being pushed into the new account.
 *   - every change that arrives is written with local-prefs, which tells its watchers, so open screens (Settings, Library, folders, Random) update at once (see their own watchers).
 * API: createSettingsSync({ adapter, uid, store, keys, now? }) -> { start(), push(), pull(), dispose(), state() }
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
const DIRTY_UID = 'sync.dirty.uid';  // v2.5.7: whose changes those are
const KNOWN = (uid) => `sync.known.${uid}`;   // v2.5.7: encoded keys this device has seen in the account (a key that vanishes was removed elsewhere)
export function createSettingsSync({ adapter, uid, store, keys, defaults = {} }) {
  const table = buildKeyTable(keys);
  if (store.get(DIRTY_UID, null) && store.get(DIRTY_UID, null) !== uid) { store.remove(DIRTY); }   // v2.5.7: changes made while signed in as someone else never go into this account
  const dirty = new Map(Object.entries(store.get(DIRTY, {}) || {}));   // encoded -> change counter
  const known = new Set(store.get(KNOWN(uid), []) || []);
  const saveKnown = () => store.set(KNOWN(uid), [...known].slice(0, 400));
  let applying = false, timer = 0, running = false, disposed = false, status = 'idle', offs = [], counter = 0, lastError = null;
  const saveDirty = () => { if (dirty.size) { store.set(DIRTY, Object.fromEntries(dirty)); store.set(DIRTY_UID, uid); } else { store.remove(DIRTY); store.remove(DIRTY_UID); } };
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
      for (const [enc, ver] of sent) { if (dirty.get(enc) === ver) dirty.delete(enc); const u = updates[`users/${uid}/settings/${enc}`]; if (u === null) known.delete(enc); else if (u !== undefined) known.add(enc); }   // changed again while sending: stays dirty
      saveDirty(); saveKnown(); status = dirty.size ? 'waiting' : 'synced'; lastError = null;
    } catch (e) { status = 'waiting'; lastError = e; log.warn('settings-sync', 'push failed, will retry', e); schedule(30000); }
    running = false;
    if (dirty.size && status !== 'waiting') schedule(200);
  }

  function applyRemote(remote) {
    applying = true;
    try {
      const have = remote || {};
      for (const [enc, v] of Object.entries(have)) {
        const key = table.get(enc); if (!key || dirty.has(enc)) continue;     // a change not yet pushed wins over what the server has
        known.add(enc);
        const val = fromRemote(v, defaults[key]);
        if (!same(store.get(key, undefined), val)) store.set(key, val);
      }
      for (const [enc, key] of table) {
        if (enc in have || dirty.has(enc)) continue;
        if (known.has(enc)) { known.delete(enc); if (store.has(key)) store.remove(key); }      // v2.5.7: it was in the account and is gone: it was reset on another device, so it is reset here too
        else if (store.has(key)) dirty.set(enc, ++counter);                                     // first upload: a key this device customised that the account does not have yet
      }
      saveKnown();
      if (dirty.size) { saveDirty(); schedule(300); }
    } finally { applying = false; }
  }
  /** v2.5.7: reads the account's settings once and applies them (the listener may have slept, e.g. a phone that was in the background). Never throws. */
  async function pull() {
    if (disposed || typeof adapter.get !== 'function') return;
    try { const remote = await adapter.get(`users/${uid}/settings`); if (!disposed && !running) applyRemote(remote || {}); } catch (e) { log.warn('settings-sync', 'pull failed', e); }
  }
  let watchOff = null, retry = 0;
  function watch() {
    if (disposed || watchOff) return;
    const cancelled = () => { if (watchOff) { try { watchOff(); } catch { /* ignore */ } watchOff = null; } clearTimeout(retry); retry = setTimeout(watch, 15000); };   // v2.5.7: the database cancelled the listener: try again
    watchOff = adapter.watchValue(`users/${uid}/settings`, (remote) => { if (!disposed) applyRemote(remote || {}); }, cancelled);
  }

  const onOnline = () => { schedule(200); pull(); watch(); };
  const onVisible = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible') { schedule(200); pull(); watch(); } };
  return {
    start() {
      for (const [enc, key] of table) offs.push(store.onChange(key, () => { if (!applying) mark(enc); }));
      watch();
      if (typeof addEventListener === 'function') { addEventListener('online', onOnline); }
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
      if (dirty.size) schedule(1500);
    },
    push, pull,
    state: () => ({ status, pending: dirty.size, error: lastError }),
    dispose() {
      disposed = true; clearTimeout(timer); clearTimeout(retry); if (watchOff) { try { watchOff(); } catch { /* ignore */ } watchOff = null; } for (const o of offs) { try { o?.(); } catch { /* ignore */ } } offs = [];
      if (typeof removeEventListener === 'function') removeEventListener('online', onOnline);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    }
  };
}
