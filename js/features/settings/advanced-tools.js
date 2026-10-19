/**
 * Linkivo — js/features/settings/advanced-tools.js  (v2.1.0)
 * Purpose: Settings > Advanced rows: debug log viewer, reset settings, and the Metadata tester wrapper.
 * API: renderAdvanced(name, ctx) -> Element     ctx = { refresh() }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { prefs } from '../../core/local-prefs.js';
import { getEntries, clear } from '../../core/logger.js';
import { requireSensitive } from '../../core/sensitive.js';
import { applyAppearance } from '../../core/appearance.js';
import { resettableKeys } from './catalog.js';
import { renderTester } from './metadata-tester.js';

function openLog() {
  const lines = () => getEntries().slice().reverse().map((e) => h('div', { class: `l-${e.level}` }, `${new Date(e.t).toLocaleTimeString()} ${e.level.toUpperCase()} [${e.scope}] ${e.message}${e.data ? ' ' + JSON.stringify(e.data) : ''}`));
  const list = h('div', { class: 'group debug-log' }, lines());
  if (!list.childNodes.length) list.appendChild(h('div', { class: 'muted', text: 'No entries yet.' }));
  openSheet({
    title: 'Debug log', wide: true, body: list,
    actions: [
      { label: 'Clear', closes: false, onClick: () => { clear(); list.replaceChildren(h('div', { class: 'muted', text: 'No entries yet.' })); } },
      { label: 'Copy', closes: false, onClick: async () => { try { await navigator.clipboard.writeText(list.innerText); toast('Log copied.'); } catch { toast('Could not copy.', { type: 'error' }); } } },
      { label: 'Close', variant: 'primary' }
    ]
  });
}

async function resetSettings(ctx) {
  const ok = await confirmDialog({ title: 'Reset all settings?', message: 'Theme, accent color, text size and every other setting return to their defaults. Your links and folders are not touched.', confirmLabel: 'Reset settings', danger: true });
  if (!ok || !(await requireSensitive('reset-settings'))) return;
  for (const k of resettableKeys()) prefs.remove(k);
  applyAppearance();
  toast('Settings reset.');
  ctx.refresh();
}

export function renderAdvanced(name, ctx) {
  if (name === 'debug') return h('button', { type: 'button', class: 'row', on: { click: openLog } }, h('span', { class: 'row-ic' }, icon('bug')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Debug log' }), h('span', { class: 'row-desc', text: 'The last 300 events recorded by the app. Secrets are never logged.' })), h('span', { class: 'row-end' }, icon('chevron-right')));
  if (name === 'reset') return h('button', { type: 'button', class: 'row is-danger', on: { click: () => resetSettings(ctx) } }, h('span', { class: 'row-ic' }, icon('refresh')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Reset settings' }), h('span', { class: 'row-desc', text: 'Return every setting to its default.' })));
  if (name === 'tester') return renderTester();
  return h('div');
}
