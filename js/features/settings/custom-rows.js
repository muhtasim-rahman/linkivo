/**
 * Linkivo — js/features/settings/custom-rows.js  (v2.1.1)
 * Purpose: the registry rows that are not plain controls: install, updates, account, storage, space used, persistent storage, app cache,
 *          metadata service status, and the About / Developer / legal blocks.
 * API: renderCustom(name, ctx) -> Element|Element[]     ctx = { router }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { openSheet } from '../../ui/sheet.js';
import { confirmDialog } from '../../ui/confirm.js';
import { getSession } from '../../core/session.js';
import { maskEmail } from '../../core/mask.js';
import { relativeTime, plural, formatBytes, dateTime } from '../../core/format.js';
import { installState, installStatus, promptInstall, installHelp } from '../../core/install.js';
import { checkForUpdates, updateState, hardUpdate } from '../../core/update.js';
import { health } from '../../core/worker-client.js';
import { getEngine } from '../../core/app-data.js';
import { resendVerification, sendReset, updateDisplayName } from '../auth/auth-service.js';
import { logOut } from '../shell/shell-parts.js';
import { aboutCard, developerCard, legalRows } from '../shell/about-card.js';
import app from '../../core/app-info.js';

const row = (label, desc, end, opts = {}) => h('div', { class: ['row', opts.stack && 'is-stack'] }, h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), end && h('span', { class: 'row-end' }, end));
const btn = (text, onClick, cls = '') => h('button', { type: 'button', class: ['btn btn-sm', cls], text, on: { click: onClick } });

function install() {
  const box = h('div');
  const render = () => {
    const st = installStatus(), s = installState.get();
    const action = s.canPrompt ? btn('Install', () => promptInstall(), 'btn-primary') : (!s.standalone && !s.installedFlag ? btn('How to install', () => { const help = installHelp(); openSheet({ title: help.title, body: h('ol', { class: 'stack', style: { paddingLeft: '18px', listStyle: 'decimal' } }, help.steps.map((t) => h('li', { text: t }))), actions: [{ label: 'Done', variant: 'primary' }] }); }) : null);
    box.replaceChildren(row(st.title, st.text, action));
  };
  installState.subscribe(render); render();
  return box;
}

function update() {
  const box = h('div');
  const b = btn('Check for updates', async () => {
    const r = await checkForUpdates();
    toast(r === 'updating' ? 'Update found. Reloading shortly.' : r === 'available' ? 'A newer version exists. Updating now.' : r === 'current' ? 'You have the latest version.' : r === 'unsupported' ? 'Updates are not supported in this browser.' : 'Could not check for updates.', { type: r === 'error' ? 'error' : 'info' });
  });
  const render = () => {
    const s = updateState.get();
    b.disabled = s.checking; b.textContent = s.checking ? 'Checking' : 'Check for updates';
    const latest = s.latest ? (s.available ? ` Latest: ${s.latest}.` : ' You are up to date.') : '';
    box.replaceChildren(row('Updates', s.ready ? 'An update is ready and installs when background work finishes.' : `Version ${app.version}.${latest} ${s.lastCheck ? 'Checked ' + relativeTime(s.lastCheck) + '.' : ''}`.trim(), b));
  };
  updateState.subscribe(render); render();
  return box;
}

function editName(u) {
  const input = h('input', { class: 'input', value: u.name, maxlength: '60', autocomplete: 'name', 'aria-label': 'Display name' });
  openSheet({ title: 'Display name', body: h('div', { class: 'field' }, h('p', { text: 'This name is shown in the menu and the sidebar.' }), input),
    actions: [{ label: 'Cancel' }, { label: 'Save', variant: 'primary', closes: false, onClick: async (api) => { api.setBusy(true); try { await updateDisplayName(input.value); api.close(); toast('Name updated.'); } catch { api.setBusy(false); toast('Could not save the name.', { type: 'error' }); return false; } } }] });
}

function account({ router }) {
  const s = getSession();
  if (s.mode === 'guest') {
    return [
      row('Guest mode', 'Your links are stored only on this device. If browser data is cleared they can not be recovered.', h('span', { class: 'tag', text: 'This device' })),
      h('button', { type: 'button', class: 'row', on: { click: () => logOut(router, { guest: true }) } }, h('span', { class: 'row-ic' }, icon('login')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Log in' }), h('span', { class: 'row-desc', text: 'Moving guest data into an account arrives in v2.5.0.' })))
    ];
  }
  const u = s.user, hasPassword = u.providers.includes('password');
  return [
    row(u.name, 'Display name', btn('Edit', () => editName(u))),
    row('Email', maskEmail(u.email)),
    row('Email verification', u.emailVerified ? 'Your email address is verified.' : 'Verify your email so you can recover your account.', u.emailVerified ? h('span', { class: 'tag', text: 'Verified' }) : btn('Resend email', async () => { try { await resendVerification(); toast('Verification email sent.'); } catch { toast('Could not send the email. Try again later.', { type: 'error' }); } })),
    row('Sign-in method', u.providers.map((p) => (p === 'google.com' ? 'Google' : p === 'password' ? 'Email and password' : p)).join(', ') || 'Unknown'),
    row('Password', hasPassword ? 'We email you a link to choose a new password.' : 'You sign in with Google, so Google manages your password.', hasPassword ? btn('Send link', async () => { try { await sendReset(u.email); toast('Reset link sent to your email.', { duration: 3500 }); } catch { toast('Could not send the link. Try again later.', { type: 'error' }); } }) : null),
    u.created ? row('Member since', dateTime(u.created)) : null,
    u.lastSignIn ? row('Last sign-in', dateTime(u.lastSignIn)) : null,
    row('Account ID', u.uid.slice(0, 8) + '...', btn('Copy', async () => { try { await navigator.clipboard.writeText(u.uid); toast('Account ID copied.'); } catch { toast('Could not copy.', { type: 'error' }); } })),
    h('button', { type: 'button', class: 'row is-danger', on: { click: () => logOut(router) } }, h('span', { class: 'row-ic' }, icon('logout')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Log out' }), h('span', { class: 'row-desc', text: 'You will need to sign in again.' })))
  ].filter(Boolean);
}

function storage() {
  const e = getEngine();
  if (!e) return row('Storage', 'The data layer is not running.');
  const st = e.status(), c = e.counts();
  const where = st.kind === 'guest' ? 'On this device only (IndexedDB).' : 'In your account, cached on this device (IndexedDB).';
  const state = st.kind === 'guest' ? (st.persistent ? 'Saved' : 'Not saved: this browser blocks storage') : { idle: 'In sync', syncing: 'Syncing', offline: 'Offline, changes are queued', error: 'Sync problem, will retry' }[st.state];
  return h('div', { class: 'row is-stack' }, h('dl', { class: 'kv', style: { width: '100%' } },
    h('dt', { text: 'Location' }), h('dd', { text: where }), h('dt', { text: 'Status' }), h('dd', { text: state }),
    h('dt', { text: 'Waiting to upload' }), h('dd', { text: st.kind === 'guest' ? 'Not applicable' : plural(st.pending, 'change') }),
    h('dt', { text: 'Contents' }), h('dd', { text: `${plural(c.folders, 'folder')}, ${plural(c.links, 'link')}` })));
}

function estimate() {
  const desc = h('span', { class: 'row-desc', text: 'Calculating...' });
  const box = h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Space used' }), desc));
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then((e) => { desc.textContent = `${formatBytes(e.usage || 0)} of ${formatBytes(e.quota || 0)} available to Linkivo on this device.`; }).catch(() => { desc.textContent = 'Not available in this browser.'; });
  else desc.textContent = 'Not available in this browser.';
  return box;
}

function persist() {
  const sup = !!(navigator.storage && navigator.storage.persist);
  const desc = h('span', { class: 'row-desc', text: sup ? 'Checking...' : 'This browser does not support it.' });
  const b = btn('Keep data', async () => { try { const ok = await navigator.storage.persist(); toast(ok ? 'Your data is now protected from automatic clean-up.' : 'The browser declined. Installing the app often helps.', { duration: 3500 }); show(); } catch { toast('Could not change this.', { type: 'error' }); } });
  async function show() { if (!sup) return; const p = await navigator.storage.persisted(); desc.textContent = p ? 'Protected: the browser will not clear Linkivo data when space is low.' : 'Not protected: the browser may clear Linkivo data when space is low. Guests benefit most.'; b.hidden = p; }
  show();
  return h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Keep data on this device' }), desc), sup && h('span', { class: 'row-end' }, b));
}

function clearCache() {
  return h('button', { type: 'button', class: 'row', on: { click: async () => {
    if (await confirmDialog({ title: 'Clear the app cache?', message: 'Downloaded app files are removed and Linkivo reloads. Your links and settings are not touched.', confirmLabel: 'Clear and reload' })) await hardUpdate();
  } } }, h('span', { class: 'row-ic' }, icon('broom')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Clear app cache' }), h('span', { class: 'row-desc', text: 'Fixes a stuck or outdated app without touching your data.' })));
}

function worker() {
  const out = h('span', { class: 'help', text: 'Not checked' });
  const b = btn('Check', async () => { b.classList.add('is-loading'); const r = await health(); b.classList.remove('is-loading'); out.textContent = r.ok ? `Online, version ${r.version}, ${r.ms} ms` : `Not reachable (${r.error || 'error'})`; out.className = r.ok ? 'mt-ok' : 'mt-bad'; });
  return row('Metadata service', 'The Cloudflare Worker that reads page titles and icons.', h('span', { class: 'ctl-end' }, out, b));
}

export function renderCustom(name, ctx) {
  const fns = { install, update, account, storage, estimate, persist, clearCache, worker, about: aboutCard, developer: developerCard, legal: legalRows };
  return fns[name] ? fns[name](ctx) : h('div');
}
