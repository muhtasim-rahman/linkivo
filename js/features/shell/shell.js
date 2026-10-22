/**
 * Linkivo — js/features/shell/shell.js  (v2.1.0)
 * Purpose: the persistent chrome around the page area: mobile floating glass bottom bar (Library, Random, Add, Search, Menu),
 *          PC collapsible sidebar (Add links, Library, Random, Search, Settings) with theme toggle and profile badge, install banner.
 *          Sidebar logo (v2.1.1): expanded = click the logo or name to open Library, collapse with the arrow; collapsed = hovering the logo
 *          shows an expand icon and a click expands. Built once; the router only swaps what is inside #page-root.
 * API: mountShell({ router }) -> { setSession(session), isWide() }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openMenu } from '../../ui/popover.js';
import { prefs } from '../../core/local-prefs.js';
import { resolvedTheme } from '../../core/appearance.js';
import { maskEmail } from '../../core/mask.js';
import { brandMark, brandWord } from '../../ui/brand.js';
import { avatar, logOut, toggleTheme } from './shell-parts.js';
import { mountInstallBanner } from './install-banner.js';

const SIDE = [
  { tab: 'import', label: 'Add links', href: '/import', icon: 'plus', primary: true },
  { tab: 'library', label: 'Library', href: '/library', icon: 'library' },
  { tab: 'random', label: 'Random Discover', href: '/random', icon: 'random' },
  { tab: 'search', label: 'Search', href: '/search', icon: 'search' },
  { tab: 'settings', label: 'Settings', href: '/settings', icon: 'settings' }
];
const BAR = [
  { tab: 'library', label: 'Library', href: '/library', icon: 'library' },
  { tab: 'random', label: 'Random Discover', href: '/random', icon: 'random' },
  { tab: 'import', label: 'Add links', href: '/import', icon: 'plus', primary: true },
  { tab: 'search', label: 'Search', href: '/search', icon: 'search' },
  { tab: 'menu', label: 'Menu', href: '/menu', icon: 'menu' }
];
const wide = typeof matchMedia === 'function' ? matchMedia('(min-width: 900px)') : { matches: false };

export function mountShell({ router }) {
  const app = document.getElementById('app');
  const sidebar = document.getElementById('sidebar');
  const bar = document.getElementById('bar');
  const root = document.getElementById('page-root');
  const bannerHost = h('div', { class: 'banner-host' });
  root.parentElement.insertBefore(bannerHost, root);
  mountInstallBanner(bannerHost);

  // ---- sidebar -------------------------------------------------------------------------------------------------------
  const home = h('a', { class: 'sb-home', href: '/library', 'data-tip': 'Library' }, brandMark(34), brandWord());
  const expand = h('button', { type: 'button', class: 'sb-expand', 'aria-label': 'Expand sidebar', 'data-tip': 'Expand sidebar', on: { click: () => setCollapsed(false) } }, brandMark(34), icon('panel-open', { size: 26 }));
  const toggle = h('button', { type: 'button', class: 'btn btn-icon sb-toggle', 'aria-label': 'Collapse sidebar', 'aria-expanded': 'true', on: { click: () => setCollapsed(true) } }, icon('panel-close', { size: 22 }));
  const setCollapsed = (v) => { app.dataset.collapsed = String(v); prefs.set('ui.sidebarCollapsed', v); toggle.setAttribute('aria-expanded', String(!v)); };
  const navLink = (it) => h('a', { class: ['nav-item', it.primary && 'is-primary'], href: it.href, 'data-tab': it.tab, 'data-tip': it.label }, h('span', { class: 'nav-ic' }, icon(it.icon, { size: 24 })), h('span', { class: 'nav-label', text: it.label }));
  const themeSwitch = h('span', { class: 'switch', 'aria-hidden': 'true' });
  const themeIcon = h('span', { class: 'nav-ic' });
  const themeRow = h('button', { type: 'button', class: 'theme-row', role: 'switch', 'data-tip': 'Dark mode', on: { click: toggleTheme } }, themeIcon, h('span', { class: 'theme-label', text: 'Dark mode' }), themeSwitch);
  const pfAvatar = h('span'); const pfName = h('span', { class: 'pf-name' }); const pfMail = h('span', { class: 'pf-mail' });
  const pfLink = h('a', { class: 'pf-link', href: '/profile', 'data-tip': 'Profile' }, pfAvatar, h('span', { class: 'pf-text' }, pfName, pfMail));
  const more = h('button', { type: 'button', class: 'btn btn-icon pf-more', 'aria-label': 'Account menu', 'aria-haspopup': 'menu', on: { click: () => openMenu(more, [{ label: 'Profile', icon: 'user', onSelect: () => router.navigate('/profile') }, { separator: true }, { label: 'Log out', icon: 'logout', danger: true, onSelect: () => logOut(router) }], { align: 'start' }) } }, icon('more', { size: 20 }));
  sidebar.replaceChildren(h('div', { class: 'sb-head' }, home, expand, toggle), ...SIDE.map(navLink), h('div', { class: 'sb-spacer' }), themeRow, h('div', { class: 'pf' }, pfLink, more));

  // ---- bottom bar ----------------------------------------------------------------------------------------------------
  const marker = h('span', { class: 'bar-marker', 'data-hidden': 'true', 'aria-hidden': 'true' });
  bar.replaceChildren(marker, ...BAR.map((it) => h('a', { class: ['bar-item', it.primary && 'bar-import'], href: it.href, 'data-tab': it.tab, 'aria-label': it.label }, it.primary ? h('span', null, icon(it.icon, { size: 26 })) : icon(it.icon, { size: 24 }))));

  // hide the bar while scrolling down, bring it back on the way up (transform + opacity only: no layout shift)
  let last = 0;
  root.addEventListener('scroll', () => {
    const y = root.scrollTop, d = y - last;
    if (Math.abs(d) < 8) return;
    bar.classList.toggle('is-hidden', d > 0 && y > 80 && prefs.get('ui.hideBar', true));
    last = y;
  }, { passive: true });

  function renderTheme() { const dark = resolvedTheme() === 'dark'; themeIcon.replaceChildren(icon(dark ? 'moon' : 'sun', { size: 24 })); themeRow.setAttribute('aria-checked', String(dark)); themeSwitch.setAttribute('aria-checked', String(dark)); }
  new MutationObserver(renderTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  renderTheme();

  setCollapsed(prefs.get('ui.sidebarCollapsed', false));

  router.on('route', ({ route }) => {
    const chrome = route.shell !== false;
    app.dataset.chrome = chrome ? '' : 'none';
    for (const a of [...sidebar.querySelectorAll('.nav-item'), ...bar.querySelectorAll('.bar-item')]) {
      if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    const idx = BAR.findIndex((b) => b.tab === route.tab);
    marker.style.setProperty('--i', String(Math.max(idx, 0)));
    marker.dataset.hidden = String(idx < 0 || BAR[idx].primary === true);
    bar.classList.remove('is-hidden'); last = 0;
  });

  return {
    isWide: () => wide.matches,
    setSession(s) {
      const guest = s.mode === 'guest';
      const name = guest ? 'Guest' : s.user ? s.user.name : '';
      app.dataset.mode = s.mode; document.documentElement.dataset.mode = s.mode;
      pfAvatar.replaceChildren(avatar(name));
      pfName.textContent = name;
      pfMail.textContent = guest ? 'This device only' : s.user ? maskEmail(s.user.email) : '';
    }
  };
}
