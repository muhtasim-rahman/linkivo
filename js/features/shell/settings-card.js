/**
 * Linkivo — js/features/shell/settings-card.js  (v2.4.2, calmer in v2.4.4)
 * Purpose: the "All settings" card of the mobile Menu page. v2.4.4 (owner): it was too big and too loud. Now a compact light blue card (a tinted surface, not a
 *          filled block): one header row that opens Settings, and under it ONE scrollable line of category chips. The chips are built from the settings SECTIONS
 *          (so a new section appears by itself) and each one opens that section. The line fades at the edge that has more.
 * API: settingsCard() -> Element
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { attachFade } from '../../ui/edge-fade.js';
import { SECTIONS } from '../settings/catalog.js';

export function settingsCard() {
  const row = h('div', { class: 'sc-chips', role: 'list' }, SECTIONS.map((s) => h('a', { class: 'sc-chip', role: 'listitem', href: `/settings/${s.id}`, 'data-tip': s.desc }, icon(s.icon, { size: 14 }), h('span', { text: s.label }))));
  attachFade(row);
  return h('section', { class: 'sc-card', 'aria-label': 'Settings' },
    h('a', { class: 'sc-top', href: '/settings', 'aria-label': 'View all settings' }, h('span', { class: 'sc-ic', 'aria-hidden': 'true' }, icon('settings', { size: 20 })),
      h('span', { class: 'sc-tx' }, h('strong', { text: 'All settings' }), h('span', { text: 'Jump to any category' })), icon('chevron-right', { size: 18 })),
    row);
}
