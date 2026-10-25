/**
 * Linkivo — js/features/export/export-engine.js  (v2.2.0)
 * Purpose: turns a scope ("whole library", selected folders, selected links, Favourites) into export items from the engine's in-memory
 *          index (so it works offline and for guests), then builds the chosen format. The Recycle Bin is never exported; vault data is
 *          not part of v2.2.0 (the vault arrives in v2.5.0).
 * Scope: { type: 'all' | 'folders' | 'links' | 'favourites', fids?: string[], lids?: string[] }
 * API: previewHtml({ engine, scope, formatId, options }) -> Promise<string|null>  (v2.2.1: the designed page formats show a live miniature)
 *      collect(engine, scope) -> { folders, links, items, label }     runExport({ engine, scope, formatId, options, app, now }) -> Promise<{ blob, name, count, size, text? }>
 *      previewExport({ engine, scope, formatId, options }) -> Promise<string>      NATIVE_ID
 */
import { buildBackup } from './native-format.js';
import { getFormat } from './formats/index.js';
import { fileName } from './formats/common.js';

export const NATIVE_ID = 'linkivo';
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function collect(engine, scope = { type: 'all' }) {
  const folders = engine.listFolders();
  const order = new Map(folders.map((f, i) => [f.id, i]));
  let links = engine.listLinks();
  let label = 'library';
  if (scope.type === 'folders') { const set = new Set(scope.fids || []); links = links.filter((l) => set.has(l.fid)); label = set.size === 1 ? slug(engine.getFolder([...set][0])?.name) || 'folder' : 'folders'; }
  else if (scope.type === 'links') { const set = new Set(scope.lids || []); links = links.filter((l) => set.has(l.id)); label = 'selected'; }
  else if (scope.type === 'favourites') { links = links.filter((l) => l.fv); label = 'favourites'; }
  links = [...links].sort((a, b) => (order.get(a.fid) ?? 1e9) - (order.get(b.fid) ?? 1e9) || a.ts - b.ts);
  const used = new Set(links.map((l) => l.fid));
  const outFolders = scope.type === 'all' ? folders : folders.filter((f) => used.has(f.id) || (scope.type === 'folders' && (scope.fids || []).includes(f.id)));
  const name = (fid) => engine.getFolder(fid)?.name || '';
  const items = links.map((l) => ({ id: l.id, title: l.title || '', url: l.url, host: l.host || '', desc: l.desc || '', kw: l.kw || '', tags: l.tags || '', folder: name(l.fid), fid: l.fid, added: l.ts, points: l.pt ?? 100, fv: !!l.fv, rl: !!l.rl, bl: !!l.bl, pn: !!l.pn }));
  return { folders: outFolders, links, items, label };
}

export async function runExport({ engine, scope, formatId, options = {}, app = '', now = Date.now() }) {
  const { folders, links, items, label } = collect(engine, scope);
  if (formatId === NATIVE_ID) {
    const backup = buildBackup({ folders, links, source: engine.kind === 'guest' ? 'guest' : 'account', app, now });
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    return { blob, name: fileName(options.fileName, label, 'linkivo.json', now), count: links.length, size: blob.size, folders: folders.length };
  }
  const fmt = getFormat(formatId);
  if (!fmt) throw new Error('Unknown export format');
  const blob = await fmt.build(items, options, { label, now });
  const out = { blob, name: fileName(options.fileName, label, fmt.ext, now), count: items.length, size: blob.size, folders: folders.length };
  if (fmt.text) out.text = () => blob.text();
  return out;
}

export async function previewExport({ engine, scope, formatId, options = {} }) {
  const { items, folders, links } = collect(engine, scope);
  if (formatId === NATIVE_ID) return `Linkivo backup\n${folders.length} folders, ${links.length} links\nFolders, points, flags and tags are kept. Import it again from the Import page.`;
  const fmt = getFormat(formatId);
  return fmt ? fmt.preview(items, options, { label: collect(engine, scope).label }) : '';
}

/** v2.2.1: the HTML of a small live preview for the designed page formats; null for every other format. */
export async function previewHtml({ engine, scope, formatId, options = {} }) {
  const fmt = getFormat(formatId);
  if (!fmt || !fmt.previewHtml) return null;
  const { items, label } = collect(engine, scope);
  return fmt.previewHtml(items, options, { label });
}
