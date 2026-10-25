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
import { getSession } from '../../../core/session.js';
import { maskEmail } from '../../../core/mask.js';
import { loadCss } from '../../../core/css-loader.js';
import { prefs } from '../../../core/local-prefs.js';
import { KEYS } from '../../../core/appearance.js';
import { getEngine } from '../../../core/app-data.js';
import { plural } from '../../../core/format.js';
import { avatar } from '../shell-parts.js';
import { installCard } from '../install-card.js';
import { appInfoCard, appLinkButtons } from '../../settings/about-card.js';
import { findEntry } from '../../settings/catalog.js';
import { renderControl } from '../../settings/controls.js';

/** Settings that are worth one tap from the Menu (kept for older callers; the theme is drawn as icons below). */
export const QUICK_SETTINGS = ['theme', 'hideBar'];
const THEMES = [['system', 'monitor', 'System'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']];

function themeRow() {
  const cur = () => prefs.get(KEYS.theme, 'system');
  const seg = h('div', { class: 'seg qs-theme', role: 'radiogroup', 'aria-label': 'Theme' }, THEMES.map(([v, ic, label]) => h('button', { type: 'button', role: 'radio', 'data-v': v, 'aria-label': label, on: { click: () => { prefs.set(KEYS.theme, v); sync(); } } }, icon(ic, { size: 18 }), h('span', { text: label }))));
  const sync = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === cur())));
  sync();
  return h('div', { class: 'row qs-row' }, h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Theme' })), seg);
}
const linkRow = (ic, label, desc, href) => h('a', { class: 'row', href }, h('span', { class: 'row-ic' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), h('span', { class: 'row-end' }, icon('chevron-right')));

export async function mount(container) {
  await Promise.all([loadCss('/css/pages/pages.css'), loadCss('/css/pages/settings.css')]);
  const s = getSession();
  const name = s.mode === 'guest' ? 'Guest' : s.user.name;
  const sub = s.mode === 'guest' ? 'Stored only on this device' : maskEmail(s.user.email);
  const e = getEngine(), c = e ? e.counts() : { deletedFolders: 0, deletedLinks: 0 };
  const binN = c.deletedFolders + c.deletedLinks;
  const hide = findEntry('hideBar');
  container.appendChild(h('div', { class: 'page page-enter' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Menu' })),
    h('div', { class: 'menu-list' },
      h('a', { class: 'menu-hero', href: '/profile' }, avatar(name, true, s.user ? s.user.photo : ''), h('div', { class: 'pf-text' }, h('span', { class: 'pf-name', text: name }), h('span', { class: 'pf-mail', text: sub })), h('span', { class: 'row-end', style: { marginLeft: 'auto' } }, icon('chevron-right'))),
      installCard(),
      h('section', { class: 'menu-quick', 'aria-labelledby': 'menu-quick-h' },
        h('h2', { class: 'menu-h', id: 'menu-quick-h' }, h('span', { class: 'set-h-ic' }, icon('zap', { size: 18 })), 'Quick settings'),
        h('div', { class: 'group' }, themeRow(), hide && renderControl(hide), linkRow('database', 'Import and export', 'Backup, restore, export formats', '/settings/data'), linkRow('settings', 'View all settings', null, '/settings'))),
      h('a', { class: 'binrow', href: '/settings/recycle-bin' }, h('span', { class: 'binrow-ic' }, icon('trash', { size: 20 })),
        h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Recycle Bin' }), h('span', { class: 'row-desc', text: binN ? `${plural(binN, 'item')}, kept for 15 days` : 'Empty. Deleted items wait here for 15 days.' })), h('span', { class: 'row-end' }, icon('chevron-right'))),
      appInfoCard(),
      appLinkButtons())));
}
