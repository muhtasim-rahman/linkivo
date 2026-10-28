/**
 * Linkivo — js/features/shell/pages/menu-page.js  (v2.2.1)
 * Purpose: the mobile Menu tab, rebuilt (owner request). Order: profile card, install card (highlighted, or a compact tick when installed), Quick settings
 *          (theme as icons, hide bottom bar on scroll, import and export, all settings), Recycle Bin card, then ONE app info card (logo, name, version,
 *          short description, feature highlights and the developer badge) with a row of link buttons under it (source code, report a problem,
 *          documentation, privacy policy, terms).
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { loadCss } from '../../../core/css-loader.js';
import { prefs } from '../../../core/local-prefs.js';
import { KEYS } from '../../../core/appearance.js';
import { profileCard, logoutButton } from '../shell-parts.js';   // v2.3.0: avatar and logOut moved into the shared profileCard and logoutButton
import { installCard } from '../install-card.js';
import { binCard } from '../bin-card.js';
import { appInfoCard, appLinkButtons } from '../../settings/about-card.js';
import { findEntry } from '../../settings/catalog.js';
import { renderControl } from '../../settings/controls.js';

/** Settings that are worth one tap from the Menu (kept for older callers; the theme is drawn as icons below). */
export const QUICK_SETTINGS = ['theme', 'hideBar'];
const THEMES = [['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']];

function themeRow() {
  const cur = () => prefs.get(KEYS.theme, 'system');
  // v2.2.4 (owner): icon-only buttons (no text), kept in the right column of the row
  const seg = h('div', { class: 'seg qs-theme', role: 'radiogroup', 'aria-label': 'Theme' }, THEMES.map(([v, ic, label]) => h('button', { type: 'button', role: 'radio', 'data-v': v, 'aria-label': label, 'data-tip': label, on: { click: () => { prefs.set(KEYS.theme, v); sync(); } } }, icon(ic, { size: 18 }))));
  const sync = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === cur())));
  sync();
  return h('div', { class: 'row qs-row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Theme' })), seg);
}
const linkRow = (ic, label, desc, href) => h('a', { class: 'row', href }, h('span', { class: 'row-ic' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), h('span', { class: 'row-end' }, icon('chevron-right')));

export async function mount(container, ctx = {}) {
  await Promise.all([loadCss('/css/pages/pages.css'), loadCss('/css/pages/settings.css')]);
  const hide = findEntry('hideBar');
  container.appendChild(h('div', { class: 'page page-enter' },
    h('header', { class: 'page-head menu-head' }, h('h1', { class: 'page-title', text: 'Menu' }), h('a', { class: 'btn-icon', href: '/settings', 'aria-label': 'Settings', 'data-tip': 'Settings' }, icon('settings', { size: 22 }))),   // v2.2.4: gear = all settings
    h('div', { class: 'menu-list' },
      profileCard(),   // v2.3.0: shared with the wide Settings page
      installCard(),
      h('section', { class: 'menu-quick', 'aria-labelledby': 'menu-quick-h' },
        h('h2', { class: 'menu-h', id: 'menu-quick-h' }, h('span', { class: 'set-h-ic' }, icon('zap', { size: 18 })), 'Quick settings'),
        h('div', { class: 'group' }, themeRow(), hide && renderControl(hide), linkRow('database', 'Import and export', 'Backup, restore, export formats', '/settings/data'))),
      h('div', { class: 'group' }, linkRow('settings', 'View all settings', 'Every option in one place', '/settings')),   // v2.2.4: its own card
      binCard(),
      appInfoCard(),
      appLinkButtons(),
      // v2.2.4 (owner): red logout card at the bottom of the Menu
      logoutButton(ctx.router))));
}
