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

export const ROUTES = [
  { id: 'root', pattern: '/', title: '', parent: null, guard: 'open', redirect: (s) => (s.mode === 'none' ? '/login' : '/library'), load: stub },
  { id: 'login', pattern: '/login', title: 'Sign in', desc: 'Sign in to Linkivo or try it as a guest. A fast, private link manager for your folders, links and bookmarks.', index: true, parent: null, guard: 'public', shell: false, load: () => import('../auth/login-page.js') },
  // v2.2.2: Linkivo's own page for the links in Firebase emails (password reset, verification). Used once Firebase's "Customize action URL" points here.
  { id: 'auth-action', pattern: '/auth/action', title: 'Account action', parent: null, guard: 'open', shell: false, load: () => import('../auth/action-page.js') },
  { id: 'reactivate', pattern: '/reactivate', title: 'Account scheduled for deletion', parent: null, guard: 'auth', shell: false, load: () => import('./pages/reactivate-page.js') },

  { id: 'library', pattern: '/library', title: 'Library', parent: null, guard: 'auth', tab: 'library', refresh: true, load: libraryPage },
  { id: 'folder', pattern: '/folder/:fid', title: 'Folder', parent: '/library', guard: 'auth', tab: 'library', refresh: true, load: folderPage },
  { id: 'import', pattern: '/import', title: 'Import links', parent: '/library', guard: 'auth', tab: 'import', load: importPage },
  { id: 'link', pattern: '/link/:lid', title: 'Preview', parent: (p, env, st) => st.from || '/library', guard: 'auth', tab: 'library', nobar: true, load: () => import('../preview/preview-page.js') },   // v2.3.0: real page; nobar hides the phone bottom bar
  { id: 'search', pattern: '/search', title: 'Search', parent: '/library', guard: 'auth', tab: 'search', load: () => import('../search/search-page.js') },   // v2.3.0
  { id: 'share', pattern: '/share', title: 'Save to Linkivo', parent: '/library', guard: 'open', shell: false, load: () => import('../share/share-page.js') },   // v2.3.0: Web Share Target
  { id: 'random', pattern: '/random', title: 'Random Discover', parent: '/library', guard: 'auth', tab: 'random', since: '2.4.0', load: () => import('../random/random-page.js') },
  { id: 'history', pattern: '/profile/history', title: 'History', parent: '/profile', guard: 'auth', tab: 'menu', refresh: true, since: '2.4.0', load: () => import('../history/history-page.js') },

  { id: 'menu', pattern: '/menu', title: 'Menu', parent: '/library', guard: 'auth', tab: 'menu', load: () => import('./pages/menu-page.js') },
  { id: 'profile', pattern: '/profile', title: 'Profile', parent: (p, env) => (env.isWide ? '/library' : '/menu'), guard: 'auth', tab: 'menu', refresh: true, load: () => import('./pages/profile-page.js') },
  { id: 'settings', pattern: '/settings', title: 'Settings', parent: (p, env) => (env.isWide ? '/library' : '/menu'), guard: 'auth', tab: 'settings', load: settings },
  { id: 'recycle-bin', pattern: '/settings/recycle-bin', title: 'Recycle Bin', parent: '/settings', guard: 'auth', tab: 'settings', load: recyclePage },
  { id: 'settings-section', pattern: '/settings/:section', title: 'Settings', parent: (p, env) => (env.isWide ? '/library' : '/menu'), guard: 'auth', tab: 'settings', load: settings },

  { id: 'terms', pattern: '/terms', title: 'Terms', desc: 'The terms of use for Linkivo.', parent: '/library', guard: 'open', stub: 'terms', since: '2.6.0', load: stub },
  { id: 'privacy', pattern: '/privacy', title: 'Privacy', desc: 'How Linkivo handles your data: what is stored, where, and who can see it.', parent: '/library', guard: 'open', stub: 'privacy', since: '2.6.0', load: stub },
  { id: 'docs', pattern: '/docs', title: 'Documentation', desc: 'A guide to every Linkivo feature: import, folders, search, random discover, vault and backup.', parent: '/library', guard: 'open', stub: 'docs', since: '2.6.0', load: stub },
  { id: 'docs-topic', pattern: '/docs/:topic', title: 'Documentation', parent: '/docs', guard: 'open', stub: 'docs', since: '2.6.0', load: stub },
  { id: 'not-found', pattern: '*', title: 'Page not found', parent: '/library', guard: 'open', stub: 'lost', load: stub }
];
