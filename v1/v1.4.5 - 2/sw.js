// ============================================================
// Linkivo — sw.js  v1.4.5
// Fix: Response.clone() called BEFORE any async operation so
//   the body is never consumed twice (was crashing at sw:120).
// Fix: firebase-config.js excluded from SW cache entirely —
//   always fetched live so stale HTML never poisons the module
//   import (was causing MIME-type "text/html" crash on cold load).
// Strategy: network-first HTML | stale-while-revalidate JS/CSS |
//           network-only for secrets | cache-first for assets
// ============================================================

const VERSION       = 'v1.4.5';
const CACHE_SHELL   = `linkivo-shell-${VERSION}`;
const CACHE_RUNTIME = `linkivo-runtime-${VERSION}`;
const ALL_CACHES    = [CACHE_SHELL, CACHE_RUNTIME];

// Files that must NEVER be served from SW cache.
// firebase-config.js: contains credentials + must always match
//   what's on the server (an old cached copy could be wrong).
const NEVER_CACHE = new Set([
  '/firebase-config.js',
  '/firebase-config.example.js',
]);

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.json',
  '/manifest.json',
  '/assets/css/variables.css',
  '/assets/css/base.css',
  '/assets/css/components.css',
  '/assets/css/nav.css',
  '/assets/css/auth.css',
  '/assets/css/home.css',
  '/assets/css/folder.css',
  '/assets/css/links.css',
  '/assets/css/import.css',
  '/assets/css/random.css',
  '/assets/css/history.css',
  '/assets/css/settings.css',
  '/assets/js/config.js',
  '/assets/js/firebase-init.js',
  '/assets/js/auth.js',
  '/assets/js/router.js',
  '/assets/js/utils.js',
  '/assets/js/app.js',
  '/assets/js/import.js',
  '/assets/js/folders.js',
  '/assets/js/links.js',
  '/assets/js/random.js',
  '/assets/js/history.js',
  '/assets/js/settings.js',
  '/assets/svg/icon.svg',
  '/assets/svg/app-icon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(cache =>
      Promise.allSettled(
        SHELL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] cache miss:', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const allKeys  = await caches.keys();
    const oldKeys  = allKeys.filter(k => !ALL_CACHES.includes(k));
    const isUpdate = oldKeys.length > 0;
    await Promise.all(oldKeys.map(k => caches.delete(k)));
    await self.clients.claim();
    if (isUpdate) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: VERSION }));
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // NEVER-CACHE: firebase-config.js must always be fresh.
  // A stale cache entry (or a cached 404->index.html) causes
  // the "MIME type text/html" module-import error on cold load.
  if (NEVER_CACHE.has(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML: network-first
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone(); // clone BEFORE async caches.open
            caches.open(CACHE_SHELL).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then(r => r || caches.match('/index.html'))
        )
    );
    return;
  }

  // Version-signal files: always network-first, never stale
  if (url.pathname === '/sw.js' || url.pathname === '/app.json' || url.pathname === '/manifest.json') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone(); // clone BEFORE async caches.open
            caches.open(CACHE_SHELL).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // JS / CSS / SVG: stale-while-revalidate
  if (/\.(js|css|svg)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(async cache => {
        const cached = await cache.match(request);

        const revalidate = fetch(request)
          .then(res => {
            if (res.ok) {
              // FIX: clone() called synchronously BEFORE any await.
              // In v1.4.4 the clone was inside the caches.open.then()
              // callback — by that point the browser had already started
              // consuming res.body, causing "body is already used" crash.
              const clone = res.clone();
              cache.put(request, clone);
            }
            return res;
          })
          .catch(() => null);

        return cached ?? revalidate;
      })
    );
    return;
  }

  // Everything else: cache-first, network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone(); // clone BEFORE async caches.open
        caches.open(CACHE_RUNTIME).then(c => c.put(request, clone));
        return res;
      });
    })
  );
});
