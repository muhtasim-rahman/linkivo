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
 *          v2.3.1 (owner): quieter design (no glowing icon box, red only where it matters), smooth step changes, and a tap outside no longer closes it.
 *          v2.3.0 (owner): redesigned. All four steps live in ONE popup (the content swaps, the popup never closes between steps) with a red theme (the sheet
 *          overrides the accent variables, see css/pages/settings.css `.da-sheet`), a red step bar, big folder and link counts on the review step and a live
 *          check on the typed phrase. On narrow phones every button is icon-only (the text stays as aria-label and tooltip).
 */
import { h } from '../../core/dom.js';
import { loadCss } from '../../core/css-loader.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { swapContent } from '../../ui/motion.js';
import { toast } from '../../ui/toast.js';
import { getEngine } from '../../core/app-data.js';
import { maskEmail } from '../../core/mask.js';
import { dateTime, plural } from '../../core/format.js';
import { sendAllowed, friendlyWait } from '../../core/send-limit.js';
import { reauthenticate, accountFacts, sendReset, friendlyAuthError, hasPassword } from '../auth/auth-service.js';
import { getSession } from '../../core/session.js';
import app from '../../core/app-info.js';

export const PHRASE = 'DELETE ACCOUNT';
export const REQUEST_TO = 'linkivo.web@gmail.com';
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

const STEP_NAMES = ['Verify', 'Review', 'Confirm', 'Send'];

export async function openDeleteAccount() {
  const s = getSession(); if (s.mode !== 'account') return;
  await loadCss('/css/pages/settings.css');
  const user = s.user, usesPassword = hasPassword(user);
  const body = h('div', { class: 'da' });
  let sheet = null, facts = null, verifiedAt = 0;
  const err = h('p', { class: 'help is-error', role: 'alert' });

  /** A button that is text + icon on wide popups and icon only on narrow phones (CSS hides .da-bt under 480px; label stays for screen readers and the tooltip). */
  const btn = (ic, label, fn, { primary = false, tag = 'button', attrs = {} } = {}) => h(tag, { type: tag === 'button' ? 'button' : null, class: ['btn', 'da-btn', primary && 'btn-primary'], 'aria-label': label, 'data-tip': label, on: fn ? { click: fn } : null, ...attrs }, icon(ic, { size: 18 }), h('span', { class: 'da-bt', text: label }));
  const foot = (left, right) => h('div', { class: 'da-foot' }, left || h('span'), right);

  /** The shared frame of every step (v2.3.1, owner: less "AI look", smoother). The title block and the 4-part progress bar stay in place and only change
   *  (the bar fills with a transition); the step's own content and footer are swapped inside `view` with a slide and a height change (ui/motion.js),
   *  forward steps come in from the right, Back comes in from the left. */
  let shown = 0;
  const lead = h('p', { class: 'da-lead' }), ttl = h('h3', { class: 'da-title' }), no = h('span', { class: 'da-no' });
  const bar = h('ol', { class: 'da-steps' }, STEP_NAMES.map((name) => h('li', null, h('i'), h('span', { text: name }))));
  const view = h('div', { class: 'da-view' });
  body.append(h('div', { class: 'da-head' }, no, ttl, lead), bar, view);
  function frame(n, title, leadText, kids, footer) {
    err.textContent = '';
    const dir = n >= shown ? 1 : -1, first = shown === 0; shown = n;
    no.textContent = `Step ${n} of 4`;
    ttl.textContent = title; lead.textContent = leadText;
    bar.setAttribute('aria-label', `Step ${n} of 4: ${STEP_NAMES[n - 1]}`);
    [...bar.children].forEach((li, i) => { li.classList.toggle('is-done', i + 1 < n); li.classList.toggle('is-now', i + 1 === n); if (i + 1 === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    const render = () => view.replaceChildren(h('div', { class: 'da-step' }, ...kids, err), footer);
    if (first) render(); else swapContent(view, render, { dir });
  }

  function stepVerify() {
    const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', 'aria-label': 'Password', spellcheck: 'false', placeholder: 'Your password' });
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
    frame(1, 'Delete your account', 'First confirm it is you.', [
      usesPassword ? h('label', { class: 'acc-field' }, h('span', { class: 'acc-label', text: 'Password' }), pass, forgot) : h('p', { class: 'da-note', text: 'This account signs in with Google. A Google window opens to confirm it is you.' })],
      foot(null, btn(usesPassword ? 'lock' : 'user', usesPassword ? 'Verify' : 'Continue with Google', run, { primary: true })));
    if (usesPassword) pass.focus();
  }

  function stepSummary() {
    const c = getEngine()?.counts?.() || { folders: 0, links: 0 };
    const kv = [['Name', facts.name || '-'], ['Email', maskEmail(facts.email)], ['Sign-in', facts.providers.map((p) => (p === 'google.com' ? 'Google' : 'Email and password')).join(' and ')], ['Created', facts.created ? dateTime(facts.created) : '-'], ['Last sign-in', facts.lastLogin ? dateTime(facts.lastLogin) : '-']];
    const ok = h('input', { type: 'checkbox', id: 'da-ok' });
    const next = btn('chevron-right', 'Continue', () => { if (!ok.checked) { err.textContent = 'Tick the box to continue.'; return; } stepType(c); }, { primary: true });
    frame(2, 'Check what will be deleted', 'Everything below goes when the request is approved.', [
      h('div', { class: 'da-stats' }, h('div', {}, h('b', { text: String(c.folders) }), h('span', { text: c.folders === 1 ? 'folder' : 'folders' })), h('div', {}, h('b', { text: String(c.links) }), h('span', { text: c.links === 1 ? 'link' : 'links' }))),
      h('dl', { class: 'kv da-kv' }, kv.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
      h('ul', { class: 'da-list' }, WHAT.map((t) => h('li', null, icon('x-circle', { size: 16 }), h('span', { text: t })))),
      btn('download', 'Back up my data first', () => import('../export/export-sheet.js').then((m) => m.openExport({ engine: getEngine(), scope: { type: 'all' }, title: 'Back up first' })), { attrs: { class: 'btn btn-sm da-btn da-backup' } }),
      h('label', { class: 'da-check', for: 'da-ok' }, ok, h('span', { text: 'I understand that my links and folders will be lost.' }))],
      foot(btn('arrow-left', 'Back', () => stepVerify()), next));
  }

  function stepType(c) {
    const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: PHRASE, 'aria-label': 'Type DELETE ACCOUNT' });
    const hit = h('span', { class: 'da-hit', 'aria-hidden': 'true' }, icon('check-circle', { size: 20 }));
    const next = btn('chevron-right', 'Continue', () => { if (input.value.trim() !== PHRASE) { err.textContent = `Type ${PHRASE} exactly, in capital letters.`; return; } stepEmail(c); }, { primary: true });
    input.addEventListener('input', () => { const ok = input.value.trim() === PHRASE; hit.classList.toggle('is-on', ok); err.textContent = ''; });
    frame(3, 'Type to confirm', 'This stops an accidental tap.', [
      h('p', { class: 'da-phrase', text: PHRASE }), h('div', { class: 'da-type' }, input, hit)],
      foot(btn('arrow-left', 'Back', () => stepSummary()), next));
    input.focus();
  }

  function stepEmail(c) {
    const id = newId(), { subject, body: text } = buildRequest(facts, c, id, verifiedAt);
    const enc = encodeURIComponent, mailto = `mailto:${REQUEST_TO}?subject=${enc(subject)}&body=${enc(text)}`;
    const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(REQUEST_TO)}&su=${enc(subject)}&body=${enc(text)}`;
    const copy = async () => { try { await navigator.clipboard.writeText(`To: ${REQUEST_TO}\nSubject: ${subject}\n\n${text}`); toast('Copied. Paste it into an email.'); } catch { toast('Could not copy. Select the text and copy it.', { type: 'error' }); } };
    frame(4, 'Send the request', 'The developer checks every request by hand.', [
      h('p', { class: 'da-warn' }, icon('mail', { size: 18 }), h('span', { text: `Send it from ${facts.email}, the email of this account. A request from any other address is rejected.` })),
      h('div', { class: 'da-actions' },
        btn('mail', 'Open my email app', null, { primary: true, tag: 'a', attrs: { href: mailto, 'data-native': '' } }),
        btn('external', 'Open Gmail', null, { tag: 'a', attrs: { href: gmail, target: '_blank', rel: 'noopener', 'data-native': '' } }),
        btn('copy', 'Copy', copy)),
      h('details', { class: 'da-mail' }, h('summary', { text: 'Preview the email' }), h('strong', { text: subject }), h('pre', { text }))],
      foot(btn('arrow-left', 'Back', () => stepType(c)), btn('check', 'Done', () => sheet.close(true), { primary: true })));
  }

  sheet = openSheet({ title: 'Delete account', body, actions: [], wide: true, scrimClose: false });   // v2.3.1: a tap outside must never close it
  sheet.el.classList.add('da-sheet');   // red theme (settings.css)
  stepVerify();
}
