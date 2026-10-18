# Linkivo v2: Testing and quality gates

Honesty rule: report exactly what was run and what was not. "Not run" is acceptable when stated; "tested" without running is not.

## 1. Automatic gate (every slice and before delivery)

```
node "@ Creator/tools/check.mjs"          # must end with: PASSED: 0 errors
node --test "@ Creator/tests/"            # unit tests (node:test, no dependencies)
bash "@ Creator/tools/pack.sh"            # runs the gate again and builds the zip
```
`check.mjs` verifies: JS syntax of every module, JSON validity, forbidden patterns in shipped code (emoji, `eval`, unsafe `innerHTML`, direct `localStorage`, inline handlers), file size caps, secret scan, version consistency (`app.json`, `sw.js`, commit file, `CONTEXT.md`), deploy safety (`firebase.json`, `.gitignore`).

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
