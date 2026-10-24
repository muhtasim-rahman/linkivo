/**
 * Linkivo — js/features/import/parsers.js  (v2.2.0)
 * Purpose: turns an uploaded file or pasted text into links. One shared module used by the parse Web Worker (so big files never freeze the
 *          page) and by the tests. Plain-text formats are read directly; ZIP-based formats (DOCX, PPTX, XLSX, XLSM, ODT, ODS) and PDF are read
 *          without third-party libraries (zip-reader.js, pdf-text.js).
 *          NOT supported (clear message, never a crash): old binary Excel (.xls), archives, images and other binary files.
 * API: FORMATS (list for the picker: { id, label, exts, popular })   detectFormat(name, bytes) -> id|'unsupported'
 *      parseText(text, { bare }) -> [{url, title?}]       parseFile({ name, bytes }, { bare }) -> Promise<{ format, links, warnings }>
 *      decodeText(bytes) -> string
 */
import { extractLinks, decodeEntities, stripTags } from '../../core/extract.js';
import { readZipEntries } from './zip-reader.js';
import { pdfToText } from './pdf-text.js';

const F = (id, label, exts, popular = false) => ({ id, label, exts, popular });
export const FORMATS = [
  F('txt', 'Text', ['txt', 'text'], true), F('html', 'HTML bookmarks', ['html', 'htm'], true), F('json', 'JSON', ['json'], true), F('csv', 'CSV', ['csv'], true),
  F('xlsx', 'Excel', ['xlsx'], true), F('pdf', 'PDF', ['pdf'], true), F('docx', 'Word', ['docx'], true),
  F('md', 'Markdown', ['md', 'markdown']), F('rtf', 'RTF', ['rtf']), F('tsv', 'TSV', ['tsv', 'tab']), F('ods', 'ODS sheet', ['ods']), F('odt', 'ODT document', ['odt']),
  F('pptx', 'PowerPoint', ['pptx']), F('xml', 'XML and OPML', ['xml', 'opml']), F('yaml', 'YAML', ['yaml', 'yml']), F('ini', 'INI', ['ini', 'cfg', 'conf']), F('log', 'Log', ['log']),
  F('eml', 'Email (EML)', ['eml']), F('url', 'URL and WEBLOC shortcuts', ['url', 'webloc']), F('jsonl', 'JSON lines', ['jsonl', 'ndjson']), F('xlsm', 'Excel macro file', ['xlsm']), F('xhtml', 'XHTML', ['xhtml'])
];
const EXT = new Map(FORMATS.flatMap((f) => f.exts.map((e) => [e, f.id])));
const BLOCKED = new Set(['xls', 'zip', 'rar', '7z', 'gz', 'tar', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'mp3', 'mp4', 'mov', 'avi', 'exe', 'dll', 'apk', 'doc', 'ppt']);

export function decodeText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}
const looksBinary = (bytes) => { const n = Math.min(bytes.length, 4096); for (let i = 0; i < n; i++) if (bytes[i] === 0) return true; return false; };

export function detectFormat(name = '', bytes = new Uint8Array(0)) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
  if (BLOCKED.has(ext)) return 'unsupported';
  if (EXT.has(ext)) return EXT.get(ext);
  if (bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b) return 'unsupported'; // an unknown ZIP
  return looksBinary(bytes) ? 'unsupported' : 'txt';
}

// ---- delimited text -----------------------------------------------------------------------------------------------------
export function parseDelimited(text, delim) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function csvLinks(text, delim, bare) {
  const rows = parseDelimited(text, delim);
  const head = (rows[0] || []).map((c) => c.trim().toLowerCase());
  const u = head.findIndex((c) => ['url', 'link', 'href', 'address', 'website', 'uri'].includes(c));
  if (u < 0) return extractLinks(text, { bare });
  const t = head.findIndex((c) => ['title', 'name', 'label', 'text', 'description'].includes(c));
  const out = [];
  for (const r of rows.slice(1)) {
    const hit = extractLinks(r[u] || '', { bare: true })[0];
    if (hit) out.push(t >= 0 && r[t] && r[t].trim() ? { url: hit.url, title: r[t].trim().slice(0, 300) } : { url: hit.url });
  }
  return out;
}

// ---- JSON ---------------------------------------------------------------------------------------------------------------
const URL_KEYS = ['url', 'href', 'link', 'uri', 'address'], TITLE_KEYS = ['title', 'name', 'label', 'text'];
function walk(v, out, bare, depth = 0) {
  if (depth > 40 || v == null) return;
  if (typeof v === 'string') { out.push(...extractLinks(v, { bare })); return; }
  if (Array.isArray(v)) { for (const x of v) walk(x, out, bare, depth + 1); return; }
  if (typeof v !== 'object') return;
  const uk = URL_KEYS.find((k) => typeof v[k] === 'string' && extractLinks(v[k], { bare: true }).length);
  const tk = TITLE_KEYS.find((k) => typeof v[k] === 'string' && v[k].trim());
  if (uk) { const hit = extractLinks(v[uk], { bare: true })[0]; out.push(tk ? { url: hit.url, title: v[tk].trim().slice(0, 300) } : { url: hit.url }); }
  for (const [k, x] of Object.entries(v)) if (k !== uk && k !== tk) walk(x, out, bare, depth + 1);
}
function jsonLinks(text, bare, lines) {
  try {
    if (lines) { const out = []; for (const ln of text.split(/\r?\n/)) { if (!ln.trim()) continue; try { walk(JSON.parse(ln), out, bare); } catch { out.push(...extractLinks(ln, { bare })); } } return out; }
    const out = []; walk(JSON.parse(text), out, bare); return out;
  } catch { return extractLinks(text, { bare }); }
}

// ---- other text formats -------------------------------------------------------------------------------------------------
function opmlLinks(text, bare) {
  const out = [];
  for (const m of text.matchAll(/<outline\b([^>]*)>/gi)) {
    const attr = (n) => { const a = new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(m[1]); return a ? decodeEntities(a[1] ?? a[2]) : ''; };
    const url = attr('htmlUrl') || attr('url') || attr('xmlUrl');
    const hit = url && extractLinks(url, { bare: true })[0];
    if (hit) { const title = (attr('title') || attr('text')).trim(); out.push(title ? { url: hit.url, title: title.slice(0, 300) } : { url: hit.url }); }
  }
  return out.length ? out : extractLinks(text, { bare });
}
function emlText(text) {
  let t = text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  for (const m of text.matchAll(/Content-Transfer-Encoding:\s*base64[\s\S]*?\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/gi)) { try { t += '\n' + atob(m[1].replace(/\s+/g, '')); } catch { /* not valid base64 */ } }
  return t;
}
const rtfText = (t) => t.replace(/\\'[0-9a-f]{2}/gi, ' ').replace(/\\[a-z]+-?\d* ?/gi, ' ').replace(/[{}]/g, ' ');
const dropScripts = (t) => t.replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

export function parseText(text, { bare = false, format = 'txt' } = {}) {
  switch (format) {
    case 'html': case 'xhtml': return extractLinks(dropScripts(text), { bare });
    case 'json': return jsonLinks(text, bare, false);
    case 'jsonl': return jsonLinks(text, bare, true);
    case 'csv': return csvLinks(text, ',', bare);
    case 'tsv': return csvLinks(text, '\t', bare);
    case 'xml': return opmlLinks(text, bare);
    case 'eml': return extractLinks(emlText(text), { bare });
    case 'rtf': return extractLinks(rtfText(text), { bare });
    default: return extractLinks(text, { bare });
  }
}

// ---- ZIP based office formats -------------------------------------------------------------------------------------------
const ZIP_FILTER = { docx: /^word\/.*\.(xml|rels)$/, pptx: /^ppt\/.*\.(xml|rels)$/, xlsx: /^xl\/.*\.(xml|rels)$/, xlsm: /^xl\/.*\.(xml|rels)$/, odt: /^(content|styles)\.xml$/, ods: /^(content|styles)\.xml$/ };
const visible = (xml) => decodeEntities(xml.replace(/<\/(?:w:p|a:p|text:p|text:h|si|row|table:table-row)>/g, '\n').replace(/<\/(?:c|table:table-cell|w:tab)>|<w:tab\/>/g, ' ').replace(/<[^>]*>/g, ''));
async function zipLinks(bytes, format, bare) {
  const entries = await readZipEntries(bytes, { filter: (n) => ZIP_FILTER[format].test(n) && !/theme|fontTable|settings|styles|numbering/.test(n) });
  const out = []; const td = new TextDecoder();
  for (const [name, data] of entries) {
    const xml = td.decode(data);
    if (name.endsWith('.rels')) { for (const m of xml.matchAll(/Target\s*=\s*"(https?:[^"]+)"/gi)) out.push(...extractLinks(decodeEntities(m[1]), { bare: false })); continue; }
    out.push(...extractLinks(xml, { bare: false }).filter((l) => !/schemas\.openxmlformats\.org|schemas\.microsoft\.com|purl\.org|w3\.org|openoffice\.org|opendocument/i.test(l.url)));
    out.push(...extractLinks(visible(xml), { bare }));
  }
  return out;
}

export async function parseFile({ name, bytes }, { bare = false } = {}) {
  const format = detectFormat(name, bytes);
  const warnings = [];
  if (format === 'unsupported') {
    const ext = (name.split('.').pop() || '').toLowerCase();
    warnings.push(ext === 'xls' ? `${name}: old Excel (.xls) files are not supported. Save the sheet as .xlsx and add it again.` : `${name}: this file type is not supported.`);
    return { format, links: [], warnings };
  }
  try {
    let links;
    if (format === 'pdf') links = parseText(await pdfToText(bytes), { bare });
    else if (ZIP_FILTER[format]) links = await zipLinks(bytes, format, bare);
    else links = parseText(decodeText(bytes), { bare, format });
    return { format, links, warnings };
  } catch (e) {
    warnings.push(`${name}: could not be read (${e && e.message ? e.message : 'unknown error'}).`);
    return { format, links: [], warnings };
  }
}
