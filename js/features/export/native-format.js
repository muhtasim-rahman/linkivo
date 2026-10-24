/**
 * Linkivo — js/features/export/native-format.js  (v2.2.0)
 * Purpose: the Linkivo backup (.linkivo.json, ARCHITECTURE section 6b): build it from the engine's records, and recognise, validate and
 *          migrate it on the way back in. The importer in features/import/native-import.js uses validateBackup().
 *          Internal fields (imp, del, ls, ds, pw, tEdit) are not exported. `linkMeta` and `history` are part of the format but stay empty until
 *          v2.3.0 / v2.4.0 give the engine those trees; `settings` holds non-sensitive preferences only; `vault` only when asked for (v2.5.0).
 * API: FORMAT_NAME FORMAT_VERSION buildBackup({ folders, links, source, app, now, linkMeta, history, settings }) -> object
 *      isBackup(obj) -> boolean   validateBackup(obj) -> { ok, error?, backup }   (migrates older formatVersion values)
 */
export const FORMAT_NAME = 'linkivo-backup';
export const FORMAT_VERSION = 1;
const LINK_FIELDS = ['fid', 'url', 'host', 'title', 'desc', 'kw', 'pt', 'oc', 'lo', 'pn', 'fv', 'bl', 'rl', 'dd', 'tags', 'ts', 'up'];
const FOLDER_FIELDS = ['name', 'color', 'icon', 'order', 'pinned', 'ts', 'up'];
const pick = (rec, keys) => { const o = { id: rec.id }; for (const k of keys) if (rec[k] !== undefined && rec[k] !== null) o[k] = rec[k]; return o; };

export function buildBackup({ folders, links, source = 'account', app = '', now = Date.now(), linkMeta = [], history = [], settings = {} }) {
  return {
    format: FORMAT_NAME, formatVersion: FORMAT_VERSION, app, exportedAt: now, source,
    counts: { folders: folders.length, links: links.length, history: history.length },
    folders: folders.map((f) => pick(f, FOLDER_FIELDS)), links: links.map((l) => pick(l, LINK_FIELDS)), linkMeta, history, settings
  };
}

export const isBackup = (o) => !!o && typeof o === 'object' && o.format === FORMAT_NAME;

/** Migrations: when formatVersion 2 exists, add `if (v === 1) { ...; v = 2; }` here so old files keep importing. */
function migrate(o) { let v = o.formatVersion || 1; const out = { ...o }; void v; out.formatVersion = FORMAT_VERSION; return out; }

export function validateBackup(o) {
  if (!isBackup(o)) return { ok: false, error: 'This is not a Linkivo backup file.' };
  if (!Number.isInteger(o.formatVersion) || o.formatVersion < 1) return { ok: false, error: 'The backup has no valid format version.' };
  if (o.formatVersion > FORMAT_VERSION) return { ok: false, error: `This backup was made by a newer version of Linkivo (format ${o.formatVersion}). Update the app and try again.` };
  if (!Array.isArray(o.folders) || !Array.isArray(o.links)) return { ok: false, error: 'The backup is missing its folders or links.' };
  const m = migrate(o);
  const folders = m.folders.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string' && f.name.trim());
  const ids = new Set(folders.map((f) => f.id));
  const links = m.links.filter((l) => l && typeof l.url === 'string' && typeof l.fid === 'string' && ids.has(l.fid));
  return { ok: true, backup: { ...m, folders, links, dropped: { folders: m.folders.length - folders.length, links: m.links.length - links.length } } };
}
