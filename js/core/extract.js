/**
 * Linkivo — js/core/extract.js  (v2.2.0)
 * Purpose: finds every link in free text (ARCHITECTURE section 6, step 2). Works on plain text, Markdown, HTML, JSON, CSV and
 *          mixes of them: links glued to punctuation or to each other, links separated only by a space, Markdown links,
 *          HTML anchors (their text becomes the title), JSON-escaped slashes. Emails and file names are never links.
 *          Pure and dependency-free, so it runs inside the parse worker and in unit tests.
 * API: extractLinks(text, { bare=false }) -> [{ url, title? }]  (document order, duplicates kept; de-duplication is the caller's job)
 *      decodeEntities(s)   stripTags(s)   BARE_TLDS
 */
import { parseUrl } from './url-tools.js';

// Top-level domains accepted for links WITHOUT a scheme ("example.com/page"). A short allow-list keeps file names (a.js, notes.txt) out.
export const BARE_TLDS = new Set(('com org net edu gov mil int info biz io co me app dev ai tv fm gg ly sh xyz online site tech store shop blog news live link page wiki cloud design studio agency ' +
  'bd in uk us ca au de fr es it nl se no dk fi pl cz ch at be ie pt gr tr ru ua jp kr cn hk sg my id th vn ph pk lk np ae sa qa kw il eg za ng ke br mx ar cl co nz eu asia pro name mobi top club vip ' +
  'tk ml ga cf gq to cc ws is la im so gl').split(' '));

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
export function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);|&#(\d+);|&#x([0-9a-f]+);/gi, (m, n, dec, hex) => {
    if (ENT[m.toLowerCase()]) return ENT[m.toLowerCase()];
    const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : NaN;
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
  });
}
export const stripTags = (s) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const TRAIL = /[.,;:!?'"\u2019\u201d>\]}*_~`|\\]+$/;
/** Removes trailing punctuation and closing brackets that have no opening partner inside the link. */
function trimLink(raw) {
  let s = raw;
  for (let guard = 0; guard < 8; guard++) {
    const before = s;
    s = s.replace(TRAIL, '');
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
      while (s.endsWith(close) && s.split(close).length > s.split(open).length) s = s.slice(0, -1);
    }
    if (s === before) break;
  }
  return s;
}

function accept(candidate, { bare = false } = {}) {
  let s = trimLink(candidate.trim());
  if (!s) return null;
  if (/^www\./i.test(s) || (bare && !/^[a-z][a-z0-9+.-]*:/i.test(s))) s = 'https://' + s;
  const u = parseUrl(s);
  return u ? s : null;
}

const MD_LINK = /!?\[([^\]\n]{0,300})\]\(\s*<?((?:[^()\s<>]|\([^()\s]*\))+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const HTML_A = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
const HTML_HREF = /\b(?:href|src|data-url|content)\s*=\s*(?:"(https?:\/\/[^"]*)"|'(https?:\/\/[^']*)')/gi;
const PLAIN = /(?:https?:\/\/|www\.)[^\s<>"'`\u0000-\u001f\u007f-\u009f]+/gi;
const BARE = /(?<![@\w./:%+-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+([a-z]{2,24})(?::\d{2,5})?(?:[/?#][^\s<>"'`]*)?(?![\p{L}\p{N}@-])/giu;
// Words that look like domains but are almost always file names or code (md = Moldova, sh = Saint Helena, ...).
const NOT_BARE = new Set(['md', 'sh', 'py', 'rs', 'pl', 'cs', 'so', 'zip', 'mov', 'pm']);

export function extractLinks(input, { bare = false } = {}) {
  if (typeof input !== 'string' || !input) return [];
  let text = input.includes('\\/') ? input.replace(/\\\//g, '/') : input;
  const found = []; // { at, url, title }
  const blank = (start, end) => { text = text.slice(0, start) + ' '.repeat(end - start) + text.slice(end); };
  const add = (at, raw, title) => { const url = accept(decodeEntities(raw), { bare: false }); if (url) found.push({ at, url, title: title && title !== url ? title.slice(0, 300) : undefined }); return !!url; };

  // 1. HTML anchors: the link text is a title worth keeping
  for (const m of [...text.matchAll(HTML_A)]) { if (add(m.index, m[1] ?? m[2] ?? m[3] ?? '', stripTags(m[4] || ''))) blank(m.index, m.index + m[0].length); }
  // 2. Markdown links and images
  for (const m of [...text.matchAll(MD_LINK)]) { if (add(m.index, m[2], m[0].startsWith('!') ? '' : decodeEntities(m[1]).trim())) blank(m.index, m.index + m[0].length); }
  // 3. other attributes that hold a full address (src, data-url, content)
  for (const m of [...text.matchAll(HTML_HREF)]) { if (add(m.index, m[1] ?? m[2], '')) blank(m.index, m.index + m[0].length); }
  // 4. plain addresses; two addresses glued together are split at the second scheme
  for (const m of [...text.matchAll(PLAIN)]) {
    const parts = m[0].split(/(?<=.)(?=https?:\/\/)/i);
    let off = 0;
    for (const part of parts) { add(m.index + off, part, ''); off += part.length; }
  }
  // 5. optional: bare domains without a scheme
  if (bare) {
    const rest = text.replace(PLAIN, (x) => ' '.repeat(x.length));
    for (const m of [...rest.matchAll(BARE)]) {
      const tld = m[1].toLowerCase();
      if (!BARE_TLDS.has(tld) || NOT_BARE.has(tld)) continue;
      const url = accept(m[0], { bare: true });
      if (url) found.push({ at: m.index, url, title: undefined });
    }
  }
  found.sort((a, b) => a.at - b.at);
  return found.map(({ url, title }) => (title ? { url, title } : { url }));
}
