// ============================================================
// Linkivo — sw.js  v1.4.4
// Service Worker: stale-while-revalidate for assets,
// network-first for HTML. Forces update on new deploy so
// existing users always get the latest version.
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

// ── Install: cache shell assets ───────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: remove ALL old caches, claim clients, notify tabs
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ includeUncontrolled: true, type: 'window' }))
      .then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: VERSION }));
      })
  );
});

// ── Skip waiting on demand ─────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Fetch strategy ────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // HTML: network-first (always fresh)
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

  // Version-signal files: network-first
  if (url.pathname === '/sw.js' || url.pathname === '/app.json') {
    event.respondWith(
      fetch(request)
        .then(res => { if (res.ok) caches.open(CACHE_SHELL).then(c => c.put(request, res.clone())); return res; })
        .catch(() => caches.match(request))
    );
    return;
  }

  // JS / CSS / SVG: stale-while-revalidate
  // Serve cached copy immediately; fetch + update cache in background.
  if (/\.(js|css|svg)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(async cache => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => null);
        return cached || networkFetch;
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
