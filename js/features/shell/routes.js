/**
 * Linkivo — js/features/shell/routes.js  (v2.1.0)
 * Purpose: the route table (ARCHITECTURE section 7). Pages load lazily; features of later versions point at a designed
 *          placeholder page until their version arrives, so every URL that will exist already works.
 * Route fields: see core/router.js.  `tab` tells the shell which nav item is active.  `since` is the version that delivers the page.
 */
const stub = () => import('./pages/stub-page.js');
const settings = () => import('../settings/settings-page.js');

export const ROUTES = [
  { id: 'root', pattern: '/', title: '', parent: null, guard: 'open', redirect: (s) => (s.mode === 'none' ? '/login' : '/library'), load: stub },
  { id: 'login', pattern: '/login', title: 'Sign in', parent: null, guard: 'public', shell: false, load: () => import('../auth/login-page.js') },
  { id: 'reactivate', pattern: '/reactivate', title: 'Account scheduled for deletion', parent: null, guard: 'auth', shell: false, load: () => import('./pages/reactivate-page.js') },

  { id: 'library', pattern: '/library', title: 'Library', parent: null, guard: 'auth', tab: 'library', stub: 'library', since: '2.2.0', load: stub },
  { id: 'folder', pattern: '/folder/:fid', title: 'Folder', parent: '/library', guard: 'auth', tab: 'library', stub: 'folder', since: '2.2.0', load: stub },
  { id: 'import', pattern: '/import', title: 'Import links', parent: '/library', guard: 'auth', tab: 'import', stub: 'import', since: '2.2.0', load: stub },
  { id: 'link', pattern: '/link/:lid', title: 'Link', parent: (p, env, st) => st.from || '/library', guard: 'auth', tab: 'library', stub: 'link', since: '2.3.0', load: stub },
  { id: 'search', pattern: '/search', title: 'Search', parent: '/library', guard: 'auth', tab: 'search', stub: 'search', since: '2.3.0', load: stub },
  { id: 'random', pattern: '/random', title: 'Random Discover', parent: '/library', guard: 'auth', tab: 'random', stub: 'random', since: '2.4.0', load: stub },
  { id: 'history', pattern: '/profile/history', title: 'History', parent: '/profile', guard: 'auth', tab: 'menu', stub: 'history', since: '2.4.0', load: stub },

  { id: 'menu', pattern: '/menu', title: 'Menu', parent: '/library', guard: 'auth', tab: 'menu', load: () => import('./pages/menu-page.js') },
  { id: 'profile', pattern: '/profile', title: 'Profile', parent: (p, env) => (env.isWide ? '/library' : '/menu'), guard: 'auth', tab: 'menu', load: () => import('./pages/profile-page.js') },
  { id: 'settings', pattern: '/settings', title: 'Settings', parent: (p, env) => (env.isWide ? '/library' : '/menu'), guard: 'auth', tab: 'settings', load: settings },
  { id: 'settings-section', pattern: '/settings/:section', title: 'Settings', parent: (p, env) => (env.isWide ? '/library' : '/settings'), guard: 'auth', tab: 'settings', load: settings },

  { id: 'terms', pattern: '/terms', title: 'Terms', parent: '/library', guard: 'open', stub: 'terms', since: '2.6.0', load: stub },
  { id: 'privacy', pattern: '/privacy', title: 'Privacy', parent: '/library', guard: 'open', stub: 'privacy', since: '2.6.0', load: stub },
  { id: 'docs', pattern: '/docs', title: 'Documentation', parent: '/library', guard: 'open', stub: 'docs', since: '2.6.0', load: stub },
  { id: 'docs-topic', pattern: '/docs/:topic', title: 'Documentation', parent: '/docs', guard: 'open', stub: 'docs', since: '2.6.0', load: stub },
  { id: 'not-found', pattern: '*', title: 'Page not found', parent: '/library', guard: 'open', stub: 'lost', load: stub }
];
