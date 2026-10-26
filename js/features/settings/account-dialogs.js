/**
 * Linkivo — js/features/settings/account-dialogs.js  (v2.2.2)
 * Purpose: the popups of the Account section (owner request): Change password (old and new password, with a Forgot password step that needs the
 *          account's own email), Add a password (a Google-only account gets email sign-in), Change email (a link goes to the NEW address first), and the
 *          small helpers they share. Everything that changes the account asks the sensitive-action gate first (PIN once the app lock exists, v2.5.0).
 * API: openChangePassword({ user }) openSetPassword({ user }) openChangeEmail({ user }) -> Promise<void>     passwordProblem(a, b?, old?) -> string
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { openSheet } from '../../ui/sheet.js';
import { maskEmail } from '../../core/mask.js';
import { sendAllowed, recordSend, friendlyWait } from '../../core/send-limit.js';
import { requireSensitive } from '../../core/sensitive.js';
import { changePassword, linkPassword, changeEmail, sendReset, friendlyAuthError } from '../auth/auth-service.js';

const MIN = 6;
/** Pure: the first problem with a new password, or '' (Firebase needs 6 characters; same wording as the sign-up form). */
export function passwordProblem(next, again, old) {
  if (!next) return 'Enter the new password.';
  if (next.length < MIN) return `Use at least ${MIN} characters for the password.`;
  if (old !== undefined && next === old) return 'The new password must be different from the old one.';
  if (again !== undefined && next !== again) return 'The two new passwords do not match.';
  return '';
}

function field(label, { type = 'password', autocomplete = 'off', value = '' } = {}) {
  const input = h('input', { class: 'input', type, autocomplete, value, spellcheck: 'false', 'aria-label': label });
  const eye = type === 'password' ? h('button', { type: 'button', class: 'btn-icon is-sm', 'aria-label': `Show ${label.toLowerCase()}`, on: { click: () => { const on = input.type === 'password'; input.type = on ? 'text' : 'password'; eye.replaceChildren(icon(on ? 'eye-off' : 'eye', { size: 18 })); } } }, icon('eye', { size: 18 })) : null;
  return { input, el: h('label', { class: 'acc-field' }, h('span', { class: 'acc-label', text: label }), h('span', { class: 'input-wrap' }, input, eye)) };
}
const note = () => h('p', { class: 'help is-error', role: 'alert' });
const submitBtn = (label, fn) => h('button', { type: 'submit', class: 'btn btn-primary', on: { click: fn } }, label);
const formOf = (...kids) => h('form', { class: 'form', novalidate: true, on: { submit: (e) => e.preventDefault() } }, ...kids);

export async function openChangePassword({ user }) {
  const old = field('Current password', { autocomplete: 'current-password' }), nw = field('New password', { autocomplete: 'new-password' }), again = field('Repeat new password', { autocomplete: 'new-password' });
  const err = note(), mail = field('Account email', { type: 'email', autocomplete: 'email' });
  let sheet = null, busy = false;
  const body = h('div');
  const setBusy = (b) => { busy = b; sheet?.setBusy?.(b); };

  async function save() {
    if (busy) return; err.textContent = '';
    if (!old.input.value) { err.textContent = 'Enter your current password.'; return; }
    const p = passwordProblem(nw.input.value, again.input.value, old.input.value); if (p) { err.textContent = p; return; }
    if (!(await requireSensitive('password-change'))) return;
    setBusy(true);
    try { await changePassword(old.input.value, nw.input.value); toast('Password changed.'); sheet.close(true); }
    catch (e) { err.textContent = friendlyAuthError(e) || ''; }
    setBusy(false);
  }
  async function sendLink() {
    if (busy) return; err.textContent = '';
    const typed = mail.input.value.trim().toLowerCase();
    if (!typed || typed !== String(user.email).trim().toLowerCase()) { err.textContent = 'That is not the email of this account.'; return; }   // the user is signed in, so this only guards against a mistake
    const g = sendAllowed('reset', user.email); if (!g.ok) { err.textContent = `A link was sent recently. Try again in ${friendlyWait(g.waitMs)} and check your spam folder.`; return; }
    setBusy(true);
    try { await sendReset(user.email); toast('Reset link sent. Check your inbox and spam folder.'); sheet.close(true); }
    catch (e) { err.textContent = e && e.code === 'lk/cooldown' ? `A link was just sent. Try again in ${friendlyWait(e.waitMs)}.` : friendlyAuthError(e) || 'Could not send the email. Try again later.'; }
    setBusy(false);
  }
  const showChange = () => { err.textContent = ''; body.replaceChildren(formOf(old.el, nw.el, again.el, err, h('div', { class: 'acc-foot' }, h('button', { type: 'button', class: 'link-btn is-sm', on: { click: showForgot } }, 'Forgot password?'), submitBtn('Change password', save)))); old.input.focus(); };
  const showForgot = () => { err.textContent = ''; body.replaceChildren(formOf(h('p', { class: 'help', text: `Type the email of this account (${maskEmail(user.email)}). We will send a link to choose a new password.` }), mail.el, err, h('div', { class: 'acc-foot' }, h('button', { type: 'button', class: 'link-btn is-sm', on: { click: showChange } }, 'Back'), submitBtn('Send link', sendLink)))); mail.input.focus(); };
  showChange();
  sheet = openSheet({ title: 'Change password', body, actions: [] });
}

export async function openSetPassword({ user }) {
  const nw = field('New password', { autocomplete: 'new-password' }), again = field('Repeat password', { autocomplete: 'new-password' }), err = note();
  let sheet = null, busy = false;
  async function save() {
    if (busy) return; err.textContent = '';
    const p = passwordProblem(nw.input.value, again.input.value); if (p) { err.textContent = p; return; }
    if (!(await requireSensitive('password-add'))) return;
    busy = true; sheet?.setBusy?.(true);
    try { await linkPassword(nw.input.value); toast('Password sign-in added.'); sheet.close(true); }
    catch (e) { err.textContent = friendlyAuthError(e) || ''; }
    busy = false; sheet?.setBusy?.(false);
  }
  sheet = openSheet({ title: 'Add a password', body: formOf(h('p', { class: 'help', text: `You will also be able to sign in with ${maskEmail(user.email)} and this password.` }), nw.el, again.el, err, h('div', { class: 'acc-foot' }, h('span'), submitBtn('Add password', save))), actions: [] });
}

export async function openChangeEmail({ user }) {
  const mail = field('New email address', { type: 'email', autocomplete: 'email' }), pass = field('Current password', { autocomplete: 'current-password' }), err = note();
  let sheet = null, busy = false;
  const body = h('div');
  async function send() {
    if (busy) return; err.textContent = '';
    const next = mail.input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(next)) { err.textContent = 'Enter a valid new email address.'; return; }
    if (next.toLowerCase() === String(user.email).toLowerCase()) { err.textContent = 'That is already your email address.'; return; }
    if (!pass.input.value) { err.textContent = 'Enter your current password.'; return; }
    const g = sendAllowed('emailchange', user.uid); if (!g.ok) { err.textContent = `A link was sent recently. Try again in ${friendlyWait(g.waitMs)}.`; return; }
    if (!(await requireSensitive('email-change'))) return;
    busy = true; sheet?.setBusy?.(true);
    try {
      await changeEmail(next, pass.input.value); recordSend('emailchange', user.uid);
      body.replaceChildren(h('div', { class: 'form' }, h('p', { text: `We sent a link to ${maskEmail(next)}.` }), h('p', { class: 'help', text: `Open it to finish. Until then your email stays ${maskEmail(user.email)}. After the change you sign in with the new address.` }), h('div', { class: 'acc-foot' }, h('span'), h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => sheet.close(true) } }, 'Done'))));
    } catch (e) { err.textContent = friendlyAuthError(e) || ''; }
    busy = false; sheet?.setBusy?.(false);
  }
  body.append(formOf(h('p', { class: 'help', text: 'A link is sent to the new address first. Your email changes only after you open it.' }), mail.el, pass.el, err, h('div', { class: 'acc-foot' }, h('span'), submitBtn('Send link', send))));
  sheet = openSheet({ title: 'Change email', body, actions: [] });
}
