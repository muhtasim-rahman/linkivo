/**
 * Linkivo — js/features/shell/pages/profile-page.js  (v2.1.2)
 * Purpose: minimal Profile: who is signed in, how to leave. The full profile (History, security, account deletion) arrives in v2.4.0 / v2.5.0.
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { getSession } from '../../../core/session.js';
import { maskEmail } from '../../../core/mask.js';
import { loadCss } from '../../../core/css-loader.js';
import { avatar, logOut } from '../shell-parts.js';

export async function mount(container, ctx) {
  await loadCss('/css/pages/pages.css');
  const s = getSession();
  const guest = s.mode === 'guest';
  const row = (iconName, label, desc, props, end) => h(props.href ? 'a' : 'button', { class: 'row', type: props.href ? null : 'button', ...props }, h('span', { class: 'row-ic' }, icon(iconName)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), end && h('span', { class: 'row-end' }, end));
  container.appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Profile' })),
    h('div', { class: 'profile-head' }, avatar(guest ? 'Guest' : s.user.name, true, s.user ? s.user.photo : ''),
      h('div', { class: 'pf-text' }, h('span', { class: 'pf-name', text: guest ? 'Guest' : s.user.name }), h('span', { class: 'pf-mail', text: guest ? 'Stored only on this device' : maskEmail(s.user.email) }), h('span', null, h('span', { class: 'tag', text: guest ? 'Guest mode' : 'Account' })))),
    h('div', { class: 'group' },
      row('settings', 'Settings', null, { href: '/settings' }, icon('chevron-right')),
      guest
        ? row('login', 'Log in', 'Sign in to keep your links in the cloud. Moving guest data to an account arrives in v2.5.0.', { on: { click: () => logOut(ctx.router, { guest: true }) } })
        : row('logout', 'Log out', 'You will need to sign in again.', { on: { click: () => logOut(ctx.router) } })),
    h('p', { class: 'help', style: { marginTop: '16px' }, text: 'History, security and account tools arrive in later versions.' })));
}
