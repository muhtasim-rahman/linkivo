# Linkivo

A fast, private link manager (PWA). Plain JavaScript, Firebase and a Cloudflare Worker, all on free tiers.

- App: https://linkivo.web.app
- Developer: Muhtasim Rahman, https://mdturzo.web.app

**Status:** v2.1.3 (foundation and shell, polish): sign-in and guest mode, navigation, one-page settings, self-updating app, data engines, database rules and the metadata Worker are in place. Library, import and the rest arrive in v2.2.0 to v2.6.0; the full README arrives with v2.6.0.

## Repository layout

| Path | What it is |
|---|---|
| `index.html`, `sw.js`, `app.json`, `firebase.json` | app shell, service worker, app info, hosting and database config |
| `css/`, `js/`, `assets/` | the app (split by page and function) |
| `@ Creator/` | project plan, rules, docs, tools and the AI build workflow (start with `PLAN-v2.0_to_v2.5.md`) |
| `@ Versions/` | one zip per released version |
