# Linkivo v2: Architecture

HOW the app is built. WHAT it does is in `FEATURES.md`. Rules for the AI are in `RULES.md`.
Items marked **[verify]** depend on third-party limits or console behavior that may have changed: check official docs before relying on them and record the result in `CONTEXT-v2.0_to_v2.5.md`.

## 1. Stack and hard constraints

- Plain JavaScript, ES modules, no framework, no build step. Static hosting on Firebase Hosting (root = project root; `@ Creator`, `@ Versions` and `@ Extra files` are never deployed).
- Firebase Auth (Google + email/password) and Realtime Database (RTDB), Spark (free) plan. No Cloud Functions (needs paid plan).
- One Cloudflare Worker (free plan): `https://linkivo.programs-turzo.workers.dev`. Code lives in `@ Creator/worker/worker.js` (current) with snapshots in `@ Creator/worker/history/`. The owner pastes it into the Cloudflare dashboard and adds secrets by hand.
- Libraries are loaded lazily from a CDN at an **exact pinned version** (never `latest`), only when needed: Firebase modular SDK, SheetJS (Excel), PDF.js (PDF), fflate (zip-based formats), mammoth is NOT needed (docx links are read from the zip relationships). Pick versions that are at least two weeks old. Service worker caches them for offline use.
- Free-tier budgets that shape the design **[verify]**: RTDB Spark roughly 1 GB stored, 10 GB/month downloaded, 100 simultaneous connections. Worker free roughly 100k requests/day, 10 ms CPU per request, about 50 subrequests per invocation, cron triggers allowed.
  Consequences: never download whole collections on every start (cache + delta sync), batch Worker calls (max 25 URLs per call), keep CPU light (stream HTML, stop at `</head>`).

## 2. Target project structure (split by page or function; guideline, not a straitjacket)

```
/                          index.html  sw.js  manifest.webmanifest  firebase.json  .firebaserc  app.json  README.md  .gitignore
assets/brand/              logo.svg  text-dark.svg  text-white.svg
assets/icons/              generated PNG/ICO/SVG icons (white background)       <- @ Creator/tools/make-icons.mjs
css/core/                  tokens.css  base.css  layout.css  motion.css
css/components/            buttons.css  forms.css  sheet.css  toast.css  nav.css  list.css ...
css/pages/                 library.css  folder.css  import.css  preview.css  random.css  search.css  settings.css ...
js/main.js                 boot: config -> splash -> auth -> router
js/core/                   config  firebase  router  nav-stack  store  events  idb  local-prefs  logger  worker-client
                           update  install  rate-limiter  utils  dom  format  url-tools  mask  flags
js/engine/                 engine (interface)  local-engine  cloud-engine  sync  job-queue  chunker  cache-crypto  points
js/ui/                     toast  modal  sheet  popover  confirm  pin-pad  icons  skeleton  scroll-fade  empty-state  task-chip
js/features/<feature>/     auth shell splash library import preview search random vault account profile history
                           recycle settings export backup activity stats legal menu
                           (export/: export-modal, export-engine, formats/*.js ; import/: native-import.js)
js/workers/                parse.worker.js (import parsing off the main thread)
@ Creator/                  PLAN-v2.0_to_v2.5.md MASTER-PROMPT-v2.0_to_v2.5.md RULES.md CONTEXT-v2.0_to_v2.5.md  docs/  commits/  rules/  worker/  tools/  tests/  reference/
```
- `js/core/local-prefs.js` is the ONLY place that touches `localStorage`/`sessionStorage` (enforced by `check.mjs`).
- `js/core/flags.js` holds feature flags so a later-version feature can ship disabled earlier (example: the random button in Folder view).
- Files stay under about 500 lines (hard cap 800). Split by function.
- `@ Creator/` is pushed to GitHub, so it contains no secrets.

## 3. Data model (Realtime Database)

All per-user data is keyed by uid. Keys are compact but readable. `up` = last-updated time (ms), `ts` = created time (ms).

```
users/{uid}/profile      { name, createdAt, lastLogin, status: "active"|"deleted" }
users/{uid}/settings/{key}  string|number|boolean      (only non-secret preferences)
users/{uid}/lockState    { app:bool, vaultSep:bool, hideVault:bool, autoLock:number }   WORKER-WRITE ONLY, readable before unlock
users/{uid}/vaultCount   number                          (so the UI knows a vault exists without reading vault data)
users/{uid}/meta/purgeEpoch  number                     (bumped on hard purge so other devices reconcile)

folders/{uid}/{fid}      { name, color, icon, order, pinned, lc, ts, up, del? }
links/{uid}/{lid}        { url, host, title, desc, kw, fid, pt, oc, lo, ls, ds, pw, pb, pn, fv, bl, rl, dd, tags, imp, ts, up, del? }
users/{uid}/importLog/{jobId}  { ty, title, st, total, done, failed, saved, skipped, invalid, fid, imp, ts }   Recent imports, newest 50 (v2.2.2)
users/{uid}/devices/{deviceId}  { name, br, os, kind, via, ip (end hidden), city, reg, cc, tz, ts, seen, rv }   signed-in devices; rv = sign-out asked by another device (v2.2.2)
linkMeta/{uid}/{lid}     { image, video, shot, long, og, log, frameable, checkedAt }   heavy, loaded on demand

vault/{uid}/folders/{fid}   same shape as folders
vault/{uid}/links/{lid}     same shape as links
vault/{uid}/linkMeta/{lid}  same shape as linkMeta
vault/{uid}/history/{hid}   same shape as history

history/{uid}/{hid}      { lid, url, title, host, fid, src: "random"|"click"|"preview", ts }
activity/{uid}/{id}      { type, ts, info }                (client trims to the newest ~500)

secure/{uid}             { pinHash, pinSalt, vaultHash?, vaultSalt?, att, lockUntil }     WORKER ONLY (no client access)
session/{uid}            { app: expiryMs, vault: expiryMs }                                 WORKER WRITE, owner read
jobs/{uid}/{jobId}       { type, status, cursor, total, done, createdAt }                   background enrichment queue (v2.5.0)
deletedAccounts/{uid}    { deleteAt, summary: {...}, email }                                WORKER WRITE; summary readable by owner
admins/{uid}             true                                                               set manually in the console; read-only for admins
```
Field notes:
- `pt` points 1..1000 (0 only while blocked, with `pb` = value before blocking). `oc` random-open count, `lo` last random open, `ls` like-step (0..3), `ds` dislike used flag (reset on each random open), `pw` last point action from normal preview (weekly limit).
- Flags: `pn` pinned, `fv` favourite, `bl` blocked, `rl` read later, `dd` dead link. `del` = soft-delete timestamp (Recycle Bin, 15 days). `imp` = import run id (powers Undo).
- `desc` and `kw` are truncated (about 200 / 120 chars) so the main record stays small; long text goes to `linkMeta`.
- Folder link counts (`lc`) are written as ABSOLUTE values computed from the local index, never incremented with read-modify-write.
- Favourites is a virtual folder (query `fv == true` locally), not a node.
- Moving a folder to/from the vault is ONE multi-path `update()` per chunk across `links/{uid}`, `linkMeta/{uid}` and `vault/{uid}`.
- Indexes (`.indexOn`): `up` on folders/links/history trees, `deleteAt` on `deletedAccounts`.

## 4. Database rules design (written in v2.1.0, extended per version)

- Default deny at the root. Every rule starts from `auth != null && auth.uid === $uid`.
- **Account gate:** deny all client access when `users/$uid/profile/status === "deleted"`, except reading `users/$uid/profile` and `deletedAccounts/$uid/summary`.
- **App-lock gate:** for all of the user's data trees: allowed only if `users/$uid/lockState/app !== true` OR `session/$uid/app > now`. `lockState` and `session` stay readable so the app can render the lock screen.
- **Vault gate:** everything under `vault/$uid` additionally needs `session/$uid/vault > now` (and the app-lock gate).
- **Worker-only paths** (`secure`, `session`, `lockState`, `jobs`, `deletedAccounts`, `admins`): client `.write` is always false. The Worker writes with a service account, which bypasses rules.
- **Validation:** type, required fields, string lengths (url <= 2048, title <= 300 ...), numeric ranges (`pt` 0..1000), timestamps not in the far future (`<= now + 60000`), `$other: false` so unknown fields are rejected.
- Rules cannot rate-limit; use size caps, validation and Worker-side limits instead.
- Testing: if the Firebase emulator is unavailable (needs Java), write a rules test matrix (allow/deny table) in `@ Creator/tests/rules-matrix.md` and have the owner run the cases in the console Rules Playground. Never claim rules were tested when they were not.

## 5. Data layer: engines, cache, sync

- A single **Engine interface** (`js/engine/engine.js`): folders, links, history, settings, bulk operations, subscribe/notify. Two implementations:
  - `local-engine.js`: IndexedDB only (guest mode, database `linkivo-guest`).
  - `cloud-engine.js`: RTDB + local cache (database `linkivo-<uid>`).
  UI code talks only to the Engine, so guest and account behave the same.
- **Optimistic UI:** write to the local index first, show the result, sync in the background; failures surface in the task chip with Retry.
- **Cache and delta sync:** first load fetches each tree once into IndexedDB; later starts read the cache instantly and fetch only records with `up > lastSeen` (`orderByChild('up').startAt(...)`). Soft deletes arrive as updates. Hard purges are detected through `users/{uid}/meta/purgeEpoch` (if it changed, reconcile using a shallow key list: REST `?shallow=true`).
- **Bulk writes:** never loop with sequential awaits. Use `chunker` (100 items) and a parallel runner (default concurrency 4, adaptive 2..6, exponential backoff on errors), each chunk is ONE multi-path `update()`.
- **Job queue** (`job-queue.js`): persisted in IndexedDB (id, type, params, cursor, status). Survives reload; on boot, unfinished jobs resume (import writes, metadata enrichment, vault moves, guest sync, bulk deletes).
- **Memory:** the local index of all links lives in memory for instant search/sort/random (10k links is a few MB).
- **Encryption at rest:** when the app lock is ON (account mode), the IndexedDB cache is stored as AES-GCM blobs; the key is derived from the PIN at unlock and kept only in memory (non-extractable CryptoKey) and dropped on lock. Vault data is **memory-only**: never persisted to IndexedDB, dropped on lock, re-fetched on unlock. When the app lock is OFF the cache is plain (state this in the Privacy page).
- **Guest to account sync:** read everything from the local engine, then write to the cloud engine through the job queue: folders merged by case-insensitive name, links de-duplicated by normalized URL (the cloud copy wins), chunks of 100 in parallel with progress, verify counts, then wipe the guest database and guest preferences. State survives the login redirect/reload and resumes. Guest vault data: ask the user to set a PIN, or import as normal folders after a warning.

## 6. Import engine

1. Input (paste or files, max 10) goes to `parse.worker.js`; heavy libraries load inside the worker. HTML cannot use `DOMParser` in a worker: extract with a tolerant tokenizer/regex.
2. Extraction: tolerant URL finder (http/https, `www.`, optional bare domains with a TLD allow-list, balanced parentheses, trailing punctuation trimmed, Markdown/HTML/JSON/CSV aware, emails and file names like `a.js` excluded, internationalized domains supported).
3. Normalization key for de-duplication: lowercase host, strip `www.`, drop fragments, remove tracking parameters (`utm_*`, `fbclid`, `gclid`, `mc_*`, `igshid`, ...), sort remaining params, strip trailing slash. The stored URL stays as given unless "clean tracking parameters" is on.
4. De-duplication happens against the local index (instant, no database reads) and inside the batch.
5. Save: create an `imp` run id, chunk by 100, run chunks in parallel, update progress, record per-link results. Pause/stop only between chunks. Undo = soft-delete every link with that `imp` id.
6. Enrichment queue (after save): batches of up to 25 URLs per Worker call, concurrency 2 to 3, backoff on 429/5xx, per-URL retry limit, results written with multi-path `update()`. The fetched title replaces the imported title unless `tEdit` (user edited) is set.

## 6b. Export and the native Linkivo format

Modules: `js/features/export/export-modal.js` (UI), `export-engine.js` (collects items from the engine, streams the output in chunks, uses a worker for big libraries), `formats/<format>.js` (one module per format with the same interface: `id`, `label`, `options schema`, `preview(items, opts)`, `build(items, opts) -> Blob`). Heavy libraries (SheetJS for Excel, later a PDF library) load lazily. Import side: `js/features/import/native-import.js`.

Native format (`.linkivo.json`, UTF-8 JSON):
```
{
  "format": "linkivo-backup",
  "formatVersion": 1,
  "app": "2.2.0",
  "exportedAt": 1760000000000,
  "source": "account" | "guest",
  "counts": { "folders": 0, "links": 0, "history": 0 },
  "folders":  [ { "id", "name", "color", "icon", "order", "pinned", "ts", "up" } ],
  "links":    [ { "id", "fid", "url", "host", "title", "desc", "kw", "pt", "oc", "lo", "pn", "fv", "bl", "rl", "dd", "tags", "ts", "up" } ],
  "linkMeta": [ { "id", "image", "video", "shot", "long", "og", "log", "frameable", "checkedAt" } ],
  "history":  [ ],
  "settings": { },
  "vault":    { "folders": [], "links": [], "linkMeta": [], "history": [] }
}
```
- `settings` contains non-sensitive preferences only; `vault` exists only when the user chose it with an unlocked vault; internal fields (`imp`, `del`, `ls`, `ds`, `pw`) are not exported.
- `formatVersion` changes only with a migration function in `native-import.js` (old files must keep importing).
- **Fast import path:** validate the schema in a worker; remap every id to new ids; create folders first (one `update()`); decide duplicates against the local index by normalized URL using the chosen policy; stamp an `imp` run id; chunk links by 100 and run chunks in parallel; keep original `ts`, set `up` to now; skip metadata enrichment for links that already carry metadata. Progress, pause, stop and Undo work exactly like the normal import.
- Exports are generated from the local index (already in memory), so they work offline and for guests. Vault items are included only when the vault session is unlocked, and never written to the cache.
- Every format has unit tests (output shape and a round trip back through the importer where possible).

## 7. Router and back logic

- Path-based SPA routing (`history.pushState`). Firebase Hosting rewrites every path to `index.html` (keep `"source": "**"`; also make module/asset loading fail loudly if HTML is returned instead of JS).
- Route table in `js/core/router.js`: pattern, `parent`, title, guard (auth/guest/lock), `mount(container, params)` returning an `unmount()`.
- **One page mounted at a time.** The router unmounts the previous page and clears its container before mounting the next. Never rely on CSS to hide old pages (v1.4.x bug).
- Routes: `/` (redirect), `/login`, `/library`, `/folder/:fid`, `/link/:lid`, `/import`, `/random`, `/search`, `/menu`, `/profile`, `/profile/history`, `/settings`, `/settings/:section`, `/settings/recycle-bin`, `/share` (Web Share Target), `/reactivate`, `/terms`, `/privacy`, `/docs`, `/docs/:topic`.
- Parent chain examples: `/folder/:fid` -> `/library`; `/link/:lid` -> where it was opened from (folder, random, search), else `/library`; `/settings/:section` -> `/settings`; `/profile/history` -> `/profile`; top-level tabs -> `/library`; `/library` -> exit (second back within 2 seconds exits, first back shows a minimal toast).
- **Back algorithm:** keep a sentinel history entry so `popstate` always fires inside the app. On `popstate`: (1) if an overlay layer (sheet, modal, popover, preview panel, minimized-upload details) is open, close the topmost and push the sentinel again; (2) otherwise navigate to `route.parent` with `replaceState`; (3) at the root apply the exit rule. Overlays register themselves on a layer stack (`nav-stack.js`) when they open.
- Test cases to automate with jsdom or document for manual testing: back from a folder, from a preview opened from random, from a settings section, with a sheet open, at the root, after a hard reload on a deep URL.

## 8. Service worker, updates, install

- Goal: users never run old code. Server headers: HTML/JS/CSS/JSON/images are `no-cache` (revalidate with ETag), `sw.js` is `no-cache, no-store`. Never use `immutable`.
- `sw.js` declares `const VERSION = 'x.y.z'` equal to `app.json` (checked by `check.mjs`). Cache name `linkivo-shell-<VERSION>`; on activate delete all other caches (this also clears the old v1 caches).
- Strategy: navigations and same-origin shell files are **network-first** with a 3-second timeout and cache fallback (offline support), not cache-first. Third-party library files are cache-first (pinned versions).
- Update flow: check `registration.update()` on launch, on tab focus and every 30 minutes. New worker: `skipWaiting` + `clients.claim`; the page listens for `controllerchange`: if no import/job is running reload automatically, otherwise show a quiet "Update ready" chip and reload when idle. Settings has "Check for updates" and shows the version.
- Version beacon (v2.1.2, D-055): `/app.json` is fetched with `no-store` at launch, on focus and every 30 minutes and compared with the running version. At launch a newer version is applied automatically (`applyUpdate`: worker update, then clear app caches and reload; at most once per version per 10 minutes); while the app is in use the user gets an "Update now" popup. The beacon also runs when the service worker cannot register. Setting "Update automatically" turns the launch auto-apply off.
- Install (v2.1.2, D-059): `beforeinstallprompt` is captured by `initInstall()` at the top of `main.js`; adding the listener inside `boot()` missed the event.
- Install banner: stash `beforeinstallprompt`; dismissal stores `now + 7 days` in local prefs; `appinstalled` sets an "installed" flag. iOS shows a short "Add to Home Screen" instruction sheet. Installed detection: `display-mode: standalone` or `navigator.standalone`, plus the flag ("installed on this device"). Browsers cannot always tell whether the app is installed when it runs inside a normal tab, so word the status honestly.

## 9. Cloudflare Worker

Single Worker, modular source, routes grow by version. CORS allow-list: `https://linkivo.web.app`, `https://linkivo.firebaseapp.com`, `http://localhost:*` for development. Verify the Firebase ID token (RS256, Google public keys, cache the keys) for account users; guests have no token and get a stricter per-IP limit, a smaller batch cap and no access to account routes.

| Route | Version | Purpose |
|---|---|---|
| `GET /health` | v2.1.0 | status and version |
| `POST /meta` | v2.1.0 | batch (max 25 URLs) metadata |
| `POST /check` | v2.3.0 | dead-link check (status, redirect) |
| `POST /pin/set`, `/pin/verify`, `/pin/change`, `/pin/reset`, `/lock` | v2.5.0 | PIN and unlock sessions |
| `POST /account/delete`, `/account/reactivate` | v2.5.0 | account lifecycle |
| `scheduled()` cron | v2.5.0 | purge expired deleted accounts, continue background enrichment jobs |

### Metadata Worker (complete in v2.1.0)
Per URL: normalize, fetch HTML with a browser-like User-Agent and a byte cap (stop at `</head>` or about 256 KB), parse with `HTMLRewriter` (title, meta description/keywords, `og:*`, `twitter:*`, canonical, `link rel=icon`, lang, author, site name), read response headers (`X-Frame-Options`, CSP `frame-ancestors`, content type) to compute `frameable`. Special handlers/oEmbed for sites that block scraping (YouTube, Vimeo, X, Reddit ...) **[verify endpoints]**.
Fallback chain when the direct fetch fails or is blocked, ordered by free limit, highest first **[verify limits at build time]**: Dub.co metatags endpoint, JSONLink, Microlink (very low daily limit, last), AllOrigins raw HTML. The response lists, for every URL, `engine` used and a `log` array of attempts (`{engine, ok, ms, error}`), which the preview Details tab shows.

**v2.1.2 chain (supersedes the order above; see CONTEXT D-053, D-054).** oEmbed handler, direct fetch (browser UA), the same fetch as Facebook's and X's link-preview crawlers (only after a blocked browser fetch; social sites start here), Jina Reader, Dub, JSONLink, Microlink, Wayback Machine snapshot, AllOrigins. Weak titles (site name only, login or captcha pages) are kept but completed from later engines; if nothing is readable the answer is `ok:true, partial:true` with a title built from the URL (`deriveFromUrl`), the site name and a favicon; only 404, 410 and unknown domains are `ok:false`. Third-party services that fail 3 times in a row are skipped for 5 minutes (circuit breaker). Budget: 30 subrequests per call, split fairly (a URL uses at most 6); the app sends 6 URLs per call and runs 3 calls in parallel. Result fields added: `partial`, `published`, `themeColor`, `rss`, `archived`; `kw` also comes from article tags and JSON-LD; `canonical` falls back to `og:url`.
Screenshot: return a URL built for a free screenshot service **[verify service and limits]**, loaded lazily at preview time and cached.
Budget per invocation: stay far below the subrequest cap (25 URLs plus fallbacks plus one database call) and the CPU cap. Run requests in parallel with timeouts (6 s direct, 4 s per fallback).
Abuse control: per-uid and per-IP counters kept small (in-memory plus the Cache API; use RTDB `limits` only if needed), `429` with `Retry-After`, batch cap, reject private/local IP targets (SSRF): block `localhost`, RFC1918, link-local, metadata IPs and non-http(s) schemes.

## 10. Security model

- **PIN storage:** `HMAC-SHA256(pepper, uid | salt | pin)` (optionally followed by a modest PBKDF2 if CPU allows **[verify against the 10 ms free CPU limit]**). The `PIN_PEPPER` secret exists only in Cloudflare, so a database leak alone cannot be brute-forced offline. The PIN is never logged or stored in plaintext.
- **Online guessing:** attempt counter and escalating lockout stored in `secure/{uid}` (5 failures: 30 s, 10: 5 min, 15: 1 h, then 6 h).
- **Unlock session:** a correct PIN makes the Worker write `session/{uid}/app` (and/or `vault`) with an expiry. Rules check it on every read/write. `/lock` clears it (manual lock, auto-lock, lock on background).
- **Forgot PIN:** needs a fresh sign-in (ID token `auth_time` within 5 minutes; the client forces re-authentication first). The Worker clears the PIN hash, sets `lockState.app = false`, revokes sessions and writes an activity entry. Data is untouched because it is gated, not encrypted by the PIN. (The local cache encryption key is rebuilt from the new PIN; if the cache cannot be decrypted it is discarded and re-downloaded.)
- **Sensitive-action window:** the client remembers a verified-at time and skips prompts for 5 minutes; the server session remains the real gate.
- **Account deletion:** `/account/delete` (fresh sign-in): compute a summary (counts via shallow reads), write `deletedAccounts/{uid}` with `deleteAt = now + 15 days`, set `status = "deleted"`, revoke refresh tokens. Login of such an account shows the Reactivate step. `/account/reactivate` restores. Daily cron: for each expired entry delete all trees (`users`, `folders`, `links`, `linkMeta`, `vault`, `history`, `activity`, `jobs`, `secure`, `session`), then the Auth user (Identity Toolkit `accounts:delete`).
- **Service account:** needed from v2.5.0 for session writes, purge and background jobs. Stored only as the Worker secret `FIREBASE_SERVICE_ACCOUNT`. Never in the repo or in chat. `SETUP-GUIDE.md` has the step-by-step.
- Always: escape or use `textContent` for any untrusted text (titles come from the web and from imported files), no inline handlers, no `eval`, mask emails, no sensitive data in the DOM when locked, never persist vault data.
- Admin readiness: `admins/{uid}`, rules allow admin reads where needed, Worker routes can check the same list. No admin UI now.

## 11. Logging and errors

- `js/core/logger.js`: leveled logger with an in-memory ring buffer (last 300 entries) shown in Settings > Advanced > Debug log. No direct `console.log` in shipped code.
- Every async boundary has try/catch; the user sees one minimal toast (what failed, what to do), the logger keeps detail. No unhandled promise rejections (global handler logs them).

## 12. Items to verify when building (record results in CONTEXT-v2.0_to_v2.5.md)

1. Spark plan RTDB limits and Worker free limits (above).
2. Second RTDB instance not needed: the existing default database is reset and reused.
3. Hosting rewrite behavior for missing files (HTML returned for a missing `.js`).
4. oEmbed endpoints, fallback services' current free limits, screenshot service.
5. Exact CDN library versions (pinned, at least two weeks old).
6. Whether a PBKDF2 stage fits the free CPU limit.
7. Google sign-in popup vs redirect behavior on mobile PWA, and the `authDomain` choice.
8. Firebase CLI accepts `database.rules` = `@ Creator/rules/database.rules.json` (space and leading `@` in the path). If a deploy rejects it, copy the rules file to a root-level `database.rules.json`, point `firebase.json` there, keep the `@ Creator` copy as the source of truth and have `pack.sh`/`check.mjs` verify both are identical.

## 13. As built in v2.1.0 (differences from the design above; decisions D-033 to D-049 in CONTEXT-v2.0_to_v2.5.md)

- **Rules are generated.** `js/engine/schema.js` is the single description of every record. `@ Creator/tools/gen-rules.mjs` turns it into `rules/database.rules.json` (normal and vault trees share one validator). Edit the schema or the generator, never the JSON. `check.mjs` fails when they differ.
- **`users/<uid>/profile/status` is written only by the Worker**; a missing value means active. The client may write `name`, `createdAt`, `lastLogin` only. This stops a client from un-deleting its own account.
- **Server clock.** The cloud engine stamps `up`/`ts` with `Date.now() + .info/serverTimeOffset`, because the rules reject timestamps more than 60 s ahead of the server.
- **Data shape details.** `tags` is one comma-separated string (max 200). Boolean flags are stored only when true (`fv`, `bl`, ...; a false value is rejected by the rules). `history` and `activity` are indexed on `ts` (records have no `up`). `linkMeta` is readable per user (`$uid`) so export can read the whole tree.
- **Cloud engine.** Writes: cache -> outbox record -> one multi-path `update()` per chunk of 100 (4 in parallel) -> outbox cleared; offline writes stay in the outbox and are retried on `online` and every 30 s. Reads: one `orderByChild('up').startAt(lastSeen)` listener per tree (initial delta and live changes in one mechanism). The engine talks to an adapter (`rtdb-adapter.js`), which is why it is unit-tested with a fake database.
- **Router.** In-app navigation only uses `replaceState`; one sentinel history entry makes every Back press reach the app, where `back-logic.js` decides (overlay, parent, root rule). The parent chain applies on PC too. On wide screens `/settings` shows the first section and `/settings/:section` goes back to `/library`.
- **Service worker.** Network-first for the app (3 s timeout, cache only as offline fallback), cache-first for the pinned Firebase SDK and Google Fonts. The precache list is generated (`gen-precache.mjs`) and checked by the gate so a new module can never be missing offline.
- **Worker.** Page heads are parsed by a small tolerant tokenizer over the streamed bytes (cut at `</head>` or 200 KB) instead of `HTMLRewriter`, which keeps the parser testable in Node. Fallback order: Dub.co, AllOrigins, JSONLink, Microlink (smallest limit last). One shared subrequest budget (45 of the free plan's 50) is spent by redirects, site handlers, fallbacks and the token-key fetch. The file has only `export default`; test hooks sit under `default.__test`. Rate limits are per isolate (memory), which is cheap and stops casual abuse; a durable limiter can come with the cron work in v2.5.0.
- **Settings in v2.1.0** are device-level (stored through `local-prefs`, not synced). The engine already has `getSetting/setSetting` for account-synced settings when a feature needs them.
