# Linkivo v2: Context (living document)

Append-only history: never edit or delete earlier version entries. Update the "Current state" sections every version.
Public repository: no secrets here, ever.

## Project identity

| Item | Value |
|---|---|
| App | Linkivo, link management PWA, rebuilt from scratch as v2 |
| Owner | Muhtasim Rahman (Turzo), student, Saidpur Govt. Science College, Bangladesh. Developer site https://mdturzo.web.app |
| Contact (public) | mdturzo.dev@gmail.com |
| Repo | https://github.com/muhtasim-rahman/linkivo |
| Hosting | https://linkivo.web.app (Firebase Hosting, project `linkivo`), confirmed by the owner |
| Firebase | project `linkivo`; Auth: Google + email/password (configured); Realtime Database: existing default instance `linkivo-default-rtdb`, to be reset (no user data exists); web config in `js/core/config.js` (public) |
| Worker | https://linkivo.programs-turzo.workers.dev (created and ready; owner pastes code and adds secrets) |
| Secrets (names only) | `FIREBASE_SERVICE_ACCOUNT`, `PIN_PEPPER` (v2.5.0). Values live only in Cloudflare. |
| UI language | English only. No emojis. |
| Plans | All free: Firebase Spark, Cloudflare free, GitHub |
| Baseline | v1.3.0 (mostly stable). v1.4.x abandoned. Audit: `docs/V1-AUDIT.md` |

## Owner workflow (how files move)

- Local project root (Windows) contains: `.git`, `@ Versions`, `@ Extra files` (the git logs live inside it), `@ Creator`, `.gitignore`, plus the app files from the zips.
- The AI's zip is extracted directly into that root ("Extract here"). The zip root is the project root and it INCLUDES `@ Creator` (this AI workspace: plan, rules, docs, tools, commits).
- Private to the owner, never shared with the AI, never in a zip, never deployed: `@ Extra files` and `@ Versions`.
- Pushed to GitHub: `@ Versions` (one zip per version: everything except the other private folder) and `@ Creator` (so nothing sensitive may be put in either). `@ Extra files` is git-ignored.
- Nothing starting with `@` is deployed to hosting (`firebase.json` ignores them).
- Folder names contain a space and a leading `@`: quote paths in every shell command.
- Extracting does not delete old files: the AI lists "Removed files" in the commit file and the summary; the owner deletes them.
- Each version has its own chat inside the Claude Project "Linkivo v2". Old chat history is NOT available to new chats: this file, `PLAN.md` and `RULES.md` carry the memory.
- Owner commits with the text from `@ Creator/commits/vX.Y.Z-commit.txt`.

## Version history

## v2.0.0 Setup (2026-10-18) Status: COMPLETE
Summary: project structure and planning package created in the planning chat. No app code yet.
Files added: root config (`firebase.json` with all `@` folders excluded from hosting and no-cache headers, `.firebaserc`, `.gitignore` with secret patterns, `app.json`, `README.md`, placeholder `index.html`, migration `sw.js` that wipes old v1 caches), folder skeleton for `css/` and `js/` (see `ARCHITECTURE.md` section 2), `js/core/config.js` (public config), brand assets and generated icons (white background) in `assets/`, `@ Creator/` (PLAN, MASTER-PROMPT, RULES, CONTEXT, docs, tools, reference files, deny-all database rules).
Tools: `@ Creator/tools/check.mjs` (quality gate), `pack.sh` (release zip), `make-icons.mjs` (icons from the logo).
Decisions: see the decision log below (D-001 to D-032).
Verified facts: none external. Icons generated and visually checked. `check.mjs` passes on this package.
Owner actions (for v2.0.0): extract the zip into the project root, commit, and save the zip in `@ Versions`. Do NOT deploy hosting yet unless you want the placeholder page (it also replaces the old v1 service worker, which is fine).
Revision before commit: the AI folder was renamed from `.creator` to `@ Creator`; `@ GitLogs` moved into `@ Extra files`; hosting URL confirmed; the Export system (native format + formatted exports) was added to the spec; `.gitattributes` and `.editorconfig` added.
Next: `Start v2.1.0`.

## v2.1.0 Foundation and shell (2026-10-18) Status: COMPLETE (not yet run in a real browser or against live Firebase/Cloudflare: see Known issues)
Summary: the app boots, signs in (Google, email/password, guest), navigates (mobile bar, PC sidebar, URL per page, parent-chain Back), updates itself, stores data through two engines, has complete database rules and the complete metadata Worker.
Base fix: the v2.0.0 zip had `PLAN-v2.0_to_v2.5.md` and `MASTER-PROMPT-v2.0_to_v2.5.md`; the gate and `pack.sh` expect `PLAN.md` and `MASTER-PROMPT.md`. Renamed (content unchanged). `STRUCTURE.md` was missing from the zip and was added from the project knowledge copy.
Files added/changed:
- Infrastructure: `index.html` (shell + splash), `sw.js` (real worker), `manifest.webmanifest`, `app.json`, `js/main.js`, `js/boot.js`, `js/core/*` (logger, local-prefs, flags, events, utils, format, mask, url-tools, dom, css-loader, appearance, session, sensitive, update, install, firebase-loader, rate-limiter, worker-client, app-data, app-info).
- Design system: `css/core/*`, `css/components/*`, `css/pages/*`; `js/ui/*` (icons: 94, toast, sheet, confirm, popover, skeleton, empty-state, scroll-fade, task-chip).
- Router: `js/core/router.js`, `nav-stack.js`, `back-logic.js`; shell: `js/features/shell/*` (routes, shell, install banner, stub/menu/profile/reactivate pages); splash: `js/features/splash/splash.js`.
- Auth: `js/features/auth/*` (auth-service, account-status, login-page).
- Engines: `js/engine/*` (schema, idb, chunker, job-queue, engine, local-engine, cloud-engine, rtdb-adapter).
- Settings: `js/features/settings/*` (registry, controls, custom rows, advanced tools, metadata tester, page).
- Rules: `@ Creator/tools/gen-rules.mjs` -> `rules/database.rules.json` (+ `history/database.rules-v2.1.0.json`), `tests/rules-matrix.md`.
- Worker: `@ Creator/worker/worker.js` (+ `history/worker-v2.1.0.js`).
- Tools: `gen-precache.mjs`; `check.mjs` extended (generated files current, app-info version, import and asset paths exist).
- Tests: 7 files, 77 tests (see `docs/TESTING.md` section 6). Docs: ARCHITECTURE section 13, TESTING section 6, SETUP-GUIDE section F, STRUCTURE.
Decisions: D-033 to D-049 (below).
Verified facts: see "Verified facts".
Assumptions awaiting owner confirmation: A-009 to A-014 (below).
Owner actions: pending (see `commits/v2.1.0-commit.txt` and SETUP-GUIDE section F).
Known issues and limits:
- Not run in a real browser or against live services (no browser, no network to Firebase/Cloudflare in the build environment): layout, animation, Google sign-in, real RTDB rules, the Worker on Cloudflare and the free fallback services are owner tests.
- The `/meta` acceptance test (20 varied URLs) is the Metadata tester's "Load 25 sample URLs": the owner runs it after deploying the Worker.
- Account sign-in needs the Firebase SDK (CDN). After the first successful load the service worker caches it; a first visit while offline can only offer guest mode.
- Worker rate limits are per isolate (memory); page charset comes from the HTTP header only (no `<meta charset>` re-decode).
- `js/ui/skeleton.js`, `scroll-fade.js`, `task-chip.js` and `engine.purgeExpired` are built and tested but not used by a page yet (first use in v2.2.0).
Next: `Start v2.2.0`.

## Decision log (locked unless the owner changes them)

| ID | Decision |
|---|---|
| D-001 | Versions: v2.0.0 setup; v2.1.0 to v2.6.0 built by separate AI chats; patches v2.X.Y |
| D-002 | Plain JS ES modules, no React, no build step |
| D-003 | Free plans only; no Cloud Functions; Worker for server logic |
| D-004 | Fresh data model; existing default RTDB reset and reused |
| D-005 | Guest mode fully local; guest can later log in and sync everything, local data then removed |
| D-006 | Auth: Google + email/password |
| D-007 | Import writes in chunks of 100, several in parallel, resumable, with progress, pause/stop/undo, minimize |
| D-008 | Import tabs: paste text, upload files (10 max, 20+ formats, no zip/images); "https-less links" toggle default off |
| D-009 | Metadata Worker complete in v2.1.0; Worker-first, fallbacks by descending free limit; fetched title wins unless user-edited |
| D-010 | Weekly refresh-all dropped |
| D-011 | Background work when the app is closed via Cloudflare cron (needs service account), delivered in v2.5.0 |
| D-012 | App lock off by default; per-user PIN; when on, no data access without verified unlock (rules enforce) |
| D-013 | Vault folders: one shared PIN, same as app PIN by default, separate vault PIN optional; vault data gated, memory-only |
| D-014 | Hide-vault-entry setting: PIN typed into the search bar reveals the unlock option |
| D-015 | Forgot PIN: re-authenticate then reset; no data loss; guests erase local data |
| D-016 | Sensitive settings need PIN; one verification covers 5 minutes |
| D-017 | Account deletion: mark deleted, 15-day recovery with reactivate step and summaries, then purge including Auth user |
| D-018 | Recycle Bin: soft delete, 15 days, grouped by deletion date, lives in Settings |
| D-019 | History lives in Profile page; auto-delete schedule in Settings |
| D-020 | Navigation: mobile floating glass bottom bar (Library, Random, Import, Search, Menu); PC collapsible sidebar (Import, Library, Random, Search, Settings) |
| D-021 | URL per page; mobile back follows parent chain |
| D-022 | Preview tabs: embedded, video, photo/thumbnail, screenshot, details with engine log; remembers last/most-used tab |
| D-023 | Points: start 100, random open -10, like +50/+20/+10 then locked, dislike -50 once, favourite +100/-120, block 0; weekly limit in normal preview; advanced weighted picker proposed, frozen at v2.4.0 kickoff |
| D-024 | Splash: logo animation only, 1.2 to 1.8 s target, 2.5 s max, loading dots if load takes longer |
| D-025 | Icons on white background everywhere a background is needed |
| D-026 | Auto-update: no-cache headers, network-first service worker, install banner (7-day hide), install status in Settings |
| D-027 | Emails masked in UI (first 2 and last 2 characters kept) |
| D-028 | No incognito/"Private open", no profile picture upload for now, no admin panel (admin-ready data model) |
| D-029 | Terms/Privacy simple, Documentation fully designed, advanced README: v2.6.0 |
| D-030 | Settings registry (declarative); 30+ settings; Recycle Bin inside Settings |
| D-031 | Owner folders: `@ Creator` (AI workspace, shipped and pushed), `@ Versions` (zips, pushed, private to the AI), `@ Extra files` (git-ignored, private); no `@` folder is deployed |
| D-032 | Export system: one main native format (`.linkivo.json`, database-shaped, fast re-import path) plus formatted exports (JSON, CSV, Excel, TXT, Markdown, HTML bookmarks, printable HTML, OPML; PDF in v2.6.0); designed popup with live preview; spec in FEATURES 6b and ARCHITECTURE 6b |
| D-033 | Database rules are GENERATED from `js/engine/schema.js` by `tools/gen-rules.mjs`; the committed JSON is the deployed artifact and the gate checks they match |
| D-034 | `users/<uid>/profile/status` is written only by the Worker; missing means active (a client can never un-delete its account) |
| D-035 | Cloud timestamps use the server clock (`.info/serverTimeOffset`) because rules reject values more than 60 s ahead |
| D-036 | Page metadata is parsed by a tolerant tokenizer over streamed bytes (cut at `</head>` or 200 KB), not `HTMLRewriter` (testable in Node) |
| D-037 | Fallback order: Dub.co, AllOrigins, JSONLink, Microlink (ARCHITECTURE listed Microlink before AllOrigins; its tiny free limit puts it last) |
| D-038 | The Worker file has only `export default`; test hooks live under `default.__test` |
| D-039 | Back follows the parent chain on mobile AND PC; in-app navigation uses `replaceState` with one sentinel entry; on wide screens `/settings` opens the first section and its parent is `/library` |
| D-040 | `tags` is one comma-separated string (max 200); boolean flags are stored only when true; `history` and `activity` are indexed on `ts` |
| D-041 | Firebase SDK pinned to 12.19.0 (2026-09-09) from gstatic; 13.0.0 (2026-10-07) was too new |
| D-042 | `maskEmail`: names of 6+ characters keep 2+2, 3 to 5 keep 1+1, shorter keep 1, so the mask never shows the whole name |
| D-043 | The service worker precache list is generated by `tools/gen-precache.mjs` and verified by the gate |
| D-044 | v2.1.0 settings are device-level (local-prefs, not synced); the engine has `getSetting/setSetting` for synced ones later |
| D-045 | Test command is `node --test "@ Creator/tests/*.test.mjs"` (Node 22 does not accept a folder); docs updated |
| D-046 | Worker per-uid and per-IP limits live in isolate memory (no Cache API) to protect the 10 ms CPU budget |
| D-047 | Guest data stays in the local database when a guest logs in (nothing is moved or lost) until the v2.5.0 sync |
| D-048 | Worker subrequest budget is 45 of the free plan's 50 (redirects, handlers, fallbacks and the token-key fetch all count) |
| D-049 | Guests may send 10 URLs per `/meta` call and 60 per minute per IP; accounts 25 and 400 per minute |

## Assumptions awaiting owner confirmation

| ID | Assumption |
|---|---|
| A-001 | CONFIRMED by the owner: hosting URL https://linkivo.web.app (used for the Worker CORS allow-list) |
| A-002 | Email/password sign-up sends a verification email but the app stays usable (soft) |
| A-003 | Points floor 1, cap 1000 (owner replied "Good" to the proposal); block stores previous value and unblock restores it |
| A-004 | Fonts: Outfit (brand/titles), Figtree (UI), JetBrains Mono (URLs/data) via Google Fonts |
| A-005 | Recycle Bin purge of items older than 15 days runs on app open (client side); account purge runs on the Worker cron |
| A-006 | The full export system with the native format arrives in v2.2.0; PDF export and optional passphrase encryption of the native backup in v2.6.0 |
| A-007 | Metadata fallback order and screenshot service are verified at v2.1.0 build time |
| A-008 | Firebase CLI accepts the rules path `@ Creator/rules/database.rules.json`; verify at the first rules deploy (fallback in ARCHITECTURE section 12) |
| A-009 | The Firebase SDK files exist at `https://www.gstatic.com/firebasejs/12.19.0/` (same version as npm). [verify on first deploy; boot logs a clear error otherwise] |
| A-010 | Dub.co metatags, AllOrigins, JSONLink and Microlink endpoints still work as coded and their free limits are acceptable. [verify with the Metadata tester] |
| A-011 | The oEmbed endpoints for YouTube, Vimeo, X, Reddit, TikTok, Spotify and SoundCloud still answer without a key. [verify with the Metadata tester] |
| A-012 | WordPress mShots (`s.wordpress.com/mshots/v1/`) is acceptable as the free screenshot service (used from v2.3.0). [verify then] |
| A-013 | Google sign-in popup works with `authDomain` = `linkivo.firebaseapp.com`; the redirect fallback is only used where popups are blocked. [verify on a phone] |
| A-014 | In RTDB rules `null > now` evaluates to false (deny) when no session exists. [verify with Playground row L11/L6 in v2.5.0 when locks exist] |

## Current state (update every version)

- Code: v2.1.0 foundation (see the v2.1.0 entry and `STRUCTURE.md`). 75 JS/CSS files under `js/` and `css/`; Worker 454 lines.
- Routes (all exist; stubs say which version delivers them): `/` (redirect), `/login`, `/reactivate` (stub), `/library`, `/folder/:fid`, `/import`, `/link/:lid`, `/search`, `/random`, `/profile/history` (stubs), `/menu`, `/profile`, `/settings`, `/settings/:section` (real), `/terms`, `/privacy`, `/docs`, `/docs/:topic` (stubs), `*` (not found).
- Feature flags (`js/core/flags.js`): `randomFromFolder`, `shareTarget`, `appLock` all off.
- Settings registered (device-level): theme, accent, fontSize, density, reduceMotion, hideBar, sidebarCollapsed (Appearance); account, install, updates, about, worker, storage, tester, debugLog, reset (custom rows).
- Database: complete rules for the whole schema (generated, 40 automated cases + matrix). Data: empty; the owner resets the instance at first deploy.
- Worker: `/health`, `/meta` (guest 10 / account 25 URLs). Secrets: none needed yet (`PIN_PEPPER`, `FIREBASE_SERVICE_ACCOUNT` arrive in v2.5.0).
- Owner actions pending: extract zip, delete the two renamed files, reset database data, deploy rules, paste Worker, authorize domains, deploy hosting, run the Metadata tester (SETUP-GUIDE section F).

## Verified facts (add with source and date)

- Cloudflare Workers Free plan limits: 100,000 requests/day, 10 ms CPU per request, 50 external subrequests per request, 1,000 requests/minute burst. Source: developers.cloudflare.com/workers/platform/limits (and the 2026-02-11 subrequests changelog), checked 2026-10-18.
- Firebase JS SDK versions from the npm registry on 2026-10-18: latest 13.0.0 (published 2026-10-07, 11 days old, not used), 12.19.0 (published 2026-09-09, pinned).
- Build environment: Node 22.22.2. Not verified (no access): gstatic CDN path, Firebase CLI handling of the `@ Creator` rules path, Dub.co/JSONLink/Microlink/AllOrigins limits, oEmbed endpoints, real RTDB rule evaluation.
