/**
 * Linkivo — js/features/shell/pages/profile-page.js  (v2.1.2, v2.4.1)
 * Purpose: Profile: who is signed in, a short "Recently opened" list with a link to the full History page, shortcuts to Settings, History settings and
 *          Random Discover, and how to leave. v2.4.1 adds the History section (the History page itself is /profile/history). Security and account deletion
 *          arrive in v2.5.0.
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { getSession } from '../../../core/session.js';
import { maskEmail } from '../../../core/mask.js';
import { loadCss } from '../../../core/css-loader.js';
import { getHistory } from '../../../core/app-data.js';
import { faviconUrl } from '../../library/folder-style.js';
import { relativeTime } from '../../../core/format.js';
import { avatar, logOut } from '../shell-parts.js';

export async function mount(container, ctx) {
  await loadCss('/css/pages/pages.css');
  const s = getSession();
  const guest = s.mode === 'guest';
  const row = (iconName, label, desc, props, end) => h(props.href ? 'a' : 'button', { class: 'row', type: props.href ? null : 'button', ...props }, h('span', { class: 'row-ic' }, icon(iconName)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), end && h('span', { class: 'row-end' }, end));
  const hist = getHistory();
  const recent = h('div', { class: 'group pf-recent' });
  const paintRecent = () => {
    const items = hist ? hist.list().slice(0, 4) : [];
    recent.replaceChildren(...(items.length ? items.map((e) => h('a', { class: 'row pf-rec', href: `/link/${encodeURIComponent(e.lid)}` },
      h('span', { class: 'pf-rec-fav', 'aria-hidden': 'true' }, h('img', { src: faviconUrl(e.host), alt: '', width: '20', height: '20', loading: 'lazy', referrerpolicy: 'no-referrer', on: { error: (ev) => ev.target.remove() } })),
      h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: e.title || e.host || e.url }), h('span', { class: 'row-desc', text: `${e.host || ''} \u00b7 ${relativeTime(e.ts)}` })))) : [h('p', { class: 'help pf-rec-empty', text: 'Links you open will be listed here.' })]));
  };
  paintRecent();
  const off = hist ? hist.subscribe(paintRecent) : null;
  container.appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Profile' })),
    h('div', { class: 'profile-head' }, avatar(guest ? 'Guest' : s.user.name, true, s.user ? s.user.photo : '', !guest),
      h('div', { class: 'pf-text' }, h('span', { class: 'pf-name', text: guest ? 'Guest' : s.user.name }), h('span', { class: 'pf-mail', text: guest ? 'Stored only on this device' : maskEmail(s.user.email) }), h('span', null, h('span', { class: 'tag', text: guest ? 'Guest mode' : 'Account' })))),
    h('h2', { class: 'pf-sec', text: 'History' }), recent,
    h('div', { class: 'group' },
      row('history', 'Open History', 'Every link you opened, by day, with search.', { href: '/profile/history' }, icon('chevron-right')),
      row('random', 'Random Discover', 'Open a surprise from your own links.', { href: '/random' }, icon('chevron-right'))),
    h('h2', { class: 'pf-sec', text: 'Account' }),
    h('div', { class: 'group' },
      row('settings', 'Settings', null, { href: '/settings' }, icon('chevron-right')),
      guest
        ? row('login', 'Log in', 'Sign in to keep your links in the cloud. Moving guest data to an account arrives in v2.5.0.', { on: { click: () => logOut(ctx.router, { guest: true }) } })
        : row('logout', 'Log out', 'You will need to sign in again.', { on: { click: () => logOut(ctx.router) } })),
    h('p', { class: 'help', style: { marginTop: '16px' }, text: 'Security and account tools arrive in the next version.' })));
  return () => { if (off) off(); };
}
