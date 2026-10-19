/**
 * Linkivo — js/features/auth/login-page.js  (v2.1.0)
 * Purpose: the sign-in page: Google, email and password (sign in / create account), reset password, and "Visit as guest" with its
 *          notice. Layout: a ring-art field and a plain form column (no centred card).
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon, googleMark } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { loadCss } from '../../core/css-loader.js';
import { getSession } from '../../core/session.js';
import { signInWithGoogle, signInWithEmail, registerWithEmail, sendReset, enterGuest, friendlyAuthError } from './auth-service.js';
import { log } from '../../core/logger.js';

/** Interlocking rings echo the logo (two rings joined by a bar); drawn large and cropped by the frame. */
function ringArt() {
  const rings = [];
  const radii = [60, 100, 140, 180, 220];
  radii.forEach((r, i) => {
    rings.push(h('circle', { cx: 230, cy: 300, r, 'stroke-opacity': 0.14 + i * 0.1 }));
    rings.push(h('circle', { cx: 400, cy: 300, r, 'stroke-opacity': 0.1 + i * 0.08 }));
  });
  rings.push(h('line', { x1: 230, y1: 300, x2: 400, y2: 300, 'stroke-width': 6, 'stroke-opacity': 0.7 }));
  return h('svg', { viewBox: '0 0 640 600', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'aria-hidden': 'true', focusable: 'false' }, rings);
}

export async function mount(container) {
  await loadCss('/css/pages/auth.css');
  let tab = 'signin';
  let busy = false;
  const session = getSession();

  const title = h('h1', { class: 'auth-title' });
  const sub = h('p', { class: 'auth-sub' });
  const alertBox = h('div', { class: 'alert is-error', role: 'alert', hidden: true });
  const email = h('input', { class: 'input', id: 'auth-email', type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'you@example.com', required: true });
  const pass = h('input', { class: 'input', id: 'auth-pass', type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'Password', required: true });
  const eye = h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Show password', on: { click: () => { const show = pass.type === 'password'; pass.type = show ? 'text' : 'password'; eye.replaceChildren(icon(show ? 'eye-off' : 'eye')); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); } } }, icon('eye'));
  const passHelp = h('p', { class: 'help', hidden: true, text: 'At least 6 characters. A verification email is sent after you sign up.' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' });
  const google = h('button', { type: 'button', class: 'btn btn-block', on: { click: () => run(() => signInWithGoogle(), 'google') } }, googleMark(18), h('span', { text: 'Continue with Google' }));
  const forgot = h('button', { type: 'button', class: 'link-btn', text: 'Forgot password?', on: { click: openReset } });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Sign in or create account' },
    h('button', { type: 'button', 'aria-pressed': 'true', text: 'Sign in', on: { click: () => setTab('signin') } }),
    h('button', { type: 'button', 'aria-pressed': 'false', text: 'Create account', on: { click: () => setTab('register') } }));

  function showError(msg) { alertBox.hidden = !msg; alertBox.replaceChildren(...(msg ? [icon('alert', { size: 18 }), h('span', { text: msg })] : [])); }
  function setBusy(b, which) { busy = b; for (const el of [submit, google]) el.disabled = b; (which === 'google' ? google : submit).classList.toggle('is-loading', b); }
  function setTab(t) {
    tab = t; showError('');
    [...seg.children].forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (t === 'signin'))));
    title.textContent = t === 'signin' ? 'Sign in' : 'Create your account';
    sub.textContent = t === 'signin' ? 'Your links, private and in one place.' : 'Free, and it works on every device you use.';
    submit.textContent = t === 'signin' ? 'Sign in' : 'Create account';
    pass.autocomplete = t === 'signin' ? 'current-password' : 'new-password';
    passHelp.hidden = t === 'signin'; forgot.hidden = t !== 'signin';
  }

  async function run(fn, which) {
    if (busy) return;
    showError(''); setBusy(true, which);
    try { await fn(); /* the session listener in boot.js moves us on; keep the busy state until the page unmounts */ }
    catch (e) {
      setBusy(false, which);
      const msg = friendlyAuthError(e);
      if (msg) showError(msg);
      log.warn('auth', 'sign-in failed', { code: e && e.code });
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!email.value.trim()) { showError('Enter your email address.'); email.focus(); return; }
    if (!pass.value) { showError('Enter your password.'); pass.focus(); return; }
    run(() => (tab === 'signin' ? signInWithEmail(email.value, pass.value) : registerWithEmail(email.value, pass.value)), 'email');
  }

  function openReset() {
    const input = h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', placeholder: 'you@example.com', value: email.value.trim(), 'aria-label': 'Email address' });
    openSheet({
      title: 'Reset password',
      body: h('div', { class: 'field' }, h('p', { text: 'Enter your email and we will send a link to choose a new password.' }), input),
      actions: [{ label: 'Cancel' }, { label: 'Send link', variant: 'primary', closes: false, onClick: async (api) => {
        if (!input.value.trim()) { input.focus(); return false; }
        api.setBusy(true);
        try { await sendReset(input.value); } catch (e) { if (e && e.code === 'auth/invalid-email') { api.setBusy(false); toast('Enter a valid email address.', { type: 'error' }); return false; } log.warn('auth', 'reset failed', { code: e && e.code }); }
        api.close(); toast('If an account exists for that email, a reset link is on its way.', { duration: 4500 });
      } }]
    });
  }

  function openGuestNotice() {
    openSheet({
      title: 'Visit as guest',
      body: h('div', { class: 'stack' },
        h('p', { text: 'Nothing is stored online. Everything stays on this device only.' }),
        h('p', { text: 'If you clear this browser\u2019s data, your links cannot be recovered. You can log in later to keep them in the cloud.' })),
      actions: [{ label: 'Cancel' }, { label: 'Continue as guest', variant: 'primary', onClick: () => { enterGuest(); } }]
    });
  }

  const offline = session.error === 'offline';
  const form = h('form', { class: 'auth-form', novalidate: true, on: { submit: onSubmit } },
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'auth-email', text: 'Email' }), email),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'auth-pass', text: 'Password' }), h('div', { class: 'input-wrap' }, pass, eye), passHelp),
    alertBox, submit, h('div', { class: 'auth-links' }, forgot));

  container.appendChild(h('div', { class: 'auth' },
    h('div', { class: 'auth-art', 'aria-hidden': 'true' }, ringArt(), h('div', { class: 'auth-brand' }, h('img', { src: '/assets/brand/logo.svg', alt: '' }), h('span', null, 'l', h('i', { text: 'i' }), 'nk', h('i', { text: 'i' }), 'vo'))),
    h('section', { class: 'auth-panel' },
      h('div', null, title, sub),
      offline && h('div', { class: 'alert is-error', role: 'alert' }, icon('wifi-off', { size: 18 }), h('span', { text: 'Sign-in could not load. Check your connection and reload. Guest mode still works.' })),
      seg, google, h('div', { class: 'auth-or', text: 'or use email' }), form,
      h('div', { class: 'auth-guest' }, h('button', { type: 'button', class: 'btn btn-block', on: { click: openGuestNotice } }, icon('user', { size: 18 }), h('span', { text: 'Visit as guest' })), h('p', { class: 'help', text: 'Try Linkivo without an account. Your data stays on this device.' })))));
  setTab('signin');
  if (session.redirectError) showError(friendlyAuthError({ code: session.redirectError }));
  if (offline) for (const el of [google, submit]) el.disabled = true;
}
