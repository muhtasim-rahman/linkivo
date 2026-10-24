/** Linkivo — js/features/export/formats/txt.js (v2.2.0) Plain text with a line template ({title} {url} {domain} {tags} {folder} {added} {points}), numbering, folder headings. */
import { commonOptions, selectItems, groupItems, fmtDate, eachChunked, lineEnd, textBlob } from './common.js';

export const render = (tpl, i, o) => tpl.replace(/\{(title|url|domain|tags|folder|added|points)\}/g, (_, k) => ({ title: i.title || i.host || i.url, url: i.url, domain: i.host, tags: i.tags || '', folder: i.folder || '', added: fmtDate(i.added, o.dateFormat), points: String(i.points) }[k]));
async function toText(items, o) {
  const nl = lineEnd(o), tpl = o.urlsOnly ? '{url}' : (o.template || '{title} - {url}');
  const sel = selectItems(items, o), groups = groupItems(sel, o.group || 'folder');
  const lines = []; let n = 0;
  for (const g of groups) {
    if (g.name && o.headings !== false && o.group !== 'none') { if (lines.length) lines.push(''); lines.push(g.name, '-'.repeat(Math.min(60, g.name.length))); }
    await eachChunked(g.items, (i) => { n++; lines.push((o.numbering ? `${n}. ` : '') + render(tpl, i, o)); });
  }
  return lines.join(nl) + nl;
}
export default {
  id: 'txt', label: 'Text', desc: 'One line per link, with a template you control.', ext: 'txt', mime: 'text/plain', text: true,
  options: [{ id: 'urlsOnly', type: 'switch', label: 'URLs only', default: false }, { id: 'template', type: 'text', label: 'Line template', placeholder: '{title} - {url}', default: '{title} - {url}', help: 'Tokens: {title} {url} {domain} {tags} {folder} {added} {points}' },
    { id: 'numbering', type: 'switch', label: 'Number the lines', default: false }, { id: 'headings', type: 'switch', label: 'Show group headings', default: true }, { id: 'lineEnding', type: 'select', label: 'Line endings', choices: [{ value: 'lf', label: 'LF' }, { value: 'crlf', label: 'CRLF (Windows)' }], default: 'lf' }, ...commonOptions()],
  preview: (items, o) => toText(items.slice(0, 6), o),
  toText,
  async build(items, o) { return textBlob(await toText(items, o), 'text/plain'); }
};
