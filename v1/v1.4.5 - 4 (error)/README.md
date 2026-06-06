<div align="center">
  <img src="assets/svg/icon.svg" width="72" height="72" alt="Linkivo">

  # Linkivo
  ### Smart Link Manager · v1.4.5

  **Save, organize, and randomly discover links — smarter.**

  [![Firebase](https://img.shields.io/badge/Firebase-10.x-orange?logo=firebase)](https://firebase.google.com)
  [![PWA](https://img.shields.io/badge/PWA-ready-blue?logo=googlechrome)](https://web.dev/progressive-web-apps)
  [![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

  [Live Demo](https://linkivo.web.app) · [Report Bug](mailto:linkivo.web@gmail.com) · [Contact](mailto:linkivo.web@gmail.com)
</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| **Universal Import** | TXT, PDF, HTML, JSON, CSV, ZIP, Image (OCR), Bookmarks, MD — 13 formats |
| **Smart Folders** | PIN-locked, custom icons (FA + imgbb upload), descriptions, tags, search |
| **Random Discover** | Weighted random engine with domain filter, options panel, preview |
| **Point System** | Like/Dislike/Favourite links to influence discovery probability |
| **Embedded Preview** | iframe → og:image → favicon fallback with status indicator |
| **Recycle Bin** | Full-page view, 30-day soft delete, multi-select restore/delete |
| **History** | Full history, 2s undo delete, 3-dot menu, locked-folder protection |
| **Global Search** | Ctrl+K cross-folder search with scroll-to + highlight |
| **Export** | JSON, CSV, PDF, HTML Bookmarks, Markdown, Print |
| **Dark Mode** | Full light/dark theme + 5 accent colours + font size |
| **App Lock** | 4-digit PIN, Firebase-synced, auto-lock timer (1min–1hr) |
| **Folder Lock** | 6-digit PIN per folder, secure (no DOM data when locked) |
| **PWA** | Install on mobile & desktop, works offline |
| **Firebase Auth** | Google + Email/Password authentication |
| **Real-time Sync** | All data + settings synced via Firebase Realtime Database |

---

## 🆕 What's New in v1.4.5

- **Splash screen removed** — no more stuck loading screen
- **Path-based routing** — `/settings` instead of `#settings`
- **Global search** — Ctrl+K, cross-folder, highlight on result click
- **Recycle Bin** — full page (was popup) with search + multi-select
- **Random Discover** — v1.4.2 layout restored + domain filter dropdown
- **Import** — Paste tab restored with Clipboard button + state saved on close
- **Profile** — enriched with stats, account info, photo upload, quick actions
- **Profile photo** — imgbb upload via Cloudflare Worker, 1:1 crop
- **Folder cards** — premium design, equal height, random button, custom icons
- **App PIN** — 4-digit, Firebase-synced, auto-verify on last digit
- **History** — 2s undo delete, 5s clear-all undo, 3-dot menu
- **Settings** — all prefs now Firebase-synced, Forgot PIN via mailto
- **PWA icons** — solid primary-colour gradient background
- **Mobile** — portrait lock, hover-state fix, back-button closes modals

---

## 🏗️ Project Structure

```
linkivo/
├── index.html              ← Single HTML entry point (SPA shell)
├── app.json                ← App config (name, version, features)
├── manifest.json           ← PWA manifest (portrait, icons)
├── sw.js                   ← Service Worker (v1.4.5 safe cache)
├── firebase.json           ← Firebase hosting config
├── .firebaserc             ← Firebase project aliases
├── firebase-config.js      ← 🔒 Firebase credentials (gitignored)
├── firebase-config.example.js
├── favicon.ico             ← PWA favicon
├── assets/
│   ├── css/
│   │   ├── variables.css   ← Design system tokens
│   │   ├── base.css        ← Global reset + profile/search styles
│   │   ├── components.css  ← Buttons, cards, modals, toasts
│   │   ├── nav.css         ← Sidebar + bottom navigation
│   │   ├── auth.css        ← Authentication pages
│   │   ├── folder.css      ← Folder cards (premium v1.4.5)
│   │   ├── links.css       ← Link cards + thumbnails
│   │   ├── import.css      ← Import modal
│   │   ├── random.css      ← Random discover (split layout)
│   │   ├── history.css     ← History + Recycle Bin page
│   │   └── settings.css    ← Settings page
│   ├── js/
│   │   ├── app.js          ← Boot, auth, profile, app lock
│   │   ├── router.js       ← Path-based SPA router
│   │   ├── config.js       ← Loads app.json
│   │   ├── firebase-init.js← Firebase SDK + DB path helpers
│   │   ├── auth.js         ← Auth logic + UI
│   │   ├── utils.js        ← Toast, modal, PIN dialog, theme
│   │   ├── folders.js      ← Folder CRUD + icon picker + search
│   │   ├── links.js        ← Link CRUD + RecycleBinModule
│   │   ├── import.js       ← 13-format import engine
│   │   ├── random.js       ← Weighted random + domain filter
│   │   ├── history.js      ← History page + undo delete
│   │   └── settings.js     ← Settings page (all Firebase-synced)
│   ├── icons/              ← PWA icons (72–512px, gradient bg)
│   └── svg/
│       ├── icon.svg        ← Gradient chain-link logo (everywhere)
│       ├── text-dark.svg   ← "linkivo" wordmark (light bg)
│       └── text-white.svg  ← "linkivo" wordmark (dark bg)
└── docs/
    ├── docs.html           ← Documentation
    ├── privacy.html        ← Privacy Policy
    └── terms.html          ← Terms of Service
```

---

## 🚀 Quick Start

### Prerequisites
- Modern browser (Chrome 90+, Firefox 88+, Safari 14+)
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A Firebase project (free Spark plan works)

### 1. Clone & Configure

```bash
git clone https://github.com/yourusername/linkivo.git
cd linkivo

# Copy and fill in your Firebase credentials
cp firebase-config.example.js firebase-config.js
# Edit firebase-config.js with your project values
```

### 2. Firebase Setup

**Realtime Database Rules** (Firebase Console → Realtime Database → Rules):
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read":  "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

**Authentication** (Firebase Console → Authentication → Sign-in methods):
Enable: **Google** and **Email/Password**

### 3. Run Locally

```bash
firebase serve
# or
npx serve .
# Open http://localhost:5000
```

### 4. Deploy

```bash
firebase login
firebase deploy --only hosting
```

---

## 🔑 Firebase Configuration

`firebase-config.js` is gitignored — never commit credentials.

```js
const firebaseConfig = {
  apiKey:            "...",
  authDomain:        "...",
  projectId:         "...",
  storageBucket:     "...",
  messagingSenderId: "...",
  appId:             "...",
  measurementId:     "...",
  databaseURL:       "..."
};
export default firebaseConfig;
```

---

## 🖼️ imgbb + Cloudflare Worker Setup

Folder icons and profile photos are uploaded to **imgbb** via a **Cloudflare Worker** proxy that keeps the API key server-side.

**Worker endpoint**: `https://linkivo.programs-turzo.workers.dev/`

The worker accepts `multipart/form-data` with fields `image` (file) and `name` (filename), forwards to imgbb, and returns the imgbb JSON response.

**imgbb naming convention** (free plan has no folders):
- Folder icons: `linkivo_folder_icon_{uid}_{folderName}_{timestamp}`
- Profile photos: `linkivo_profile_photo_{uid}_{timestamp}`

---

## 🎨 Design System

Linkivo uses CSS custom properties defined in `variables.css`:

| Token | Value | Usage |
|---|---|---|
| `--primary` | `#3b82f6` | Primary blue |
| `--secondary` | `#22d3ee` | Cyan accent |
| `--gradient` | `135deg, #3b82f6→#22d3ee` | Brand gradient |
| `--font-ui` | Outfit + DM Sans | UI text |
| `--r-md` | `12px` | Standard radius |
| `--sidebar-w` | `240px` | Expanded sidebar |
| `--sidebar-w-coll` | `60px` | Collapsed sidebar |

**Accent themes**: blue, purple, green, orange, rose

---

## 🧠 Architecture Notes

- **Single HTML file** (`index.html`) — all pages loaded via JS
- **ES Modules** — native browser modules, no bundler needed
- **Path-based routing** — `/settings`, `/history`, `/folder/:id`
- **Firebase Realtime DB** — all data per user UID
- **Service Worker** — stale-while-revalidate for JS/CSS, network-first for HTML
- **No frameworks** — pure HTML, CSS, JS

---

## 📋 Version History

| Version | Date | Summary |
|---|---|---|
| v1.0.0 | 2026-03-27 | Initial release |
| v1.1.0 | 2026-03-28 | Quick import, advanced random, history, export |
| v1.2.0 | 2026-03-28 | Dark mode fix, JSON import, folder random button |
| v1.3.0 | 2026-03-29 | Full PWA rebuild (5 steps) |
| v1.4.0 | 2026-03-29 | Global search, advanced URL detection, full settings |
| v1.4.2 | 2026-03-31 | Complete overhaul — import/export, random, PWA |
| v1.4.3 | 2026-03-31 | Page switching fix, sidebar toggle, PIN security |
| v1.4.4 | 2026-04-01 | Cache update, tab routing, sidebar UX, secure lock |
| v1.4.5 | 2026-04-06 | Full overhaul — see What's New above |

---

## 📄 License

MIT © 2026 Linkivo

---

<div align="center">
  Made with care · <a href="https://linkivo.web.app">linkivo.web.app</a> · <a href="mailto:linkivo.web@gmail.com">linkivo.web@gmail.com</a>
</div>
