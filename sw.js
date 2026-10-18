/**
 * Linkivo — sw.js  (v2.0.0 MIGRATION worker)
 * Purpose: v1 registered a cache-first worker at this same URL. Browsers that visited v1 would keep
 * serving old files forever. This worker takes over immediately, deletes every old cache and does
 * NOT cache anything itself. v2.1.0 replaces it with the real update-safe worker.
 * KEEP `VERSION` identical to app.json "version" (checked by @ Creator/tools/check.mjs).
 */
const VERSION = '2.0.0';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// No fetch handler on purpose: every request goes straight to the network.
