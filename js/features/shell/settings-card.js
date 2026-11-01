/**
 * Linkivo — js/features/shell/settings-card.js  (v2.4.2)
 * Purpose: the "All settings" card of the mobile Menu page. Owner: the old plain row did not read as Settings; people had to scroll the whole Menu to learn it.
 *          Now it is the one card with a filled accent surface, a large gear and a row of the setting categories, so it is unmistakable and nothing else on the page looks like it.
 * API: settingsCard() -> Element
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { SECTIONS } from '../settings/catalog.js';

export function settingsCard() {
  const chips = SECTIONS.filter((s) => s.id !== 'danger').slice(0, 7).map((s) => h('span', { class: 'sc-chip', 'aria-hidden': 'true' }, icon(s.icon, { size: 14 }), s.label));
  return h('a', { class: 'sc-card', href: '/settings', 'aria-label': 'View all settings' },
    h('span', { class: 'sc-gear', 'aria-hidden': 'true' }, icon('settings', { size: 64 })),
    h('span', { class: 'sc-top' }, h('span', { class: 'sc-ic', 'aria-hidden': 'true' }, icon('settings', { size: 22 })), h('span', { class: 'sc-tx' }, h('strong', { text: 'All settings' }), h('span', { text: 'Appearance, library, search, random and more' })), icon('chevron-right', { size: 20 })),
    h('span', { class: 'sc-chips' }, chips));
}
