/**
 * Linkivo — js/features/shell/switch-account.js  (v2.3.1)
 * Purpose: the "Switch account" popup (owner request). Lists the accounts that signed in on this device (core/known-accounts.js), the current one on top, and an
 *          "Add another account" button under the list. Each account has a three-dot menu: Log out (current
 *          account) or Remove from list (the others). Tapping another account asks once, signs out and opens the login page with that email filled in (Google
 *          accounts are offered with their address as the hint). Honest limit: Firebase keeps one signed-in user per browser, so this is a fast re-sign-in, not
 *          two live sessions; the current account's data stays safely in its own account and on this device's cache.
 * API: openSwitchAccount(router) -> void      switchButton(router) -> Element (the small icon for profile badges)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { openMenu } from '../../ui/popover.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { prefs } from '../../core/local-prefs.js';
import { getSession } from '../../core/session.js';
import { maskEmail } from '../../core/mask.js';
import { listAccounts, forgetAccount, stashPrefill } from '../../core/known-accounts.js';
import { signOutUser } from '../auth/auth-service.js';
import { avatar, logOut } from './shell-parts.js';
import { loadCss } from '../../core/css-loader.js';

export async function openSwitchAccount(router) {
  await loadCss('/css/pages/pages.css');
  const s = getSession(), cur = s.mode === 'account' && s.user ? s.user.uid : null;
  let sheet = null;
  const list = h('ul', { class: 'swa-list' });

  async function goSignIn(a) {
    if (!(await confirmDialog({ title: a ? `Switch to ${a.name || maskEmail(a.email)}?` : 'Add another account?', message: 'You will be signed out here and taken to the sign-in page. Your links stay safe in their accounts.', confirmLabel: a ? 'Switch' : 'Continue' }))) return;
    sheet?.close();
    if (a) stashPrefill(prefs, { email: a.email, google: (a.providers || []).includes('google.com') && !(a.providers || []).includes('password') });
    try { await signOutUser(); } catch { toast('Could not sign out. Try again.', { type: 'error' }); return; }
    router.navigate('/login', { replace: true });
  }
  function paint() {
    const accounts = listAccounts(prefs).sort((x, y) => (y.uid === cur) - (x.uid === cur));
    list.replaceChildren(...(accounts.length ? accounts.map((a) => {
      const isCur = a.uid === cur;
      const more = h('button', { type: 'button', class: 'btn-icon', 'aria-label': `Options for ${a.name || maskEmail(a.email)}`, 'aria-haspopup': 'menu' }, icon('more', { size: 18 }));
      more.addEventListener('click', () => openMenu(more, [
        isCur ? { label: 'Log out', icon: 'logout', danger: true, onSelect: () => { sheet?.close(); logOut(router); } } : { label: 'Remove account', icon: 'close', onSelect: () => { forgetAccount(a.uid, prefs); paint(); } }
      ]));
      const main = h('button', { type: 'button', class: 'swa-main', disabled: isCur, 'aria-current': isCur ? 'true' : null, on: { click: () => goSignIn(a) } },
        avatar(a.name || a.email, false, a.photo), h('span', { class: 'swa-tx' }, h('span', { class: 'swa-name', text: a.name || 'Account' }), h('span', { class: 'swa-mail', text: maskEmail(a.email) })),
        isCur && h('span', { class: 'swa-cur' }, icon('check', { size: 14 }), 'Current'));
      return h('li', { class: ['swa-row', isCur && 'is-cur'] }, main, more);
    }) : [h('li', { class: 'swa-empty', text: 'Accounts you sign in with on this device will be listed here.' })]));
  }
  paint();
  const body = h('div', { class: 'swa' }, list,
    h('button', { type: 'button', class: 'swa-add', on: { click: () => goSignIn(null) } }, h('span', { class: 'swa-add-ic' }, icon('plus', { size: 18 })), h('span', { text: 'Add another account' })),
    h('p', { class: 'help', text: 'Switching signs you in again as that account. Your data is never mixed.' }));
  sheet = openSheet({ title: 'Switch account', body, actions: [{ label: 'Close', variant: 'quiet' }] });
}

/** A small round icon beside a profile badge (Menu page, Settings, sidebar). Accounts only; guests have nothing to switch from. */
export function switchButton(router) {
  if (getSession().mode !== 'account') return h('span', { hidden: true });
  return h('button', { type: 'button', class: 'btn-icon swa-btn', 'aria-label': 'Switch account', 'data-tip': 'Switch account', on: { click: (e) => { e.preventDefault(); e.stopPropagation(); openSwitchAccount(router); } } }, icon('users', { size: 20 }));
}
