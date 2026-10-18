# Linkivo: v1.3.0 audit and v1.4.x lessons

Why v2 is a rebuild. Use this to avoid repeating v1 mistakes. v1 code is not part of this repository; the reference files in `@ Creator/reference/` are the finished splash animation (v21) and the multi-engine metadata prototype (LinkIntel).

## 1. Problems found in v1.3.0

| Area | Problem | v2 answer |
|---|---|---|
| Deploy | `firebase-config.js` was in the hosting `ignore` list but imported by the app; deployed, the import returned the SPA fallback page and the app broke (a likely cause of the stuck splash) | public config committed in `js/core/config.js`; `check.mjs` verifies deploy safety |
| Cache | JS/CSS with a one-year `immutable` header plus a cache-first service worker: users kept old code (the v1.4.x update fights) | `no-cache` headers, network-first service worker, auto-update flow, old caches wiped |
| Security | folder PIN stored in plaintext in the database and compared in the browser; locked folders' links were still downloaded | peppered hash on the Worker, unlock sessions enforced by rules, vault memory-only |
| Import speed | one sequential `await set()` per link after reading all existing links; no progress, no resume, no chunking | local dedupe, chunks of 100 in parallel, multi-path updates, persisted resumable jobs |
| Delete speed | per link: copy to the recycle bin then remove, sequential; emptying the bin and trimming history also looped | soft-delete flag, chunked multi-path updates, Undo |
| Data model | links nested under folders: opening a folder downloads all its links, Random fetched every selected folder, no local cache (bandwidth risk on Spark) | flat per-user trees, IndexedDB cache, delta sync |
| Counters | read-modify-write link counts drift | absolute values or transactions |
| Parsing | main thread (PDF/ZIP freeze the UI); `parseImage` placeholder returned nothing although images were advertised; naive CSV split; bare domains missed | Web Worker parsing, tolerant extraction, honest format list |
| Metadata | titles only from bookmarks; the prototype tool relied on four public browser-side APIs with tiny free limits | Worker-first extraction with a logged fallback chain |
| Router | no URLs, no deep links, no back handling, `lastPage` in storage | path routing, parent-chain back logic, one page mounted at a time |
| Architecture | globals on `window`, dynamic-import coupling, big inline script and styles in `index.html`, leftover placeholder toasts | modules, no globals, flags, clean shell |
| Rules | no rules file in the repository (live rules unknown) | complete rules in `@ Creator/rules`, test matrix |
| Account deletion | data removed before `user.delete()`; failure left an account without data | marked-deleted lifecycle with recovery and purge |
| Splash | about 10 seconds, fixed timeline regardless of load, hard-coded version, debug controls | 1.2 to 1.8 s logo-only splash tied to readiness |
| Misc | analytics loaded on every start; `app.json` placeholders; folder names not escaped when rendered | no analytics, real `app.json`, escape everything |

## 2. Lessons from the v1.4.x history (git log)

- Fixes that repeated across 1.4.2 to 1.4.4: page overlap (fixed three times), splash stuck, sidebar toggle, cache updates, PIN confirm helper. All came from weak foundations: CSS-hidden pages instead of a router that unmounts, cache headers, global state. v2 builds those foundations first (v2.1.0) and tests them.
- Features were stacked in "steps" of a dozen items per commit with no tests. v2 ships slice by slice with a gate.
- App-lock hiding via `visibility:hidden` and `inert` was only cosmetic. v2 withholds data (rules, no cache, no DOM).

## 3. Features from v1.3.0/v1.4.x worth carrying (re-implemented, not copied)

Random engine modes (points/equal/inverse), avoid recent, skip disliked/blocked, only starred/liked, auto-advance countdown; link actions (pin, star, like, dislike, block, copy, open); history grouping; tracking-parameter stripping for dedupe; clipboard URL detection; Ctrl+K global search; accent themes and font size; auto-clear history; offline banner; export formats (JSON, CSV, HTML bookmarks, Markdown); install banner state; storage usage display; PDF export.

## 4. What the owner explicitly did not like

Slow bulk operations, missing progress and error handling, a busy import popup, the point system capped at 150, bloated splash, generic AI-looking layouts, emojis in the UI, plaintext PIN handling, and anything that needs a paid plan.
