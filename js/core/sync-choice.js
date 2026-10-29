/**
 * Linkivo — js/core/sync-choice.js  (v2.3.1, storage changed v2.3.2)
 * Purpose: which settings follow the account (owner request: "Select which settings to sync"). Everything syncs EXCEPT the settings the person turned off
 *          in the popup. A few settings are off from the start because they describe THIS device (theme, accent, sidebar): they carry `local: true` in the
 *          catalog. The popup list is built from the catalog every time, so a setting added in a later version is in it automatically (ticked, unless it
 *          says `local: true`).
 *          v2.3.2 (owner: "the sync list itself must sync"): the choice is stored as ONE pref per setting, `sync.c.<id>` = true | false, written only when the person
 *          changes it (no value = the default). These prefs are always part of the synced keys, so a choice made on one device reaches the others, and the
 *          other devices then rebuild their list of synced keys (core/app-data.js). Arrays were too long for the 200-character limit of a synced value.
 * API: choiceKey(entry) -> 'sync.c.<id>'      choiceKeys(catalog) -> string[] (every setting that can be chosen)
 *      isSynced(entry, store) -> boolean      setSynced(entry, on, store)      syncedEntries(catalog, store) -> entries that sync
 *      syncedKeySet(catalog, store) -> string  (stable text of the synced keys, to detect a change)
 *      syncGroups(catalog, sections, store) -> [{ section, entries:[{ entry, on }] }]   (rows with `key` only; custom rows hold no value)
 */
export const choiceKey = (entry) => 'sync.c.' + entry.id;
const choosable = (e) => !!(e && e.key && !e.device);
export const choiceKeys = (catalog) => catalog.filter(choosable).map(choiceKey);

export function isSynced(entry, store) {
  if (!choosable(entry)) return false;                  // `device: true` never syncs (not even offered)
  const v = store.get(choiceKey(entry), undefined);
  if (typeof v === 'boolean') return v;
  return !entry.local;                                  // no choice made: the default
}
export function setSynced(entry, on, store) {
  if (!choosable(entry)) return;
  if (isSynced(entry, store) === !!on && store.get(choiceKey(entry), undefined) === undefined) return;   // same as the default and never chosen: nothing to store
  store.set(choiceKey(entry), !!on);
}
export const syncedEntries = (catalog, store) => catalog.filter((e) => isSynced(e, store));
export const syncedKeySet = (catalog, store) => syncedEntries(catalog, store).map((e) => e.key).sort().join('|');
export function syncGroups(catalog, sections, store) {
  return sections.map((s) => ({ section: s, entries: catalog.filter((e) => e.section === s.id && choosable(e)).map((e) => ({ entry: e, on: isSynced(e, store) })) })).filter((g) => g.entries.length);
}
