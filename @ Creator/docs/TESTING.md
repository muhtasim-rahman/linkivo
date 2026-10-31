# Linkivo v2: Testing and quality gates

Honesty rule: report exactly what was run and what was not. "Not run" is acceptable when stated; "tested" without running is not.

## 1. Automatic gate (every slice and before delivery)

```
node "@ Creator/tools/check.mjs"          # must end with: PASSED: 0 errors
node --test "@ Creator/tests/*.test.mjs"            # unit tests (node:test, no dependencies)
bash "@ Creator/tools/pack.sh"            # runs the gate again and builds the zip
```
`check.mjs` verifies: JS syntax of every module, JSON validity, forbidden patterns in shipped code (emoji, `eval`, unsafe `innerHTML`, direct `localStorage`, inline handlers), file size caps, secret scan, version consistency (`app.json`, `sw.js`, commit file, `CONTEXT-v2.0_to_v2.5.md`), deploy safety (`firebase.json`, `.gitignore`).

## 2. Unit tests (write them in the version that introduces the logic)

Put them in `@ Creator/tests/*.test.mjs`. Import the real modules (ES modules), never copies. Minimum coverage by topic:

| Topic | Introduced | What to test |
|---|---|---|
| mask util | v2.1.0 | `ab******yz@domain` rules, short local parts |
| router and back logic | v2.1.0 | parent chain, overlay layers, root exit rule, deep-link reload |
| chunker, parallel runner | v2.1.0 | chunk sizes, concurrency cap, backoff, failure isolation, order independence |
| job queue | v2.1.0 | persist, resume, pause/stop |
| engines | v2.1.0 | same behavior for local and cloud (fake database) |
| export formats and native round trip | v2.2.0 | export then re-import (fast path) keeps folders, points, tags, flags and metadata; CSV BOM and delimiters; HTML bookmarks re-import through the normal extractor; line templates; large export does not block |
| URL extraction and normalization | v2.2.0 | glued punctuation, space-only separation, Markdown/HTML, bare domains toggle, emails and file names excluded, dedupe keys |
| import engine | v2.2.0 | progress counts, undo by `imp`, resume mid-way |
| points rules | v2.2.0 / v2.4.0 | every rule in `FEATURES.md` section 8 |
| weighted picker | v2.4.0 | seeded RNG, no repeats until exhausted, filters, modes |
| search scoring | v2.3.0 | ranking, categories, vault excluded while locked |
| Worker pure functions | v2.1.0+ | URL normalization, SSRF guard, HTML meta parsing, fallback chain with mocked `fetch`, JWT verification |
| PIN logic | v2.5.0 | hash/compare, lockout escalation, session expiry |

DOM-dependent tests may use `jsdom` installed outside the project folder (for example in a temp directory); never add a `node_modules` folder to the deliverable.

## 3. Rules test matrix (`@ Creator/tests/rules-matrix.md`)

A table kept up to date every version: path, actor (owner, other user, anonymous, deleted account, locked app, unlocked app, locked vault, unlocked vault, admin), operation (read/write), expected result (allow/deny). Include invalid-data cases (wrong type, too long, extra field, future timestamp).
Run it with the Firebase emulator when available, otherwise the owner runs it in the console Rules Playground.

## 4. Manual checklist template (copy into the chat summary)

1. Hard reload on a deep URL (for example `/folder/abc`): page loads, no overlap of pages.
2. Fresh install flow and update flow: deploy a new build, open an existing tab: "Update ready" or auto-reload happens.
3. Guest flow and account flow for every feature of the version.
4. 360px phone width and 1280px desktop width; dark and light theme; reduced motion.
5. Back button: from every new page, with an overlay open, at the root.
6. Bulk scenario with 1000 links (import, move, delete, undo): progress, speed, no UI freeze.
7. Offline: app shell loads, clear message for actions that need the network.
8. One deliberate failure: wrong PIN, bad URL, blocked site, network cut mid-import. Error is understandable and nothing is lost.
9. Security spot check relevant to the version (locked state shows nothing sensitive in the page or the cache).

## 5. Performance targets

- First meaningful paint after the splash under 2 seconds on a mid-range phone with a warm cache.
- 5,000 to 10,000 links: scrolling stays smooth, search results under 100 ms, random pick under 50 ms.
- Import of 1,000 links saved to the database in a few seconds (excluding metadata enrichment) on a normal connection.

## 6. How the suite is organised (12 files, 154 tests as of v2.2.0) (read before adding tests)

| File | What it covers |
|---|---|
| `mask-url-back.test.mjs` | mask util, URL keys, `resolveBack`, route matching, parent chain, guards, ids, formatting |
| `chunker-jobs.test.mjs` | chunker, adaptive parallel runner (retry, backoff, stop), job queue (persist, pause, resume after restart, fail, stop) |
| `engine.test.mjs` | schema sanitizers, local engine (CRUD, soft delete cascade, absolute `lc`, 1000-link bulk, restart), cloud engine with a fake RTDB (chunks, outbox, offline, live sync, last-write-wins, purge epoch, server clock) |
| `rules.test.mjs` + `helpers/rules-eval.mjs` | the generated rules against the matrix in `rules-matrix.md` (own evaluator, see the note there) |
| `worker.test.mjs` | Worker pure functions and routes with mocked `fetch`: SSRF guard, head parser, frameable, streaming cut, fallback chain (preview-crawler retry, Jina, Wayback, circuit breaker, partial results), URL-derived titles, JSON-LD parsing, oEmbed, redirects, budget, token verification (generated RSA key), rate limits, CORS |
| `v212.test.mjs` | v2.1.2 pure logic: version compare, splash mode, page meta (SEO), context-menu guard, pull distance, settings scroll-spy |
| `v213.test.mjs` | v2.1.3: splash and settings registry, context guard, image menu, tooltip (hover, long-press), send limits, device-side metadata rescue (fake providers and fake fetch), Worker version check, router refreshCurrent, View Transition theme switch, CSS and index.html contracts |
| `v214.test.mjs` | v2.1.4 regressions: inline theme script (and its equality with appearance.js), pull-to-refresh lifecycle, bar ring edges and Import active look, collapsed sidebar logo |
| `v220-logic.test.mjs` | v2.2.0 logic: link extraction, points rules, every parser (text, DOCX, PPTX, XLSX, PDF), zip reader and writer, all export formats, Excel round trip, Linkivo backup round trip, import and enrich jobs (1000 links, pause and resume, restart, Undo), engine helpers, activity hooks |
| `v220-ui.test.mjs` | v2.2.0 jsdom: Library, folder page (1200 links windowed, select, delete and Undo), link menu, quick add, import popup (paste, review, run, backup fast path), export popup, Recycle Bin, new settings |
| `boot-smoke.test.mjs` | jsdom: the boot sequence in guest mode, data layer start and teardown, session changes (guest, logout, deleted account) |
| `ui-smoke.test.mjs` | jsdom: router and Back behavior, overlays, toast, popover, appearance, shell, every route module, login, settings, worker client and metadata tester |

Commands (Node 22 needs a glob, not a folder):
```
node --test "@ Creator/tests/*.test.mjs"
node "@ Creator/tools/gen-rules.mjs" --check
node "@ Creator/tools/gen-precache.mjs" --check
```
`ui-smoke.test.mjs` needs jsdom OUTSIDE the project: `cd <any temp dir> && npm i jsdom`, then `JSDOM_PATH=<that dir>/node_modules node --test ...`
(default `/home/claude/tools-node/node_modules`). Never install `node_modules` inside the project.

What these tests can NOT prove: real browser layout and animation, real Firebase and Cloudflare network behavior, the real database rules engine, the free-service endpoints
(Dub, JSONLink, Microlink, AllOrigins, oEmbed). Those are owner tests (see the version summary).

## v2.2.2 owner checklist (short)
1. Start an import: the progress popup shows "Closing in 10 s" after it finishes and closes; open an old import from Recent imports: it stays open. Remove one entry, then Clear all; reload and check the account list matches on a second device.
2. Drop one file on the Import page: it is added once. Tap the arrow beside Supported file types.
3. Folder page on a phone: open a link three-dot menu and scroll it (it must not close); pull the page slowly (thin ring); select with the favicon check box on PC; the selection bar fits without sideways scrolling.
4. Settings on PC: install card and Recycle Bin card on top; a choice (for example Density) is a dropdown on the right; on a phone it is a full-width control. App shows the app details card.
5. Account: View profile, sync icon, verified tick, link Google or a password, change password (wrong old password shows an error), forgot step needs the account email, change email (link arrives at the NEW address), Logged-in devices (this device listed; sign another device out and open the app there).
6. Clipboard: allow clipboard access in Chrome, copy two links, return to Linkivo: a suggestion card appears; Import opens the page with the text filled in.


## 7. v2.3.0 additions (Preview, search, dead-link checker, Share Target)

Automated (Node and jsdom, 246 tests in total, 43 new): `v230-fixes` (Danger zone, toggle rows, captions, toast and bar, install note, delete-account popup, profile card, Log out, Edit link),
`v230-preview` (tabs, embeds, log, fetch once, page), `v230-search` (ranking, 5000-link speed, history, page), `v230-worker-check` (`/check` with a mocked fetch),
`v230-check` (job, client batching, result sheet), `v230-share` (model, manifest, page).
Not automated, owner must run: the real network `/check` (a live 404 page, a made-up domain, a site that blocks robots), iframe behaviour of real sites, YouTube and Vimeo players,
the mShots screenshot service, the Android share sheet after installing the app, the Fullscreen button on a phone, the toast following the hidden bottom bar, and every layout at 360px and 1280px in light and dark.

## v2.4.1 tests (`v241.test.mjs`, 21 tests)
Automated: picker (seeded distribution, no repeats, filters, weights and modes), History service (record, repeat rule, keep time, Off, admin "no limit", account store and clear, guest), page-state, `syncNow`, admin Normal view (memory only), the small fixes (email, 25 a day, card heights, tap highlight, Switch account, info buttons), the Random page (hub, Surprise me, -10 points, History, no repeat, folder narrowing, `?folder=`), the History page (day groups, search, filter, remove, select), Profile, folder state restore on Back, router `replace`.
Setup: jsdom **30 or newer** is needed (`Blob.text()`); install it outside the project and run `JSDOM_PATH=<dir>/node_modules node --test "@ Creator/tests/"*.test.mjs`.
Not automated, owner must run: Back on a real phone (folder filters and scroll after a Preview, related link then Back), the sidebar header animation, the tap-highlight removal on Android and iPhone, the embedded Preview with a real site, auto-advance, History in the account on two devices, Microlink over the real network.
