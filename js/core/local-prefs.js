/**
 * Linkivo — js/core/local-prefs.js  (v2.1.0)
 * Purpose: the ONLY module that touches the browser's key-value storage (enforced by check.mjs).
 *          Namespaced ("lk:"), JSON-encoded, with an in-memory fallback when storage is blocked
 *          (private mode, disabled cookies) so the app never crashes because of it.
 * API: prefs / sessionPrefs : get(key, fallback) set(key, value) remove(key) has(key) keys(prefix)
 *      removePrefix(prefix) onChange(key, fn) -> off   persistent (boolean)
 *      setDefaults(obj) -> [changed keys]   v2.5.6: server-side default settings (js/core/app-defaults.js). They answer get() ONLY while the person has no stored value of their own,
 *      so a setting they changed always wins; has() / keys() still mean "stored on this device" (settings sync uploads only those).
 */
const NS = 'lk:';

function makeStore(kind) {
  let backend = null;
  try {
    const s = globalThis[kind];
    if (s) { s.setItem('__lk_probe', '1'); s.removeItem('__lk_probe'); backend = s; }
  } catch { backend = null; }
  const mem = new Map();
  const watchers = new Map(); // key -> Set<fn>
  let defaults = new Map();   // v2.5.6: values that only apply while nothing is stored for the key

  const notify = (key, value) => { const set = watchers.get(key); if (set) for (const fn of set) { try { fn(value); } catch { /* ignore */ } } };

  const api = {
    persistent: !!backend,
    get(key, fallback = null) {
      try {
        const raw = backend ? backend.getItem(NS + key) : mem.get(NS + key) ?? null;
        if (raw == null) return defaults.has(key) ? defaults.get(key) : fallback;   // v2.5.6: the account owner's default, else the one the caller gave
        return JSON.parse(raw);
      } catch { return fallback; }
    },
    /** v2.5.6: replace the server defaults. Returns the keys whose EFFECTIVE value changed (only keys with nothing stored): their watchers are told, so e.g. a new default theme shows at once. */
    setDefaults(obj = {}) {
      const next = new Map(Object.entries(obj || {}));
      const changed = [];
      for (const k of new Set([...defaults.keys(), ...next.keys()])) {
        const a = defaults.has(k) ? JSON.stringify(defaults.get(k)) : undefined, b = next.has(k) ? JSON.stringify(next.get(k)) : undefined;
        if (a !== b && !api.has(k)) changed.push(k);
      }
      defaults = next;
      for (const k of changed) notify(k, api.get(k, null));
      return changed;
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try { backend ? backend.setItem(NS + key, raw) : mem.set(NS + key, raw); } catch { mem.set(NS + key, raw); }
      notify(key, value);
    },
    remove(key) {
      try { backend ? backend.removeItem(NS + key) : mem.delete(NS + key); } catch { mem.delete(NS + key); }
      notify(key, null);
    },
    has(key) {   // v2.5.6: "stored on this device" (a server default does not count)
      try { const raw = backend ? backend.getItem(NS + key) : mem.get(NS + key) ?? null; return raw != null && JSON.parse(raw) !== undefined; } catch { return false; }
    },
    keys(prefix = '') {
      const all = backend ? Object.keys(backend).filter((k) => k.startsWith(NS)).map((k) => k.slice(NS.length)) : [...mem.keys()].map((k) => k.slice(NS.length));
      return all.filter((k) => k.startsWith(prefix));
    },
    removePrefix(prefix) { for (const k of api.keys(prefix)) api.remove(k); },
    onChange(key, fn) {
      if (!watchers.has(key)) watchers.set(key, new Set());
      watchers.get(key).add(fn);
      return () => watchers.get(key)?.delete(fn);
    }
  };

  // Changes made in another tab arrive through the "storage" event.
  if (backend && kind === 'localStorage' && typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (!e.key || !e.key.startsWith(NS)) return;
      let v = null; try { v = e.newValue == null ? null : JSON.parse(e.newValue); } catch { /* ignore */ }
      notify(e.key.slice(NS.length), v);
    });
  }
  return api;
}

export const prefs = makeStore('localStorage');
export const sessionPrefs = makeStore('sessionStorage');
