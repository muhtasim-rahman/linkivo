/**
 * Linkivo — js/features/settings/advanced-tools.js  (v2.1.2)
 * Purpose: Settings > Advanced rows: debug log viewer, reset settings, and the Metadata tester wrapper.
 *          v2.2.3: also the rows of the new Danger zone (reset all settings, clear app cache, log out, clear local storage data).
 * API: renderAdvanced(name, ctx) -> Element     ctx = { refresh(), router }
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
import { clearCachesAndReload } from '../../core/update.js';
import { clearLocalData } from '../../core/clear-local.js';
import { getSession } from '../../core/session.js';
import { signOutUser } from '../auth/auth-service.js';
import { logOut } from '../shell/shell-parts.js';

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

/** Clear local storage data: signs an account out, erases this browser's data for Linkivo (guest data too) and reloads. Cloud data is not touched. */
async function clearLocal() {
  const guest = getSession().mode === 'guest';
  const ok = await confirmDialog(guest
    ? { title: 'Erase all data on this device?', message: 'You are a guest, so your folders, links and settings exist ONLY on this device. This erases all of it, clears the app cache and restarts Linkivo. It can not be undone.', confirmLabel: 'Continue', danger: true }
    : { title: 'Clear local storage data?', message: 'You will be logged out. Settings, the saved copy of your library and the app cache on this device are erased and Linkivo restarts. Your account and everything saved in it stay safe in the cloud.', confirmLabel: 'Clear and log out', danger: true });
  if (!ok) return;
  if (guest && !(await confirmDialog({ title: 'Last check', message: 'Every guest folder and link on this device will be gone for good. Erase everything?', confirmLabel: 'Erase everything', danger: true }))) return;
  if (!(await requireSensitive('clear-local'))) return;
  try { if (!guest) await signOutUser(); } catch (e) { toast('Could not sign out first. Check your connection and try again.', { type: 'error' }); return; }
  await clearLocalData();
}

const dangerRow = (ic, label, desc, fn, danger = true) => h('button', { type: 'button', class: ['row', danger && 'is-danger'], on: { click: fn } }, h('span', { class: 'row-ic' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), h('span', { class: 'row-desc', text: desc })));

export function renderAdvanced(name, ctx) {
  if (name === 'logout') return dangerRow('logout', getSession().mode === 'guest' ? 'Leave guest mode' : 'Log out', getSession().mode === 'guest' ? 'Back to the login page. Your guest data stays on this device.' : 'Sign out of this device. Your data stays in your account.', () => logOut(ctx.router), false);
  if (name === 'clearLocal') return dangerRow('trash', 'Clear local storage data', 'Logs you out and erases everything this browser holds for Linkivo: settings, the saved library copy and the app cache. A guest loses all data.', clearLocal);
  if (name === 'debug') return h('button', { type: 'button', class: 'row', on: { click: openLog } }, h('span', { class: 'row-ic' }, icon('bug')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Debug log' }), h('span', { class: 'row-desc', text: 'The last 300 events recorded by the app. Secrets are never logged.' })), h('span', { class: 'row-end' }, icon('chevron-right')));
  if (name === 'reset') return h('button', { type: 'button', class: 'row is-danger', on: { click: () => resetSettings(ctx) } }, h('span', { class: 'row-ic' }, icon('refresh')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Reset settings' }), h('span', { class: 'row-desc', text: 'Return every setting to its default.' })));
  if (name === 'tester') return renderTester();
  if (name === 'clearCache') return h('button', { type: 'button', class: 'row', on: { click: async () => { const ok = await confirmDialog({ title: 'Clear the app cache?', message: 'The saved copy of the app files is deleted and the app reloads with fresh files. Your links, folders and settings are not touched.', confirmLabel: 'Clear and reload' }); if (ok) clearCachesAndReload(); } } }, h('span', { class: 'row-ic' }, icon('refresh')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Clear app cache' }), h('span', { class: 'row-desc', text: 'Use this if the app looks out of date or something does not load.' })), h('span', { class: 'row-end' }, icon('chevron-right')));
  return h('div');
}
