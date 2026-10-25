/**
 * Linkivo — js/ui/shortcut-help.js  (v2.2.1)
 * Purpose: the small "Keyboard shortcuts" popup a page opens with the ? key. It lists the same entries the page registered.
 * API: openShortcutHelp(list, title?) -> sheet api
 */
import { h } from '../core/dom.js';
import { openSheet } from './sheet.js';
import { describeKeys } from '../core/shortcuts.js';

export function openShortcutHelp(list, title = 'Keyboard shortcuts') {
  const rows = list.filter((s) => s.desc).map((s) => h('div', { class: 'kb-row' }, h('span', { text: s.desc }), h('kbd', { class: 'kb-keys', text: describeKeys(s.keys) })));
  return openSheet({ title, body: h('div', { class: 'kb-list' }, rows), actions: [{ label: 'Done', variant: 'primary' }] });
}
