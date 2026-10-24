/** Linkivo — js/features/export/formats/opml.js (v2.2.0) OPML outline for feed readers and outliners; one outline per folder. */
import { commonOptions, selectItems, groupItems, esc, eachChunked, lineEnd, textBlob } from './common.js';

async function toText(items, o) {
  const nl = lineEnd(o), groups = groupItems(selectItems(items, o), o.group === 'domain' ? 'domain' : o.group === 'none' ? 'none' : 'folder');
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<opml version="2.0">', '  <head><title>Linkivo links</title></head>', '  <body>'];
  for (const g of groups) {
    const nested = !!g.name && o.group !== 'none';
    if (nested) out.push(`    <outline text="${esc.xml(g.name)}">`);
    await eachChunked(g.items, (i) => out.push(`${nested ? '      ' : '    '}<outline text="${esc.xml(i.title || i.host || i.url)}" type="link" url="${esc.xml(i.url)}"/>`));
    if (nested) out.push('    </outline>');
  }
  out.push('  </body>', '</opml>', '');
  return out.join(nl);
}
export default {
  id: 'opml', label: 'OPML', desc: 'Outline file for feed readers and outliners.', ext: 'opml', mime: 'text/x-opml', text: true,
  options: [...commonOptions().filter((x) => ['sort', 'group', 'skipBlocked', 'onlyFavourites', 'onlyTag'].includes(x.id))],
  preview: (items, o) => toText(items.slice(0, 4), o),
  toText,
  async build(items, o) { return textBlob(await toText(items, o), 'text/x-opml'); }
};
