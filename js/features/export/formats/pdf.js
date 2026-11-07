/**
 * Linkivo — js/features/export/formats/pdf.js  (v2.5.3)
 * Purpose: "PDF" export (FEATURES section 6b): a real .pdf file, A4 or Letter, a heading per folder, every link clickable, "Page n of N" in the footer. It is built by js/features/export/pdf-writer.js,
 *          no library. Titles and descriptions in other scripts (Bangla, Arabic, Chinese ...) cannot use the built-in PDF fonts, so such a line is drawn as a small picture of the text by the
 *          browser (canvas) and the link below it stays real text; where no canvas exists (tests) those characters become "?". The Print format remains for a page with the app's own design.
 * API: default export format { id: 'pdf', options, preview, build }      layoutPdf(items, options, ctx) -> Promise<PdfDoc>
 */
import { commonOptions, fieldOptions, selectItems, groupItems, fmtDate, yieldNow } from './common.js';
import { PdfDoc, PAGE, textWidth, isLatin, wrap } from '../pdf-writer.js';

const INK = [0.09, 0.09, 0.11], GREY = [0.42, 0.42, 0.46], BLUE = [0.1, 0.3, 0.78], ACCENT = [0.12, 0.32, 0.86];
const M = 42, SCALE = 3;

/** A line of non-Latin text as a grey picture. Returns { id, w, h } in points, or null when the browser cannot draw it. */
function rasterLine(doc, text, size, bold, maxW) {
  try {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'), ctx = c.getContext && c.getContext('2d'); if (!ctx) return null;
    const font = `${bold ? '700 ' : ''}${size * SCALE}px "Noto Sans Bengali", "Segoe UI", system-ui, Arial, sans-serif`;
    ctx.font = font; let t = String(text);
    while (ctx.measureText(t).width / SCALE > maxW && t.length > 1) t = t.slice(0, -1);
    if (t !== text) t = t.slice(0, -1) + '\u2026';
    const w = Math.ceil(ctx.measureText(t).width) + 2, h = Math.ceil(size * SCALE * 1.4);
    c.width = w; c.height = h; ctx.font = font; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'; ctx.fillText(t, 1, h / 2);
    const px = ctx.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
    for (let i = 0; i < g.length; i++) g[i] = px[i * 4];
    return { id: doc.addImage({ w, h, data: g }), w: w / SCALE, h: h / SCALE };
  } catch { return null; }
}
const latinOnly = (s) => String(s).replace(/[^\u0000-\u00ff]/g, '?');

export async function layoutPdf(items, o = {}, ctx = {}) {
  const size = PAGE[o.pageSize === 'letter' ? 'LETTER' : 'A4'], doc = new PdfDoc(size), W = size.w - M * 2, fields = new Set(o.fields && o.fields.length ? o.fields : ['title', 'url', 'description']);
  const list = selectItems(items, o), groups = groupItems(list, o.group || 'folder');
  let y = size.h - M;
  const room = (need) => { if (y - need < M + 18) { doc.newPage(); y = size.h - M; return true; } return false; };
  // text that may be non-Latin: real text when Latin, otherwise a picture (or "?" without a canvas); returns the height used
  function put(text, x, s, { bold = false, color = INK, maxW = W - (x - M), link = '' } = {}) {
    if (!text) return 0;
    if (isLatin(text)) { doc.text(x, y - s, text, s, { bold, color }); if (link) doc.link(x, y - s - 1, Math.min(maxW, textWidth(text, s, bold)), s + 3, link); return s * 1.28; }
    const r = rasterLine(doc, text, s, bold, maxW);
    if (!r) { doc.text(x, y - s, latinOnly(text), s, { bold, color }); return s * 1.28; }
    doc.image(r.id, x, y - r.h + 1, r.w, r.h); if (link) doc.link(x, y - r.h, r.w, r.h, link); return Math.max(r.h, s * 1.28);
  }
  // title block (first page only)
  y -= put('Linkivo links', M, 20, { bold: true, color: ACCENT }) + 2;
  y -= put(`${ctx.label || 'library'}  |  ${list.length} link${list.length === 1 ? '' : 's'}  |  ${fmtDate(ctx.now || Date.now(), 'long')}`, M, 9, { color: GREY }) + 10;
  let n = 0;
  for (const g of groups) {
    if (g.name && o.group !== 'none') { room(46); y -= 8; y -= put(g.name, M, 12.5, { bold: true }); doc.rule(M, y - 2, M + W, 0.6); y -= 8; }
    for (const i of g.items) {
      const lines = [];   // [text, size, opts]
      if (fields.has('title')) for (const t of (isLatin(i.title || i.host || i.url) ? wrap(i.title || i.host || i.url, 10.5, W, true).slice(0, 3) : [i.title || i.host || i.url])) lines.push([t, 10.5, { bold: true }]);
      if (fields.has('url')) lines.push([i.url.length > 110 ? i.url.slice(0, 107) + '...' : i.url, 8.5, { color: BLUE, link: i.url }]);
      if (fields.has('domain') && !fields.has('url')) lines.push([i.host, 8.5, { color: BLUE, link: i.url }]);
      if (fields.has('description') && i.desc) for (const t of (isLatin(i.desc) ? wrap(i.desc, 8.5, W).slice(0, 3) : [i.desc])) lines.push([t, 8.5, { color: GREY }]);
      const meta = [fields.has('tags') && i.tags ? `tags: ${i.tags}` : '', fields.has('folder') && i.folder && o.group === 'none' ? `folder: ${i.folder}` : '', fields.has('added') ? fmtDate(i.added, o.dateFormat) : '', fields.has('points') ? `points ${i.points}` : '', fields.has('favourite') && i.fv ? 'favourite' : '', fields.has('readLater') && i.rl ? 'read later' : ''].filter(Boolean).join('   |   ');
      if (meta) lines.push([meta, 8, { color: GREY }]);
      if (!lines.length) continue;
      room(lines.reduce((s, l) => s + l[1] * 1.3, 0) + 9);
      for (const [t, s, opt] of lines) y -= put(t, M, s, opt);
      y -= 9;
      if (++n % 150 === 0) await yieldNow();
    }
  }
  if (!list.length) put('No links to show.', M, 11, { color: GREY });
  if (o.pageNumbers !== false) doc.pages.forEach((p, k) => { doc.cur = p; doc.text(M, 22, 'Linkivo', 8, { color: GREY }); const s = `Page ${k + 1} of ${doc.pages.length}`; doc.text(size.w - M - textWidth(s, 8), 22, s, 8, { color: GREY }); });
  return doc;
}

export default {
  id: 'pdf', label: 'PDF', icon: 'file', desc: 'A document with clickable links.', ext: 'pdf', mime: 'application/pdf',
  options: [
    { id: 'pageSize', group: 'layout', type: 'seg', label: 'Page', choices: [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }], default: 'a4' },
    { id: 'pageNumbers', group: 'layout', type: 'switch', label: 'Page numbers', default: true },
    fieldOptions(['title', 'url', 'description']),
    ...commonOptions()
  ],
  preview: (items, o) => { const n = selectItems(items, o).length; return `PDF document\n${n} link${n === 1 ? '' : 's'}, ${o.pageSize === 'letter' ? 'Letter' : 'A4'}, every link clickable.`; },
  async build(items, o, ctx) { const doc = await layoutPdf(items, o, ctx); return new Blob([await doc.build({ title: `Linkivo - ${(ctx && ctx.label) || 'library'}`, now: (ctx && ctx.now) || Date.now() })], { type: 'application/pdf' }); }
};
