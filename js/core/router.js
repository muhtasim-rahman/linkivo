/**
 * Linkivo — js/core/router.js  (v2.1.0)
 * Purpose: path-based SPA router. ONE page is mounted at a time: the previous page is unmounted and its container is
 *          cleared before the next one mounts (the v1.4.x "pages overlap" bug can not happen).
 *          Back button = overlay layers first, then the route's parent chain, then the root exit rule (ARCHITECTURE s.7).
 * Route:   { id, pattern:'/folder/:fid', title: string|fn(params), parent: string|null|fn(params, env, state),
 *            guard: 'auth'|'public'|'open', redirect?: fn(session), tab?: string, shell?: boolean, load: () => import() }
 * Page module contract: export async function mount(container, ctx) -> unmount() | void
 *            ctx = { params, query, path, from, router }
 * SEO:     route.description (string) and route.robots override the defaults; see applyPageMeta().
 * API:     compileRoutes(table) resolveGuard(route, session) applyPageMeta(doc, route, path) createRouter(options) -> router
 *   router: start() navigate(path, {from}) back() reevaluate() current() destroy() on(event, fn)   events: 'route' 'mounted'
 */
import { resolveBack } from './back-logic.js';
import { closeTopLayer, layerCount, resetLayers } from './nav-stack.js';
import { createEmitter } from './events.js';
import { log } from './logger.js';
import app from './app-info.js';

const DEFAULT_TITLE = 'Linkivo - A fast, private link manager';
const DEFAULT_DESC = 'Linkivo is a fast, private link manager. Keep thousands of links in folders, import them from text and files, and rediscover them. Free, works offline, installable.';

/** SEO (v2.1.1): every route sets its own title, description, robots, canonical and Open Graph tags. Private app pages are noindex. */
export function applyPageMeta(doc, route, path, base = app.hosting) {
  const title = typeof route.title === 'function' ? route.title({}) : route.title;
  const full = title ? `${title} - Linkivo` : DEFAULT_TITLE;
  const isPrivate = route.guard === 'auth';
  const desc = route.description || DEFAULT_DESC;
  const set = (sel, attr, value, make) => {
    let el = doc.head.querySelector(sel);
    if (!el && make) { el = doc.createElement(make.tag); for (const [k, v] of Object.entries(make.attrs)) el.setAttribute(k, v); doc.head.appendChild(el); }
    if (el) el.setAttribute(attr, value);
  };
  doc.title = full;
  set('meta[name="description"]', 'content', desc, { tag: 'meta', attrs: { name: 'description' } });
  set('meta[name="robots"]', 'content', route.robots || (isPrivate ? 'noindex, nofollow' : 'index, follow'), { tag: 'meta', attrs: { name: 'robots' } });
  set('link[rel="canonical"]', 'href', isPrivate ? base + '/' : base + (path === '/' ? '/' : path), { tag: 'link', attrs: { rel: 'canonical' } });
  set('meta[property="og:title"]', 'content', full, { tag: 'meta', attrs: { property: 'og:title' } });
  set('meta[property="og:description"]', 'content', desc, { tag: 'meta', attrs: { property: 'og:description' } });
  set('meta[property="og:url"]', 'content', isPrivate ? base + '/' : base + path, { tag: 'meta', attrs: { property: 'og:url' } });
  set('meta[name="twitter:title"]', 'content', full, { tag: 'meta', attrs: { name: 'twitter:title' } });
  set('meta[name="twitter:description"]', 'content', desc, { tag: 'meta', attrs: { name: 'twitter:description' } });
}

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

  function unmountCurrent() {
    const c = current;
    if (c && c.unmount) { try { const r = c.unmount(); if (r && r.catch) r.catch((e) => log.warn('router', 'unmount failed', e)); } catch (e) { log.warn('router', 'unmount failed', e); } }
  }

  async function go(raw, { from = null, force = false, depth = 0 } = {}) {
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
    unmountCurrent();
    resetLayers(); // overlays belong to the page that is leaving
    container.replaceChildren();
    container.scrollTop = 0;
    applyPageMeta(document, { ...route, title: typeof route.title === 'function' ? route.title(params) : route.title }, path);
    current = { route, params, path, search: url.search, from, unmount: null };
    history.replaceState({ lk: 'top', from }, '', path + url.search + url.hash);
    const query = Object.fromEntries(url.searchParams);
    bus.emit('route', { route, params, path, query });

    try {
      const mod = await route.load();
      if (mySeq !== seq) return;
      const unmount = await mod.mount(container, { params, query, path, from, router });
      if (mySeq !== seq) { try { if (typeof unmount === 'function') unmount(); } catch { /* ignore */ } return; }
      current.unmount = typeof unmount === 'function' ? unmount : null;
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

  function onPop(e) {
    const st = e.state;
    if (st && st.lk === 'top') return;
    if (!st || st.lk !== 'base') { go(location.pathname + location.search); return; } // entry we did not create
    const d = resolveBack({ layerCount: layerCount(), parent: parentPath(), now: Date.now(), lastRootBackAt });
    if (d.type === 'close-layer') { closeTopLayer(); rearm(); }
    else if (d.type === 'navigate') { lastRootBackAt = 0; rearm(); go(d.to, { from: null }); }
    else if (d.type === 'root-first') { lastRootBackAt = Date.now(); onHint('Press back again to exit'); rearm(); }
    else { lastRootBackAt = 0; history.back(); setTimeout(() => rearm(), 350); } // if we are still here, the app is the first history entry
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || a.hasAttribute('data-native')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname.startsWith('/__/')) return;
    e.preventDefault();
    go(u.pathname + u.search, { from: current ? current.path : null });
  }

  const router = {
    start() {
      document.addEventListener('click', onClick);
      window.addEventListener('popstate', onPop);
      const first = location.pathname + location.search;
      history.replaceState({ lk: 'base' }, '', first);
      history.pushState({ lk: 'top', from: null }, '', first);
      return go(first);
    },
    navigate(path, opts = {}) { return go(path, { from: current ? current.path : null, ...opts }); },
    back() { history.back(); },
    reevaluate() { return go(current ? fullPath() : location.pathname, { force: true }); },
    current: () => current,
    parentPath,
    /** Removes the listeners (tests and hot restarts); the app itself creates exactly one router. */
    destroy() { document.removeEventListener('click', onClick); window.removeEventListener('popstate', onPop); unmountCurrent(); current = null; bus.clear(); },
    on: bus.on
  };
  return router;
}
