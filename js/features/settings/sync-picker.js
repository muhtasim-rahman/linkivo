/**
 * Linkivo — js/features/settings/sync-picker.js  (v2.3.1)
 * Purpose: the "Select which settings to sync" popup (Settings > Account and sync). A compact list of every setting in the catalog, grouped by category, each with a
 *          tick. Most are ticked; the few that describe this device (theme and accent) start unticked. The list is generated from catalog.js, so new settings of later
 *          versions are in it without extra work. Saving restarts the settings sync with the new key list.
 * API: openSyncPicker() -> void      syncRow() -> Element (the row in the Account section)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { prefs } from '../../core/local-prefs.js';
import { getSession } from '../../core/session.js';
import { syncGroups, setSynced } from '../../core/sync-choice.js';
import { CATALOG, SECTIONS } from './catalog.js';

export function openSyncPicker() {
  const groups = syncGroups(CATALOG, SECTIONS, prefs), want = new Map();   // id -> boolean chosen in this popup
  const body = h('div', { class: 'syp' }, h('p', { class: 'help', text: 'Ticked settings are saved to your account and follow you to your other devices. Unticked ones stay on this device.' }),
    ...groups.map((g) => h('section', { class: 'syp-g' }, h('h3', { class: 'syp-h' }, icon(g.section.icon, { size: 16 }), h('span', { text: g.section.label })),
      h('ul', { class: 'syp-l' }, g.entries.map(({ entry, on }) => {
        const cb = h('input', { type: 'checkbox', checked: on, id: 'syp-' + entry.id }); cb.addEventListener('change', () => want.set(entry.id, cb.checked));
        return h('li', null, h('label', { class: 'syp-i', for: 'syp-' + entry.id }, cb, h('span', { text: entry.label })));
      })))));
  openSheet({ title: 'Select which settings to sync', body, wide: false, actions: [{ label: 'Cancel', variant: 'quiet' }, { label: 'Save', variant: 'primary', onClick: async () => {
    for (const g of groups) for (const { entry } of g.entries) if (want.has(entry.id)) setSynced(entry, want.get(entry.id), prefs);
    try { const d = await import('../../core/app-data.js'); await d.restartSettingsSync?.(); } catch { /* the choice is saved either way; sync restarts at the next start */ }
    toast('Sync choice saved.');
  } }] });
  import('../../core/css-loader.js').then((m) => m.loadCss('/css/pages/settings.css'));
}

export function syncRow() {
  if (getSession().mode !== 'account') return h('div', { hidden: true });
  return h('button', { type: 'button', class: 'row dz-row', on: { click: openSyncPicker } },
    h('span', { class: 'row-ic' }, icon('refresh', { size: 20 })),
    h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Select which settings to sync' }), h('span', { class: 'row-desc', text: 'Choose what follows your account and what stays on this device.' })),
    h('span', { class: 'row-end' }, icon('chevron-right', { size: 18 })));
}
