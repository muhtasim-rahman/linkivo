/**
 * Linkivo — js/features/shell/routes.js  (v2.1.3)
 * Purpose: the route table (ARCHITECTURE section 7). Pages load lazily; features of later versions point at a designed
 *          placeholder page until their version arrives, so every URL that will exist already works.
 * Route fields: see core/router.js. `nobar: true` (v2.3.0) hides the phone bottom bar for that route. `index: true` marks a public, indexable page (SEO, see core/page-meta.js); `desc` is its meta description.  `tab` tells the shell which nav item is active.  `refresh: true` lets the page take part in pull-to-refresh (pages whose content can change: lists, history, profile); the page module may export refresh(ctx).  `since` is the version that delivers the page.
 */
const stub = () => import('./pages/stub-page.js');
const settings = () => import('../settings/settings-page.js');
const libraryPage = () => import('../library/library-page.js');
const folderPage = () => import('../library/folder-page.js');
const importPage = () => import('../import/import-page.js');
const recyclePage = () => import('../library/recycle-bin-page.js');

import { HOME_TITLE, HOME_DESC } from '../../core/seo-pages.js';
export const ROUTES = [
  // v2.5.3 (owner): the home page has its own address, title and description. Before, "/" sent a visitor to /login, so a crawler (and a link preview) saw the sign-in page's title. Now a signed-out visitor stays on "/"
  // (the sign-in screen is the front door) and a signed-in one is sent to the library by the guard.
  { id: 'root', pattern: '/', fullTitle: HOME_TITLE, title: 'Home', desc: HOME_DESC, index: true, parent: null, guard: 'public', shell: false, load: () => import('../auth/login-page.js') },
  { id: 'admin-reset', pattern: '/admin-reset', title: 'Admin reset', parent: null, guard: 'open', shell: false, load: () => import('./pages/admin-reset-page.js') },   // v2.4.4: clears the device flag "Normal user"
  { id: 'login', pattern: '/login', title: 'Sign in', desc: 'Sign in to Linkivo with Google or email, or try it as a guest. Your links stay yours.', follow: true, parent: null, guard: 'public', shell: false, load: () => import('../auth/login-page.js') },
  // v2.2.2: Linkivo's own page for the links in Firebase emails (password reset, verification). Used once Firebase's "Customize action URL" points here.
  { id: 'auth-action', pattern: '/auth/action', title: 'Account action', parent: null, guard: 'open', shell: false, load: () => import('../auth/action-page.js') },
  { id: 'reactivate', pattern: '/reactivate', title: 'Account scheduled for deletion', parent: null, guard: 'auth', shell: false, load: () => import('./pages/reactivate-page.js') },

  { id: 'library', pattern: '/library', title: 'Library', parent: null, guard: 'auth', tab: 'library', refresh: true, load: libraryPage },
  { id: 'folder', pattern: '/folder/:fid', title: 'Folder', parent: '/library', guard: 'auth', tab: 'library', refresh: true, load: folderPage },
  { id: 'import', pattern: '/import', title: 'Import links', parent: '/library', guard: 'auth', tab: 'import', load: importPage },
  { id: 'link', pattern: '/link/:lid', title: 'Preview', parent: (p, env, st) => st.from || '/library', guard: 'auth', tab: 'library', nobar: true, load: () => import('../preview/preview-page.js') },   // v2.3.0: real page; nobar hides the phone bottom bar
  { id: 'search', pattern: '/search', title: 'Search', parent: '/library', guard: 'auth', tab: 'search', load: () => import('../search/search-page.js') },   // v2.3.0
  { id: 'share', pattern: '/share', title: 'Save to Linkivo', parent: '/library', guard: 'open', shell: false, load: () => import('../share/share-page.js') },   // v2.3.0: Web Share Target
  { id: 'random', pattern: '/random', title: 'Random Discover', parent: '/library', guard: 'auth', tab: 'random', load: () => import('../random/random-page.js') },   // v2.4.1: real page
  { id: 'history', pattern: '/profile/history', title: 'History', parent: '/profile', guard: 'auth', tab: 'menu', refresh: true, load: () => import('../history/history-page.js') },   // v2.4.1: real page

  { id: 'activity', pattern: '/profile/activity', title: 'Activity', parent: '/profile', guard: 'auth', tab: 'menu', refresh: true, load: () => import('../insights/activity-page.js') },   // v2.5.2
  { id: 'stats', pattern: '/profile/stats', title: 'Stats', parent: '/profile', guard: 'auth', tab: 'menu', refresh: true, load: () => import('../insights/stats-page.js') },
  { id: 'menu', pattern: '/menu', title: 'Menu', parent: '/library', guard: 'auth', refresh: true, tab: 'menu', load: () => import('./pages/menu-page.js') },
  { id: 'profile', pattern: '/profile', title: 'Profile', parent: (p, env) => (env.isWide ? '/library' : '/menu'), guard: 'auth', tab: 'menu', refresh: true, load: () => import('./pages/profile-page.js') },
  { id: 'settings', pattern: '/settings', title: 'Settings', parent: (p, env) => (env.isWide ? '/library' : '/menu'), guard: 'auth', refresh: true, tab: 'settings', load: settings },
  { id: 'recycle-bin', pattern: '/settings/recycle-bin', title: 'Recycle Bin', parent: '/settings', guard: 'auth', refresh: true, tab: 'settings', load: recyclePage },
  { id: 'settings-section', pattern: '/settings/:section', title: 'Settings', parent: (p, env) => (env.isWide ? '/library' : '/menu'), guard: 'auth', refresh: true, tab: 'settings', load: settings },

  { id: 'terms', pattern: '/terms', title: 'Terms', fullTitle: 'Terms of use - Linkivo', desc: 'The terms of use for Linkivo, a free link manager by Muhtasim Rahman.', index: true, parent: '/library', guard: 'open', load: () => import('../legal/legal-page.js') },
  { id: 'privacy', pattern: '/privacy', title: 'Privacy', fullTitle: 'Privacy - Linkivo', desc: 'How Linkivo handles your data: what is stored, where, who can see it, and how to export or delete everything.', index: true, image: '/assets/social/og-vault.jpg', imageAlt: 'Linkivo privacy: locked folders behind a code', parent: '/library', guard: 'open', load: () => import('../legal/legal-page.js') },
  { id: 'docs', pattern: '/docs', title: 'Documentation', fullTitle: 'Documentation - Linkivo', desc: 'A guide to every Linkivo feature: folders, import, search, Random Discover, locked folders, backup and settings.', index: true, image: '/assets/social/og-overview.jpg', parent: '/library', guard: 'open', load: () => import('../docs/docs-page.js') },
  { id: 'docs-topic', pattern: '/docs/:topic', title: 'Documentation', index: true, parent: '/docs', guard: 'open', load: () => import('../docs/docs-page.js') },
  { id: 'not-found', pattern: '*', title: 'Page not found', parent: '/library', guard: 'open', stub: 'lost', load: () => import('./pages/not-found-page.js') }   // v2.4.2: its own centred page
];
