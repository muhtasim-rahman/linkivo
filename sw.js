/**
 * Linkivo — sw.js  (v2.1.0 update-safe service worker)
 * Rules (ARCHITECTURE section 8): users never run old code.
 *  - App files (same origin) are NETWORK-FIRST with a 3 s timeout, cache is only the offline fallback. Never cache-first.
 *  - Pinned third-party libraries (Firebase SDK, fonts) are cache-first: their URLs contain an exact version.
 *  - Worker API calls, Firebase calls and /__/ auth handler paths are never touched.
 *  - On activate every cache from older versions (including v1) is deleted and open pages are claimed.
 *  - skipWaiting: a new worker takes over at once; the page reloads itself (js/core/update.js).
 * KEEP `VERSION` identical to app.json "version" and PRECACHE complete (both checked by @ Creator/tools/check.mjs).
 */
const VERSION = '2.1.0';
const SHELL_CACHE = `linkivo-shell-${VERSION}`;
const LIB_CACHE = 'linkivo-libs-v1';
const NET_TIMEOUT_MS = 3000;

// Files needed to start offline. check.mjs verifies this list against the files on disk.
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/app.json',
  '/assets/brand/logo.svg',
  '/assets/icons/favicon.svg',
  '/assets/icons/favicon.ico',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/icons/icon-maskable-512.png',
  // BEGIN GENERATED (node "@ Creator/tools/gen-precache.mjs")
  '/css/components/buttons.css',
  '/css/components/feedback.css',
  '/css/components/forms.css',
  '/css/components/nav.css',
  '/css/components/sheet.css',
  '/css/components/toast.css',
  '/css/core/base.css',
  '/css/core/layout.css',
  '/css/core/motion.css',
  '/css/core/tokens.css',
  '/css/pages/auth.css',
  '/css/pages/pages.css',
  '/css/pages/settings.css',
  '/css/pages/splash.css',
  '/js/boot.js',
  '/js/core/app-data.js',
  '/js/core/app-info.js',
  '/js/core/appearance.js',
  '/js/core/back-logic.js',
  '/js/core/config.js',
  '/js/core/css-loader.js',
  '/js/core/dom.js',
  '/js/core/events.js',
  '/js/core/firebase-loader.js',
  '/js/core/flags.js',
  '/js/core/format.js',
  '/js/core/install.js',
  '/js/core/local-prefs.js',
  '/js/core/logger.js',
  '/js/core/mask.js',
  '/js/core/nav-stack.js',
  '/js/core/rate-limiter.js',
  '/js/core/router.js',
  '/js/core/sensitive.js',
  '/js/core/session.js',
  '/js/core/update.js',
  '/js/core/url-tools.js',
  '/js/core/utils.js',
  '/js/core/worker-client.js',
  '/js/engine/chunker.js',
  '/js/engine/cloud-engine.js',
  '/js/engine/engine.js',
  '/js/engine/idb.js',
  '/js/engine/job-queue.js',
  '/js/engine/local-engine.js',
  '/js/engine/rtdb-adapter.js',
  '/js/engine/schema.js',
  '/js/features/auth/account-status.js',
  '/js/features/auth/auth-service.js',
  '/js/features/auth/login-page.js',
  '/js/features/settings/advanced-tools.js',
  '/js/features/settings/catalog.js',
  '/js/features/settings/controls.js',
  '/js/features/settings/custom-rows.js',
  '/js/features/settings/metadata-tester.js',
  '/js/features/settings/settings-page.js',
  '/js/features/shell/install-banner.js',
  '/js/features/shell/pages/menu-page.js',
  '/js/features/shell/pages/profile-page.js',
  '/js/features/shell/pages/reactivate-page.js',
  '/js/features/shell/pages/stub-page.js',
  '/js/features/shell/routes.js',
  '/js/features/shell/shell-parts.js',
  '/js/features/shell/shell.js',
  '/js/features/splash/splash.js',
  '/js/main.js',
  '/js/ui/confirm.js',
  '/js/ui/empty-state.js',
  '/js/ui/icons.js',
  '/js/ui/popover.js',
  '/js/ui/scroll-fade.js',
  '/js/ui/sheet.js',
  '/js/ui/skeleton.js',
  '/js/ui/task-chip.js',
  '/js/ui/toast.js',
  // END GENERATED
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // allSettled: one missing file must never make the whole update fail to install
    await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, LIB_CACHE]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
  })());
});

self.addEventListener('message', (event) => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });

const isLib = (url) => url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/') || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(cacheKey || request, { ignoreSearch: false });
  const network = fetch(request).then(async (res) => {
    // never cache an HTML page that answered a script/style request (hosting rewrite of a missing file)
    const type = res.headers.get('content-type') || '';
    const wrong = request.destination !== 'document' && /text\/html/.test(type) && ['script', 'style'].includes(request.destination);
    if (res.ok && !wrong) cache.put(cacheKey || request, res.clone()).catch(() => {});
    return res;
  });
  if (!cached) return network;
  // with a cached copy, do not make the user wait longer than the timeout for a slow network
  return Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(cached), NET_TIMEOUT_MS))]).catch(() => cached);
}

async function cacheFirst(request) {
  const cache = await caches.open(LIB_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isLib(url)) { event.respondWith(cacheFirst(request)); return; }
  if (url.origin !== self.location.origin) return;                 // Worker API, Firebase, anything else: straight to the network
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/__/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html').catch(async () => (await caches.match('/index.html')) || Response.error()));
    return;
  }
  event.respondWith(networkFirst(request));
});
