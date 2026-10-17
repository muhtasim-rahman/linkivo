// ============================================================
// Linkivo — router.js  v1.4.0
// SPA Tab/Page Router with URL sync (no reload)
// ============================================================

import { Storage } from './utils.js';

const Router = (() => {
  const pages   = {};
  let   current = null;
  let   _params = {};

  const PAGE_PATHS = {
    home:     '/',
    random:   '/discover',
    history:  '/history',
    settings: '/settings',
    folder:   '/folder',
  };
  const PATH_PAGES = {};
  Object.entries(PAGE_PATHS).forEach(([k, v]) => { PATH_PAGES[v] = k; });

  function register(id, { onEnter, onLeave } = {}) {
    const el = document.getElementById('page-' + id);
    if (!el) { console.warn('[Router] Page element #page-' + id + ' not found'); return; }
    pages[id] = { el, onEnter, onLeave };
  }

  function go(id, params) {
    params = params || {};
    if (!pages[id]) { console.warn('[Router] Unknown page: ' + id); return; }
    if (current === id && id !== 'folder') return;

    if (current && pages[current]) {
      pages[current].el.classList.remove('active');
      pages[current].onLeave && pages[current].onLeave();
    }

    current = id;
    _params = params;
    pages[id].el.classList.add('active');
    pages[id].onEnter && pages[id].onEnter(params);

    _updateNav(id);
    _updateUrl(id, params);
    Storage.set('lastPage', id === 'folder' ? 'home' : id);
  }

  function _updateUrl(id, params) {
    params = params || {};
    var path = PAGE_PATHS[id] || '/';
    if (id === 'folder' && params.folder && params.folder.id) {
      path = '/folder/' + params.folder.id;
    }
    try {
      history.pushState({ page: id, params: params }, '', path);
    } catch(e) {}
  }

  function _updateNav(id) {
    var navId = (id === 'folder') ? 'home' : id;
    document.querySelectorAll('.nav-item[data-page]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.page === navId);
    });
    document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.page === navId);
    });
    _updateTopbarTitle(id);
  }

  function _updateTopbarTitle(id) {
    var titles = {
      home:     'My Links',
      random:   'Random Discover',
      history:  'History',
      settings: 'Settings',
      folder:   (_params && _params.folder && _params.folder.name) ? _params.folder.name : 'Folder',
    };
    var titleEl = document.getElementById('topbar-page-title');
    if (titleEl) titleEl.textContent = titles[id] || '';

    var logoWrap  = document.getElementById('topbar-logo-wrap');
    var titleWrap = document.getElementById('topbar-title-wrap');
    if (logoWrap && titleWrap) {
      var isHome = (id === 'home');
      logoWrap.classList.toggle('hidden', !isHome);
      titleWrap.classList.toggle('hidden', isHome);
    }
  }

  function getCurrent() { return current; }
  function getParams()  { return _params; }

  function _handlePopState(e) {
    if (e.state && e.state.page && pages[e.state.page]) {
      var id     = e.state.page;
      var params = e.state.params || {};
      if (current && pages[current]) {
        pages[current].el.classList.remove('active');
        pages[current].onLeave && pages[current].onLeave();
      }
      current = id;
      _params = params;
      pages[id].el.classList.add('active');
      pages[id].onEnter && pages[id].onEnter(params);
      _updateNav(id);
    }
  }

  function init(defaultPage) {
    defaultPage = defaultPage || 'home';

    document.querySelectorAll('[data-page]').forEach(function(el) {
      el.addEventListener('click', function() { go(el.dataset.page); });
    });

    window.addEventListener('popstate', _handlePopState);

    var pathname  = location.pathname;
    var startPage = defaultPage;

    if (pathname.startsWith('/folder/')) {
      startPage = 'home';
      Storage.set('_pendingFolderPath', pathname);
    } else if (PATH_PAGES[pathname] && pages[PATH_PAGES[pathname]]) {
      startPage = PATH_PAGES[pathname];
    } else {
      var last = Storage.get('lastPage', defaultPage);
      startPage = pages[last] ? last : defaultPage;
    }

    go(startPage);
  }

  return { register, go, getCurrent, getParams, init };
})();

export default Router;
