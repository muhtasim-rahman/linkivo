/**
 * Linkivo — js/features/auth/login-page.js  (v2.1.2)
 * Purpose: the sign-in page: Google, email and password (sign in / create account), reset password, and "Visit as guest" with its
 *          notice. Creating an account needs the Terms and Privacy agreement. Wide screens: art-and-overview column + form column;
 *          phones: one compact column. A theme switch is always at hand.
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon, googleMark } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { loadCss } from '../../core/css-loader.js';
import { getSession } from '../../core/session.js';
import { resolvedTheme } from '../../core/appearance.js';
import { toggleTheme } from '../shell/shell-parts.js';
import { signInWithGoogle, signInWithEmail, registerWithEmail, sendReset, enterGuest, friendlyAuthError } from './auth-service.js';
import { friendlyWait } from '../../core/send-limit.js';
import { log } from '../../core/logger.js';
import app from '../../core/app-info.js';

const HIGHLIGHTS = [
  ['upload', 'Import in bulk', 'Paste text or drop files and every link is picked out, in seconds.'],
  ['library', 'Folders, tags and search', 'Organise freely and find any link as you type.'],
  ['image', 'Rich preview', 'See the page, video or image of a link before you open it.'],
  ['random', 'Random Discover', 'Bring back the links you forgot you saved.'],
  ['lock', 'Private by design', 'Guest mode stays on your device; PIN lock and vault protect the rest.'],
  ['install', 'Works offline', 'Install it as an app on your phone or PC; it updates itself.']
];

const brand = () => h('a', { class: 'auth-brand', href: '/login', 'aria-label': 'Linkivo' }, h('img', { class: 'auth-tile', src: '/assets/brand/logo-tile.svg', alt: '', width: 36, height: 36 }), h('span', { class: 'wordmark' }, 'l', h('i', { text: 'i' }), 'nk', h('i', { text: 'i' }), 'vo'));

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
  const agree = h('input', { type: 'checkbox', id: 'auth-agree' });
  const agreeRow = h('label', { class: 'check', for: 'auth-agree', hidden: true }, agree,
    h('span', null, 'I agree to the ', h('a', { href: '/terms', target: '_blank', rel: 'noopener' }, 'Terms'), ' and the ', h('a', { href: '/privacy', target: '_blank', rel: 'noopener' }, 'Privacy Policy'), '.'));
  const legal = h('p', { class: 'auth-legal' }, 'By continuing you agree to the ', h('a', { href: '/terms', target: '_blank', rel: 'noopener' }, 'Terms'), ' and ', h('a', { href: '/privacy', target: '_blank', rel: 'noopener' }, 'Privacy Policy'), '.');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block' });
  const google = h('button', { type: 'button', class: 'btn btn-block', on: { click: () => { if (!agreedOk()) return; run(() => signInWithGoogle(), 'google'); } } }, googleMark(18), h('span', { text: 'Continue with Google' }));
  const forgot = h('button', { type: 'button', class: 'link-btn', text: 'Forgot password?', on: { click: openReset } });
  const tabBtn = (id, label) => h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', id: 'tab-' + id, text: label, on: { click: () => setTab(id) } });
  const tabs = h('div', { class: 'auth-tabs', role: 'tablist', 'aria-label': 'Sign in or create account' }, tabBtn('signin', 'Sign in'), tabBtn('register', 'Create account'));

  function showError(msg) { alertBox.hidden = !msg; alertBox.replaceChildren(...(msg ? [icon('alert', { size: 18 }), h('span', { text: msg })] : [])); }
  /** Creating an account (email or Google, on the Create account tab) needs the agreement. */
  function agreedOk() {
    if (tab !== 'register' || agree.checked) { agreeRow.classList.remove('is-error'); return true; }
    agreeRow.classList.add('is-error'); showError('Please agree to the Terms and the Privacy Policy to create an account.'); agree.focus();
    return false;
  }
  function setBusy(b, which) { busy = b; for (const el of [submit, google]) el.disabled = b; (which === 'google' ? google : submit).classList.toggle('is-loading', b); }
  function setTab(t) {
    tab = t; showError(''); agreeRow.classList.remove('is-error');
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.id === 'tab-' + t));
    title.textContent = t === 'signin' ? 'Welcome back' : 'Create your account';
    sub.textContent = t === 'signin' ? 'Your links, private and in one place.' : 'Free, and it works on every device you use.';
    submit.textContent = t === 'signin' ? 'Sign in' : 'Create account';
    pass.autocomplete = t === 'signin' ? 'current-password' : 'new-password';
    passHelp.hidden = t === 'signin'; agreeRow.hidden = t === 'signin'; legal.hidden = t !== 'signin'; forgot.parentElement.hidden = t !== 'signin';
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
    if (!agreedOk()) return;
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
        try { await sendReset(input.value); } catch (e) { if (e && e.code === 'lk/cooldown') { api.setBusy(false); toast(`A link was sent to that address a moment ago. Check your inbox and spam folder, or try again in ${friendlyWait(e.waitMs)}.`, { duration: 5000 }); return false; } if (e && e.code === 'auth/invalid-email') { api.setBusy(false); toast('Enter a valid email address.', { type: 'error' }); return false; } log.warn('auth', 'reset failed', { code: e && e.code }); }
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

  const themeBtn = h('button', { type: 'button', class: 'btn btn-icon auth-theme', 'aria-label': 'Switch between light and dark theme', on: { click: toggleTheme } });
  const renderTheme = () => themeBtn.replaceChildren(icon(resolvedTheme() === 'dark' ? 'sun' : 'moon'));
  const themeWatch = new MutationObserver(renderTheme);
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  renderTheme();

  const offline = session.error === 'offline';
  const form = h('form', { class: 'auth-form', novalidate: true, on: { submit: onSubmit } },
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'auth-email', text: 'Email' }), email),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'auth-pass', text: 'Password' }), h('div', { class: 'input-wrap' }, pass, eye), passHelp),
    h('div', { class: 'auth-links' }, forgot), agreeRow, alertBox, submit);

  container.appendChild(h('div', { class: 'auth' },
    h('aside', { class: 'auth-art', 'aria-label': 'About Linkivo' },
      brand(),
      h('div', { class: 'art-mid' },
        h('h2', { class: 'art-head', text: 'Every link you save, one search away.' }),
        h('p', { class: 'art-lead', text: 'Linkivo is a fast, private home for hundreds or thousands of links. Here is what you get:' }),
        h('ul', { class: 'art-list' }, HIGHLIGHTS.map(([ic, t, d]) => h('li', null, h('span', { class: 'art-ic' }, icon(ic, { size: 20 })), h('div', null, h('strong', { text: t }), h('span', { class: 't', text: d })))))),
      h('p', { class: 'art-foot' }, `Version ${app.version}. Open source on `, h('a', { href: app.repo, target: '_blank', rel: 'noopener', 'data-native': '' }, 'GitHub'), '.')),
    h('div', { class: 'auth-main' },
      h('div', { class: 'auth-top' }, brand(), themeBtn),
      h('section', { class: 'auth-panel', 'aria-label': 'Sign in' },
        tabs,
        h('div', null, title, sub),
        offline && h('div', { class: 'alert is-error', role: 'alert' }, icon('wifi-off', { size: 18 }), h('span', { text: 'Sign-in could not load. Check your connection and reload. Guest mode still works.' })),
        google, legal, h('div', { class: 'auth-or', text: 'or use email' }), form,
        h('div', { class: 'auth-guest' }, h('button', { type: 'button', class: 'btn', on: { click: openGuestNotice } }, icon('user', { size: 18 }), h('span', { text: 'Visit as guest' })), h('p', { class: 'help', text: 'No account needed. Your data stays on this device.' }))))));
  setTab('signin');
  if (session.redirectError) showError(friendlyAuthError({ code: session.redirectError }));
  if (offline) for (const el of [google, submit]) el.disabled = true;
  return () => themeWatch.disconnect();
}
