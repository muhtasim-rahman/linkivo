/**
 * Linkivo — js/features/auth/action-page.js  (v2.2.2)
 * Purpose: /auth/action — Linkivo's own page for the links in Firebase emails (owner request: no default Firebase page). It handles
 *            mode=resetPassword        choose a new password (verifyPasswordResetCode, then confirmPasswordReset)
 *            mode=verifyEmail          confirm an email address (applyActionCode)
 *            mode=verifyAndChangeEmail confirm the NEW address of an email change (applyActionCode)
 *            mode=recoverEmail         undo an email change that was not yours (checkActionCode, applyActionCode)
 *          The page works as soon as Firebase Console > Authentication > Templates > (template) > Customize action URL points to
 *          https://linkivo.web.app/auth/action. Until then the links keep opening Firebase's own page and nothing here is used.
 *          Nothing sensitive is shown: the email is masked and the one-time code stays in the address bar only.
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { loadFirebase } from '../../core/firebase-loader.js';
import { getSession } from '../../core/session.js';
import { maskEmail } from '../../core/mask.js';
import { log } from '../../core/logger.js';
import { passwordProblem } from '../settings/account-dialogs.js';

const MODES = ['resetPassword', 'verifyEmail', 'verifyAndChangeEmail', 'recoverEmail'];
/** Pure: what the page should do for a query. */
export function readAction(query = {}) {
  const mode = MODES.includes(query.mode) ? query.mode : '';
  const code = typeof query.oobCode === 'string' && /^[\w-]{8,512}$/.test(query.oobCode) ? query.oobCode : '';
  return { mode, code, ok: !!(mode && code) };
}
/** Pure: friendly text for an action-code error. */
export function actionError(e) {
  const c = e && e.code;
  if (c === 'auth/expired-action-code') return 'This link has expired. Ask for a new one.';
  if (c === 'auth/invalid-action-code') return 'This link is not valid, or it was already used. Ask for a new one.';
  if (c === 'auth/user-disabled') return 'This account has been disabled.';
  if (c === 'auth/user-not-found') return 'No account belongs to this link any more.';
  if (c === 'auth/weak-password') return 'Use at least 6 characters for the password.';
  if (c === 'auth/network-request-failed') return 'No connection. Check your network and try again.';
  return 'This link could not be used. Ask for a new one.';
}

export async function mount(container, ctx) {
  await loadCss('/css/pages/auth.css');
  const act = readAction(ctx.query || {});
  const router = ctx.router;
  const title = h('h1', { class: 'auth-title' }), sub = h('p', { class: 'auth-sub' }), body = h('div', { class: 'auth-form' });
  const panel = h('div', { class: 'auth-panel act-panel' }, h('a', { class: 'auth-brand', href: '/login', 'aria-label': 'Linkivo' }, h('img', { class: 'auth-tile', src: '/assets/brand/logo-tile.svg', alt: '', width: 36, height: 36 }), h('span', { class: 'wordmark' }, 'l', h('i', { text: 'i' }), 'nk', h('i', { text: 'i' }), 'vo')), title, sub, body);
  container.appendChild(h('main', { class: 'auth' }, h('div', { class: 'auth-main' }, h('div'), panel)));

  const goTo = () => (getSession().mode === 'account' ? '/library' : '/login');
  const finish = (heading, text, { ok = true, label = 'Continue', to = goTo() } = {}) => {
    title.textContent = heading; sub.textContent = text;
    body.replaceChildren(h('div', { class: ['alert', ok ? 'is-ok' : 'is-error'] }, icon(ok ? 'check-circle' : 'alert', { size: 18 }), h('span', { text: ok ? 'Done.' : 'Nothing was changed.' })),
      h('button', { type: 'button', class: 'btn btn-primary btn-block', on: { click: () => router.navigate(to, { replace: true }) } }, label));
  };

  if (!act.ok) { finish('This link is not complete', 'Open the link from your email again, or ask for a new one.', { ok: false, label: 'Go to sign in', to: '/login' }); return () => {}; }
  title.textContent = 'One moment'; sub.textContent = 'Checking your link';
  let fb;
  try { fb = await loadFirebase(); } catch (e) { log.error('action', 'sdk failed', e); finish('No connection', 'Check your network and open the link again.', { ok: false, label: 'Go to sign in', to: '/login' }); return () => {}; }
  const { auth, mods } = fb;

  try {
    if (act.mode === 'resetPassword') {
      const email = await mods.auth.verifyPasswordResetCode(auth, act.code);
      title.textContent = 'Choose a new password'; sub.textContent = `For ${maskEmail(email)}`;
      const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'New password', placeholder: 'New password' });
      const again = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'Repeat new password', placeholder: 'Repeat new password' });
      const eye = h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Show passwords', on: { click: () => { const s = pw.type === 'password'; pw.type = again.type = s ? 'text' : 'password'; eye.replaceChildren(icon(s ? 'eye-off' : 'eye')); } } }, icon('eye'));
      const err = h('div', { class: 'alert is-error', role: 'alert', hidden: true });
      const go = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Save new password');
      const form = h('form', { class: 'auth-form', novalidate: true, on: { submit: async (e) => {
        e.preventDefault(); err.hidden = true;
        const p = passwordProblem(pw.value, again.value); if (p) { err.hidden = false; err.replaceChildren(icon('alert', { size: 18 }), h('span', { text: p })); return; }
        go.disabled = true;
        try { await mods.auth.confirmPasswordReset(auth, act.code, pw.value); finish('Password changed', 'You can sign in with your new password now.', { label: getSession().mode === 'account' ? 'Open Linkivo' : 'Sign in' }); }
        catch (x) { err.hidden = false; err.replaceChildren(icon('alert', { size: 18 }), h('span', { text: actionError(x) })); go.disabled = false; }
      } } }, h('div', { class: 'input-wrap' }, pw, eye), again, err, go);
      body.replaceChildren(form); pw.focus();
    } else if (act.mode === 'verifyEmail' || act.mode === 'verifyAndChangeEmail') {
      await mods.auth.applyActionCode(auth, act.code);
      try { await auth.currentUser?.reload(); } catch { /* signed out is fine */ }
      if (act.mode === 'verifyEmail') finish('Email verified', 'Thank you. Your address is confirmed.');
      else finish('Email changed', 'Your new address is confirmed. Sign in with it from now on.', { label: 'Sign in', to: '/login' });
    } else {
      const info = await mods.auth.checkActionCode(auth, act.code);
      const restored = info && info.data && info.data.email;
      await mods.auth.applyActionCode(auth, act.code);
      finish('Email restored', `Your account email is ${restored ? maskEmail(restored) : 'back to the old address'}. If this change was not yours, reset your password now.`, { label: 'Go to sign in', to: '/login' });
    }
  } catch (e) { log.warn('action', 'action code failed', e); finish('This link can not be used', actionError(e), { ok: false, label: 'Go to sign in', to: '/login' }); }
  return () => {};
}
