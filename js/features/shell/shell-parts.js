/**
 * Linkivo — js/features/shell/shell-parts.js  (v2.1.2)
 * Purpose: small pieces shared by the shell and the pages: the ringed avatar, the log-out flow, the theme toggle.
 * API: avatar(name, large, photo?) -> Element (a round photo when the account has one, else the initial)     logOut(router, { guest }) -> Promise<void>     toggleTheme()
 *      v2.3.0: profileCard() -> Element (the Menu page's first card, now also first on the wide-screen Settings page)     logoutButton(router) -> Element (the red Log out
 *      button, the same one at the bottom of the Menu page and of Settings)
 */
import { h } from '../../core/dom.js';
import { prefs } from '../../core/local-prefs.js';
import { KEYS, resolvedTheme } from '../../core/appearance.js';
import { requireSensitive } from '../../core/sensitive.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { signOutUser, leaveGuest } from '../auth/auth-service.js';
import { log } from '../../core/logger.js';
import { icon } from '../../ui/icons.js';
import { clearSearchHistory } from '../search/search-store.js';
import { getSession } from '../../core/session.js';
import { maskEmail } from '../../core/mask.js';

/** `self: true` (the signed-in person's own avatar) adds the small admin shield, shown only while <html data-admin> is set (core/admin.js). */
export function avatar(name, large = false, photo = '', self = false) {
  const initial = ([...String(name || '?').trim()][0] || '?').toUpperCase();
  const inner = h('span', { text: initial });
  if (photo) {
    const img = h('img', { src: photo, alt: '', referrerpolicy: 'no-referrer', width: 40, height: 40 });
    img.addEventListener('error', () => img.remove()); // a blocked photo falls back to the initial underneath
    inner.appendChild(img);
  }
  return h('span', { class: ['avatar', large && 'is-lg'], 'aria-hidden': 'true' }, inner, self && h('span', { class: 'avatar-admin' }, icon('shield', { size: large ? 14 : 11 })));
}

export function toggleTheme() { prefs.set(KEYS.theme, resolvedTheme() === 'dark' ? 'light' : 'dark'); }

/** Logging out asks for confirmation (and, from v2.5.0, the PIN through the sensitive gate). Guests only leave guest mode: their data stays on the device. */
export async function logOut(router, { guest = false } = {}) {
  const leavingGuest = guest || document.documentElement.dataset.mode === 'guest';
  const ok = await confirmDialog(leavingGuest
    ? { title: 'Leave guest mode?', message: 'Your guest data stays on this device. You can come back to it later by choosing Visit as guest again.', confirmLabel: 'Continue' }
    : { title: 'Log out?', message: 'You will need to sign in again to open your links.', confirmLabel: 'Log out', danger: true });
  if (!ok) return;
  if (!(await requireSensitive('logout'))) return;
  try {
    if (leavingGuest) leaveGuest(); else { clearSearchHistory(); await signOutUser(); }   // v2.3.0: recent searches are cleared when an account logs out
  } catch (e) { log.error('auth', 'logout failed', e); toast('Could not log out. Try again.', { type: 'error' }); }
}

/** The profile card: avatar, name, masked email, arrow. Opens the Profile page. Used first on the Menu page and first on the wide Settings page (owner, v2.3.0). */
export function profileCard(router = null) {
  const s = getSession(), account = s.mode === 'account';
  const name = account ? s.user.name : 'Guest';
  const sub = account ? maskEmail(s.user.email) : 'Stored only on this device';
  // v2.3.2 (owner): the switch-account button sits INSIDE the card, on the right, where the arrow was (accounts); guests keep the arrow. The card is a div so a
  // button can live in it; the avatar and the text are one link to the Profile page.
  const main = h('a', { class: 'menu-hero-main', href: '/profile' }, avatar(name, true, s.user ? s.user.photo : '', account),
    h('div', { class: 'pf-text' }, h('span', { class: 'pf-name' }, h('span', { text: name }), h('span', { class: 'admin-chip', text: 'Admin' })), h('span', { class: 'pf-mail', text: sub })));
  const end = h('span', { class: 'menu-hero-end' });
  if (account) import('./switch-account.js').then((m) => end.appendChild(m.switchButton(router)));
  else end.appendChild(icon('chevron-right', { size: 18 }));
  return h('div', { class: 'menu-hero' }, main, end);
}

/** The red Log out button (guests: Leave guest mode). One function so the Menu page and the bottom of Settings can never differ. */
export function logoutButton(router) {
  const guest = getSession().mode === 'guest';
  return h('button', { type: 'button', class: 'menu-logout', on: { click: () => logOut(router) } }, icon('logout', { size: 20 }), h('span', { text: guest ? 'Leave guest mode' : 'Log out' }));
}
