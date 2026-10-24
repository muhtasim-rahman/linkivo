/** Linkivo — js/features/export/formats/json.js (v2.2.0) Readable JSON: a flat array or grouped by folder, chosen fields only. */
import { FIELDS, fieldOptions, commonOptions, selectItems, groupItems, fmtDate, eachChunked, textBlob } from './common.js';

function record(i, fields, o) {
  const r = {};
  for (const id of fields) { const f = FIELDS.find((x) => x.id === id); if (f) r[id] = id === 'added' ? fmtDate(i.added, o.dateFormat) : id === 'points' ? i.points : f.get(i); }
  return r;
}
async function toText(items, o) {
  const fields = o.fields?.length ? o.fields : ['title', 'url'];
  const sel = selectItems(items, o);
  const out = []; await eachChunked(sel, (i) => out.push(i));
  const data = o.layout === 'grouped'
    ? Object.fromEntries(groupItems(out, o.group === 'none' ? 'folder' : o.group).map((g) => [g.name, g.items.map((i) => record(i, fields, o))]))
    : out.map((i) => record(i, fields, o));
  return JSON.stringify(data, null, o.pretty === false ? 0 : 2);
}
export default {
  id: 'json', label: 'JSON', desc: 'Readable list of objects with the fields you pick.', ext: 'json', mime: 'application/json', text: true,
  options: [fieldOptions(['title', 'url', 'folder']), { id: 'layout', type: 'select', label: 'Layout', choices: [{ value: 'flat', label: 'One flat list' }, { value: 'grouped', label: 'Grouped by folder' }], default: 'flat' }, { id: 'pretty', type: 'switch', label: 'Indent the output', default: true }, ...commonOptions()],
  preview: (items, o) => toText(items.slice(0, 4), o),
  toText,
  async build(items, o) { return textBlob(await toText(items, o), 'application/json'); }
};
