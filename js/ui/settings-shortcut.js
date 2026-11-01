/**
 * Linkivo — js/ui/settings-shortcut.js  (v2.4.2)
 * Purpose: the small settings icon in a page header that opens the Settings section that belongs to that page (owner: Library, Folder, Search, Profile, History and
 *          Random all carry one, so the options of a page are one tap away without hunting through Settings).
 * API: settingsShortcut(section, label?) -> HTMLAnchorElement      e.g. settingsShortcut('library')
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';

export const settingsShortcut = (section, label = 'Settings') => h('a', { class: 'btn-icon', href: `/settings/${encodeURIComponent(section)}`, 'aria-label': label, 'data-tip': label }, icon('settings', { size: 20 }));
