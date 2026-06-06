// ============================================================
// Linkivo — router.js
// SPA Tab/Page Router
// ============================================================

import { Storage } from './utils.js';

const Router = (() => {
  const pages    = {}; // page id → { el, onEnter, onLeave }
  let   current  = null;

  // Register a page
  function register(id, { onEnter, onLeave } = {}) {
    const el = document.getElementById(`page-${id}`);
    if (!el) { console.warn(`[Router] Page element #page-${id} not found`); return; }
    pages[id] = { el, onEnter, onLeave };
  }

  // Navigate to a page
  function go(id, params = {}) {
    if (!pages[id]) { console.warn(`[Router] Unknown page: ${id}`); return; }
    if (current === id) return;

    // Hide current
    if (current && pages[current]) {
      pages[current].el.classList.remove('active');
      pages[current].onLeave?.();
    }

    // Show new
    current = id;
    pages[id].el.classList.add('active');
    pages[id].onEnter?.(params);

    // Update nav highlights
    _updateNav(id);

    // Persist
    Storage.set('lastPage', id);
  }

  function _updateNav(id) {
    // Bottom nav items
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === id);
    });
    // Sidebar nav items
    document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === id);
    });
  }

  function getCurrent() { return current; }

  function init(defaultPage = 'home') {
    // Bind all nav items
    document.querySelectorAll('[data-page]').forEach(el => {
      el.addEventListener('click', () => go(el.dataset.page));
    });

    // Restore last page or go to default
    const last = Storage.get('lastPage', defaultPage);
    const target = pages[last] ? last : defaultPage;
    go(target);
  }

  return { register, go, getCurrent, init };
})();

export default Router;
