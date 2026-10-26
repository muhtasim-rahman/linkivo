/**
 * Linkivo — js/features/shell/bin-card.js  (v2.2.2)
 * Purpose: the Recycle Bin card, shared by the mobile Menu page and (new in v2.2.2) the top of the wide-screen Settings page, where it replaces the old
 *          Recycle Bin row of the Import, export and data section.
 * API: binCard() -> Element
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { getEngine } from '../../core/app-data.js';
import { plural } from '../../core/format.js';

export function binCard() {
  const e = getEngine(), c = e ? e.counts() : { deletedFolders: 0, deletedLinks: 0 };
  const n = c.deletedFolders + c.deletedLinks;
  return h('a', { class: 'binrow', href: '/settings/recycle-bin' }, h('span', { class: 'binrow-ic' }, icon('trash', { size: 20 })),
    h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Recycle Bin' }), h('span', { class: 'row-desc', text: n ? `${plural(n, 'item')}, kept for 15 days` : 'Empty. Deleted items wait here for 15 days.' })), h('span', { class: 'row-end' }, icon('chevron-right')));
}
