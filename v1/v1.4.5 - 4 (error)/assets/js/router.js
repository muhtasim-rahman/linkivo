// ============================================================
// Linkivo — router.js  v1.4.5
// Path-based SPA router: /path instead of #hash
// Explicit display toggling — pages never overlap.
// Tab switch resets search inputs.
// Backspace/back closes open modals before navigating.
// ============================================================

import { Storage } from '/utils.js';

const Router = (() => {
  const pages  = {};
  let current  = null;
  const TITLES = {
    home: 'My Links', random: 'Random Discover',
    history: 'History', settings: 'Settings', folder: 'Folder',
    'recycle-bin': 'Recycle Bin'
  };

  function register(id, { onEnter, onLeave } = {}) {
    const el = document.getElementById(`page-${id}`);
    if (!el) { console.warn(`[Router] #page-${id} not found`); return; }
    el.style.display = 'none';
    pages[id] = { el, onEnter, onLeave };
  }

  function go(id, params = {}, replace = false) {
    if (!pages[id]) { console.warn(`[Router] Unknown: ${id}`); return; }

    // Reset all search inputs on page switch
    document.querySelectorAll('[data-search]').forEach(el => {
      if (el.value) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Hide ALL pages explicitly
    Object.values(pages).forEach(p => {
      p.el.style.display = 'none';
      p.el.classList.remove('active');
    });

    // Leave hook
    if (current && pages[current]) pages[current].onLeave?.();

    // Show target page
    current = id;
    pages[id].el.style.display = 'flex';
    pages[id].el.classList.add('active');
    pages[id].onEnter?.(params);

    _updateNav(id);
    _updatePath(id, params, replace);
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

  function _updatePath(id, params, replace) {
    let path = '/';
    if (id === 'folder' && params?.folder?.id) path = `/folder/${params.folder.id}`;
    else if (id === 'recycle-bin') path = '/recycle-bin';
    else if (id !== 'home') path = `/${id}`;
    const fn = replace ? history.replaceState : history.pushState;
    fn.call(history, { id, params }, '', path);
  }

  function _updateTitle(id, params) {
    let t = TITLES[id] || 'Linkivo';
    if (id === 'folder' && params?.folder?.name) t = params.folder.name;
    const el = document.getElementById('topbar-page-title');
    if (el) el.textContent = t;
    document.title = t === 'My Links'
      ? 'Linkivo v1.4.5 — Smart Link Manager'
      : `${t} — Linkivo`;
  }

  function init(def = 'home') {
    // Hide all before first nav
    Object.values(pages).forEach(p => {
      p.el.style.display = 'none';
      p.el.classList.remove('active');
    });

    // Bind nav items
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.page));
    });

    // Back/forward + popup-close handling
    window.addEventListener('popstate', e => {
      // If a modal is open, close it instead of navigating
      const openModal = document.querySelector(
        '.modal-backdrop, .sheet-backdrop, .more-menu-backdrop, ' +
        '#import-modal, #profile-sheet-backdrop, .link-preview-backdrop, ' +
        '.recycle-backdrop, .icon-picker-backdrop, .pin-backdrop'
      );
      if (openModal) {
        openModal.remove();
        // Push state back so next backpress still works
        history.pushState(e.state, '', location.pathname);
        return;
      }
      if (e.state?.id) go(e.state.id, e.state.params || {}, true);
    });

    // Parse current path on load
    const { page, params } = _parsePath(location.pathname);
    const target = pages[page] ? page : (pages[def] ? def : 'home');
    go(target, params, true);
  }

  function _parsePath(pathname) {
    const p = pathname.replace(/^\//, ''); // strip leading /
    if (!p || p === 'index.html') return { page: 'home', params: {} };
    const fm = p.match(/^folder\/(.+)$/);
    if (fm) return { page: 'folder', params: { folderId: fm[1] } };
    const known = ['home', 'random', 'history', 'settings', 'recycle-bin'];
    return { page: known.includes(p) ? p : 'home', params: {} };
  }

  // Push a modal-open history entry (for backpress-to-close)
  function pushModalState() {
    history.pushState({ modal: true }, '', location.pathname);
  }

  function getCurrent() { return current; }
  function getTitle(id) { return TITLES[id] || id; }

  return { register, go, getCurrent, getTitle, init, pushModalState };
})();

export default Router;
