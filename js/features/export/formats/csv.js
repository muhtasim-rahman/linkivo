/** Linkivo — js/features/export/formats/csv.js (v2.2.0) CSV for spreadsheets: delimiter, optional BOM (Excel), chosen columns, formula-safe cells. */
import { FIELDS, fieldOptions, commonOptions, selectItems, fmtDate, esc, guardCell, eachChunked, lineEnd, textBlob } from './common.js';

const DELIMS = { comma: ',', semicolon: ';', tab: '\t' };
async function toText(items, o, withBom = false) {
  const fields = (o.fields?.length ? o.fields : ['title', 'url']).map((id) => FIELDS.find((f) => f.id === id)).filter(Boolean);
  const d = DELIMS[o.delimiter] || ',', nl = lineEnd(o);
  const lines = [];
  if (o.header !== false) lines.push(fields.map((f) => esc.csv(f.label, d)).join(d));
  await eachChunked(selectItems(items, o), (i) => lines.push(fields.map((f) => {
    const v = f.id === 'added' ? fmtDate(i.added, o.dateFormat) : f.id === 'points' ? String(i.points) : guardCell(f.get(i));
    return esc.csv(v, d);
  }).join(d)));
  return (withBom ? '\ufeff' : '') + lines.join(nl) + nl;
}
export default {
  id: 'csv', label: 'CSV', desc: 'Rows and columns for Excel, Google Sheets and databases.', ext: 'csv', mime: 'text/csv', text: true,
  options: [fieldOptions(['title', 'url', 'folder', 'added']), { id: 'delimiter', type: 'select', label: 'Delimiter', choices: [{ value: 'comma', label: 'Comma' }, { value: 'semicolon', label: 'Semicolon' }, { value: 'tab', label: 'Tab' }], default: 'comma' },
    { id: 'bom', type: 'switch', label: 'Add a byte order mark (helps Excel read UTF-8)', default: true }, { id: 'header', type: 'switch', label: 'First row is a header', default: true }, { id: 'lineEnding', type: 'select', label: 'Line endings', choices: [{ value: 'lf', label: 'LF' }, { value: 'crlf', label: 'CRLF (Windows)' }], default: 'lf' }, ...commonOptions().filter((x) => x.id !== 'group')],
  preview: (items, o) => toText(items.slice(0, 5), o),
  toText,
  async build(items, o) { return textBlob(await toText(items, o, o.bom !== false), 'text/csv'); }
};
