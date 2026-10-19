/**
 * Linkivo — js/features/shell/shell-parts.js  (v2.1.0)
 * Purpose: small pieces shared by the shell and the pages: the ringed avatar, the log-out flow, the theme toggle.
 * API: avatar(name, large) -> Element     logOut(router, { guest }) -> Promise<void>     toggleTheme()
 */
import { h } from '../../core/dom.js';
import { prefs } from '../../core/local-prefs.js';
import { KEYS, resolvedTheme } from '../../core/appearance.js';
import { requireSensitive } from '../../core/sensitive.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { signOutUser, leaveGuest } from '../auth/auth-service.js';
import { log } from '../../core/logger.js';

export function avatar(name, large = false) {
  const initial = ([...String(name || '?').trim()][0] || '?').toUpperCase();
  return h('span', { class: ['avatar', large && 'is-lg'], 'aria-hidden': 'true' }, h('span', { text: initial }));
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
    if (leavingGuest) leaveGuest(); else await signOutUser();
  } catch (e) { log.error('auth', 'logout failed', e); toast('Could not log out. Try again.', { type: 'error' }); }
}
