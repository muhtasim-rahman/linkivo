/**
 * Linkivo — js/core/sync-choice.js  (v2.3.1)
 * Purpose: which settings follow the account (owner request: "Select which settings to sync"). Everything syncs EXCEPT the settings the person turned off
 *          here. A few settings are off from the start because they describe THIS device (the theme, a phone and a PC often want different looks): they carry
 *          `local: true` in the catalog. The list the popup shows is built from the catalog every time, so a setting added in a later version appears in it
 *          automatically (checked, unless it says `local: true`) and nobody has to remember to register it twice.
 * Storage: local pref `sync.off` = array of catalog ids the person turned OFF, and `sync.on` = array of `local` ids the person turned ON; both only hold CHANGES from
 *          the defaults, so a new setting follows the default without any migration.
 * API: syncedEntries(catalog, store) -> entries that sync     isSynced(entry, store) -> boolean     setSynced(entry, on, store)
 *      syncGroups(catalog, sections, store) -> [{ section, entries:[{ entry, on }] }]   (rows with `key` only; custom rows hold no value)
 */
const OFF = 'sync.off', ON = 'sync.on';
const list = (store, k) => { const v = store.get(k, []); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; };

export function isSynced(entry, store) {
  if (!entry || !entry.key || entry.device) return false;      // `device: true` never syncs (not even offered)
  if (list(store, OFF).includes(entry.id)) return false;
  if (entry.local) return list(store, ON).includes(entry.id);
  return true;
}
export function setSynced(entry, on, store) {
  const off = new Set(list(store, OFF)), onSet = new Set(list(store, ON));
  if (entry.local) { if (on) onSet.add(entry.id); else onSet.delete(entry.id); off.delete(entry.id); }
  else { if (on) off.delete(entry.id); else off.add(entry.id); onSet.delete(entry.id); }
  store.set(OFF, [...off]); store.set(ON, [...onSet]);
}
export const syncedEntries = (catalog, store) => catalog.filter((e) => isSynced(e, store));
export function syncGroups(catalog, sections, store) {
  return sections.map((s) => ({ section: s, entries: catalog.filter((e) => e.section === s.id && e.key && !e.device).map((e) => ({ entry: e, on: isSynced(e, store) })) })).filter((g) => g.entries.length);
}
