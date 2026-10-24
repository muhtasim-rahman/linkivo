/**
 * Linkivo — js/features/export/formats/common.js  (v2.2.0)
 * Purpose: what every export format shares: the field list, selecting and ordering items, grouping, date formats, escaping, and a
 *          cooperative yield so a 10,000-link export never freezes the page.
 * Item (built by export-engine.js): { id, title, url, host, desc, kw, tags, folder, fid, added, points, fv, rl, bl, pn }
 * API: FIELDS  fieldOptions()  selectItems(items, opts)  groupItems(items, mode) -> [{ name, items }]  fmtDate(ts, style)
 *      esc.html(s)  esc.xml(s)  esc.csv(s, delim)  esc.md(s)  guardCell(s)  yieldNow()  commonOptions(extra)  fileName(pattern, scope, ext, now)
 */
export const FIELDS = [
  { id: 'title', label: 'Title', get: (i) => i.title || i.host || i.url },
  { id: 'url', label: 'URL', get: (i) => i.url },
  { id: 'domain', label: 'Domain', get: (i) => i.host },
  { id: 'description', label: 'Description', get: (i) => i.desc || '' },
  { id: 'tags', label: 'Tags', get: (i) => i.tags || '' },
  { id: 'folder', label: 'Folder', get: (i) => i.folder || '' },
  { id: 'added', label: 'Added', get: (i) => i.added },
  { id: 'points', label: 'Points', get: (i) => i.points },
  { id: 'favourite', label: 'Favourite', get: (i) => (i.fv ? 'yes' : '') },
  { id: 'readLater', label: 'Read later', get: (i) => (i.rl ? 'yes' : '') }
];
export const fieldOptions = (defaults = ['title', 'url']) => ({ id: 'fields', type: 'multi', label: 'Fields', choices: FIELDS.map((f) => ({ value: f.id, label: f.label })), default: defaults });

export function commonOptions(extra = []) {
  return [
    { id: 'sort', type: 'select', label: 'Sort by', choices: [{ value: 'folder', label: 'Folder order' }, { value: 'added-desc', label: 'Newest first' }, { value: 'added-asc', label: 'Oldest first' }, { value: 'title', label: 'Title' }, { value: 'domain', label: 'Domain' }, { value: 'points', label: 'Points' }], default: 'folder' },
    { id: 'group', type: 'select', label: 'Group by', choices: [{ value: 'folder', label: 'Folder' }, { value: 'domain', label: 'Domain' }, { value: 'none', label: 'No grouping' }], default: 'folder' },
    { id: 'dateFormat', type: 'select', label: 'Date format', choices: [{ value: 'iso', label: '2026-10-23' }, { value: 'long', label: '23 Oct 2026' }, { value: 'full', label: '2026-10-23 14:05' }], default: 'iso' },
    { id: 'skipBlocked', type: 'switch', label: 'Skip blocked links', default: false },
    { id: 'onlyFavourites', type: 'switch', label: 'Only favourites', default: false },
    { id: 'onlyTag', type: 'text', label: 'Only this tag', placeholder: 'tag name', default: '' },
    ...extra
  ];
}

export function selectItems(items, o = {}) {
  let out = items.filter((i) => !(o.skipBlocked && i.bl) && !(o.onlyFavourites && !i.fv));
  const tag = (o.onlyTag || '').trim().toLowerCase();
  if (tag) out = out.filter((i) => (i.tags || '').toLowerCase().split(',').map((t) => t.trim()).includes(tag));
  const by = {
    'added-desc': (a, b) => b.added - a.added, 'added-asc': (a, b) => a.added - b.added,
    title: (a, b) => (a.title || a.url).localeCompare(b.title || b.url), domain: (a, b) => a.host.localeCompare(b.host) || a.added - b.added, points: (a, b) => b.points - a.points
  }[o.sort];
  return by ? [...out].sort(by) : out;
}

export function groupItems(items, mode = 'folder') {
  if (mode === 'none') return [{ name: '', items }];
  const map = new Map();
  for (const i of items) { const k = mode === 'domain' ? i.host : (i.folder || 'Unsorted'); if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
  return [...map].map(([name, list]) => ({ name, items: list }));
}

export function fmtDate(ts, style = 'iso') {
  if (!ts) return '';
  const d = new Date(ts), p = (n) => String(n).padStart(2, '0');
  if (style === 'long') return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const day = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  return style === 'full' ? `${day} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : day;
}

const HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = {
  html: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML[c]),
  xml: (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, (c) => HTML[c]),
  csv: (s, delim = ',') => { const v = String(s ?? ''); return v.includes('"') || v.includes(delim) || /[\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; },
  md: (s) => String(s ?? '').replace(/([\\`*_[\]|<>])/g, '\\$1').replace(/\r?\n/g, ' ')
};
/** Spreadsheet programs run a cell that starts with = + - @ as a formula; a leading apostrophe keeps imported text harmless. */
export const guardCell = (s) => { const v = String(s ?? ''); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };

export const yieldNow = () => new Promise((r) => setTimeout(r, 0));
export async function eachChunked(items, fn, size = 1500) { for (let i = 0; i < items.length; i++) { fn(items[i], i); if (i % size === size - 1) await yieldNow(); } }

export function fileName(pattern, scope, ext, now = Date.now()) {
  const date = fmtDate(now, 'iso');
  const base = (pattern || 'linkivo-{scope}-{date}').replace(/\{scope\}/g, scope || 'library').replace(/\{date\}/g, date).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').slice(0, 100) || 'linkivo-export';
  return `${base}.${ext}`;
}
export const lineEnd = (o) => (o.lineEnding === 'crlf' ? '\r\n' : '\n');
export const textBlob = (s, mime) => new Blob([s], { type: `${mime};charset=utf-8` });
