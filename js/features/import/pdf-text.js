/**
 * Linkivo — js/features/import/pdf-text.js  (v2.2.0)
 * Purpose: best-effort link finder for PDF files with NO library. It reads clickable link annotations (/URI) and the plain text of
 *          page content streams (Tj / TJ operators) after expanding Flate streams with the browser's DecompressionStream.
 *          Limits (honest): text in fonts that use encoded glyph ids (hex strings) yields no text; clickable links are still found.
 *          Encrypted PDFs are not readable. A full PDF library can replace this later without changing the interface.
 * API: pdfToText(bytes: Uint8Array) -> Promise<string>   (link annotations first, then page text, one item per line)
 */
import { inflateZlib } from './zip-reader.js';

const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
function unescapePdf(s) {
  return s.replace(/\\([0-7]{1,3}|[\s\S])/g, (m, c) => {
    if (/^[0-7]+$/.test(c)) return String.fromCharCode(parseInt(c, 8) & 255);
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[c] ?? c;
  });
}
const URI_RE = /\/URI\s*\(((?:\\[\s\S]|[^\\)])*)\)/g;
const TJ_RE = /\[((?:\\[\s\S]|[^\]\\])*)\]\s*TJ|\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj/g;
const STR_RE = /\(((?:\\[\s\S]|[^\\)])*)\)|(-?\d+(?:\.\d+)?)/g;

function scan(chunk, uris, lines) {
  for (const m of chunk.matchAll(URI_RE)) uris.push(unescapePdf(m[1]));
  for (const m of chunk.matchAll(TJ_RE)) {
    if (m[2] != null) { lines.push(unescapePdf(m[2])); continue; }
    let line = '';
    for (const p of m[1].matchAll(STR_RE)) { if (p[1] != null) line += unescapePdf(p[1]); else if (Number(p[2]) < -250) line += ' '; }
    lines.push(line);
  }
}

export async function pdfToText(bytes) {
  const raw = latin1(bytes);
  if (/\/Encrypt\b/.test(raw.slice(-2048)) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(raw.slice(-4096))) throw new Error('This PDF is encrypted');
  const uris = [], lines = [];
  scan(raw, uris, lines); // uncompressed objects and annotations
  const STREAM = /stream\r?\n/g;
  let n = 0, total = 0;
  for (let m; (m = STREAM.exec(raw)) && n < 4000;) {
    const dictStart = raw.lastIndexOf('<<', m.index);
    const dict = dictStart >= 0 ? raw.slice(dictStart, m.index) : '';
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    STREAM.lastIndex = end;
    if (!/\/FlateDecode/.test(dict) || /\/(Image|XObject)\b.*\/Subtype\s*\/Image|\/Subtype\s*\/Image/.test(dict)) continue;
    n++;
    try {
      // use the declared /Length when it is a plain number, otherwise drop the line break before "endstream" (extra bytes break inflate)
      const L = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      let to = L && start + Number(L[1]) <= end ? start + Number(L[1]) : end;
      if (!L) { if (bytes[to - 1] === 0x0a) to--; if (bytes[to - 1] === 0x0d) to--; }
      const data = await inflateZlib(bytes.subarray(start, to), 8e6);
      total += data.length; if (total > 40e6) break;
      scan(latin1(data), uris, lines);
    } catch { /* a stream that does not inflate is skipped */ }
  }
  return [...new Set(uris)].join('\n') + '\n' + lines.join('\n');
}
