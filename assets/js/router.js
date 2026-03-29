// ============================================================
// Linkivo — router.js  v1.4.0
// Hash-based SPA router: #home, #random, #history, #settings,
// #folder/FOLDERID  — no reload, URL updates on tab switch
// ============================================================

import { Storage } from './utils.js';

const Router = (() => {
  const pages  = {};
  let current  = null;
  const PAGE_TITLES = {
    home:     'My Links',
    random:   'Random Discover',
    history:  'History',
    settings: 'Settings',
    folder:   'Folder',
  };

  // ── Register a page ─────────────────────────────────────
  function register(id, { onEnter, onLeave } = {}) {
    const el = document.getElementById(`page-${id}`);
    if (!el) { console.warn(`[Router] #page-${id} not found`); return; }
    pages[id] = { el, onEnter, onLeave };
  }

  // ── Navigate ─────────────────────────────────────────────
  function go(id, params = {}, replaceState = false) {
    if (!pages[id]) { console.warn(`[Router] Unknown page: ${id}`); return; }

    // Leave current
    if (current && pages[current]) {
      pages[current].el.classList.remove('active');
      pages[current].onLeave?.();
    }

    current = id;
    pages[id].el.classList.add('active');
    pages[id].onEnter?.(params);

    // Update nav highlights
    _updateNav(id, params);

    // Update URL hash (no reload)
    const hash = _buildHash(id, params);
    if (replaceState) history.replaceState({ id, params }, '', hash);
    else              history.pushState(  { id, params }, '', hash);

    // Update topbar page title
    _updateTitle(id, params);

    // Persist last page
    Storage.set('lastPage', id);
    if (params?.folder?.id) Storage.set('lastFolderId', params.folder.id);
  }

  function _buildHash(id, params) {
    if (id === 'folder' && params?.folder?.id) return `#folder/${params.folder.id}`;
    if (id === 'home') return '#home';
    return `#${id}`;
  }

  function _updateNav(id, params) {
    const navId = id === 'folder' ? 'home' : id;
    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === navId);
    });
  }

  function _updateTitle(id, params) {
    let title = PAGE_TITLES[id] || 'Linkivo';
    if (id === 'folder' && params?.folder?.name) title = params.folder.name;
    // Update topbar title element
    const el = document.getElementById('topbar-page-title');
    if (el) el.textContent = title;
    // Update document title
    document.title = title === 'My Links' ? 'Linkivo' : `${title} — Linkivo`;
  }

  // ── Init: parse hash on load + bind nav clicks ───────────
  function init(defaultPage = 'home') {
    // Bind nav items
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.page));
    });

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      if (e.state?.id) go(e.state.id, e.state.params || {}, true);
    });

    // Parse current hash
    const { page, params } = _parseHash(window.location.hash);
    const target = pages[page] ? page : (pages[defaultPage] ? defaultPage : 'home');
    go(target, params, true);
  }

  function _parseHash(hash) {
    const h = hash.replace('#', '');
    if (!h) return { page: 'home', params: {} };
    // folder/FOLDERID
    const folderMatch = h.match(/^folder\/(.+)$/);
    if (folderMatch) return { page: 'folder', params: { folderId: folderMatch[1] } };
    // known pages
    const known = ['home','random','history','settings'];
    if (known.includes(h)) return { page: h, params: {} };
    return { page: 'home', params: {} };
  }

  function getCurrent() { return current; }
  function getTitle(id) { return PAGE_TITLES[id] || id; }

  return { register, go, getCurrent, getTitle, init };
})();

export default Router;
