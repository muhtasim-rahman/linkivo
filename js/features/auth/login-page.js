/**
 * Linkivo — js/features/auth/login-page.js  (v2.1.1, rebuilt)
 * Purpose: the sign-in page. Desktop: a side panel (chain pattern that matches the logo, white logo tile, short overview of what you get) and one
 *          compact form column. Phones: a short brand band, then the same form. Google, email and password (sign in / create account),
 *          password reset, "Visit as guest" with its notice, a light/dark switch, and an agreement to the Terms and Privacy policy when creating
 *          an account (the time of agreement is stored on the profile as `termsAt`).
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon, googleMark } from '../../ui/icons.js';
import { brandWord, logoTile } from '../../ui/brand.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { loadCss } from '../../core/css-loader.js';
import { getSession } from '../../core/session.js';
import { sessionPrefs } from '../../core/local-prefs.js';
import { resolvedTheme } from '../../core/appearance.js';
import { signInWithGoogle, signInWithEmail, registerWithEmail, sendReset, enterGuest, friendlyAuthError } from './auth-service.js';
import { toggleTheme } from '../shell/shell-parts.js';
import app from '../../core/app-info.js';
import { log } from '../../core/logger.js';

const POINTS = [
  ['folder', 'Folders for everything', 'Group thousands of links and find any of them in an instant.'],
  ['plus', 'Add links in seconds', 'Paste text or drop files and every link is picked out for you.'],
  ['random', 'Random Discover', 'Reopen links you forgot, weighted by what you like.'],
  ['lock', 'Private by design', 'Guest data never leaves your device. Lock folders behind a PIN.']
];

export async function mount(container) {
  await loadCss('/css/pages/auth.css');
  let tab = 'signin', busy = false, agree = false;
  const session = getSession();
  const offline = session.error === 'offline';

  const title = h('h1', { class: 'auth-title' });
  const sub = h('p', { class: 'auth-sub' });
  const alertBox = h('div', { class: 'alert is-error', role: 'alert', hidden: true });
  const email = h('input', { class: 'input', id: 'auth-email', type: 'email', name: 'email', autocomplete: 'email', inputmode: 'email', autocapitalize: 'off', spellcheck: 'false', placeholder: 'you@example.com', required: true });
  const pass = h('input', { class: 'input', id: 'auth-pass', type: 'password', name: 'password', autocomplete: 'current-password', placeholder: 'Password', required: true });
  const eye = h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Show password', on: { click: () => { const show = pass.type === 'password'; pass.type = show ? 'text' : 'password'; eye.replaceChildren(icon(show ? 'eye-off' : 'eye')); eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); } } }, icon('eye'));
  const forgot = h('button', { type: 'button', class: 'link-btn', text: 'Forgot password?', on: { click: openReset } });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' });
  const google = h('button', { type: 'button', class: 'btn btn-block', on: { click: () => { if (!requireAgreement()) return; run(() => signInWithGoogle(), 'google'); } } }, googleMark(18), h('span', { text: 'Continue with Google' }));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Sign in or create account', style: { width: '100%' } },
    h('button', { type: 'button', 'aria-pressed': 'true', text: 'Sign in', on: { click: () => setTab('signin') } }),
    h('button', { type: 'button', 'aria-pressed': 'false', text: 'Create account', on: { click: () => setTab('register') } }));

  const box = h('span', { class: 'check-box' }, icon('check', { size: 14 }));
  const checkBtn = h('button', { type: 'button', class: 'check-hit', role: 'checkbox', 'aria-checked': 'false', 'aria-label': 'I agree to the Terms of use and the Privacy policy', style: { display: 'contents' } }, box);
  const check = h('div', { class: 'check', role: 'group', 'aria-checked': 'false', hidden: true, on: { click: (e) => { if (!e.target.closest('a')) toggleAgree(); } } }, checkBtn,
    h('span', null, 'I agree to the ', h('a', { href: '/terms', target: '_blank', rel: 'noopener', text: 'Terms of use' }), ' and the ', h('a', { href: '/privacy', target: '_blank', rel: 'noopener', text: 'Privacy policy' }), '.'));
  const legal = h('p', { class: 'auth-legal' }, 'By continuing you accept the ', h('a', { href: '/terms', target: '_blank', rel: 'noopener', text: 'Terms' }), ' and ', h('a', { href: '/privacy', target: '_blank', rel: 'noopener', text: 'Privacy policy' }), '.');

  function toggleAgree() { agree = !agree; check.setAttribute('aria-checked', String(agree)); checkBtn.setAttribute('aria-checked', String(agree)); if (agree) showError(''); }
  function requireAgreement() {
    if (tab !== 'register' || agree) return true;
    showError('Agree to the Terms of use and the Privacy policy to create an account.');
    return false;
  }
  function showError(msg) { alertBox.hidden = !msg; alertBox.replaceChildren(...(msg ? [icon('alert', { size: 18 }), h('span', { text: msg })] : [])); }
  function setBusy(b, which) { busy = b; for (const el of [submit, google]) el.disabled = b; (which === 'google' ? google : submit).classList.toggle('is-loading', b); }
  function setTab(t) {
    tab = t; showError('');
    [...seg.children].forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === (t === 'signin'))));
    title.textContent = t === 'signin' ? 'Welcome back' : 'Create your account';
    sub.textContent = t === 'signin' ? 'Sign in to open your links.' : 'Free, and it works on every device you use.';
    submit.textContent = t === 'signin' ? 'Sign in' : 'Create account';
    pass.autocomplete = t === 'signin' ? 'current-password' : 'new-password';
    pass.placeholder = t === 'signin' ? 'Password' : 'At least 6 characters';
    forgot.hidden = t !== 'signin'; check.hidden = t !== 'register'; legal.hidden = t === 'register';
  }

  async function run(fn, which) {
    if (busy) return;
    showError(''); setBusy(true, which);
    if (tab === 'register') sessionPrefs.set('terms.pending', Date.now()); // read by account-status.js when the profile is created
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
    if (!requireAgreement()) return;
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

  const themeBtn = h('button', { type: 'button', class: 'btn btn-icon auth-theme', on: { click: toggleTheme } });
  const renderTheme = () => { const dark = resolvedTheme() === 'dark'; themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', { size: 22 })); themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme'); };
  const observer = new MutationObserver(renderTheme); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  renderTheme();

  const form = h('form', { class: 'auth-form', novalidate: true, on: { submit: onSubmit } },
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'auth-email', text: 'Email' }), email),
    h('div', { class: 'field' }, h('div', { class: 'auth-field-row' }, h('label', { class: 'label', for: 'auth-pass', text: 'Password' }), forgot), h('div', { class: 'input-wrap' }, pass, eye)),
    check, alertBox, submit);

  container.appendChild(h('div', { class: 'auth' }, themeBtn,
    h('aside', { class: 'auth-side' },
      h('div', { class: 'auth-brand' }, logoTile(48), brandWord()),
      h('div', { class: 'auth-pitch' },
        h('div', null, h('h2', { text: 'Every link you keep, in order.' }), h('p', { text: 'Linkivo is a fast, private home for the links you want to find again.' })),
        h('ul', { class: 'auth-points' }, POINTS.map(([ic, t, d]) => h('li', null, h('span', { class: 'pt-ic' }, icon(ic, { size: 22 })), h('div', null, h('strong', { text: t }), h('span', { text: d })))))),
      h('p', { class: 'auth-credit' }, `Made by `, h('a', { href: app.site, target: '_blank', rel: 'noopener', text: app.developer }))),
    h('main', { class: 'auth-main' }, h('div', { class: 'auth-panel' },
      h('div', null, title, sub),
      offline && h('div', { class: 'alert is-error', role: 'alert' }, icon('wifi-off', { size: 18 }), h('span', { text: 'Sign-in could not load. Check your connection and reload. Guest mode still works.' })),
      seg, google, h('div', { class: 'auth-or', text: 'or with email' }), form, legal,
      h('div', { class: 'auth-guest' }, h('button', { type: 'button', class: 'btn', on: { click: openGuestNotice } }, icon('user', { size: 18 }), h('span', { text: 'Visit as guest' })), h('p', { class: 'help', text: 'No account needed. Your data stays on this device.' }))))));
  setTab('signin');
  if (session.redirectError) showError(friendlyAuthError({ code: session.redirectError }));
  if (offline) for (const el of [google, submit]) el.disabled = true;
  return () => observer.disconnect();
}
