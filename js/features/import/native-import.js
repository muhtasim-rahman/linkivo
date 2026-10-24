/**
 * Linkivo — js/features/import/native-import.js  (v2.2.0)
 * Purpose: the FAST PATH of the Import popup (ARCHITECTURE section 6b): a .linkivo.json backup is recognised, validated and turned into a restore
 *          plan without URL extraction and without any network metadata fetch. Every id is remapped to a new id; original creation times,
 *          points, tags and flags are kept. The plan is then written by the normal import job (chunks of 100, parallel, pause, stop, Undo).
 * Duplicate policy (same normalized URL): 'skip' | 'both' | 'update' (copy the backup's fields onto the existing link).
 * Folder mode: 'merge' (reuse a folder with the same name, case-insensitive) | 'new' (always create new folders).
 * API: readBackupText(text) -> { ok, backup, error }   describeBackup(backup) -> summary   planRestore(engine, backup, { folderMode, duplicates }) -> Promise<plan>
 *      plan = { items, updates, folderIds, createdFolders, skipped }
 */
import { validateBackup } from '../export/native-format.js';
import { newId } from '../../core/utils.js';
import { dedupeKey } from '../../core/url-tools.js';

export function readBackupText(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  return validateBackup(obj);
}

export function describeBackup(b) {
  const tags = new Set();
  for (const l of b.links) for (const t of String(l.tags || '').split(',')) if (t.trim()) tags.add(t.trim().toLowerCase());
  return { exportedAt: b.exportedAt, app: b.app || 'unknown', source: b.source || 'account', folders: b.folders.length, links: b.links.length, tags: tags.size, history: (b.history || []).length, dropped: b.dropped };
}

const RESTORE_FIELDS = ['url', 'host', 'title', 'desc', 'kw', 'pt', 'oc', 'lo', 'pn', 'fv', 'bl', 'rl', 'dd', 'tags', 'ts'];

export async function planRestore(engine, backup, { folderMode = 'merge', duplicates = 'skip' } = {}) {
  const t = engine.now();
  const byName = new Map(engine.listFolders().map((f) => [f.name.trim().toLowerCase(), f.id]));
  const folderMap = new Map(); const createdFolders = [];
  for (const f of backup.folders) {
    const key = f.name.trim().toLowerCase();
    if (folderMode === 'merge' && byName.has(key)) { folderMap.set(f.id, byName.get(key)); continue; }
    const rec = await engine.createFolder({ name: f.name, color: f.color, icon: f.icon, order: f.order, pinned: f.pinned === true, ts: f.ts });
    folderMap.set(f.id, rec.id); createdFolders.push(rec.id);
    if (folderMode === 'merge') byName.set(key, rec.id);
  }
  const items = [], updates = []; let skipped = 0;
  const seen = new Set();
  for (const l of backup.links) {
    const fid = folderMap.get(l.fid);
    if (!fid) continue;
    const key = dedupeKey(l.url);
    const fields = {}; for (const k of RESTORE_FIELDS) if (l[k] !== undefined && l[k] !== null) fields[k] = l[k];
    if (key && duplicates !== 'both') {
      const existing = engine.findByUrl(l.url);
      if (existing) { if (duplicates === 'update') { const { url, ts, ...patch } = fields; updates.push({ id: existing.id, patch }); } else skipped++; continue; }
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
    }
    items.push({ id: newId(t), fid, ...fields });
  }
  return { items, updates, folderIds: [...new Set(folderMap.values())], createdFolders, skipped };
}
