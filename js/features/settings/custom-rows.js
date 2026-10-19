/**
 * Linkivo — js/features/settings/custom-rows.js  (v2.1.0)
 * Purpose: the rows of the settings registry that are not plain controls: install status, updates, about, account, storage,
 *          metadata service status.
 * API: renderCustom(name, ctx) -> Element|Element[]     ctx = { router }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { getSession } from '../../core/session.js';
import { maskEmail } from '../../core/mask.js';
import { relativeTime, plural } from '../../core/format.js';
import { installState, installStatus, promptInstall } from '../../core/install.js';
import { checkForUpdates, updateState } from '../../core/update.js';
import { health } from '../../core/worker-client.js';
import { getEngine } from '../../core/app-data.js';
import { resendVerification } from '../auth/auth-service.js';
import { logOut } from '../shell/shell-parts.js';
import app from '../../core/app-info.js';

const row = (label, desc, end, opts = {}) => h('div', { class: ['row', opts.stack && 'is-stack'] }, h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), end && h('span', { class: 'row-end' }, end));

function install() {
  const box = h('div');
  const render = () => {
    const st = installStatus();
    const btn = installState.get().canPrompt ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Install', on: { click: async () => { await promptInstall(); } } }) : null;
    box.replaceChildren(row(st.title, st.text, btn));
  };
  installState.subscribe(render); render();
  return box;
}

function update() {
  const desc = () => `Version ${app.version}. ${updateState.get().lastCheck ? 'Last checked ' + relativeTime(updateState.get().lastCheck) + '.' : 'Not checked yet.'}`;
  const box = h('div');
  const btn = h('button', { type: 'button', class: 'btn btn-sm', text: 'Check for updates' });
  const render = () => { const s = updateState.get(); btn.disabled = s.checking; btn.textContent = s.checking ? 'Checking' : 'Check for updates'; box.replaceChildren(row('Updates', s.ready ? 'An update is ready and will install when background work finishes.' : desc(), btn)); };
  btn.addEventListener('click', async () => {
    const r = await checkForUpdates();
    toast(r === 'updating' ? 'Update found. Reloading shortly.' : r === 'current' ? 'You have the latest version.' : r === 'unsupported' ? 'Updates are not supported in this browser.' : 'Could not check for updates.', { type: r === 'error' ? 'error' : 'info' });
  });
  updateState.subscribe(render); render();
  return box;
}

function about() {
  return h('div', { class: 'row is-stack' }, h('dl', { class: 'kv', style: { width: '100%' } },
    h('dt', { text: 'App' }), h('dd', { text: `${app.name} ${app.version}` }),
    h('dt', { text: 'Developer' }), h('dd', null, h('a', { href: app.site, target: '_blank', rel: 'noopener', 'data-native': '', text: app.developer })),
    h('dt', { text: 'Source' }), h('dd', null, h('a', { href: app.repo, target: '_blank', rel: 'noopener', 'data-native': '', text: 'GitHub' }))));
}

function account({ router }) {
  const s = getSession();
  if (s.mode === 'guest') {
    return [
      row('Guest mode', 'Your links are stored only on this device. If browser data is cleared they can not be recovered.', h('span', { class: 'tag', text: 'This device' })),
      h('button', { type: 'button', class: 'row', on: { click: () => logOut(router, { guest: true }) } }, h('span', { class: 'row-ic' }, icon('login')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Log in' }), h('span', { class: 'row-desc', text: 'Moving guest data into an account arrives in v2.5.0.' })))
    ];
  }
  const u = s.user;
  const verify = u.emailVerified ? h('span', { class: 'tag', text: 'Verified' }) : h('button', { type: 'button', class: 'btn btn-sm', text: 'Resend email', on: { click: async () => { try { await resendVerification(); toast('Verification email sent.'); } catch { toast('Could not send the email. Try again later.', { type: 'error' }); } } } });
  return [
    row(u.name, maskEmail(u.email), null),
    row('Email verification', u.emailVerified ? 'Your email address is verified.' : 'Verify your email so you can recover your account.', verify),
    row('Sign-in method', u.providers.map((p) => (p === 'google.com' ? 'Google' : p === 'password' ? 'Email and password' : p)).join(', ') || 'Unknown', null),
    h('button', { type: 'button', class: 'row is-danger', on: { click: () => logOut(router) } }, h('span', { class: 'row-ic' }, icon('logout')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Log out' })))
  ];
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

function worker() {
  const out = h('span', { class: 'help', text: 'Not checked' });
  const btn = h('button', { type: 'button', class: 'btn btn-sm', text: 'Check' });
  btn.addEventListener('click', async () => {
    btn.classList.add('is-loading');
    const r = await health();
    btn.classList.remove('is-loading');
    out.textContent = r.ok ? `Online, version ${r.version}, ${r.ms} ms` : `Not reachable (${r.error || 'error'})`;
    out.className = r.ok ? 'mt-ok' : 'mt-bad';
  });
  return row('Metadata service', 'The Cloudflare Worker that reads page titles and icons.', h('span', { class: 'ctl-end' }, out, btn));
}

export function renderCustom(name, ctx) {
  return ({ install, update, about, account, storage, worker })[name]?.(ctx) ?? h('div');
}
