# Linkivo v2: Context (compact, covers v2.0 to v2.5)

Purpose: a short memory for the next chat. It holds the project summary, the current state, and the important things the owner and the AI agreed or changed in conversation.
Keep it short: append only what a future chat needs; delete what no longer matters. (Rewritten compact in v2.1.1 on the owner's request; the long v2.0 to v2.1.0 history is gone on purpose. Specs live in PLAN, FEATURES, ARCHITECTURE, DESIGN.)
File naming: this file, `PLAN-v2.0_to_v2.5.md` and `MASTER-PROMPT-v2.0_to_v2.5.md` carry the suffix of the version range they cover; planning v2.6 and later creates new files with a new suffix (see RULES section 9). Public repo: no secrets here, ever.

## Project in one paragraph
Linkivo: a fast, private, free link manager PWA (plain JavaScript ES modules, no build step; Firebase Auth + Realtime Database; one Cloudflare Worker). Guest mode is fully local (IndexedDB); accounts sync through a local cache with delta sync. Owner: Muhtasim Rahman (Turzo), student developer, Bangladesh; talks Banglish, wants replies in Bangla with English technical terms; code, comments, docs and commits in English. Hosting https://linkivo.web.app, Worker https://linkivo.programs-turzo.workers.dev, repo github.com/muhtasim-rahman/linkivo. Built one version per chat: v2.1.0 foundation (done), v2.2.0 library and import, v2.3.0 preview and search, v2.4.0 random and history, v2.5.0 security and account, v2.6.0 settings and final (own plan then).

## Owner workflow
Zip extracted into the project root (next to `.git`); old files are deleted by the owner from "Removed files". `@ Extra files` and `@ Versions` are private: never touched. `@ Creator` is public. Quote paths with `@` and spaces. Commit text comes from `commits/vX.Y.Z-commit.txt`. Chat starts: `Start vX.Y.Z`, `Continue`, `Fix: ...`, `Review`.

## Agreed with the owner (important, keep)
- Splash: the owner's original logo animation is kept (shackle, ring drop with ripple, sparkles, expanding background, typed name); only the floating URL badges were removed. First launch full, later launches short, Settings > Appearance > Start animation (Auto / Always full / Always short). Never replace it with something simpler.
- Icons and custom artwork are SVG FILES under `assets/` (`ui-icons`, `art`, `brand`), not inline in code. The logo and wordmark follow the accent color. Logo on dark backgrounds sits on a white rounded tile; favicon and PWA icons have a white background.
- Design: not an AI-template look; emojis never; English UI. Pages are centred (max 1040px) next to a left sidebar. Sidebar has no filled background: expanded = whole active row highlighted, collapsed = active icon in a rounded square; collapsed logo shows an expand icon on hover; expanded logo opens Library. "Add links" uses a plus icon.
- Settings is ONE page with category headings; PC keeps a category list fixed and synced with scroll; phones get a sticky chip bar. Labels and descriptions are on separate lines.
- No right-click menu on PC and no long-press menu on phones (text fields keep theirs); setting to allow. Pull-to-refresh on phones (setting).
- A new page always starts at the top; pages fade in softly; light/dark switch fades.
- Updates: automatic (service worker reload) plus a version check against `/app.json`; an "Update now" popup appears when the app cannot switch by itself or automatic updates are off.
- SEO-friendly always (owner does real SEO work from v2.6): one h1 per page, semantic HTML, per-route title/description/robots/canonical/Open Graph, private pages noindex, robots.txt, sitemap.xml, JSON-LD, noscript text.
- Metadata for ANY pasted link matters (public app, any kind of site): richer fields and a rescue chain were added from the owner's tester results. Free third-party services Dub.co, AllOrigins, JSONLink were dead from Cloudflare and were removed; Microlink is last.
- Signup requires agreeing to the Terms and Privacy policy (time stored as `profile/termsAt`).
- Older rules still in force: free plans only; no admin panel, no profile picture upload, no incognito open; vault/PIN design in PLAN v2.5.0; points rules fixed in FEATURES section 8 (formula frozen with the owner at v2.4.0 kickoff).

## Current state (v2.1.1)
- Routes: `/` (start page setting), `/login`, `/reactivate` (stub), `/library`, `/folder/:fid`, `/import`, `/link/:lid`, `/search`, `/random`, `/profile/history` (stubs), `/menu`, `/profile`, `/settings` (+ `/settings/:section` scrolls), `/terms`, `/privacy`, `/docs`, `/docs/:topic` (stubs).
- Settings registry: 7 sections, 21 entries (`js/features/settings/catalog.js`). Flags in `js/core/flags.js` all off.
- Data: engines (local, cloud), job queue, chunker exist and are tested; no feature uses them yet. Rules generated from `js/engine/schema.js` by `tools/gen-rules.mjs` (includes `profile/termsAt`).
- Worker v2.1.1: `/health`, `/meta` (guest 10 / account 25 URLs), two passes (primary, then rescue: crawler, jina, wayback, microlink), JSON-LD and body fallbacks, subrequest budget 36. No secrets needed until v2.5.0 (`PIN_PEPPER`, `FIREBASE_SERVICE_ACCOUNT`).
- Tests: `node --test "@ Creator/tests/*.test.mjs"` (8 files). jsdom lives outside the project.
- Unused but ready for v2.2.0: skeleton, scroll-fade, task-chip, `engine.purgeExpired`.

## Decisions worth remembering (v2.1.x)
Rules generated from schema; `profile/status` Worker-only; server clock for timestamps; Back follows the parent chain on all devices; settings device-level (not synced); precache list generated (`gen-precache.mjs`, includes icon SVGs); Worker file has only `export default`; test command uses a glob; Firebase SDK pinned 12.19.0; guest 10 / account 25 URLs per `/meta`.

## Open verifications (owner tests, not run by the AI)
gstatic SDK path; Firebase CLI path with `@ Creator`; real RTDB rules in the Playground (matrix); Google sign-in popup on phones; Jina and Wayback rescue behavior from Cloudflare; why the platform cut subrequests below 45 (budget lowered to 36); desktop install prompt after the early-listener fix; full-screen OS launch splash on Android is controlled by the system (manifest colors and 512 icon only).

## Version log
- v2.0.0 setup (structure, docs, tools, icons).
- v2.1.0 foundation: auth, router, shell, engines, rules, Worker, settings shell, tests.
- v2.1.1 (2026-10-20) fix release after the owner's review: original splash restored with modes, login rebuilt, sidebar and menu redesigned, single-page settings with more options, icons and art moved to assets, accent-colored logo, update popup, pull-to-refresh, SEO files, richer metadata Worker. Next: `Start v2.2.0`.
