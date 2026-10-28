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

export function avatar(name, large = false, photo = '') {
  const initial = ([...String(name || '?').trim()][0] || '?').toUpperCase();
  const inner = h('span', { text: initial });
  if (photo) {
    const img = h('img', { src: photo, alt: '', referrerpolicy: 'no-referrer', width: 40, height: 40 });
    img.addEventListener('error', () => img.remove()); // a blocked photo falls back to the initial underneath
    inner.appendChild(img);
  }
  return h('span', { class: ['avatar', large && 'is-lg'], 'aria-hidden': 'true' }, inner);
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
export function profileCard() {
  const s = getSession();
  const name = s.mode === 'guest' ? 'Guest' : s.user.name;
  const sub = s.mode === 'guest' ? 'Stored only on this device' : maskEmail(s.user.email);
  return h('a', { class: 'menu-hero', href: '/profile' }, avatar(name, true, s.user ? s.user.photo : ''), h('div', { class: 'pf-text' }, h('span', { class: 'pf-name', text: name }), h('span', { class: 'pf-mail', text: sub })), h('span', { class: 'row-end', style: { marginLeft: 'auto' } }, icon('chevron-right')));
}

/** The red Log out button (guests: Leave guest mode). One function so the Menu page and the bottom of Settings can never differ. */
export function logoutButton(router) {
  const guest = getSession().mode === 'guest';
  return h('button', { type: 'button', class: 'menu-logout', on: { click: () => logOut(router) } }, icon('logout', { size: 20 }), h('span', { text: guest ? 'Leave guest mode' : 'Log out' }));
}
