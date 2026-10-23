/**
 * Linkivo — js/features/shell/pages/menu-page.js  (v2.1.3)
 * Purpose: the mobile Menu tab: profile entry, QUICK SETTINGS (the few settings people change most, same controls as Settings, v2.1.3),
 *          Settings and install status, the About card and the separate Developer section.
 *          (Documentation, Terms and Privacy pages themselves arrive in v2.6.0; the links are already here.)
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { getSession } from '../../../core/session.js';
import { maskEmail } from '../../../core/mask.js';
import { loadCss } from '../../../core/css-loader.js';
import { avatar } from '../shell-parts.js';
import { installStatus } from '../../../core/install.js';
import { aboutCard, developerCard } from '../../settings/about-card.js';
import { findEntry } from '../../settings/catalog.js';
import { renderControl } from '../../settings/controls.js';

/** Settings that are worth one tap from the Menu. They are registry entries, so they stay in step with Settings. */
export const QUICK_SETTINGS = ['theme', 'accent', 'fontSize', 'hideBar'];

export async function mount(container) {
  await Promise.all([loadCss('/css/pages/pages.css'), loadCss('/css/pages/settings.css')]);
  const s = getSession();
  const name = s.mode === 'guest' ? 'Guest' : s.user.name;
  const sub = s.mode === 'guest' ? 'Stored only on this device' : maskEmail(s.user.email);
  const st = installStatus();
  const row = (ic, label, desc, href) => h('a', { class: 'row', href }, h('span', { class: 'row-ic' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), h('span', { class: 'row-desc', text: desc })), h('span', { class: 'row-end' }, icon('chevron-right')));
  const quick = QUICK_SETTINGS.map(findEntry).filter(Boolean).map(renderControl);
  container.appendChild(h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Menu' })),
    h('div', { class: 'menu-list' },
      h('a', { class: 'menu-hero', href: '/profile' }, avatar(name, true, s.user ? s.user.photo : ''), h('div', { class: 'pf-text' }, h('span', { class: 'pf-name', text: name }), h('span', { class: 'pf-mail', text: sub })), h('span', { class: 'row-end', style: { marginLeft: 'auto' } }, icon('chevron-right'))),
      h('section', { class: 'menu-quick', 'aria-labelledby': 'menu-quick-h' },
        h('h2', { class: 'menu-h', id: 'menu-quick-h' }, h('span', { class: 'set-h-ic' }, icon('zap', { size: 18 })), 'Quick settings'),
        h('div', { class: 'group' }, quick)),
      h('div', { class: 'group' },
        row('settings', 'All settings', 'Appearance, behavior, account, app', '/settings'),
        row('install', st.title, 'Install and updates', '/settings/app')),
      aboutCard(),
      developerCard())));
}
