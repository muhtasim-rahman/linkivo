// ============================================================
// Linkivo — router.js  v1.4.4
// Hash-based SPA router: explicit display toggling per page
// so tabs never overlap. Routes: #home #random #history
// #settings #folder/ID
// ============================================================

import { Storage } from './utils.js';

const Router = (() => {
  const pages = {};
  let current = null;
  const TITLES = { home: 'My Links', random: 'Random Discover', history: 'History', settings: 'Settings', folder: 'Folder' };

  function register(id, { onEnter, onLeave } = {}) {
    const el = document.getElementById(`page-${id}`);
    if (!el) { console.warn(`[Router] #page-${id} not found`); return; }
    // Ensure initially hidden (belt + braces alongside CSS)
    el.style.display = 'none';
    pages[id] = { el, onEnter, onLeave };
  }

  function go(id, params = {}, replace = false) {
    if (!pages[id]) { console.warn(`[Router] Unknown: ${id}`); return; }

    // Hide ALL pages explicitly — prevents any overlap
    Object.entries(pages).forEach(([pid, p]) => {
      p.el.style.display = 'none';
      p.el.classList.remove('active');
    });

    // Leave hook
    if (current && pages[current]) {
      pages[current].onLeave?.();
    }

    // Show target page
    current = id;
    pages[id].el.style.display = 'flex';
    pages[id].el.classList.add('active');
    pages[id].onEnter?.(params);

    _updateNav(id);
    _updateHash(id, params, replace);
    _updateTitle(id, params);
    Storage.set('lastPage', id);
    if (params?.folder?.id) Storage.set('lastFolderId', params.folder.id);
  }

  function _updateNav(id) {
    const navId = id === 'folder' ? 'home' : id;
    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === navId);
    });
  }

  function _updateHash(id, params, replace) {
    let hash = '#home';
    if (id === 'folder' && params?.folder?.id) hash = `#folder/${params.folder.id}`;
    else if (id !== 'home') hash = `#${id}`;
    const fn = replace ? history.replaceState : history.pushState;
    fn.call(history, { id, params }, '', hash);
  }

  function _updateTitle(id, params) {
    let t = TITLES[id] || 'Linkivo';
    if (id === 'folder' && params?.folder?.name) t = params.folder.name;
    const el = document.getElementById('topbar-page-title');
    if (el) el.textContent = t;
    document.title = t === 'My Links' ? 'Linkivo' : `${t} — Linkivo`;
  }

  function init(def = 'home') {
    // Hide all pages before first navigation
    Object.values(pages).forEach(p => {
      p.el.style.display = 'none';
      p.el.classList.remove('active');
    });

    // Bind nav items
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.page));
    });

    // Handle back/forward
    window.addEventListener('popstate', e => {
      if (e.state?.id) go(e.state.id, e.state.params || {}, true);
    });

    // Parse hash on load
    const { page, params } = _parseHash(location.hash);
    const target = pages[page] ? page : (pages[def] ? def : 'home');
    go(target, params, true);
  }

  function _parseHash(hash) {
    const h = hash.replace('#', '');
    if (!h) return { page: 'home', params: {} };
    const fm = h.match(/^folder\/(.+)$/);
    if (fm) return { page: 'folder', params: { folderId: fm[1] } };
    return { page: ['home', 'random', 'history', 'settings'].includes(h) ? h : 'home', params: {} };
  }

  function getCurrent() { return current; }
  function getTitle(id) { return TITLES[id] || id; }

  return { register, go, getCurrent, getTitle, init };
})();

export default Router;
