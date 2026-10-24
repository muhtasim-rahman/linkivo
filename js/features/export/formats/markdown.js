/** Linkivo — js/features/export/formats/markdown.js (v2.2.0) Markdown: list or table style, group headings, [title](url), optional description and tags. */
import { commonOptions, selectItems, groupItems, fmtDate, esc, eachChunked, lineEnd, textBlob } from './common.js';

const mdUrl = (u) => u.replace(/[()\s]/g, (c) => encodeURIComponent(c));
async function toText(items, o) {
  const nl = lineEnd(o), groups = groupItems(selectItems(items, o), o.group || 'folder');
  const out = [];
  for (const g of groups) {
    if (g.name && o.group !== 'none') out.push(`## ${esc.md(g.name)}`, '');
    if (o.style === 'table') {
      out.push('| Title | URL |' + (o.description ? ' Description |' : '') + (o.tags ? ' Tags |' : '') + (o.added ? ' Added |' : ''), '| --- | --- |' + (o.description ? ' --- |' : '') + (o.tags ? ' --- |' : '') + (o.added ? ' --- |' : ''));
      await eachChunked(g.items, (i) => out.push(`| [${esc.md(i.title || i.host || i.url)}](${mdUrl(i.url)}) | ${esc.md(i.host)} |` + (o.description ? ` ${esc.md(i.desc)} |` : '') + (o.tags ? ` ${esc.md(i.tags)} |` : '') + (o.added ? ` ${fmtDate(i.added, o.dateFormat)} |` : '')));
    } else {
      await eachChunked(g.items, (i) => {
        const extra = [o.description && i.desc ? esc.md(i.desc) : '', o.tags && i.tags ? `tags: ${esc.md(i.tags)}` : '', o.added ? fmtDate(i.added, o.dateFormat) : ''].filter(Boolean).join(' | ');
        out.push(`- [${esc.md(i.title || i.host || i.url)}](${mdUrl(i.url)})${extra ? ' - ' + extra : ''}`);
      });
    }
    out.push('');
  }
  return out.join(nl);
}
export default {
  id: 'md', label: 'Markdown', desc: 'Headings per folder and [title](url) links.', ext: 'md', mime: 'text/markdown', text: true,
  options: [{ id: 'style', type: 'select', label: 'Style', choices: [{ value: 'list', label: 'List' }, { value: 'table', label: 'Table' }], default: 'list' }, { id: 'description', type: 'switch', label: 'Include description', default: false }, { id: 'tags', type: 'switch', label: 'Include tags', default: false }, { id: 'added', type: 'switch', label: 'Include added date', default: false },
    { id: 'lineEnding', type: 'select', label: 'Line endings', choices: [{ value: 'lf', label: 'LF' }, { value: 'crlf', label: 'CRLF (Windows)' }], default: 'lf' }, ...commonOptions()],
  preview: (items, o) => toText(items.slice(0, 5), o),
  toText,
  async build(items, o) { return textBlob(await toText(items, o), 'text/markdown'); }
};
