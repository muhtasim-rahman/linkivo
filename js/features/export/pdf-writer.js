/**
 * Linkivo — js/features/export/pdf-writer.js  (v2.5.3)
 * Purpose: a small PDF 1.4 writer with no library (RULES: no runtime dependencies). Text uses the built-in Helvetica fonts (WinAnsi), links are real clickable annotations, images are
 *          8-bit grey pictures (used for non-Latin text, see formats/pdf.js). Everything is built in memory as bytes.
 * API: PdfDoc({ w, h })  .newPage()  .text(x, y, s, size, { bold, color })  .rule(x1, y, x2, width, color)  .link(x, y, w, h, uri)  .addImage({ w, h, data }) -> id   .image(id, x, y, w, h)
 *      .build({ title, now }) -> Promise<Uint8Array>      textWidth(s, size, bold) -> points      isLatin(s) -> boolean (every character is in Latin-1)      wrap(s, size, maxW, bold) -> [lines]
 *      PAGE: A4, LETTER (points)
 */
export const PAGE = { A4: { w: 595.28, h: 841.89 }, LETTER: { w: 612, h: 792 } };

// Helvetica advance widths for ASCII 32..126 (units per 1000 em, the standard AFM values); anything else counts as 556. Bold is wider: the factor keeps lines inside their box.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
export const textWidth = (s, size, bold = false) => { let u = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); u += c >= 32 && c <= 126 ? W[c - 32] : 556; } return (u / 1000) * size * (bold ? 1.07 : 1); };
export const isLatin = (s) => { for (const ch of String(s)) if (ch.codePointAt(0) > 255) return false; return true; };

/** Greedy word wrap by width; a single word wider than the box is cut. */
export function wrap(s, size, maxW, bold = false) {
  const out = []; let line = '';
  for (const word of String(s).split(/\s+/).filter(Boolean)) {
    let w = word;
    while (textWidth(w, size, bold) > maxW) { let n = w.length; while (n > 1 && textWidth(w.slice(0, n), size, bold) > maxW) n--; if (line) { out.push(line); line = ''; } out.push(w.slice(0, n)); w = w.slice(n); }
    const t = line ? `${line} ${w}` : w;
    if (textWidth(t, size, bold) <= maxW) line = t; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

const enc = new TextEncoder();
const num = (n) => (Math.round(n * 100) / 100).toString();
const esc = (s) => String(s).replace(/[\u0000-\u001f]/g, ' ').replace(/[\\()]/g, (c) => '\\' + c);
const latin1 = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[i] = c > 255 ? 63 : c; } return b; };
const hex16 = (s) => { let o = 'FEFF'; for (let i = 0; i < s.length; i++) o += s.charCodeAt(i).toString(16).padStart(4, '0'); return `<${o}>`; };   // a text string as UTF-16 (document title)
const rgb = (c) => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;
async function deflate(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try { const cs = new CompressionStream('deflate'); const w = cs.writable.getWriter(); w.write(bytes); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); } catch { return null; }
}

export class PdfDoc {
  constructor({ w = PAGE.A4.w, h = PAGE.A4.h } = {}) { this.w = w; this.h = h; this.pages = []; this.images = []; this.newPage(); }
  newPage() { this.cur = { ops: [], annots: [], imgs: new Set() }; this.pages.push(this.cur); return this.cur; }
  text(x, y, s, size, { bold = false, color = [0, 0, 0] } = {}) { if (s === '' || s == null) return; this.cur.ops.push(`BT /F${bold ? 2 : 1} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(y)} Td (${esc(s)}) Tj ET`); }
  rule(x1, y, x2, width = 0.5, color = [0.85, 0.85, 0.85]) { this.cur.ops.push(`${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`); }
  link(x, y, w, h, uri) { if (/^https?:\/\//i.test(uri)) this.cur.annots.push({ x, y, w, h, uri: String(uri).replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c)) }); }
  addImage({ w, h, data }) { this.images.push({ w, h, data }); return this.images.length; }
  image(id, x, y, w, h) { this.cur.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(y)} cm /Im${id} Do Q`); this.cur.imgs.add(id); }

  async build({ title = 'Linkivo', now = Date.now() } = {}) {
    const chunks = []; let pos = 0; const offsets = [];
    const put = (b) => { const u = typeof b === 'string' ? latin1(b) : b; chunks.push(u); pos += u.length; };
    const begin = (id) => { offsets[id] = pos; put(`${id} 0 obj\n`); };
    // fixed ids: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info; images next; then per page: content, page, annotations
    let next = 6;
    const imgIds = this.images.map(() => next++);
    const pageIds = this.pages.map(() => ({ content: next++, page: next++, annots: [] }));
    this.pages.forEach((p, i) => { for (let k = 0; k < p.annots.length; k++) pageIds[i].annots.push(next++); });
    const last = next - 1;
    put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    begin(1); put('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    begin(2); put(`<< /Type /Pages /Kids [${pageIds.map((p) => `${p.page} 0 R`).join(' ')}] /Count ${this.pages.length} >>\nendobj\n`);
    begin(3); put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');
    begin(4); put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n');
    const d = new Date(now), p2 = (n) => String(n).padStart(2, '0');
    begin(5); put(`<< /Title ${hex16(title)} /Producer (Linkivo) /CreationDate (D:${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z) >>\nendobj\n`);
    for (let i = 0; i < this.images.length; i++) {
      const im = this.images[i], z = await deflate(im.data), body = z || im.data;
      begin(imgIds[i]); put(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8${z ? ' /Filter /FlateDecode' : ''} /Length ${body.length} >>\nstream\n`); put(body); put('\nendstream\nendobj\n');
    }
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i], ids = pageIds[i], content = enc.encode(p.ops.join('\n')), z = await deflate(content), body = z || content;
      begin(ids.content); put(`<< /Length ${body.length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`); put(body); put('\nendstream\nendobj\n');
      const xo = [...p.imgs].map((n) => `/Im${n} ${imgIds[n - 1]} 0 R`).join(' ');
      begin(ids.page); put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.w)} ${num(this.h)}] /Contents ${ids.content} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xo ? ` /XObject << ${xo} >>` : ''} >>${ids.annots.length ? ` /Annots [${ids.annots.map((a) => `${a} 0 R`).join(' ')}]` : ''} >>\nendobj\n`);
      p.annots.forEach((a, k) => { begin(ids.annots[k]); put(`<< /Type /Annot /Subtype /Link /Rect [${num(a.x)} ${num(a.y)} ${num(a.x + a.w)} ${num(a.y + a.h)}] /Border [0 0 0] /A << /S /URI /URI (${esc(a.uri)}) >> >>\nendobj\n`); });
    }
    const xref = pos;
    put(`xref\n0 ${last + 1}\n0000000000 65535 f \n`);
    for (let id = 1; id <= last; id++) put(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    put(`trailer\n<< /Size ${last + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(pos); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}
