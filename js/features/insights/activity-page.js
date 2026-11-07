/**
 * Linkivo — js/features/insights/activity-page.js  (v2.5.2)
 * Purpose: /profile/activity — what happened in this library: imports, exports, deletes, restores (kept on this device, newest 500) plus, for accounts, the security events the Worker
 *          writes (lock on/off, PIN reset, locked folders, account changes). Grouped by day. Entries only name things (a folder, a count), never a PIN or a code.
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../core/dom.js';
import { refreshButton } from '../../ui/refresh-button.js';
import { loadCss } from '../../core/css-loader.js';
import { emptyState } from '../../ui/empty-state.js';
import { getEngine } from '../../core/app-data.js';
import { listActivity } from '../../core/activity.js';
import { getLock } from '../../core/lock.js';
import { relativeTime } from '../../core/format.js';
import { dayLabel } from './stats-core.js';

const LABEL = { import: 'Imported', export: 'Exported', delete: 'Deleted links', restore: 'Restored', merge: 'Merged folders', duplicate: 'Duplicated a folder', 'folder-delete': 'Deleted a folder', 'empty-bin': 'Emptied the Recycle Bin', 'lock-on': 'App lock on', 'lock-off': 'App lock off', 'pin-reset': 'PIN reset', 'vault-on': 'Locked folders on', 'vault-off': 'Locked folders off', 'vault-code': 'Locked folders code changed', 'vault-reset': 'Locked folders code reset' };
export const activityTitle = (type) => LABEL[type] || String(type).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

export async function mount(container) {
  await loadCss('/css/pages/pages.css');
  const engine = getEngine(), body = h('div', { class: 'ac-body' });
  container.appendChild(h('div', { class: 'page page-enter activity' }, h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Activity' }), h('div', { class: 'page-actions' }, refreshButton())), body));
  if (!engine) { body.appendChild(emptyState({ art: 'lost', title: 'Your data is not ready', text: 'Wait a moment and try again.', actions: [] })); return () => {}; }
  let rows = await listActivity(engine);
  const lock = getLock();
  if (lock.scope === 'account' && engine.adapter && engine.adapter.recent) {
    try { const cloud = await engine.adapter.recent(`activity/${lock.uid}`, 'ts', 100); rows = rows.concat(Object.values(cloud || {}).map((r) => ({ type: r.type, info: r.info, ts: r.ts }))); } catch { /* the device list still shows */ }
  }
  rows.sort((a, b) => b.ts - a.ts);
  if (!rows.length) { body.appendChild(emptyState({ art: 'library', title: 'No activity yet', text: 'Imports, exports, deletes and security changes are listed here.', actions: [] })); return () => {}; }
  const groups = new Map(); for (const r of rows) { const k = dayLabel(r.ts); (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  body.replaceChildren(...[...groups].map(([k, list]) => h('section', { class: 'ac-sec' }, h('h2', { class: 'ac-h', text: k }), h('ul', { class: 'ac-list' }, list.map((r) => h('li', { class: 'ac-row' }, h('span', { class: 'ac-t', text: activityTitle(r.type) }), r.info ? h('span', { class: 'ac-i', text: r.info }) : null, h('span', { class: 'ac-w', text: relativeTime(r.ts) })))))));
  return () => {};
}
