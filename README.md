# Linkivo

A fast, private link manager (PWA). Plain JavaScript, Firebase and a Cloudflare Worker, all on free tiers.

- App: https://linkivo.web.app
- Developer: Muhtasim Rahman, https://mdturzo.web.app

**Status:** v2.2.0 (library and import): folders, links, bulk actions with Undo, fast resumable import from text and 20+ file types, Recycle Bin and export (Linkivo backup, JSON, CSV, Excel, text, Markdown, bookmarks, printable page, OPML) are in place on top of the v2.1 foundation. Preview, search, Random, security and the full README arrive in v2.3.0 to v2.6.0.

## Repository layout

| Path | What it is |
|---|---|
| `index.html`, `sw.js`, `app.json`, `firebase.json` | app shell, service worker, app info, hosting and database config |
| `css/`, `js/`, `assets/` | the app (split by page and function) |
| `@ Creator/` | project plan, rules, docs, tools and the AI build workflow (start with `PLAN-v2.0_to_v2.5.md`) |
| `@ Versions/` | one zip per released version |
