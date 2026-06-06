// ============================================================
// Linkivo — sw.js  v1.4.5
// Service Worker: reliable update propagation.
// Fix v1.4.5: Response.clone() called BEFORE body is consumed
// ============================================================

importScripts("https://progressier.app/uzmY9UBEbVOutjNNnTKX/sw.js" );
const VERSION       = 'v1.4.5';
const CACHE_SHELL   = `linkivo-shell-${VERSION}`;
const CACHE_RUNTIME = `linkivo-runtime-${VERSION}`;
const ALL_CACHES    = [CACHE_SHELL, CACHE_RUNTIME];

const SHELL_ASSETS = [
  '/','/index.html','/app.json','/manifest.json',
  '/assets/css/variables.css','/assets/css/base.css',
  '/assets/css/components.css','/assets/css/nav.css',
  '/assets/css/auth.css','/assets/css/home.css',
  '/assets/css/folder.css','/assets/css/links.css',
  '/assets/css/import.css','/assets/css/random.css',
  '/assets/css/history.css','/assets/css/settings.css',
  '/assets/js/config.js','/assets/js/firebase-init.js',
  '/assets/js/auth.js','/assets/js/router.js',
  '/assets/js/utils.js','/assets/js/app.js',
  '/assets/js/import.js','/assets/js/folders.js',
  '/assets/js/links.js','/assets/js/random.js',
  '/assets/js/history.js','/assets/js/settings.js',
  '/assets/svg/icon.svg','/assets/svg/text-dark.svg',
  '/assets/svg/text-white.svg',
];

// ── Install ────────────────────────────────────────────────
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

// ── Activate ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const allKeys  = await caches.keys();
    const oldKeys  = allKeys.filter(k => !ALL_CACHES.includes(k));
    const isUpdate = oldKeys.length > 0;
    await Promise.all(oldKeys.map(k => caches.delete(k)));
    await self.clients.claim();
    if (isUpdate) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: VERSION }));
    }
  })());
});

// ── Message ────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Helper: safe cache put (clone BEFORE consuming) ────────
function safePut(cache, req, res) {
  if (!res || !res.ok || res.status === 0) return res;
  try { cache.put(req, res.clone()); } catch (e) { /* ignore */ }
  return res;
}

// ── Fetch ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // HTML → network-first
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(cache =>
        fetch(request)
          .then(res => safePut(cache, request, res))
          .catch(() => cache.match(request).then(r => r || cache.match('/index.html')))
      )
    );
    return;
  }

  // Version-critical files → always network-first
  const criticalPaths = ['/sw.js','/app.json','/manifest.json','/firebase-config.js'];
  if (criticalPaths.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(cache =>
        fetch(request)
          .then(res => safePut(cache, request, res))
          .catch(() => cache.match(request))
      )
    );
    return;
  }

  // JS / CSS / SVG → stale-while-revalidate
  if (/\.(js|css|svg)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_SHELL).then(async cache => {
        const cached = await cache.match(request);
        const fresh  = fetch(request)
          .then(res => safePut(cache, request, res))
          .catch(() => null);
        return cached ?? fresh;
      })
    );
    return;
  }

  // Everything else → cache-first
  event.respondWith(
    caches.open(CACHE_RUNTIME).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const res = await fetch(request).catch(() => null);
      if (!res || res.status !== 200 || res.type === 'opaque') return res;
      return safePut(cache, request, res);
    })
  );
});
