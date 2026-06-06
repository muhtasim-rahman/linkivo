// ============================================================
// Linkivo — router.js  v1.4.5
// Path-based SPA router (/ /random /history /settings /folder/:id)
// — No more #hash URLs: cleaner, shareable, back/forward works
// — Explicit display:none/flex toggling prevents page overlap
// — Modal back-button: pushes a dummy history state when modals
//   open; popstate intercepts it and closes the modal instead
//   of navigating away. Use Router.pushModal(closeFn) / popModal().
// ============================================================

import { Storage } from './utils.js';

const Router = (() => {
  const pages  = {};
  let current  = null;
  const TITLES = {
    home: 'My Links', random: 'Random Discover',
    history: 'History', settings: 'Settings', folder: 'Folder',
  };

  // ── Modal back-button stack ────────────────────────────────
  const _modalStack = [];

  function pushModal(closeFn) {
    _modalStack.push(closeFn);
    history.pushState({ _modal: true }, '');
  }

  function popModal() {
    const fn = _modalStack.pop();
    fn?.();
  }

  // ── Page registration ──────────────────────────────────────
  function register(id, { onEnter, onLeave } = {}) {
    const el = document.getElementById(`page-${id}`);
    if (!el) { console.warn(`[Router] #page-${id} not found`); return; }
    el.style.display = 'none';
    pages[id] = { el, onEnter, onLeave };
  }

  // ── Core navigate ──────────────────────────────────────────
  function go(id, params = {}, replace = false) {
    if (!pages[id]) { console.warn(`[Router] Unknown page: ${id}`); return; }

    // Hide all pages
    Object.values(pages).forEach(p => {
      p.el.style.display = 'none';
      p.el.classList.remove('active');
    });

    // Leave hook
    if (current && pages[current]) {
      pages[current].onLeave?.();
    }

    // Show target
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
    else if (id !== 'home') path = `/${id}`;
    const fn = replace ? history.replaceState : history.pushState;
    fn.call(history, { id, params }, '', path);
  }

  function _updateTitle(id, params) {
    let t = TITLES[id] || 'Linkivo';
    if (id === 'folder' && params?.folder?.name) t = params.folder.name;
    const el = document.getElementById('topbar-page-title');
    if (el) el.textContent = t;
    document.title = t === 'My Links' ? 'Linkivo' : `${t} — Linkivo`;
  }

  // ── Init ───────────────────────────────────────────────────
  function init(def = 'home') {
    Object.values(pages).forEach(p => {
      p.el.style.display = 'none';
      p.el.classList.remove('active');
    });

    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.page));
    });

    window.addEventListener('popstate', e => {
      // Modal dummy state → close top modal, don't navigate
      if (e.state?._modal) { popModal(); return; }
      if (e.state?.id) go(e.state.id, e.state.params || {}, true);
    });

    const { page, params } = _parsePath(location.pathname);
    const target = pages[page] ? page : (pages[def] ? def : 'home');
    go(target, params, true);
  }

  function _parsePath(pathname) {
    const parts = pathname.replace(/^\//, '').split('/');
    const seg   = parts[0] || '';
    if (seg === 'folder' && parts[1]) return { page: 'folder', params: { folderId: parts[1] } };
    const valid = ['random', 'history', 'settings'];
    if (!seg) return { page: 'home', params: {} };
    return { page: valid.includes(seg) ? seg : 'home', params: {} };
  }

  function getCurrent() { return current; }
  function getTitle(id)  { return TITLES[id] || id; }

  return { register, go, getCurrent, getTitle, init, pushModal, popModal };
})();

export default Router;
