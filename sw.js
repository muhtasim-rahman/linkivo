// ============================================================
// Linkivo Service Worker — v1.0.0
// Handles: App Shell caching, offline fallback
// ============================================================

const CACHE_NAME      = 'linkivo-shell-v1.4.0';
const RUNTIME_CACHE   = 'linkivo-runtime-v1.4.0';

// App shell assets — cache on install
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
  '/assets/svg/logo-dark.svg'
];

// ── Install: cache app shell ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ────────────────────────────
self.addEventListener('activate', (event) => {
  const validCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !validCaches.includes(key))
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache-first for shell, Network-first for API ───
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, Firebase calls, and cross-origin requests
  if (request.method !== 'GET') return;
  if (url.hostname.includes('firebase') || url.hostname.includes('google')) return;
  if (url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic')) return;

  // App shell → cache-first
  if (SHELL_ASSETS.some(path => url.pathname === path || url.pathname.endsWith(path))) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      }))
    );
    return;
  }

  // Everything else → network-first with runtime cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
