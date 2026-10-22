/**
 * Linkivo — js/ui/icons.js  (v2.1.1)
 * Purpose: the icon set. The drawings are SVG FILES in /assets/ui-icons/<name>.svg (owner decision: custom artwork lives in assets, not in
 *          code). Each icon is a <span> that uses its file as a CSS mask, so it takes the current text color (and the accent) and needs no
 *          extra markup. The service worker precaches the files, so icons work offline.
 * API: icon(name, {size=20, cls, label}) -> Element     hasIcon(name)     ICON_NAMES     FOLDER_ICONS (category set for the v2.2.0 folder picker)
 *      googleMark(size) -> Element (the multicolor Google "G", an <img>: the only icon that keeps its own colors)
 * To add or change an icon: edit/add the .svg file, add its name below, then run "node @ Creator/tools/gen-precache.mjs".
 */
import { h } from '../core/dom.js';

export const ICON_NAMES = ["alert", "arrow-left", "book", "bookmark", "briefcase", "broom", "bug", "bulb", "calendar", "chat", "check", "check-circle", "chevron-down", "chevron-left", "chevron-right", "chevron-up", "clock", "close", "cloud", "code", "contrast", "copy", "cpu", "database", "edit", "external", "eye", "eye-off", "file-text", "filter", "finance", "fire", "flag", "flask", "folder", "food", "game", "gift", "github", "globe", "graduation", "grid", "health", "heart", "history", "home", "image", "import", "info", "install", "key", "library", "link", "list", "lock", "login", "logout", "mail", "map", "menu", "monitor", "moon", "more", "more-h", "mosque", "music", "news", "palette", "panel-close", "panel-open", "pause", "pin", "play", "plus", "random", "refresh", "rings", "rows", "search", "settings", "share", "shield", "shopping", "sort", "star", "stop", "sun", "tag", "terminal", "tool", "trash", "travel", "type", "undo", "upload", "user", "users", "video", "wifi-off", "x-circle", "zap"];
export const FOLDER_ICONS = ["folder", "star", "heart", "bookmark", "book", "graduation", "briefcase", "code", "terminal", "palette", "image", "video", "music", "game", "news", "shopping", "finance", "health", "food", "travel", "map", "home", "tool", "flask", "cpu", "cloud", "shield", "lock", "globe", "chat", "mail", "calendar", "clock", "flag", "fire", "bulb", "gift", "user", "users", "mosque"];
const SET = new Set(ICON_NAMES);
export const hasIcon = (name) => SET.has(name);

export function icon(name, { size = 20, cls = '', label = '' } = {}) {
  const file = SET.has(name) ? name : 'info';
  const el = h('span', { class: ['ic', cls], style: { '--ic': `url("/assets/ui-icons/${file}.svg")`, width: size + 'px', height: size + 'px' } });
  if (label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', label); } else el.setAttribute('aria-hidden', 'true');
  return el;
}

export function googleMark(size = 18) {
  return h('img', { class: 'g-mark', src: '/assets/brand/google-g.svg', alt: '', width: size, height: size, 'aria-hidden': 'true' });
}
