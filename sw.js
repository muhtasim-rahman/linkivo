// ============================================================
// Linkivo — sw.js  v1.4.2
// Service Worker: cache-first for assets, network-first for
// HTML. Auto-update: skip-waiting when new version available.
// ============================================================

const CACHE_SHELL   = 'linkivo-shell-v1.4.2';
const CACHE_RUNTIME = 'linkivo-runtime-v1.4.2';
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
      .then(() => self.skipWaiting())  // activate immediately
  );
});

// ── Activate: remove old caches ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())  // take control of existing pages
  );
});

// ── Skip waiting on demand (from app.js updatefound handler) ─
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Fetch strategy ────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin Firebase/CDN requests
  if (request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin)) return;

  // HTML pages: network-first (always get fresh HTML)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_SHELL).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // SW and app.json: always network-first
  if (url.pathname === '/sw.js' || url.pathname === '/app.json') {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
    return;
  }

  // Assets (JS, CSS, SVG): cache-first with network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_RUNTIME).then(c => c.put(request, clone));
        return res;
      });
    })
  );
});
