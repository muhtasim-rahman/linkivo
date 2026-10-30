/**
 * Linkivo — js/features/settings/account-card.js  (v2.2.2)
 * Purpose: the Account section of Settings, rebuilt at the owner's request. A signed-in user sees: a profile line (round photo or initial, name, masked email,
 *          View profile and a sync icon), email verification (green tick when verified), the email address with Change, the sign-in methods (email and Google
 *          icons: a tick on the linked ones, a tap binds the other one to the SAME account), a short warning when the account email and the linked Google email
 *          differ, Change password (or Add a password), Logged-in devices and Log out. Guests keep their short explanation.
 *          v2.2.3 (owner): order = profile, verification, sign-in methods, Change email, password; the linked Google icon opens an Unlink popup.
 * API: accountRows({ router }) -> Element[]
 */
import { h } from '../../core/dom.js';
import { icon, googleMark } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { getSession } from '../../core/session.js';
import { maskEmail } from '../../core/mask.js';
import { getEngine } from '../../core/app-data.js';
import { confirmDialog } from '../../ui/confirm.js';
import { resendVerification, linkGoogle, unlinkGoogle, friendlyAuthError, hasPassword, emailsDiffer } from '../auth/auth-service.js';
import { requireSensitive } from '../../core/sensitive.js';
import { logOut, avatar } from '../shell/shell-parts.js';
import { openChangePassword, openSetPassword, openChangeEmail } from './account-dialogs.js';

const row = (label, desc, end) => h('div', { class: 'row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), end && h('span', { class: 'row-end' }, end));
const actionRow = (ic, label, desc, fn, cls = '') => h('button', { type: 'button', class: ['row', cls], on: { click: fn } }, h('span', { class: 'row-ic' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), cls ? null : icon('chevron-right', { size: 18 }));

/** Pure: what the sign-in method icons show. */
export function methodState(user) { return { password: hasPassword(user), google: (user.providers || []).includes('google.com') }; }

function guestRows(router) {
  return [
    row('Guest mode', 'Your links are stored only on this device. If browser data is cleared they can not be recovered.', h('span', { class: 'tag', text: 'This device' })),
    row('Back up your links', 'Log in to keep them in your account. Backup and moving guest data to an account arrive in v2.5.0 and v2.6.0.', null),
    actionRow('login', 'Log in', 'Moving guest data into an account arrives in v2.5.0.', () => logOut(router, { guest: true }))
  ];
}

export function accountRows({ router, rerender = () => {} }) {
  const s = getSession();
  if (s.mode === 'guest') return guestRows(router);
  const u = s.user;
  const engine = getEngine();

  // 1. profile line: photo, name, masked email, View profile, sync icon (no separate Sync now row any more)
  const syncBtn = engine && engine.status().kind !== 'guest' ? h('button', { type: 'button', class: 'btn-icon is-sm', 'aria-label': 'Sync now', 'data-tip': 'Sync now', on: { click: async (e) => {
    const b = e.currentTarget; b.classList.add('is-loading');
    try { const ok = engine.syncNow ? await engine.syncNow() : await engine.flush?.(); toast(ok === false ? 'Could not sync now. It will retry by itself.' : 'Everything is synced.', ok === false ? { type: 'error' } : undefined); } catch { toast('Could not sync. It will retry by itself.', { type: 'error' }); }
    b.classList.remove('is-loading');
  } } }, icon('refresh', { size: 18 })) : null;
  const head = h('div', { class: 'row acc-head' }, avatar(u.name, true, u.photo, true),
    h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: u.name }), h('span', { class: 'row-desc', text: maskEmail(u.email) })),
    h('span', { class: 'row-end' }, h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => router.navigate('/profile') } }, 'View profile'), syncBtn));

  // 2. verification: green tick when verified
  const verified = u.emailVerified
    ? h('span', { class: 'acc-ok', 'aria-label': 'Verified' }, icon('check-circle', { size: 20 }), h('span', { text: 'Verified' }))
    : h('button', { type: 'button', class: 'btn btn-sm', text: 'Resend email', on: { click: async () => { try { await resendVerification(); toast('Verification email sent. Check your inbox and spam folder.'); } catch (e) { toast(e && e.code === 'lk/cooldown' ? 'A link was sent a moment ago. Check your inbox and spam folder.' : 'Could not send the email. Try again later.', { type: 'error' }); } } } });
  const verifyRow = row('Email verification', u.emailVerified ? 'Your email address is verified.' : 'Verify your email so you can recover your account.', verified);

  // 3. email address + change (a password account only: a Google-only account first adds a password)
  const emailRow = hasPassword(u)
    ? actionRow('mail', 'Change email', `Now ${maskEmail(u.email)}. A link goes to the new address first.`, () => openChangeEmail({ user: u }))
    : row('Email address', `${maskEmail(u.email)}. It comes from Google; add a password below to be able to change it.`, null);

  // 4. sign-in methods: ticks, tap to bind the missing one to this same account
  const m = methodState(u);
  // v2.2.3: a linked Google icon is tappable too: it opens the Unlink popup (then another Google account can be linked). Email and password stays fixed.
  const chip = (linked, label, glyph, fn, { canTap = !linked, tip } = {}) => h('button', { type: 'button', class: ['acc-method', linked && 'is-linked'], 'aria-label': linked ? `${label}: linked${canTap ? ', tap to unlink' : ''}` : `Link ${label}`, 'data-tip': tip || (linked ? `${label} is linked` : `Link ${label} to this account`), disabled: !canTap, on: { click: fn } },
    glyph, linked && h('span', { class: 'acc-tick', 'aria-hidden': 'true' }, icon('check', { size: 10 })));
  const methods = row('Sign-in methods', `${[m.password && 'Email and password', m.google && 'Google'].filter(Boolean).join(' and ') || 'Unknown'} linked. Tap an icon to link the other one to this account, or the Google icon to unlink it.`,
    h('span', { class: 'acc-methods' },
      chip(m.password, 'Email and password', icon('mail', { size: 20 }), () => openSetPassword({ user: u }).then(rerender)),
      chip(m.google, 'Google', googleMark(20), async () => {
        if (m.google) {   // linked: offer to unlink
          if (!m.password) { toast('Add a password first, so you can still sign in after unlinking Google.', { duration: 5000 }); return; }
          const who = u.googleEmail ? ` (${maskEmail(u.googleEmail)})` : '';
          if (!(await confirmDialog({ title: 'Unlink this Google account?', message: `Google${who} will no longer open this Linkivo account. Your account, folders and links stay exactly as they are, and you will sign in with your email and password. You can link a different Google account afterwards.`, confirmLabel: 'Unlink Google', danger: true }))) return;
          if (!(await requireSensitive('google-unlink'))) return;
          try { await unlinkGoogle(); toast('Google unlinked. You can link another Google account now.'); rerender(); } catch (e) { const t = friendlyAuthError(e); toast(t || 'Could not unlink Google. Try again.', { type: 'error' }); }
          return;
        }
        if (!(await confirmDialog({ title: 'Link your Google account?', message: 'A Google sign-in window opens. Afterwards you can use Google or your password to reach this same account.', confirmLabel: 'Link Google' }))) return;
        try { await linkGoogle(); toast('Google linked.'); rerender(); } catch (e) { const t = friendlyAuthError(e); if (t) toast(t, { type: 'error' }); }
      }, { canTap: true, tip: m.google ? 'Google is linked. Tap to unlink it.' : 'Link Google to this account' })));
  const warn = emailsDiffer(u) ? h('div', { class: 'acc-warn', role: 'note' }, icon('alert', { size: 18 }), h('span', { text: `Your Google email (${maskEmail(u.googleEmail)}) is different from this account's email (${maskEmail(u.email)}). Both open this same Linkivo account.` })) : null;

  return [
    head, verifyRow, methods, warn, emailRow,   // v2.2.3 (owner): Change email sits after the sign-in methods and before the password row
    hasPassword(u) ? actionRow('lock', 'Change password', 'Type your old and new password. Forgot it? You can ask for a reset link there.', () => openChangePassword({ user: u }))
      : actionRow('lock', 'Add a password', 'Also sign in with your email and a password.', () => openSetPassword({ user: u }).then(rerender)),
    actionRow('monitor', 'Logged-in devices', 'See where you are signed in, and sign a device out.', () => import('./devices-sheet.js').then((d) => d.openDevices()))   // ! v2.2.4 (owner): the Log out row moved to the Danger zone only
  ].filter(Boolean);
}
