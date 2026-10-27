/**
 * Linkivo — js/features/settings/devices-sheet.js  (v2.2.2)
 * Purpose: "Logged-in devices" (owner request): a list of every device that is signed in to this account and, on tap, everything known about it (browser,
 *          system, approximate place, hidden-end IP address, time zone, first sign-in, last activity) with a button that signs that device out.
 *          Signing out another device is app-level (see core/devices.js): it leaves the next time it opens the app, or at once if it is open.
 *          v2.2.3 (owner): "Signing out" is a yellow badge; once the device has signed out it is NOT removed automatically: it shows a grey "Signed out"
 *          badge and a cross icon, and only that cross removes it from the list.
 * API: openDevices() -> Promise<void>     deviceDetails(rec) -> [[label, value]]  (pure, tested)     deviceState(rec) -> 'current'|'out'|'leaving'|'active'
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { openSheet } from '../../ui/sheet.js';
import { confirmDialog } from '../../ui/confirm.js';
import { relativeTime, dateTime } from '../../core/format.js';
import { locationText } from '../../core/device-info.js';
import { getDevices } from '../../core/app-data.js';
import { logOut } from '../shell/shell-parts.js';
import { requireSensitive } from '../../core/sensitive.js';

const KIND = { computer: 'Computer', phone: 'Phone', tablet: 'Tablet' };
/** Pure: the rows of the detail popup. A field the device did not report is written as "Not available", never left out silently. */
/** Pure: what the row shows. `out` (signed out) wins over `rv` (asked to sign out) because a device that finished signing out still carries both. */
export const deviceState = (r) => (r.current ? 'current' : r.out ? 'out' : r.rv ? 'leaving' : 'active');

export function deviceDetails(r) {
  const na = (v) => v || 'Not available';
  return [
    ['Device', na(r.name)], ['Browser', na(r.br)], ['System', na(r.os)], ['Type', KIND[r.kind] || 'Not available'], ['Opened as', r.via === 'pwa' ? 'Installed app' : 'Web browser'],
    ['Place (approximate)', locationText(r)], ['IP address (end hidden)', na(r.ip)], ['Time zone', na(r.tz)],
    ['First signed in', r.ts ? dateTime(r.ts) : 'Not available'], ['Last active', r.seen ? `${dateTime(r.seen)} (${relativeTime(r.seen)})` : 'Not available'],
    ...(r.out ? [['Signed out', dateTime(r.out)]] : [])
  ];
}

export async function openDevices() {
  const svc = getDevices();
  const body = h('div', { class: 'dev-list', role: 'list' }, h('p', { class: 'help', text: 'Loading devices' }));
  const sheet = openSheet({ title: 'Logged-in devices', wide: false, body, actions: [] });
  if (!svc) { body.replaceChildren(h('p', { class: 'help', text: 'The device list is not ready yet. Wait a moment and try again.' })); return; }

  async function load() {
    try {
      const list = await svc.list();
      if (!list.length) { body.replaceChildren(h('p', { class: 'help', text: 'No devices yet.' })); return; }
      body.replaceChildren(h('p', { class: 'help dev-note', text: 'Signing out another device takes effect when it opens Linkivo (at once if it is open now). To also block its saved login, change your password.' }),
        ...list.map((r) => {
          const state = deviceState(r);
          const tag = state === 'current' ? h('span', { class: 'tag', text: 'This device' }) : state === 'out' ? h('span', { class: 'tag is-muted', text: 'Signed out' }) : state === 'leaving' ? h('span', { class: 'tag is-warn', text: 'Signing out' }) : icon('chevron-right', { size: 18 });
          const sub = state === 'out' ? `${locationText(r)}  \u00b7  ${relativeTime(r.out)}` : `${locationText(r)}  \u00b7  ${r.current ? 'Active now' : relativeTime(r.seen)}`;
          return h('div', { class: ['row dev-row', state === 'out' && 'is-out'], role: 'listitem' },
            h('button', { type: 'button', class: 'dev-main', on: { click: () => details(r) } },
              h('span', { class: 'row-ic' }, icon('monitor')),
              h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: r.name || 'Unknown device' }), h('span', { class: 'row-desc', text: sub })), tag),
            state === 'out' && h('button', { type: 'button', class: 'btn-icon is-sm', 'aria-label': `Remove ${r.name || 'device'} from the list`, 'data-tip': 'Remove from the list', on: { click: () => removeOut(r) } }, icon('close', { size: 16 })));
        }));
    } catch { body.replaceChildren(h('p', { class: 'help is-error', text: 'Could not load the devices. Check your connection and try again.' }), h('button', { type: 'button', class: 'btn btn-sm', on: { click: load } }, 'Try again')); }
  }

  async function removeOut(r) {
    try { await svc.forget(r.id); load(); } catch { toast('Could not remove it. Try again.', { type: 'error' }); }
  }

  function details(r) {
    const kv = h('dl', { class: 'kv' }, deviceDetails(r).flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
    const acts = [];
    if (r.out) acts.push(h('button', { type: 'button', class: 'btn', on: { click: async () => { await removeOut(r); d.close(); } } }, icon('close', { size: 18 }), 'Remove from the list'));
    else if (r.current) acts.push(h('button', { type: 'button', class: 'btn btn-danger', on: { click: () => { d.close(); sheet.close(); logOut(null); } } }, icon('logout', { size: 18 }), 'Log out this device'));
    else {
      acts.push(h('button', { type: 'button', class: 'btn btn-danger', disabled: !!r.rv, on: { click: async () => {
        if (!(await confirmDialog({ title: 'Log out this device?', message: `${r.name || 'This device'} will be signed out of your account.`, confirmLabel: 'Log out device', danger: true }))) return;
        if (!(await requireSensitive('device-logout'))) return;
        try { await svc.signOutDevice(r.id); toast('Sign-out requested.'); d.close(); load(); } catch { toast('Could not reach that device record. Try again.', { type: 'error' }); }
      } } }, icon('logout', { size: 18 }), r.rv ? 'Sign-out requested' : 'Log out this device'));
      if (r.rv) acts.push(h('button', { type: 'button', class: 'btn', on: { click: async () => { try { await svc.forget(r.id); d.close(); load(); } catch { toast('Could not remove it.', { type: 'error' }); } } } }, 'Remove from the list'));
    }
    const d = openSheet({ title: r.name || 'Device', body: h('div', { class: 'form' }, kv, h('div', { class: 'acc-foot' }, ...acts)), actions: [] });
  }
  load();
}
