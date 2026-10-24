/**
 * Linkivo — js/features/export/formats/xlsx.js  (v2.2.0)
 * Purpose: Excel workbook written by hand (an .xlsx is a ZIP of small XML files, see zip-writer.js): styled header row, sensible column widths,
 *          clickable URLs (HYPERLINK formula, with the plain text as the cached value), one sheet or one sheet per folder. No library.
 * API: default format object (id 'xlsx')   buildWorkbook(items, opts) -> Uint8Array
 */
import { FIELDS, fieldOptions, commonOptions, selectItems, groupItems, fmtDate, esc, guardCell, yieldNow } from './common.js';
import { zipStore } from '../zip-writer.js';

const colName = (n) => { let s = ''; for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const sheetName = (raw, used) => {
  let base = (raw || 'Links').replace(/[\[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 28) || 'Links', name = base, k = 2;
  while (used.has(name.toLowerCase())) name = `${base.slice(0, 26)} ${k++}`;
  used.add(name.toLowerCase());
  return name;
};
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><u/><sz val="11"/><color rgb="FF1D4FC4"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>';

function sheetXml(rows, fields, o) {
  const widths = fields.map((f) => Math.min(60, Math.max(f.label.length + 2, ...rows.slice(0, 200).map((r) => String(r[f.id] ?? '').length + 2), 8)));
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const cell = (r, c, v, style = 0, link = false) => {
    const ref = colName(c) + r, s = String(v ?? '');
    if (link && s.length <= 250 && /^https?:\/\//i.test(s)) return `<c r="${ref}" s="2" t="str"><f>HYPERLINK("${esc.xml(s).replace(/&quot;/g, '""')}","${esc.xml(s).replace(/&quot;/g, '""')}")</f><v>${esc.xml(s)}</v></c>`;
    if (typeof v === 'number') return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}"${style ? ` s="${style}"` : ''} t="inlineStr"><is><t xml:space="preserve">${esc.xml(s)}</t></is></c>`;
  };
  const head = `<row r="1">${fields.map((f, c) => cell(1, c, f.label, 1)).join('')}</row>`;
  const body = rows.map((r, n) => `<row r="${n + 2}">${fields.map((f, c) => cell(n + 2, c, r[f.id], 0, f.id === 'url')).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${head}${body}</sheetData><autoFilter ref="A1:${colName(Math.max(0, fields.length - 1))}${Math.max(1, rows.length + 1)}"/></worksheet>`;
}

export function buildWorkbook(items, o) {
  const fields = (o.fields?.length ? o.fields : ['title', 'url']).map((id) => FIELDS.find((f) => f.id === id)).filter(Boolean);
  const sel = selectItems(items, o);
  const toRow = (i) => Object.fromEntries(fields.map((f) => [f.id, f.id === 'added' ? fmtDate(i.added, o.dateFormat) : f.id === 'points' ? i.points : ['title', 'description', 'tags', 'folder'].includes(f.id) ? guardCell(f.get(i)) : f.get(i)]));
  const groups = o.sheets === 'folders' ? groupItems(sel, 'folder') : [{ name: 'Links', items: sel }];
  const used = new Set(), sheets = groups.map((g) => ({ name: sheetName(g.name, used), rows: g.items.map(toRow) }));
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc.xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows, fields, o) }))
  ];
  return zipStore(files);
}

const summary = (items, o) => { const sel = selectItems(items, o); return `${sel.length} rows, ${o.sheets === 'folders' ? groupItems(sel, 'folder').length + ' sheets (one per folder)' : '1 sheet'}\n` + sel.slice(0, 4).map((i) => `${i.title || i.host}  |  ${i.url}`).join('\n'); };
export default {
  id: 'xlsx', label: 'Excel', desc: 'Workbook with a styled header, widths and clickable URLs.', ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: false,
  options: [fieldOptions(['title', 'url', 'folder', 'added']), { id: 'sheets', type: 'select', label: 'Sheets', choices: [{ value: 'one', label: 'One sheet' }, { value: 'folders', label: 'One sheet per folder' }], default: 'one' }, ...commonOptions().filter((x) => x.id !== 'group')],
  preview: async (items, o) => summary(items.slice(0, 40), o),
  async build(items, o) { await yieldNow(); return new Blob([buildWorkbook(items, o)], { type: this.mime }); }
};
