# Linkivo

A fast, private link manager (PWA). Plain JavaScript, Firebase and a Cloudflare Worker, all on free tiers.

- App: https://linkivo.web.app
- Developer: Muhtasim Rahman, https://mdturzo.web.app

**Status:** v2.2.2 (library and import, refined; account and devices): folders, links, bulk actions with Undo, a full Import page (paste or files, domain switches, favicon filter), Recycle Bin, a redesigned Export (Linkivo backup, Web page, Print, Excel, CSV, JSON, text, Markdown, bookmarks, OPML), a rebuilt Menu page and account-synced settings are in place on top of the v2.1 foundation. Preview, search, Random, security and the full README arrive in v2.3.0 to v2.6.0.

## Repository layout

| Path | What it is |
|---|---|
| `index.html`, `sw.js`, `app.json`, `firebase.json` | app shell, service worker, app info, hosting and database config |
| `css/`, `js/`, `assets/` | the app (split by page and function) |
| `@ Creator/` | project plan, rules, docs, tools and the AI build workflow (start with `PLAN-v2.0_to_v2.5.md`) |
| `@ Versions/` | one zip per released version |
