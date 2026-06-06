<div align="center">
  <img src="assets/svg/icon.svg" width="80" height="80" alt="Linkivo Icon">

  # Linkivo
  ### Smart Link Manager · v1.4.5

  **Save, organize, and randomly discover links — smarter.**

  [![Firebase](https://img.shields.io/badge/Firebase-10.x-orange?logo=firebase)](https://firebase.google.com)
  [![PWA](https://img.shields.io/badge/PWA-ready-blue?logo=googlechrome)](https://web.dev/progressive-web-apps)
  [![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
  [![Version](https://img.shields.io/badge/version-v1.4.5-violet)](https://linkivo.web.app)

  [Live App](https://linkivo.web.app) · [Report Bug](https://github.com/yourusername/linkivo/issues) · [Contact](mailto:linkivo.web@gmail.com)
</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📥 **Universal Import** | Import links from TXT, PDF, HTML, JSON, CSV, ZIP, Image (OCR), Bookmarks, Markdown |
| 📁 **Smart Folders** | Color-coded folders with custom icons (preset + imgbb upload), PIN lock, search/filter |
| 🔀 **Weighted Random Discover** | Point-based random opener — likes, stars, and history influence probability |
| 🎯 **Point System** | Like (+50), Dislike (−40), Star (+100), open-count decay affects discovery weight |
| 📺 **Embedded Preview** | iframe → og:image → favicon fallback chain with live status indicator |
| 🗑️ **Full-page Recycle Bin** | 30-day soft delete with search, multi-select, bulk restore/delete |
| 📜 **History** | Date-grouped with search, 2s undo delete, 5s undo clear-all, locked folder protection |
| 🔒 **Dual PIN Lock** | 4-digit app lock (Firebase synced) + 6-digit per-folder PIN |
| 📤 **Export** | JSON, CSV, PDF, HTML Bookmarks, Markdown, Print |
| 🌙 **Dark / Light Mode** | Full theming with 5 accent colors and 3 font sizes |
| 📱 **PWA** | Install as native app, offline-first via Service Worker |
| ☁️ **Real-time Sync** | Firebase Realtime Database with full settings sync across devices |
| 🔍 **Global Search** | Cross-folder search with keyboard navigation (Ctrl+K) |
| 🖼️ **Grid Thumbnails** | Lazy-loaded og:image previews in grid view, saved to Firebase |
| 🔗 **Path Routing** | Clean URLs: `/random` `/history` `/settings` `/folder/:id` |
| 📋 **Paste Import** | Inline paste textarea with clipboard button — no separate tab needed |

---

## 🗂️ Project Structure

```
linkivo/
├── index.html              ← Single HTML entry point (SPA shell)
├── app.json                ← App config (name, version, features)
├── manifest.json           ← PWA manifest (portrait orientation locked)
├── sw.js                   ← Service Worker (stale-while-revalidate, NEVER_CACHE list)
├── firebase.json           ← Firebase hosting (cache headers, rewrites)
├── firebase-config.js      ← 🔒 Firebase credentials (gitignored, never cached by SW)
├── firebase-config.example.js
├── assets/
│   ├── css/
│   │   ├── variables.css   ← Design system tokens
│   │   ├── base.css        ← Global reset, mobile UX fixes
│   │   ├── components.css  ← Buttons, modals, PIN dots, toasts
│   │   ├── nav.css         ← Sidebar, bottom nav, More sheet
│   │   ├── auth.css        ← Auth pages (scroll-safe on mobile)
│   │   ├── folder.css      ← Folder cards, icon picker, toolbar
│   │   ├── links.css       ← Link list/grid, thumbnails
│   │   ├── import.css      ← Import modal, paste section
│   │   ├── random.css      ← Random discover page
│   │   ├── history.css     ← History page, recycle bin
│   │   └── settings.css    ← Settings page
│   ├── js/
│   │   ├── config.js       ← Loads app.json
│   │   ├── firebase-init.js← Firebase SDK init
│   │   ├── router.js       ← Path-based SPA router + modal back-button
│   │   ├── utils.js        ← toast, modal, PIN dialog, imgbb upload, compressImage
│   │   ├── auth.js         ← Auth logic
│   │   ├── app.js          ← Boot, sidebar, profile sheet, app lock
│   │   ├── folders.js      ← Folder CRUD, home page, icon picker
│   │   ├── links.js        ← Link CRUD, folder view, recycle bin page
│   │   ├── import.js       ← 13-format import engine
│   │   ├── random.js       ← Weighted random, domain filter, preview
│   │   ├── history.js      ← History page, undo delete
│   │   └── settings.js     ← Full settings (all Firebase-synced)
│   └── svg/
│       ├── icon.svg        ← App icon (used in splash, favicon, sidebar)
│       ├── logo-gradient.svg ← Full logo with gradient (light + dark compatible)
│       ├── logo-light.svg  ← Legacy light mode logo
│       └── logo-dark.svg   ← Legacy dark mode logo
└── docs/
    ├── privacy.html
    ├── terms.html
    └── docs.html
```

---

## 🚀 Setup

### Prerequisites
- Modern browser (Chrome 90+, Firefox 88+, Safari 14+)
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A Firebase project (free Spark plan works)

### 1. Clone & Configure

```bash
git clone https://github.com/yourusername/linkivo.git
cd linkivo
cp firebase-config.example.js firebase-config.js
# Edit firebase-config.js with your Firebase project credentials
```

### 2. Firebase Setup

**Realtime Database Rules:**
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

**Authentication:** Enable Google + Email/Password in Firebase Console → Authentication.

### 3. Run Locally

```bash
firebase serve
# or
npx serve .
# or
python3 -m http.server 5000
```

Open: `http://localhost:5000`

> **Note:** `firebase-config.js` is never cached by the Service Worker (NEVER_CACHE list) and always fetched live. A missing or invalid config shows a setup-required screen instead of a stuck loading screen.

### 4. Deploy

```bash
firebase login
firebase deploy --only hosting
```

---

## 🎨 Design System

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#3b82f6` | Primary blue |
| `--secondary` | `#22d3ee` | Cyan accent |
| `--gradient` | `135deg, #3b82f6 → #22d3ee` | Brand gradient |
| `--font-ui` | `Outfit, DM Sans` | All UI text |
| `--r-md` | `12px` | Standard border radius |

**Accent themes:** Blue, Purple, Green, Orange, Rose  
**Font sizes:** Small, Medium, Large

---

## 🎯 Point System

| Action | Effect |
|--------|--------|
| Base | 100 pts |
| Like | +50 pts |
| Dislike | −40 pts |
| Star / Favourite | +100 pts |
| Blocked | 0 pts (excluded from random) |
| Open count > 10 | ×max(0.4, 1−(n−10)×0.02) decay |

Higher points = higher probability of being picked in Random Discover.

---

## 🔒 Security

- **firebase-config.js** is gitignored and excluded from the Service Worker cache — it's always fetched live with `no-cache, no-store` headers.
- **Folder PIN** (6-digit): session-based unlock. Locked folders never put real data in the DOM.
- **App PIN** (4-digit): stored in Firebase (`users/{uid}/settings/appPin`) and synced across devices. 4-digit auto-submits on last digit. No password manager interference.
- **Sensitive actions** (logout, reset settings, delete account) require PIN confirmation.

---

## 📦 Supported Formats

**Import:** `TXT` `PDF` `HTML` `JSON` `CSV` `ZIP` `PNG` `JPG` `JPEG` `WEBP` `Bookmarks` `HTM` `MD`  
**Export:** `JSON` `CSV` `PDF` `HTML Bookmarks` `Markdown` `Print`

---

## 📋 Changelog

| Version | Date | Highlights |
|---------|------|-----------|
| v1.0.0 | 2026-03-27 | Initial release (React + Vite + TS) |
| v1.1.0 | 2026-03-28 | Advanced random, quick import, history, export |
| v1.2.0 | 2026-03-28 | Dark mode fix, JSON import, folder→random |
| v1.3.0 | 2026-03-29 | **Full rewrite: React → pure HTML/CSS/JS** |
| v1.4.0 | 2026-03-29 | Advanced URL detection, global search, accent themes |
| v1.4.2 | 2026-03-31 | App lock, sidebar, import engine, recycle bin |
| v1.4.3 | 2026-03-31 | Page overlap fix, sidebar logo toggle, PIN security |
| v1.4.4 | 2026-04-01 | SW update propagation, splash fix, locked folder DOM security |
| **v1.4.5** | 2026-04-05 | SW clone fix, firebase-config MIME fix, loading animation, path routing, full-page recycle bin, folder redesign, grid thumbnails, domain filter, history undo, 4-digit PIN + Firebase sync, imgbb icons, import paste merged, all settings Firebase-synced |

---

## 🛠️ Architecture

- **Single HTML file** — all pages loaded via JS modules, zero bundler
- **ES Modules** — native browser modules
- **Firebase Realtime Database** — all user data stored per-UID
- **Service Worker** — stale-while-revalidate for JS/CSS, network-first for HTML, NEVER_CACHE for secrets
- **Path routing** — `/random` `/history` `/settings` `/folder/:id` with History API
- **Back button** — closes modals before navigating (Router.pushModal)
- **imgbb** — custom icon and profile photos uploaded via Cloudflare Worker proxy (API key never exposed)

---

## 📄 License

MIT © 2026 Linkivo

---

<div align="center">
  Made with ❤️ by <a href="mailto:linkivo.web@gmail.com">Linkivo</a> ·
  <a href="https://linkivo.web.app">linkivo.web.app</a>
</div>
