/**
 * Linkivo — js/core/app-defaults.js  (v2.5.6)
 * Purpose: the owner can change the DEFAULT value of any ordinary setting from the Firebase console, without a new release (owner request). What a new person (account or guest) gets
 *          is read from the public node  appDefaults/<settingKey>  of the Realtime Database. A person who changed a setting keeps their own value: server defaults answer prefs.get() only
 *          while nothing is stored (see local-prefs.js setDefaults). Admin-only editing: the rules allow reads for everyone and writes for nobody (the console ignores rules), so the
 *          only editor is the owner in the Firebase console. A real admin panel can write the same node later.
 * Safety: the node is public input, so every value is checked against the settings catalog before it is used: only keys of ordinary settings (not Security, Account, Admin, Danger zone,
 *          App or Testing), only the value types and options that setting really has. Anything else is ignored. The result is cached on the device (offline start) and applied before the
 *          first screen is drawn (main.js), so a returning person never sees the old default flash.
 * Key names: the database does not allow dots, so  ui.theme  is stored as  ui_theme  (the same encoding as settings sync).
 * API: cleanDefaults(raw, catalog) -> { settingKey: value }   (pure, tested)     applyCachedDefaults()     refreshServerDefaults({ catalog, fetchFn?, store? }) -> Promise<{ ok, count }>
 *      eligibleEntries(catalog) -> entries   DEFAULTS_NODE   DEFAULTS_CACHE
 */
import { prefs } from './local-prefs.js';
import { FIREBASE_CONFIG } from './config.js';
import { encodeKey } from './settings-sync.js';
import { log } from './logger.js';

export const DEFAULTS_NODE = 'appDefaults';
export const DEFAULTS_CACHE = 'app.defaults';
const EXCLUDED_SECTIONS = new Set(['security', 'account', 'admin', 'danger', 'app', 'advanced']);
const TIMEOUT_MS = 5000;

/** The settings whose default may be set from the server: a real preference key, a simple control, not sensitive, not admin-only. */
export const eligibleEntries = (catalog) => catalog.filter((e) => e && e.key && ['seg', 'switch', 'swatch'].includes(e.type) && !e.sensitive && !e.admin && !EXCLUDED_SECTIONS.has(e.section));

/** Checks one value against the entry it is meant for. Returns the value to use (an option keeps its own type), or undefined to ignore it. */
function checkValue(entry, v) {
  if (entry.type === 'switch') return typeof v === 'boolean' ? v : undefined;
  const hit = (entry.options || []).find((o) => String(o.value) === String(v));
  return hit ? hit.value : undefined;
}

/** Raw database node -> { settingKey: value } containing only what is allowed and valid. Pure. */
export function cleanDefaults(raw, catalog) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const table = new Map(eligibleEntries(catalog).map((e) => [encodeKey(e.key), e]));
  for (const [enc, v] of Object.entries(raw)) {
    const entry = table.get(enc); if (!entry) continue;
    const ok = checkValue(entry, v); if (ok !== undefined) out[entry.key] = ok;
  }
  return out;
}

/** Early start (before the first screen): use what the last visit saved. Needs no catalog, because only cleaned data was ever saved. */
export function applyCachedDefaults(store = prefs) {
  try { const c = store.get(DEFAULTS_CACHE, null); if (c && typeof c === 'object' && !Array.isArray(c)) store.setDefaults(c); } catch (e) { log.warn('app-defaults', 'cached defaults ignored', e); }
}

/** Reads the node (a plain public GET, no account needed, so guests get it too), cleans it, saves it and applies it. Never throws; a failure keeps what is cached. */
export async function refreshServerDefaults({ catalog, fetchFn = (typeof fetch === 'function' ? fetch : null), store = prefs, url = `${FIREBASE_CONFIG.databaseURL}/${DEFAULTS_NODE}.json` } = {}) {
  if (!fetchFn || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { ok: false, count: 0 };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchFn(url, { cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {}) });
    if (!res.ok) throw new Error(`defaults read failed (${res.status})`);
    const clean = cleanDefaults(await res.json(), catalog);
    store.set(DEFAULTS_CACHE, clean); store.setDefaults(clean);
    return { ok: true, count: Object.keys(clean).length };
  } catch (e) { log.warn('app-defaults', 'server defaults not refreshed', { message: e && e.message }); return { ok: false, count: 0 }; }
  finally { clearTimeout(timer); }
}
