/** Linkivo — js/features/export/formats/html-bookmarks.js (v2.2.0) Netscape bookmarks file: every browser imports it; folders become bookmark folders. */
import { commonOptions, selectItems, groupItems, esc, eachChunked, lineEnd, textBlob } from './common.js';

async function toText(items, o) {
  const nl = lineEnd(o), groups = groupItems(selectItems(items, o), o.group === 'domain' ? 'domain' : o.group === 'none' ? 'none' : 'folder');
  const out = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>'];
  for (const g of groups) {
    const nested = !!g.name && o.group !== 'none';
    if (nested) out.push(`    <DT><H3>${esc.html(g.name)}</H3>`, '    <DL><p>');
    await eachChunked(g.items, (i) => out.push(`${nested ? '        ' : '    '}<DT><A HREF="${esc.html(i.url)}" ADD_DATE="${Math.floor(i.added / 1000)}"${o.tags && i.tags ? ` TAGS="${esc.html(i.tags)}"` : ''}>${esc.html(i.title || i.host || i.url)}</A>`));
    if (nested) out.push('    </DL><p>');
  }
  out.push('</DL><p>', '');
  return out.join(nl);
}
export default {
  id: 'bookmarks', label: 'HTML bookmarks', desc: 'The standard file every browser can import.', ext: 'html', mime: 'text/html', text: true,
  options: [{ id: 'tags', type: 'switch', label: 'Include tags attribute', default: false }, ...commonOptions().filter((x) => ['sort', 'group', 'skipBlocked', 'onlyFavourites', 'onlyTag'].includes(x.id))],
  preview: (items, o) => toText(items.slice(0, 4), o),
  toText,
  async build(items, o) { return textBlob(await toText(items, o), 'text/html'); }
};
