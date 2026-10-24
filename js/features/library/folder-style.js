/**
 * Linkivo — js/features/library/folder-style.js  (v2.2.0)
 * Purpose: the look of a folder in one place: the color palette, the virtual Favourites folder, the colored icon tile, helpers for links.
 * API: FOLDER_COLORS  DEFAULT_COLOR  FAV_ID  favouritesFolder(count)  colorOf(folder)  folderTile(folder, size)  safeHref(url)  faviconUrl(host)  linkTitle(link)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';

export const FOLDER_COLORS = [['#2563eb', 'Blue'], ['#0ea5e9', 'Sky'], ['#14b8a6', 'Teal'], ['#16a34a', 'Green'], ['#84cc16', 'Lime'], ['#eab308', 'Amber'], ['#f97316', 'Orange'], ['#ef4444', 'Red'], ['#ec4899', 'Pink'], ['#a855f7', 'Purple'], ['#6366f1', 'Indigo'], ['#64748b', 'Slate']];
export const DEFAULT_COLOR = '#2563eb';
export const FAV_ID = 'favourites';
export const favouritesFolder = (count = 0) => ({ id: FAV_ID, name: 'Favourites', color: '#eab308', icon: 'star', lc: count, virtual: true });
export const colorOf = (f) => (f && /^#[0-9a-f]{3,8}$/i.test(f.color || '') ? f.color : DEFAULT_COLOR);

/** The rounded colored square with the folder icon (pure CSS variables, so the theme and accent never clash with it). */
export function folderTile(folder, size = 40) {
  return h('span', { class: 'ftile', style: { '--fc': colorOf(folder), '--sz': size + 'px' }, 'aria-hidden': 'true' }, icon(folder.icon || 'folder', { size: Math.round(size * 0.5) }));
}

/** Only web addresses are ever used as a link target: a stored "javascript:" value can not run from a click. */
export const safeHref = (url) => (/^https?:\/\//i.test(url || '') ? url : '#');
export const faviconUrl = (host) => (host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : '');
export const linkTitle = (l) => l.title || l.host || l.url;
