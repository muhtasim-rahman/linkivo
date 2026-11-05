# Linkivo

A fast, private link manager (PWA). Plain JavaScript, Firebase and a Cloudflare Worker, all on free tiers.

- App: https://linkivo.web.app
- Developer: Muhtasim Rahman, https://mdturzo.web.app

**Status:** v2.5.2 (PARTIAL final stage: vault, change list, Activity, Stats, Terms, Privacy and Docs are built; the advanced README, PDF export, backup passphrase and the hardening pass are still open. v2.5 is the final major version). v2.5.0 PARTIAL (app lock with PIN, guest lock, encrypted device copy, forgot PIN, account deletion and recovery, Worker PIN/session/cron; vault, guest-to-account sync and the background-job button follow in v2.5.1; before that v2.4.3 (Random polish, Profile with photo and banner; v2.4.1: Random Discover, points picker, History, Profile; before that v2.3.0: Preview, global search, dead-link checker, Share Target, Settings and Danger zone polish): folders, links, bulk actions with Undo, a full Import page (paste or files, domain switches, favicon filter), Recycle Bin, a redesigned Export (Linkivo backup, Web page, Print, Excel, CSV, JSON, text, Markdown, bookmarks, OPML), a rebuilt Menu page and account-synced settings are in place on top of the v2.1 foundation. A link Preview (page, video, photo, screenshot, details), one global search, a dead-link checker and the Web Share Target are new in v2.3.0. Random, security and the full README arrive in v2.4.0 to v2.6.0.

## Repository layout

| Path | What it is |
|---|---|
| `index.html`, `sw.js`, `app.json`, `firebase.json` | app shell, service worker, app info, hosting and database config |
| `css/`, `js/`, `assets/` | the app (split by page and function) |
| `@ Creator/` | project plan, rules, docs, tools and the AI build workflow (start with `PLAN-v2.0_to_v2.5.md`) |
| `@ Versions/` | one zip per released version (local only, not pushed to GitHub) |
