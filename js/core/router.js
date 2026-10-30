/**
 * Linkivo — js/core/router.js  (v2.1.3)
 * Purpose: path-based SPA router. ONE page is mounted at a time: the previous page is unmounted and its container is
 *          cleared before the next one mounts (the v1.4.x "pages overlap" bug can not happen).
 *          Back button = overlay layers first, then the route's parent chain, then the root exit rule (ARCHITECTURE s.7).
 * v2.2.4: Back/Forward are the browser's own (history entries are pushed per page). The old parent-chain back logic (back-logic.js, parentOf, rearm)
 *          is NOT used any more; it stays in the file for now (owner asked to switch it off first).
 * Route:   { id, pattern:'/folder/:fid', title: string|fn(params), parent: string|null|fn(params, env, state),
 *            guard: 'auth'|'public'|'open', redirect?: fn(session), tab?: string, shell?: boolean, load: () => import() }
 * Page module contract: export async function mount(container, ctx) -> unmount() | void
 *            ctx = { params, query, path, from, router }
 *            optional: export async function refresh(ctx) -> reload the page's data in place (pull-to-refresh, v2.1.3). Only routes with
 *            `refresh: true` take part; the page is NOT re-mounted, no splash, no reload.
 * API:     compileRoutes(table) resolveGuard(route, session) createRouter(options) -> router
 *   router: start() navigate(path, {from}) back() reevaluate() refreshCurrent() canRefresh() current() destroy() on(event, fn)   events: 'route' 'mounted'
 */
import { resolveBack } from './back-logic.js';
import { closeTopLayer, layerCount, resetLayers, handlePop } from './nav-stack.js';   // v2.3.1: handlePop lets Back close an open overlay first
import { createEmitter } from './events.js';
import { pageMeta, applyPageMeta } from './page-meta.js';
import { log } from './logger.js';

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function compileRoutes(table) {
  const compiled = table.filter((r) => r.pattern !== '*').map((route) => ({ route, parts: route.pattern.split('/').filter(Boolean) }));
  const fallback = table.find((r) => r.pattern === '*') || null;
  return {
    match(path) {
      const segs = path.split('/').filter(Boolean).map(safeDecode);
      for (const { route, parts } of compiled) {
        if (parts.length !== segs.length) continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].startsWith(':')) params[parts[i].slice(1)] = segs[i];
          else if (parts[i] !== segs[i]) { ok = false; break; }
        }
        if (ok) return { route, params };
      }
      return fallback ? { route: fallback, params: {} } : null;
    }
  };
}

/** Returns a path to redirect to, or null when the route may open for this session. */
export function resolveGuard(route, session) {
  const signedIn = session.mode !== 'none';
  if (route.guard === 'open') return null;
  if (signedIn && session.status === 'deleted') return route.id === 'reactivate' ? null : '/reactivate';
  if (route.id === 'reactivate') return signedIn ? '/library' : '/login';
  if (route.guard === 'public') return signedIn ? '/library' : null;
  if (route.guard === 'auth') return signedIn ? null : '/login';
  return null;
}

export function parentOf(route, params, env = {}, state = {}) {
  const p = route.parent;
  return typeof p === 'function' ? p(params, env, state) : p || null;
}

export function createRouter({ routes, container, getSession, isWide = () => false, onHint = () => {} }) {
  const compiled = compileRoutes(routes);
  const bus = createEmitter();
  let current = null;
  let seq = 0;
  let lastRootBackAt = 0;

  const fullPath = () => (current ? current.path + current.search : '/');
  const parentPath = () => (current ? parentOf(current.route, current.params, { isWide: isWide() }, { from: current.from }) : null);

  function rearm() {
    history.replaceState({ lk: 'base' }, '', fullPath());
    history.pushState({ lk: 'top', from: current?.from || null }, '', fullPath());
  }

  /** A new page always starts at its top. #page-root has scroll-behavior: smooth (for in-page anchors), so switch it off for the jump. */
  function resetScroll() {
    container.style.scrollBehavior = 'auto';
    container.scrollTop = 0; container.scrollLeft = 0;
    requestAnimationFrame(() => { container.style.scrollBehavior = ''; });
  }

  function unmountCurrent() {
    const c = current;
    if (c && c.unmount) { try { const r = c.unmount(); if (r && r.catch) r.catch((e) => log.warn('router', 'unmount failed', e)); } catch (e) { log.warn('router', 'unmount failed', e); } }
  }

  async function go(raw, { from = null, force = false, depth = 0, pop = false, replace = false } = {}) {
    const url = new URL(raw, location.origin);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const match = compiled.match(path);
    if (!match) { log.error('router', 'no route table match', { path }); return; }
    const { route, params } = match;
    if (route.redirect) return go(route.redirect(getSession()), { from, depth: depth + 1 });
    const redirect = resolveGuard(route, getSession());
    if (redirect && redirect !== path) {
      if (depth > 5) { log.error('router', 'redirect loop', { path, redirect }); return; }
      return go(redirect, { from, depth: depth + 1 });
    }
    if (!force && current && current.path === path && current.search === url.search) return;

    const mySeq = ++seq;
    // Load the page module FIRST and keep the old page on screen meanwhile: no blank flash between pages (v2.1.2).
    let mod = null, loadError = null;
    try { mod = await route.load(); } catch (e) { loadError = e; }
    if (mySeq !== seq) return;

    unmountCurrent();
    resetLayers(); // overlays belong to the page that is leaving
    container.replaceChildren();
    resetScroll();
    applyPageMeta(pageMeta(route, params));
    // v2.2.4 (owner): NATIVE history. A new page is a new history entry (pushState), so the browser's own Back and Forward buttons behave as in any website.
    //   Replace only for the first page, a reload of the same page, or when the browser itself moved (pop).
    const same = current && current.path === path && current.search === url.search;
    const hist = { lk: 'page', from };
    // v2.4.0: `replace` was accepted by navigate() but never honoured, so every "replace" added a history entry; now it replaces the current one
    if (pop || replace || !current || same) history.replaceState(hist, '', path + url.search + url.hash); else history.pushState(hist, '', path + url.search + url.hash);
    const query = Object.fromEntries(url.searchParams);
    current = { route, params, path, search: url.search, from, unmount: null, mod: null };
    bus.emit('route', { route, params, path, query });

    try {
      if (loadError) throw loadError;
      const unmount = await mod.mount(container, { params, query, path, from, router, pop });   // v2.4.0: pop = the browser moved (Back or Forward): pages may restore their filters and scroll
      if (mySeq !== seq) { try { if (typeof unmount === 'function') unmount(); } catch { /* ignore */ } return; }
      current.unmount = typeof unmount === 'function' ? unmount : null;
      current.mod = mod;
      container.firstElementChild?.classList.add('page-enter');
      bus.emit('mounted', { route, params, path });
    } catch (e) {
      log.error('router', 'page failed to load', { path, error: e });
      if (mySeq === seq) {
        const { renderLoadError } = await import('../ui/empty-state.js');
        renderLoadError(container, () => go(path, { from, force: true }));
        bus.emit('mounted', { route, params, path, failed: true });
      }
    }
  }

  /** v2.2.4: the browser moved through its history (Back, Forward, swipe): just show the page of the address bar. No custom back rules any more. */
  // v2.3.1: an open menu, sheet or dialog owns one history entry: Back closes it (and nothing else changes)
  // v2.4.0: `from` comes back from the entry itself (it was saved when the page was opened), so a page reached by Back or Forward still knows where it came from
  function onPop() { if (handlePop()) return; const st = history.state; go(location.pathname + location.search, { from: st && st.lk === 'page' && typeof st.from === 'string' ? st.from : null, pop: true }); }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.hasAttribute('data-native')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname.startsWith('/__/')) return;
    e.preventDefault();
    // v2.4.0 (owner): a link marked data-replace (the Preview's related list) REPLACES the current entry and keeps where the Preview was opened from,
    // so Back goes straight to the folder instead of walking back through every related link
    if (a.hasAttribute('data-replace')) { go(u.pathname + u.search, { from: current ? current.from : null, replace: true }); return; }
    go(u.pathname + u.search, { from: current ? current.path : null });
  }

  const router = {
    start() {
      document.addEventListener('click', onClick);
      window.addEventListener('popstate', onPop);
      const first = location.pathname + location.search;
      return go(first);
    },
    navigate(path, opts = {}) { return go(path, { from: current ? current.path : null, ...opts }); },
    back() { history.back(); },
    reevaluate() { return go(current ? fullPath() : location.pathname, { force: true }); },
    /** Does the page on screen take part in pull-to-refresh? (route flag `refresh: true`) */
    canRefresh() { return !!(current && current.route.refresh === true); },
    /** In-app refresh for pull-to-refresh: asks the page module to reload its own data. Resolves 'unsupported' | 'nothing' | 'refreshed' | 'error'. */
    async refreshCurrent() {
      const c = current;
      if (!c || c.route.refresh !== true) return 'unsupported';
      if (!c.mod || typeof c.mod.refresh !== 'function') return 'nothing'; // layout only for now: pages add refresh() with their data
      try { await c.mod.refresh({ params: c.params, query: Object.fromEntries(new URLSearchParams(c.search)), path: c.path, from: c.from, router }); return 'refreshed'; }
      catch (e) { log.warn('router', 'refresh failed', e); return 'error'; }
    },
    current: () => current,
    parentPath,
    /** Removes the listeners (tests and hot restarts); the app itself creates exactly one router. */
    destroy() { document.removeEventListener('click', onClick); window.removeEventListener('popstate', onPop); unmountCurrent(); current = null; bus.clear(); },
    on: bus.on
  };
  return router;
}
