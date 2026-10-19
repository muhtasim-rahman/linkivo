/**
 * Linkivo — js/features/shell/pages/menu-page.js  (v2.1.0)
 * Purpose: the mobile Menu tab: profile entry, Settings, app info. (Documentation, Terms, Privacy and the developer banner
 *          are added in v2.6.0.)
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { getSession } from '../../../core/session.js';
import { maskEmail } from '../../../core/mask.js';
import { loadCss } from '../../../core/css-loader.js';
import { avatar } from '../shell-parts.js';
import { installStatus } from '../../../core/install.js';
import app from '../../../core/app-info.js';

export async function mount(container) {
  await loadCss('/css/pages/pages.css');
  const s = getSession();
  const name = s.mode === 'guest' ? 'Guest' : s.user.name;
  const sub = s.mode === 'guest' ? 'Stored only on this device' : maskEmail(s.user.email);
  const st = installStatus();
  container.appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Menu' })),
    h('div', { class: 'menu-list' },
      h('a', { class: 'menu-hero', href: '/profile' }, avatar(name, true), h('div', { class: 'pf-text', style: { opacity: 1, transform: 'none' } }, h('span', { class: 'pf-name', text: name }), h('span', { class: 'pf-mail', text: sub })), h('span', { class: 'row-end', style: { marginLeft: 'auto' } }, icon('chevron-right'))),
      h('div', { class: 'group' },
        h('a', { class: 'row', href: '/settings' }, h('span', { class: 'row-ic' }, icon('settings')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Settings' }), h('span', { class: 'row-desc', text: 'Appearance, app, advanced' })), h('span', { class: 'row-end' }, icon('chevron-right'))),
        h('a', { class: 'row', href: '/settings/app' }, h('span', { class: 'row-ic' }, icon('install')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: st.title }), h('span', { class: 'row-desc', text: 'Install and updates' })), h('span', { class: 'row-end' }, icon('chevron-right')))),
      h('div', { class: 'about' }, h('img', { src: '/assets/brand/logo.svg', alt: '', width: 44, height: 44 }), h('div', null, h('strong', { text: app.name }), h('span', { class: 'muted', text: `Version ${app.version}. ${app.tagline}.` }))))));
}
