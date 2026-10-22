# Linkivo v2: Master Plan

Owner: Muhtasim Rahman (Turzo). Contact: mdturzo.dev@gmail.com. Repo: github.com/muhtasim-rahman/linkivo.
This plan is the contract between the owner and every AI agent that builds a version. Read it together with `MASTER-PROMPT-v2.0_to_v2.5.md`, `RULES.md`, `CONTEXT-v2.0_to_v2.5.md` and `docs/`.

## 1. Vision

A fast, private, public-use link manager for people with hundreds or thousands of links. Same concept as v1.3.0, rebuilt from scratch: new layout, new data model, reliable bulk operations, real security, guest mode, and an interface that does not look AI-generated. Everything runs on free plans (Firebase Spark, Cloudflare free Worker, free GitHub).

## 2. Why v2 exists (lessons from v1)

- v1.3.0 was mostly stable but imports were slow (one network call per link), deletes were slow, there was no progress/resume/error handling, folder PINs were plaintext and checked in the browser, and caching served stale code.
- v1.4.0 to v1.4.5 added many features and broke repeatedly (cache, splash stuck, pages overlapping, tab routing, sidebar). Root causes and the audit are in `docs/V1-AUDIT.md`.
- v2 fixes the foundations first (data layer, router, update system), then builds features on top, one verified version at a time.

## 3. Locked decisions (summary; full spec in `docs/FEATURES.md`, design in `docs/ARCHITECTURE.md`)

| Area | Decision |
|---|---|
| Tech | Plain JS ES modules, no framework, no build step; Firebase Auth + RTDB (Spark); one Cloudflare Worker; all free |
| Modes | Account (Google, email/password) and Guest (fully local, can later log in and sync everything) |
| Data | Flat per-user trees, local cache + delta sync, optimistic UI, chunks of 100 in parallel, soft delete (15 days) |
| Security | Per-user PIN as peppered hash on the Worker side, unlock sessions enforced by database rules, vault data memory-only, encrypted cache when app lock is on |
| Account deletion | Marked deleted, recoverable for 15 days with an extra reactivate step, then purged with the Auth user |
| Metadata | Worker-first (complete in v2.1.0), fallbacks by descending free limit, fetched title wins unless user edited, video/thumbnail/screenshot at preview time |
| Navigation | Mobile floating glass bottom bar; PC collapsible sidebar; URL per page; back button follows a parent chain |
| Export | One main native format (database-shaped, re-imports through a fast path) plus formatted exports (JSON, CSV, Excel, TXT, Markdown, HTML bookmarks, printable HTML, OPML; PDF in v2.6.0) |
| Updates | Network-first service worker, no-cache headers, auto-update, install banner (7-day hide) and install status in Settings |
| Language | English only. No emojis. Icons only |
| Dropped | Weekly refresh-all, incognito/"Private open", profile picture upload, admin panel (data model is admin-ready) |

## 4. Versions

`v2.0.0` is this setup (structure, docs, rules, tooling, icons, migration service worker). The app is built in six stages, each in its own chat, each COMPLETE and verified before the next starts. Patch releases `v2.X.Y` (Y >= 1) are for bug fixes only.

| Version | Name | Core outcome |
|---|---|---|
| v2.0.0 | Setup | Done: structure, plan, rules, tools |
| v2.1.0 | Foundation and shell | App boots, logs in (account or guest), navigates, updates itself; data engines, rules and the complete metadata Worker exist |
| v2.2.0 | Library and import | Folders, links, bulk operations, fast resumable import, Recycle Bin, export |
| v2.3.0 | Preview and search | Rich preview with tabs, global search, dead-link checker, Share Target |
| v2.4.0 | Random Discover and history | Points engine, merged filter panel, History page inside Profile |
| v2.5.0 | Security and account | App lock, vault, forgot PIN, account lifecycle, guest sync, background jobs |
| v2.6.0 | Settings and final | Full settings catalog, backup, activity log, stats, menu, legal and docs pages, README, hardening |

### v2.1.0 Foundation and shell
Slices (build in this order, run `check.mjs` after each):
1. Infrastructure: real `sw.js` (replaces the migration worker, update flow), `manifest.webmanifest`, `index.html` shell, icons wired, headers verified, logger, local-prefs, flags.
2. Design system: tokens, base CSS, components CSS, icon set, UI kit (toast, modal, sheet, popover, confirm, skeleton, empty state, loading dots, scroll fade, task chip).
3. Router and nav-stack with the parent-chain back logic; page container lifecycle; route guards.
4. Splash (spec in `DESIGN.md`), boot sequence, shell: mobile floating bottom bar, PC sidebar, header, placeholder pages with designed empty states for every route that exists later.
5. Auth: login page (Google, email/password, reset password, verification), Guest button and notice popup, masked-email util, account status hook (deleted account goes to a stub route until v2.5.0).
6. Engines: Engine interface, local engine (IndexedDB), cloud engine (RTDB + cache + delta sync), chunker, parallel runner, persisted job queue; unit-tested with fakes. Folder and link primitives complete (UI comes in v2.2.0).
7. Database rules (complete for the whole schema, incl. vault/session/secure/jobs/deletedAccounts/admins) plus the rules test matrix; replace `@ Creator/rules/database.rules.json`, snapshot in `history/`.
8. Metadata Worker, complete: `/health`, `/meta` (batch 25, streaming parse, oEmbed handlers, fallback chain with per-engine log, `frameable`, screenshot URL, SSRF guard, CORS allow-list, per-IP/uid limits); client `worker-client.js`; "Metadata tester" in Settings > Advanced. Deployment steps for the owner.
9. Settings shell with the declarative registry (appearance, app, advanced sections working), install banner and install status row, update check row.
10. QA, docs, CONTEXT, commit text, zip.
Acceptance: account login/logout, guest entry and its popup, theme switch, nav on mobile and PC, back-button test cases pass, service worker update reaches an open tab and an old v1 worker is replaced, install banner hides for 7 days, engine unit tests pass, `/meta` returns correct data for at least 20 varied URLs including blocked ones (fallbacks work), rules matrix written, `check.mjs` passes.
Owner actions: reset the database data and deploy rules (verify the rules path `@ Creator/rules/database.rules.json` works with the Firebase CLI, fallback in `ARCHITECTURE.md` section 12), authorize domains, paste the Worker code (steps in `SETUP-GUIDE.md`).

### v2.2.0 Library and import
Slices: (1) Library page (folders grid/list, search, filter, sort, Favourites, three-dot menu, color/icon picker, pin, rename, merge, duplicate; delete goes to the Recycle Bin) (2) Folder view (header theme, search, domain filter row, sort, view toggle, multi-select with bulk actions and Undo toast, mobile overflow menu) (3) Link row and link menu (all actions, tags, read later, edit title; `points.js` deterministic rules) (4) Import popup: both tabs, parsers in the worker (20+ formats), extraction, toggles, review list with select/sort, warnings, close confirmation (5) Import engine: dedupe, chunks of 100 in parallel, progress/pause/stop/undo/minimize chip, resume after reload, enrichment queue through the Worker (6) Recycle Bin page in Settings (date groups, multi-select) and 15-day purge on open (7) Export system: a designed export popup (folder-preselected when opened from a folder), the main Linkivo native format and its fast re-import path (no extraction, no metadata fetch, id remapping, chunks of 100 in parallel), plus JSON, CSV, Excel, TXT, Markdown, HTML bookmarks, printable HTML and OPML, each with formatting options (see `docs/FEATURES.md` section 6b) (8) Smart duplicates, quick-add (clipboard detection), activity-log hooks (9) QA.
Acceptance: import 1000 links from a paste and from mixed files completes without UI freeze, shows live progress, survives a reload mid-way, Undo works; delete 1000 links in seconds with Undo; no duplicate rows; Library works in guest and account mode identically; exporting 1000 links in the native format and importing that file again finishes in seconds with folders, points, tags, flags and metadata intact.

### v2.3.0 Preview and search
Slices: (1) Preview component (route `/link/:lid`, tabs in spec order, tab memory, `frameable` handling, Details tab with metadata and engine log, compact actions, PC right panel, mobile full screen, fullscreen) (2) Metadata fetch/caching for preview (video, thumbnail, screenshot, long description) (3) Global search (index over title/URL/domain/description/keywords/tags and settings; category results; see more; history of 50 with 5 shown; Ctrl/Cmd+K) (4) Dead-link checker (`/check`, per link/folder, batch, results flag `dd`) (5) Web Share Target (manifest entry, `/share` route, save-to-folder sheet) (6) Edit link details; (7) QA.
Acceptance: preview opens fast from cache and fetches missing metadata once; blocked-iframe sites skip straight to a working tab; search is instant on 5000 links; share-target works when installed on Android.

### v2.4.0 Random Discover and history
Slices: (1) Random page with the merged folder+filter panel; filter popup during a session (2) Points engine: owner rules (see `FEATURES.md`) plus the advanced weighted picker. **At kickoff show the proposed formula and its parameters in a short table and get the owner's confirmation, then freeze.** (3) Embedded preview reuse with "new random link" icon; session memory; auto-advance (4) Folder view "Random from this folder" enabled via flag (5) History recording (random/click/preview) (6) Profile page shell with the History section: date groups, search, three-dot actions, multi-select, clear, auto-delete schedule (7) Random and history settings registered (8) QA.
Acceptance: points follow the owner's rules exactly (unit tests for like steps 50/20/10, dislike once, favourite +100/-120, block 0 and restore, weekly limit in normal preview); sampling is statistically sensible (test with seeded RNG); no repeats until the pool is exhausted.

### v2.5.0 Security and account
First action: guide the owner step by step to create the Firebase service account JSON and store it as the Worker secret (see `SETUP-GUIDE.md`); never ask them to paste it into chat.
Slices: (1) Worker routes: `/pin/*`, `/lock`, `/account/*`, cron (2) Rules activation of app-lock and vault gates and re-test matrix (3) App lock UX: PIN pad, lockout feedback, auto-lock, lock on background, cache encryption at rest (4) Vault: move to/from vault (job), memory-only vault data, unlock entry at the bottom of Library, hide option with search-bar PIN (5) Sensitive-action gate with the 5-minute window; wire it to logout, reset settings, delete folder (first time after login), delete account, security settings (6) Forgot PIN flow (re-auth then reset; guest: erase local data) (7) Account deletion, summary, recovery step on login, purge cron (8) Guest to account sync with merge, progress, resume, wipe (9) Background enrichment jobs by cron when the app is closed (10) Profile page: account section, delete account, security entry points (11) Update the Privacy-related facts in CONTEXT (12) QA.
Acceptance: with the app lock ON, a direct database read without a session is denied (rules matrix); wrong PIN lockout works; forgot-PIN keeps all data; vault data is absent from DOM, cache and search while locked; delete then reactivate restores everything; guest sync moves all data and clears local; cron purges only expired accounts.

### v2.6.0 Settings and final
Slices: (1) Complete the settings catalog (minimum 30 settings, every setting wired and tested, sensitive ones PIN-gated, searchable) (2) Optional passphrase encryption for the native backup format, restore flow polish and backup reminders (works for guests too), and PDF export (3) Activity log page (4) Stats (5) Mobile Menu page and PC banners (app info, developer) (6) Terms and Privacy (simple), Documentation (fully designed, covers every feature) (7) Advanced `README.md` (8) Hardening: accessibility pass, performance pass (10k-link library, Lighthouse budget), security review against `RULES.md`, rules and Worker final review, CSP evaluation, optional font self-hosting (9) Final QA of the whole app, CONTEXT final.
Acceptance: every feature in `FEATURES.md` exists and is reachable; no dead settings; docs describe the real app; `check.mjs` passes; a fresh clone deploys with the documented steps only.

## 5. Feature placement matrix

| Feature | Version |
|---|---|
| Auth, guest mode and notice, masked email | v2.1.0 |
| Install banner and install status, auto-update | v2.1.0 |
| Metadata Worker (complete), metadata tester | v2.1.0 |
| Library, folders, folder view, link menu, bulk actions, undo | v2.2.0 |
| Import (paste and files), native fast import, enrichment, Recycle Bin, export system (native + formatted), duplicates, tags, read later, quick-add | v2.2.0 |
| Preview, global search, dead-link checker, Share Target | v2.3.0 |
| Random Discover, points engine, History page | v2.4.0 |
| App lock, vault, forgot PIN, account deletion and recovery, guest sync, background jobs | v2.5.0 |
| Settings catalog (complete), encrypted backup, activity log, stats, menu, legal/docs, README | v2.6.0 |

Settings are registered in the registry by the version that introduces the feature; v2.6.0 completes and audits the catalog.

## 6. Dependencies and risks

- v2.5.0 needs the service account secret (owner action). Until then background enrichment works only while the app is open.
- Worker free-plan CPU/subrequest limits can bite: keep batches small, measure, and record real numbers in `CONTEXT-v2.0_to_v2.5.md`.
- Third-party metadata/screenshot services can change or disappear: keep the fallback chain data-driven and logged.
- Rules cannot be fully tested without the emulator: keep the rules matrix and ask the owner to run the playground cases.
- Each stage is large. The agent must work in slices, run the quality gate after each, and never ship a half-working state (see `MASTER-PROMPT-v2.0_to_v2.5.md` section 6).

## 7. Release process (every version)

1. Owner says: "Start v2.X.0" in a new chat inside the Linkivo v2 project and provides the latest project zip.
2. Agent follows `MASTER-PROMPT-v2.0_to_v2.5.md`: reads the docs, verifies the previous version is complete, builds slice by slice, runs `node "@ Creator/tools/check.mjs"`, packs with `bash "@ Creator/tools/pack.sh"`.
3. Agent delivers: the zip, `@ Creator/commits/vX.Y.Z-commit.txt`, updated `CONTEXT-v2.0_to_v2.5.md`, changed docs/rules/Worker, and a chat summary (what was built, how to test, removed files, owner actions, next version).
4. Owner extracts the zip into the project root, deletes files listed under "Removed files", tests, commits, deploys, saves the zip into `@ Versions`.
