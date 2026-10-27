/**
 * Linkivo — js/features/settings/delete-account.js  (v2.2.4)
 * Purpose: "Delete account" (Settings > Danger zone, last row). There is no automatic deletion yet (it needs the Worker and a service account, v2.5.0), so
 *          the owner checks every request by hand. The flow is built to make that check reliable:
 *            1 Verify: password (with a Forgot password link) or, for Google-only accounts, a Google sign-in popup. A fresh sign-in proves the person holds it.
 *            2 Summary: account facts, how much data is in it, and what deleting does. The person ticks that they understand.
 *            3 Type DELETE ACCOUNT exactly.
 *            4 Request email: a ready email (subject, message, account details, a request id) to the developer, opened in the person's mail app (or Gmail on
 *              the web, or copied). It must be sent FROM the account's own email address, otherwise it is rejected.
 *          Nothing is deleted by this flow. API: openDeleteAccount({ router? }) -> Promise<void>     buildRequest(facts, counts, id, now) -> { subject, body }  (pure, tested)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { getEngine } from '../../core/app-data.js';
import { maskEmail } from '../../core/mask.js';
import { dateTime, plural } from '../../core/format.js';
import { sendAllowed, friendlyWait } from '../../core/send-limit.js';
import { reauthenticate, accountFacts, sendReset, friendlyAuthError, hasPassword } from '../auth/auth-service.js';
import { getSession } from '../../core/session.js';
import app from '../../core/app-info.js';

export const PHRASE = 'DELETE ACCOUNT';
export const REQUEST_TO = 'mdturzo.dev@gmail.com';
const WHAT = ['All your folders and links, the Recycle Bin and the vault.', 'Your settings, history and the list of logged-in devices.', 'Your sign-in (email and password, linked Google).', 'It can not be undone once the request is approved.'];

/** Pure: the email text. The id lets the developer match the request; nothing secret is in it. */
export function buildRequest(f, counts, id, now) {
  const subject = `Account deletion request: ${f.email} (${id})`;
  const body = [
    'Hello Linkivo developer,', '', `I want my Linkivo account deleted with all its data. I am sending this from the email address of the account (${f.email}).`, '',
    '--- Account details ---', `Request id: ${id}`, `Email: ${f.email}`, `Name: ${f.name || '-'}`, `Account id: ${f.uid}`, `Sign-in methods: ${f.providers.join(', ') || '-'}`, `Email verified: ${f.verified ? 'yes' : 'no'}`,
    `Created: ${f.created ? new Date(f.created).toISOString() : '-'}`, `Last sign-in: ${f.lastLogin ? new Date(f.lastLogin).toISOString() : '-'}`,
    `Data: ${counts.folders} folders, ${counts.links} links`, `App version: ${app.version}`, `Verified by a fresh sign-in at: ${new Date(now).toISOString()}`, `Typed confirmation: ${PHRASE}`, '',
    'If you need to confirm it is me, please reply to this email.'].join('\n');
  return { subject, body };
}
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

export async function openDeleteAccount() {
  const s = getSession(); if (s.mode !== 'account') return;
  const user = s.user, usesPassword = hasPassword(user);
  const body = h('div', { class: 'form da' });
  let sheet = null, facts = null, verifiedAt = 0;
  const err = h('p', { class: 'help is-error', role: 'alert' });
  const foot = (...btns) => h('div', { class: 'acc-foot' }, ...btns);
  const btn = (label, fn, primary = true) => h('button', { type: 'button', class: ['btn', primary && 'btn-primary'], on: { click: fn } }, label);
  const show = (...kids) => { err.textContent = ''; body.replaceChildren(...kids); };

  function stepVerify() {
    const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Password', spellcheck: 'false' });
    const run = async () => {
      err.textContent = ''; if (usesPassword && !pass.value) { err.textContent = 'Enter your password.'; return; }
      sheet.setBusy?.(true);
      try { await reauthenticate(usesPassword ? pass.value : undefined); facts = await accountFacts(); verifiedAt = Date.now(); stepSummary(); }
      catch (e) { err.textContent = friendlyAuthError(e) || 'Could not verify. Try again.'; }
      sheet.setBusy?.(false);
    };
    const forgot = h('button', { type: 'button', class: 'link', text: 'Forgot password?', on: { click: async () => {
      const g = sendAllowed('reset', user.email); if (!g.ok) { err.textContent = `A link was sent recently. Try again in ${friendlyWait(g.waitMs)}.`; return; }
      try { await sendReset(user.email); toast(`Reset link sent to ${maskEmail(user.email)}.`); } catch (e) { err.textContent = friendlyAuthError(e) || ''; }
    } } });
    show(h('p', { class: 'help', text: 'Step 1 of 4. First confirm it is you.' }),
      usesPassword ? h('label', { class: 'acc-field' }, h('span', { class: 'acc-label', text: 'Password' }), pass) : h('p', { class: 'help', text: 'This account signs in with Google. A Google window will open to confirm it is you.' }),
      usesPassword && forgot, err, foot(h('span'), btn(usesPassword ? 'Verify' : 'Continue with Google', run)));
    if (usesPassword) pass.focus();
  }
  function stepSummary() {
    const c = getEngine()?.counts?.() || { folders: 0, links: 0 };
    const kv = [['Name', facts.name || '-'], ['Email', maskEmail(facts.email)], ['Sign-in', facts.providers.map((p) => (p === 'google.com' ? 'Google' : 'Email and password')).join(' and ')], ['Created', facts.created ? dateTime(facts.created) : '-'], ['Last sign-in', facts.lastLogin ? dateTime(facts.lastLogin) : '-'], ['Contains', `${plural(c.folders, 'folder')}, ${plural(c.links, 'link')}`]];
    const ok = h('input', { type: 'checkbox', id: 'da-ok' }); const next = btn('Continue', () => { if (!ok.checked) { err.textContent = 'Tick the box to continue.'; return; } stepType(c); });
    show(h('p', { class: 'help', text: 'Step 2 of 4. Check what will be deleted.' }),
      h('dl', { class: 'kv' }, kv.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      h('p', { class: 'help', text: 'Deleting the account removes:' }), h('ul', { class: 'da-list' }, WHAT.map((t) => h('li', { text: t }))),
      h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => import('../export/export-sheet.js').then((m) => m.openExport({ engine: getEngine(), scope: { type: 'all' }, title: 'Back up first' })) } }, icon('download', { size: 16 }), 'Back up my data first'),
      h('label', { class: 'check-row', for: 'da-ok' }, ok, h('span', { text: 'I understand that my links and folders will be lost.' })), err, foot(btn('Back', () => stepVerify(), false), next));
  }
  function stepType(c) {
    const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: PHRASE, 'aria-label': 'Type DELETE ACCOUNT' });
    show(h('p', { class: 'help', text: 'Step 3 of 4. Type the words below exactly to confirm.' }), h('p', { class: 'da-phrase', text: PHRASE }), input, err,
      foot(btn('Back', () => stepSummary(), false), btn('Continue', () => { if (input.value.trim() !== PHRASE) { err.textContent = `Type ${PHRASE} exactly, in capital letters.`; return; } stepEmail(c); })));
    input.focus();
  }
  function stepEmail(c) {
    const id = newId(), { subject, body: text } = buildRequest(facts, c, id, verifiedAt);
    const enc = encodeURIComponent, mailto = `mailto:${REQUEST_TO}?subject=${enc(subject)}&body=${enc(text)}`;
    const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(REQUEST_TO)}&su=${enc(subject)}&body=${enc(text)}`;
    show(h('p', { class: 'help', text: 'Step 4 of 4. Send the request email.' }),
      h('p', { class: 'help da-warn', text: `Send it from ${facts.email}, the email of this account. A request from any other address is rejected. The developer checks it by hand and may reply to you.` }),
      h('div', { class: 'da-mail' }, h('strong', { text: subject }), h('pre', { text })),
      h('div', { class: 'da-actions' }, h('a', { class: 'btn btn-primary', href: mailto, 'data-native': '' }, icon('mail', { size: 18 }), 'Open my email app'), h('a', { class: 'btn', href: gmail, target: '_blank', rel: 'noopener', 'data-native': '' }, 'Open Gmail'),
        h('button', { type: 'button', class: 'btn', on: { click: async () => { try { await navigator.clipboard.writeText(`To: ${REQUEST_TO}\nSubject: ${subject}\n\n${text}`); toast('Copied. Paste it into an email.'); } catch { toast('Could not copy. Select the text and copy it.', { type: 'error' }); } } } }, 'Copy')),
      foot(btn('Back', () => stepType(c), false), btn('Done', () => sheet.close(true), false)));
  }
  sheet = openSheet({ title: 'Delete account', body, actions: [], wide: true });
  stepVerify();
}
