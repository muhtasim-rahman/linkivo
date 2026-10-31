/**
 * Linkivo — js/features/settings/custom-rows.js  (v2.1.3, v2.2.2)
 * Purpose: the rows of the settings registry that are not plain controls: install status, updates, about, developer, account, data and sync,
 *          metadata service status. v2.1.3: the password reset row asks for confirmation and is rate limited (it used to send an email per tap).
 * API: renderCustom(name, ctx) -> Element|Element[]     ctx = { router }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { getSession } from '../../core/session.js';
import { maskEmail } from '../../core/mask.js';
import { relativeTime, dateTime, plural } from '../../core/format.js';
import { prefs } from '../../core/local-prefs.js';
import { installState, installStatus, promptInstall } from '../../core/install.js';
import { checkForUpdates, updateState } from '../../core/update.js';
import { health, EXPECTED_WORKER, isWorkerOutdated } from '../../core/worker-client.js';
import { getEngine } from '../../core/app-data.js';
import { resendVerification, sendReset } from '../auth/auth-service.js';
import { sendAllowed, friendlyWait } from '../../core/send-limit.js';
import { confirmDialog } from '../../ui/confirm.js';
import { requireSensitive } from '../../core/sensitive.js';
import { aboutCard, developerCard, appDetails as appDetailsNodes } from './about-card.js';
import { accountRows } from './account-card.js';
import { logOut } from '../shell/shell-parts.js';
import app from '../../core/app-info.js';
import { syncRow } from './sync-picker.js';
import { quota as mlQuota, mlEnabled, subscribeQuota } from '../../core/microlink.js';
import { isAdminAccount, isAdminView, subscribeAdmin, getAdminViewMode, setAdminView } from '../../core/admin.js';
import { KEEP_OPTIONS } from '../../core/history.js';
import { createSelect } from '../../ui/select.js';

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
  const desc = () => { const a = updateState.get().available; return `Version ${app.version}. ${a ? `Version ${a} is available.` : updateState.get().lastCheck ? 'Last checked ' + relativeTime(updateState.get().lastCheck) + '.' : 'Not checked yet.'}`; };
  const box = h('div');
  const btn = h('button', { type: 'button', class: 'btn btn-sm', text: 'Check for updates' });
  const render = () => { const s = updateState.get(); btn.disabled = s.checking; btn.textContent = s.checking ? 'Checking' : 'Check for updates'; box.replaceChildren(row('Updates', s.ready ? 'An update is ready and will install when background work finishes.' : desc(), btn)); };
  btn.addEventListener('click', async () => {
    const r = await checkForUpdates({ launch: true });
    toast(r === 'updating' ? 'Update found. Reloading shortly.' : r === 'available' ? 'A new version is available.' : r === 'current' ? 'You have the latest version.' : r === 'unsupported' ? 'Updates are not supported in this browser.' : 'Could not check for updates.', { type: r === 'error' ? 'error' : 'info' });
  });
  updateState.subscribe(render); render();
  return box;
}

function about() { return aboutCard(); }
function developer() { return developerCard(); }

// ! Unused since v2.2.2: the Account section is built by account-card.js. This older version (and passwordRow below) is kept for reference only.
function accountOld({ router }) {
  const s = getSession();
  if (s.mode === 'guest') {
    return [
      row('Guest mode', 'Your links are stored only on this device. If browser data is cleared they can not be recovered.', h('span', { class: 'tag', text: 'This device' })),
      row('Back up your links', 'Log in to keep them in your account. Backup and moving guest data to an account arrive in v2.5.0 and v2.6.0.', null),
      h('button', { type: 'button', class: 'row', on: { click: () => logOut(router, { guest: true }) } }, h('span', { class: 'row-ic' }, icon('login')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Log in' }), h('span', { class: 'row-desc', text: 'Moving guest data into an account arrives in v2.5.0.' })))
    ];
  }
  const u = s.user;
  const verify = u.emailVerified ? h('span', { class: 'tag', text: 'Verified' }) : h('button', { type: 'button', class: 'btn btn-sm', text: 'Resend email', on: { click: async () => { try { await resendVerification(); toast('Verification email sent. Check your inbox and spam folder.'); } catch (e) { toast(e && e.code === 'lk/cooldown' ? `An email was sent a moment ago. Try again in ${friendlyWait(e.waitMs)}.` : 'Could not send the email. Try again later.', { type: e && e.code === 'lk/cooldown' ? 'info' : 'error' }); } } } });
  return [
    row(u.name, maskEmail(u.email), null),
    row('Email verification', u.emailVerified ? 'Your email address is verified.' : 'Verify your email so you can recover your account.', verify),
    row('Sign-in method', u.providers.map((p) => (p === 'google.com' ? 'Google' : p === 'password' ? 'Email and password' : p)).join(', ') || 'Unknown', null),
    // Password accounts only (Google accounts manage their password with Google). One deliberate path: confirm first, then the email, and a
    // cooldown so the row can not be used to send many emails (they land in spam).
    ...(u.providers.includes('password') ? [passwordRow(u)] : []),
    h('button', { type: 'button', class: 'row is-danger', on: { click: () => logOut(router) } }, h('span', { class: 'row-ic' }, icon('logout')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Log out' })))
  ];
}

function passwordRow(u) {
  const desc = () => { const g = sendAllowed('reset', u.email); return g.ok ? `We email a link to ${maskEmail(u.email)}. Only one email every few minutes.` : `A link was sent recently. You can ask again in ${friendlyWait(g.waitMs)}. Check your spam folder too.`; };
  const sub = h('span', { class: 'row-desc', text: desc() });
  return h('button', { type: 'button', class: 'row', on: { click: async () => {
    const g = sendAllowed('reset', u.email);
    if (!g.ok) { toast(`A reset link was sent recently. Check your inbox and spam folder, or try again in ${friendlyWait(g.waitMs)}.`); return; }
    const ok = await confirmDialog({ title: 'Send a password reset email?', message: `A link to choose a new password will be sent to ${maskEmail(u.email)}. Your current password keeps working until you use the link.`, confirmLabel: 'Send email' });
    if (!ok || !(await requireSensitive('password-reset'))) return;
    try { await sendReset(u.email); toast('Reset link sent. Check your inbox and spam folder.'); }
    catch (e) { toast(e && e.code === 'lk/cooldown' ? `A link was sent a moment ago. Try again in ${friendlyWait(e.waitMs)}.` : 'Could not send the email. Try again later.', { type: e && e.code === 'lk/cooldown' ? 'info' : 'error' }); }
    sub.textContent = desc();
  } } }, h('span', { class: 'row-ic' }, icon('lock')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Reset password' }), sub));
}

function account(ctx) { return accountRows({ router: ctx.router, rerender: ctx.rerender }); }
function appDetails() { return appDetailsNodes(); }

function sync() {
  const box = h('div');
  const render = () => {
    const e = getEngine();
    if (!e) { box.replaceChildren(row('Storage', 'The data layer is not running.')); return; }
    const st = e.status(), c = e.counts();
    const where = st.kind === 'guest' ? 'On this device only (IndexedDB).' : 'In your account, cached on this device (IndexedDB).';
    const state = st.kind === 'guest' ? (st.persistent ? 'Saved' : 'Not saved: this browser blocks storage') : { idle: 'In sync', syncing: 'Syncing', offline: 'Offline, changes are queued', error: 'Sync problem, will retry' }[st.state];
    const last = st.lastSync || prefs.get('sync.last', 0); if (st.lastSync) prefs.set('sync.last', st.lastSync);
    // v2.2.2 (owner): the separate "Sync now" row is gone; the sync icon sits beside View profile in the Account card.
    box.replaceChildren(h('div', { class: 'row is-stack' }, h('dl', { class: 'kv', style: { width: '100%' } },
      h('dt', { text: 'Location' }), h('dd', { text: where }), h('dt', { text: 'Status' }), h('dd', { text: state }),
      st.kind === 'guest' ? null : h('dt', { text: 'Last synced' }), st.kind === 'guest' ? null : h('dd', { text: last ? `${dateTime(last)} (${relativeTime(last)})` : 'Not yet in this session' }),   // v2.2.4 (owner)
      h('dt', { text: 'Waiting to upload' }), h('dd', { text: st.kind === 'guest' ? 'Not applicable' : plural(st.pending, 'change') }),
      h('dt', { text: 'Contents' }), h('dd', { text: `${plural(c.folders, 'folder')}, ${plural(c.links, 'link')}` }))));
  };
  render();
  // v2.4.1 (owner): Last synced showed old data after Sync now: the row was painted once. It now repaints on every sync event while it is on screen.
  const e0 = getEngine(); const off = e0 && e0.subscribe ? e0.subscribe((ev) => { if (!box.isConnected) { off(); return; } if (ev.type === 'sync' || ev.type === 'change') render(); }) : null;
  return box;
}

function worker() {
  const out = h('span', { class: 'help', text: 'Not checked' });
  const btn = h('button', { type: 'button', class: 'btn btn-sm', text: 'Check' });
  btn.addEventListener('click', async () => {
    btn.classList.add('is-loading');
    const r = await health();
    btn.classList.remove('is-loading');
    const old = r.ok && isWorkerOutdated(r.version);
    out.textContent = r.ok ? `Online, version ${r.version}, ${r.ms} ms${old ? `. Outdated: this app expects ${EXPECTED_WORKER}. Paste the newest worker.js into Cloudflare.` : ''}` : `Not reachable (${r.error || 'error'})`;
    out.className = r.ok && !old ? 'mt-ok' : 'mt-bad';
  });
  return row('Metadata service', 'The Cloudflare Worker that reads page titles and icons.', h('span', { class: 'ctl-end' }, out, btn));
}

// ---- v2.2.0: import, export and Recycle Bin rows ----------------------------------------------------------------------------
function importData(ctx) {
  // v2.2.1: ONE popup that takes only a file Linkivo exported itself (owner request); other files are imported from the Import page.
  return row('Import a Linkivo backup', 'Add a file exported by Linkivo. Folders, tags, points and flags come back, and no titles are fetched again.', h('button', { type: 'button', class: 'btn btn-sm btn-primary', text: 'Import', on: { click: () => import('../import/restore-popup.js').then((m) => m.openRestorePopup({ engine: getEngine(), router: ctx.router })) } }));
}
function exportData() {
  return row('Export library', 'Download everything as a Linkivo backup, or as JSON, CSV, Excel, text, Markdown, bookmarks, a printable page or OPML.', h('button', { type: 'button', class: 'btn btn-sm', text: 'Export', on: { click: () => import('../export/export-sheet.js').then((m) => m.openExport({ engine: getEngine(), scope: { type: 'all' }, title: 'Export library' })) } }));
}
function recycleBin(ctx) {
  const e = getEngine(), c = e ? e.counts() : { deletedFolders: 0, deletedLinks: 0 };
  return row('Recycle Bin', `Deleted folders and links stay for 15 days. Now: ${plural(c.deletedFolders, 'folder')}, ${plural(c.deletedLinks, 'link')}.`, h('button', { type: 'button', class: 'btn btn-sm', text: 'Open', on: { click: () => ctx.router.navigate('/settings/recycle-bin') } }));
}

// ---- v2.3.1: sync choice, Microlink allowance, admin view --------------------------------------------------------------------
function syncPick() { return syncRow(); }
function mlQuotaRow() {
  const box = h('div');
  const render = () => {
    const q = mlQuota(), on = mlEnabled();
    const info = null;
    box.replaceChildren(row('Microlink allowance today', on ? `${q.left} of ${q.limit} lookups left (a reminder, Microlink may still answer).` : 'Switched off. Turn it on above.'));
  };
  subscribeQuota(() => { if (box.isConnected) render(); });
  render(); return box;
}
/** v2.4.1: "Keep history for" is a dropdown. Admins get one extra entry, "No limit"; everyone else sees seven plain choices. */
function historyKeepRow() {
  const box = h('div');
  const draw = () => {
    const opts = KEEP_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
    if (isAdminView()) opts.push({ value: 'never', label: 'No limit' });
    let cur = prefs.get('history.keep', '7d'); if (!opts.some((o) => o.value === cur)) cur = '7d';
    const sel = createSelect({ options: opts, value: cur, label: 'Keep history for', align: 'end', onChange: (v) => { prefs.set('history.keep', v); toast(v === 'off' ? 'History is off. Existing entries are removed.' : 'History keep time saved.'); } });
    box.replaceChildren(row('Keep history for', 'Older entries are removed automatically. Off stops recording and clears the list.', sel));
  };
  draw(); subscribeAdmin(() => { if (box.isConnected) draw(); });
  return box;
}
function historyOpenRow() {
  return h('a', { class: 'row', href: '/profile/history' }, h('span', { class: 'row-ic' }, icon('history')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Open History' }), h('span', { class: 'row-desc', text: 'See the links you opened, by day.' })), h('span', { class: 'row-end' }, icon('chevron-right')));
}
function adminViewRow() {
  const box = h('div');
  const render = () => {
    if (!isAdminAccount()) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
    const cur = getAdminViewMode();
    const sel = createSelect({ options: [{ value: 'admin', label: 'Admin' }, { value: 'normal', label: 'Normal user' }], value: cur, label: 'View the app as', align: 'end', onChange: (v) => { setAdminView(v); toast(v === 'admin' ? 'Back to Admin.' : 'Showing the app as a normal user.'); render(); } });
    box.replaceChildren(row('View the app as', 'For testing. Normal user makes the whole app behave like an ordinary account until you switch back or reload.', sel));
  };
  subscribeAdmin(render); render(); return box;
}

export function renderCustom(name, ctx) {
  return ({ install, update, about, developer, appDetails, account, sync, worker, importData, exportData, recycleBin, syncPick, mlQuota: mlQuotaRow, adminView: adminViewRow, historyKeep: historyKeepRow, historyOpen: historyOpenRow })[name]?.(ctx) ?? h('div');
}
