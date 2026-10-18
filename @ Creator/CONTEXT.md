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

## Current state (update every version)

- Code: none yet. Placeholder `index.html`, migration `sw.js`, `js/core/config.js` only.
- Routes: none. Feature flags: none. Settings registered: none.
- Database: rules are deny-all (placeholder). Data: empty (to be reset by the owner anyway).
- Worker: not yet written (v2.1.0). Secrets: none set yet.
- Owner actions pending: none for v2.0.0 beyond commit.

## Verified facts (add with source and date)

(none yet)
