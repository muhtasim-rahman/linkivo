/**
 * Linkivo — sw.js  (v2.1.1 update-safe service worker)
 * Rules (ARCHITECTURE section 8): users never run old code.
 *  - App files (same origin) are NETWORK-FIRST with a 3 s timeout, cache is only the offline fallback. Never cache-first.
 *  - Pinned third-party libraries (Firebase SDK, fonts) are cache-first: their URLs contain an exact version.
 *  - Worker API calls, Firebase calls and /__/ auth handler paths are never touched.
 *  - On activate every cache from older versions (including v1) is deleted and open pages are claimed.
 *  - skipWaiting: a new worker takes over at once; the page reloads itself (js/core/update.js).
 * KEEP `VERSION` identical to app.json "version" and PRECACHE complete (both checked by @ Creator/tools/check.mjs).
 */
const VERSION = '2.1.1';
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
  '/assets/art/chain-pattern.svg',
  '/assets/art/empty-error.svg',
  '/assets/art/empty-import.svg',
  '/assets/art/empty-library.svg',
  '/assets/art/empty-lost.svg',
  '/assets/art/empty-menu.svg',
  '/assets/art/empty-profile.svg',
  '/assets/art/empty-random.svg',
  '/assets/art/empty-search.svg',
  '/assets/art/empty-settings.svg',
  '/assets/brand/google-g.svg',
  '/assets/brand/logo-mask.svg',
  '/assets/brand/logo.svg',
  '/assets/brand/text-dark.svg',
  '/assets/brand/text-white.svg',
  '/assets/ui-icons/alert.svg',
  '/assets/ui-icons/arrow-left.svg',
  '/assets/ui-icons/book.svg',
  '/assets/ui-icons/bookmark.svg',
  '/assets/ui-icons/briefcase.svg',
  '/assets/ui-icons/broom.svg',
  '/assets/ui-icons/bug.svg',
  '/assets/ui-icons/bulb.svg',
  '/assets/ui-icons/calendar.svg',
  '/assets/ui-icons/chat.svg',
  '/assets/ui-icons/check-circle.svg',
  '/assets/ui-icons/check.svg',
  '/assets/ui-icons/chevron-down.svg',
  '/assets/ui-icons/chevron-left.svg',
  '/assets/ui-icons/chevron-right.svg',
  '/assets/ui-icons/chevron-up.svg',
  '/assets/ui-icons/clock.svg',
  '/assets/ui-icons/close.svg',
  '/assets/ui-icons/cloud.svg',
  '/assets/ui-icons/code.svg',
  '/assets/ui-icons/contrast.svg',
  '/assets/ui-icons/copy.svg',
  '/assets/ui-icons/cpu.svg',
  '/assets/ui-icons/database.svg',
  '/assets/ui-icons/edit.svg',
  '/assets/ui-icons/external.svg',
  '/assets/ui-icons/eye-off.svg',
  '/assets/ui-icons/eye.svg',
  '/assets/ui-icons/file-text.svg',
  '/assets/ui-icons/filter.svg',
  '/assets/ui-icons/finance.svg',
  '/assets/ui-icons/fire.svg',
  '/assets/ui-icons/flag.svg',
  '/assets/ui-icons/flask.svg',
  '/assets/ui-icons/folder.svg',
  '/assets/ui-icons/food.svg',
  '/assets/ui-icons/game.svg',
  '/assets/ui-icons/gift.svg',
  '/assets/ui-icons/github.svg',
  '/assets/ui-icons/globe.svg',
  '/assets/ui-icons/graduation.svg',
  '/assets/ui-icons/grid.svg',
  '/assets/ui-icons/health.svg',
  '/assets/ui-icons/heart.svg',
  '/assets/ui-icons/history.svg',
  '/assets/ui-icons/home.svg',
  '/assets/ui-icons/image.svg',
  '/assets/ui-icons/import.svg',
  '/assets/ui-icons/info.svg',
  '/assets/ui-icons/install.svg',
  '/assets/ui-icons/key.svg',
  '/assets/ui-icons/library.svg',
  '/assets/ui-icons/link.svg',
  '/assets/ui-icons/list.svg',
  '/assets/ui-icons/lock.svg',
  '/assets/ui-icons/login.svg',
  '/assets/ui-icons/logout.svg',
  '/assets/ui-icons/mail.svg',
  '/assets/ui-icons/map.svg',
  '/assets/ui-icons/menu.svg',
  '/assets/ui-icons/monitor.svg',
  '/assets/ui-icons/moon.svg',
  '/assets/ui-icons/more-h.svg',
  '/assets/ui-icons/more.svg',
  '/assets/ui-icons/mosque.svg',
  '/assets/ui-icons/music.svg',
  '/assets/ui-icons/news.svg',
  '/assets/ui-icons/palette.svg',
  '/assets/ui-icons/panel-close.svg',
  '/assets/ui-icons/panel-open.svg',
  '/assets/ui-icons/pause.svg',
  '/assets/ui-icons/pin.svg',
  '/assets/ui-icons/play.svg',
  '/assets/ui-icons/plus.svg',
  '/assets/ui-icons/random.svg',
  '/assets/ui-icons/refresh.svg',
  '/assets/ui-icons/rings.svg',
  '/assets/ui-icons/rows.svg',
  '/assets/ui-icons/search.svg',
  '/assets/ui-icons/settings.svg',
  '/assets/ui-icons/share.svg',
  '/assets/ui-icons/shield.svg',
  '/assets/ui-icons/shopping.svg',
  '/assets/ui-icons/sort.svg',
  '/assets/ui-icons/star.svg',
  '/assets/ui-icons/stop.svg',
  '/assets/ui-icons/sun.svg',
  '/assets/ui-icons/tag.svg',
  '/assets/ui-icons/terminal.svg',
  '/assets/ui-icons/tool.svg',
  '/assets/ui-icons/trash.svg',
  '/assets/ui-icons/travel.svg',
  '/assets/ui-icons/type.svg',
  '/assets/ui-icons/undo.svg',
  '/assets/ui-icons/upload.svg',
  '/assets/ui-icons/user.svg',
  '/assets/ui-icons/users.svg',
  '/assets/ui-icons/video.svg',
  '/assets/ui-icons/wifi-off.svg',
  '/assets/ui-icons/x-circle.svg',
  '/assets/ui-icons/zap.svg',
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
  '/js/core/input-guard.js',
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
  '/js/features/shell/about-card.js',
  '/js/features/shell/install-banner.js',
  '/js/features/shell/pages/menu-page.js',
  '/js/features/shell/pages/profile-page.js',
  '/js/features/shell/pages/reactivate-page.js',
  '/js/features/shell/pages/stub-page.js',
  '/js/features/shell/routes.js',
  '/js/features/shell/shell-parts.js',
  '/js/features/shell/shell.js',
  '/js/features/shell/update-prompt.js',
  '/js/features/splash/splash.js',
  '/js/main.js',
  '/js/ui/brand.js',
  '/js/ui/confirm.js',
  '/js/ui/empty-state.js',
  '/js/ui/icons.js',
  '/js/ui/popover.js',
  '/js/ui/pull-refresh.js',
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
