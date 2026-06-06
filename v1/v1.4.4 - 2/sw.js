// ============================================================
// Linkivo — sw.js  v1.4.4
// Service Worker: reliable update propagation.
// - install: cache shell assets individually (one 404 won't block)
// - activate: delete old caches, notify clients ONLY on upgrade
// - fetch: stale-while-revalidate for JS/CSS, network-first for HTML
// ============================================================

const VERSION       = 'v1.4.4';
const CACHE_SHELL   = `linkivo-shell-${VERSION}`;
const CACHE_RUNTIME = `linkivo-runtime-${VERSION}`;
const ALL_CACHES    = [CACHE_SHELL, CACHE_RUNTIME];

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
  '/assets/svg/logo-light.svg',
  '/assets/svg/logo-dark.svg',
];

// ── Install: cache shell assets (individual adds so one failure
//   doesn't block the whole install) ───────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(cache => {
      // Cache each asset individually — a 404 won't abort the install
      return Promise.allSettled(
        SHELL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] cache miss:', url, err))
        )
      );
    }).then(() => self.skipWaiting()) // always activate immediately
  );
});

// ── Activate: remove old caches, claim clients ────────────
// Only notify tabs to reload when this is a genuine UPDATE
// (old caches existed), not on a fresh install.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const allKeys  = await caches.keys();
    const oldKeys  = allKeys.filter(k => !ALL_CACHES.includes(k));
    const isUpdate = oldKeys.length > 0; // true = genuine upgrade

    // Delete old version caches
    await Promise.all(oldKeys.map(k => caches.delete(k)));

    // Claim all open tabs
    await self.clients.claim();

    // Only reload tabs when it's a real update (not fresh install)
    if (isUpdate) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: VERSION }));
    }
  })());
});

// ── Skip waiting on demand (from app) ─────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Fetch strategy ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (Firebase SDK, Analytics CDN)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // HTML: network-first (always get the freshest shell)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE_SHELL).then(c => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Version-signal files: always network-first, never serve stale
  if (url.pathname === '/sw.js' || url.pathname === '/app.json' || url.pathname === '/manifest.json') {
    event.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) caches.open(CACHE_SHELL).then(c => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // JS / CSS / SVG: stale-while-revalidate
  // Respond from cache immediately, update cache in background.
  if (/\.(js|css|svg)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(async cache => {
        const cached = await cache.match(request);
        // Always fetch fresh in background
        const networkFetch = fetch(request)
          .then(res => { if (res.ok) cache.put(request, res.clone()); return res; })
          .catch(() => null);
        // Serve cached immediately if available
        return cached ?? networkFetch;
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
        caches.open(CACHE_RUNTIME).then(c => c.put(request, res.clone()));
        return res;
      });
    })
  );
});
