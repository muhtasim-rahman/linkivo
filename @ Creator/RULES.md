# Linkivo v2: Rules for the AI agent

These rules are strict. They apply to every version. If a rule conflicts with a user request, say so and ask; do not silently break the rule. Rules marked (gate) are checked by `node "@ Creator/tools/check.mjs"`.

## 0. Authority and reading order
1. `MASTER-PROMPT.md` (how to work), 2. this file, 3. `PLAN.md` (what each version contains), 4. `CONTEXT.md` (current state and decisions), 5. `docs/FEATURES.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/SETUP-GUIDE.md`, `docs/TESTING.md`.
The newest owner instruction in the chat wins over the documents; when it changes a decision, record it in `CONTEXT.md`.

## 1. Scope and completeness
- Build only the version asked for. Do not start features of later versions (use feature flags if something must exist early).
- A version is delivered only when every slice in `PLAN.md` for that version works and the quality gate passes with zero errors. Never ship a broken or half-wired state. If something cannot be finished, cut it from this version, say exactly what was cut, and move it to the next version in `CONTEXT.md`.
- Never remove or weaken an existing feature or security property without the owner's explicit approval.
- Never modify the history of earlier versions: older `commits/*.txt` files and older entries in `CONTEXT.md` are append-only.
- Never touch, request, or mention the owner's private folders `@ Extra files` (personal files and the git logs) and `@ Versions` (release zips). `@ Creator` is YOUR workspace: you read it and update it every version, and it ships inside the zip.
- Folder names contain a space and a leading `@`: quote every path in shell commands (`"@ Creator/tools/check.mjs"`), and never pass `@` paths to `zip -x` (zip treats a leading `@` as a list file; `pack.sh` handles this).
- Do not invent facts (keys, IDs, limits, endpoints, console menus). Verify against official docs when you can search; otherwise label it **[verify]** and tell the owner. Never claim a test passed unless you ran it.

## 2. Code
- Plain JavaScript ES modules. No frameworks, no build tools, no runtime npm dependencies. Libraries only from a CDN at an exact pinned version at least two weeks old, lazy-loaded when needed (see `ARCHITECTURE.md`).
- Structure: split by page or function; files under about 500 lines (gate: hard cap 800). One responsibility per module. No circular imports. Shared pieces go in `js/core`, `js/engine`, `js/ui`.
- No globals on `window` (a single `window.__linkivo` debug handle in development only). No inline event handlers (gate: warning).
- Untrusted text (page titles, imported files, user input) is never inserted with `innerHTML`; use `textContent` or the `dom` helper. If `innerHTML` is truly needed, the line ends with `// safe: <reason>` (gate).
- `localStorage`/`sessionStorage` only through `js/core/local-prefs.js` (gate). No `eval`, `new Function`, `document.write` (gate).
- No emojis in code, UI text, docs shipped to users or commit messages (gate for shipped files). Icons come from `js/ui/icons.js`.
- Use `js/core/logger.js`, not `console.log` (gate: warning).
- Comments explain WHY, not WHAT. Every file starts with a header comment: purpose, public API, version introduced. Mark unused code you notice with a clear comment and mention it in the summary instead of silently deleting working code.
- Every async boundary has try/catch; the user gets one short toast, the logger gets the detail. No unhandled promise rejections.
- Accessibility floor: visible focus, labels on icon buttons, keyboard operable dialogs, 44px touch targets, contrast AA, `prefers-reduced-motion` honored.

## 3. Security (non-negotiable)
- No secrets in the repository (gate: secret scan): no service-account JSON, private keys, `PIN_PEPPER`, tokens. The Firebase web config in `js/core/config.js` is public by design.
- PINs are never stored in plaintext, never logged, never sent anywhere except over HTTPS to the Worker. Verification happens on the Worker.
- Data in the database is protected by rules, not by the UI. Every new path or field gets rules and a line in the rules test matrix in the same version.
- While the app lock or the vault is locked, the corresponding data must not be in the DOM, the cache (vault: never persisted) or search results.
- Never put sensitive details in URLs, logs, toasts or error messages. Emails are masked in the UI.
- Worker: CORS allow-list, token verification, per-uid and per-IP limits, SSRF guard (no private/loopback/metadata targets), request size caps.
- Sensitive actions go through the single `requireSensitive()` gate (PIN when the lock is on, 5-minute window, server session remains authoritative).

## 4. Data and performance
- Never loop with sequential `await` over many items. Bulk work uses the chunker (100 per chunk), a parallel runner (default concurrency 4, adaptive 2 to 6, backoff on errors) and one multi-path `update()` per chunk.
- Bulk operations (import, delete, move, vault move, sync, enrichment) are jobs: persisted, resumable, with progress, pause/stop where it makes sense, error reporting and retry for failed items.
- Never download a whole collection on every start: local cache plus delta sync. Never use read-modify-write for counters (write absolute values or use transactions).
- Respect the free tiers (see `ARCHITECTURE.md` section 1). Batch Worker calls (max 25 URLs), cap CPU time, stream HTML.
- UI stays responsive with 10,000 links: virtualize or window long lists, avoid per-row animations, debounce search, do heavy parsing in a Web Worker.

## 5. UX and design
- Mobile-first, then PC. Follow `docs/DESIGN.md`. Compact and clean. Not a generic AI look (use the anti-template checklist before each delivery).
- No emojis. English UI text, sentence case, verb-first buttons, one action name everywhere.
- Every page has a URL path. One page is mounted at a time (router unmounts the previous page). Back button follows the parent chain; overlays register a back layer.
- Every list has loading, empty and error states. Toasts are minimal.
- Anything bigger than a few seconds shows progress; anything destructive asks for confirmation or offers Undo.

## 6. Updates and caching
- Never use `immutable` or long cache lifetimes for app files (gate). `sw.js` is never cached. The service worker is network-first for the shell and removes all old caches.
- `app.json` `version`, `sw.js` `VERSION`, the commit file and the `CONTEXT.md` entry always agree (gate).
- Bumping the version is part of every delivery.

## 7. Workflow and deliverables
- One version per chat. The chat starts when the owner says "Start vX.Y.Z" and gives the current project zip.
- Run `node "@ Creator/tools/check.mjs"` after every slice and before delivery; fix every error. Add tests for logic-heavy modules (points, extraction, chunker, router back logic, rules matrix) under `@ Creator/tests/` and run them.
- Deliverables for every version: (1) project zip built by `bash "@ Creator/tools/pack.sh"` (no wrapper folder; it INCLUDES `@ Creator` and EXCLUDES `@ Extra files` and `@ Versions`), (2) `@ Creator/commits/vX.Y.Z-commit.txt` (title + bullet description, one file per commit), (3) updated `CONTEXT.md` (append a new version entry; update current-state sections), (4) updated docs, rules (`@ Creator/rules/database.rules.json` + snapshot in `history/`) and Worker (`@ Creator/worker/worker.js` + snapshot in `history/`) when changed, (5) the chat summary described in `MASTER-PROMPT.md`.
- List every file removed or renamed under "Removed files" in the commit file and in the summary, because extracting a zip does not delete old files.
- The zip root IS the project root. The owner extracts it directly into the project folder next to `.git`.
- `@ Creator/` is public (pushed to GitHub): never put anything sensitive in it.

## 8. Communication
- Talk to the owner in Bangla (Bengali script) with technical terms in English; he writes Banglish. Keep explanations simple, structured and practical; no vague answers. Code, comments, docs and commit messages are in English.
- Ask only blocking questions (at most 5, grouped), otherwise decide, record the decision in `CONTEXT.md`, and continue.
- When the owner must do something (deploy, paste, add a secret), give numbered steps with exact names.
- When a request is risky or contradicts earlier decisions or the free-tier limits, say so briefly and propose the alternative.
- Bugs reported later: reproduce from the report, fix, release a patch `vX.Y.Z+1` with the same deliverables.
