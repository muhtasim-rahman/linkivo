/**
 * Linkivo — js/features/library/bookmark-action.js  (v2.3.1)
 * Purpose: "Add to bookmarks" (owner request): put a saved link into the BROWSER's own bookmarks. A website can not add a bookmark by itself (no browser
 *          offers such an API), so the sheet gives the two ways that really work: open the link and press the browser's bookmark key there, or download
 *          a one-link bookmarks file that every browser can import. The wording says so plainly.
 * API: addToBookmarks(link) -> void      bookmarkFileText(link) -> string      bookmarkKey() -> 'Ctrl+D' | 'Cmd+D'
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { safeHref } from './folder-style.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const bookmarkKey = () => (/mac|iphone|ipad/i.test(typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent : '') ? 'Cmd+D' : 'Ctrl+D');

/** A Netscape bookmarks file with this single link (the format every browser imports). */
export function bookmarkFileText(l) {
  return ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>',
    `    <DT><A HREF="${esc(l.url)}" ADD_DATE="${Math.floor((l.ts || Date.now()) / 1000)}">${esc(l.title || l.host || l.url)}</A>`, '</DL><p>', ''].join('\n');
}

export function addToBookmarks(l) {
  const href = safeHref(l.url); if (href === '#') { toast('This address can not be bookmarked.', { type: 'error' }); return; }
  const key = bookmarkKey();
  const choice = (ic, title, text, fn) => h('button', { type: 'button', class: 'bm-choice', on: { click: fn } }, h('span', { class: 'bm-ic' }, icon(ic, { size: 20 })), h('span', { class: 'bm-tx' }, h('strong', { text: title }), h('span', { text }))) ;
  const sheet = openSheet({
    title: 'Add to browser bookmarks',
    body: h('div', { class: 'bm' },
      h('p', { class: 'help', text: 'Websites can not add bookmarks by themselves. Pick the way that suits you.' }),
      choice('external', 'Open it, then press ' + key, 'The link opens in a new tab. Press the bookmark key there to save it.', () => { window.open(href, '_blank', 'noopener,noreferrer'); toast(`Press ${key} in the new tab.`); sheet.close(); }),
      choice('download', 'Download a bookmark file', 'One link in the standard file; import it in your browser.', async () => {
        const { downloadBlob } = await import('../export/export-sheet.js');
        downloadBlob(new Blob([bookmarkFileText(l)], { type: 'text/html' }), 'linkivo-bookmark.html'); sheet.close();
      })),
    actions: [{ label: 'Close', variant: 'quiet' }]
  });
}
