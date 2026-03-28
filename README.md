<div align="center">
  <img src="assets/svg/icon.svg" width="80" height="80" alt="Linkivo Icon">

  # Linkivo
  ### Smart Link Manager · v1.0.0

  **Save, organize, and randomly discover links — smarter.**

  [![Firebase](https://img.shields.io/badge/Firebase-10.x-orange?logo=firebase)](https://firebase.google.com)
  [![PWA](https://img.shields.io/badge/PWA-ready-blue?logo=googlechrome)](https://web.dev/progressive-web-apps)
  [![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

  [Live Demo](https://linkivo.web.app) · [Report Bug](https://github.com/yourusername/linkivo/issues) · [Request Feature](https://github.com/yourusername/linkivo/issues)
</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 📥 **Universal Import** | Import links from TXT, PDF, HTML, JSON, CSV, ZIP, Image (OCR), Bookmarks & more |
| 📁 **Smart Folders** | Organize links in folders with PIN-lock, rename, pin, and delete |
| 🔀 **Random Discover** | Weighted random link opener with point-based scoring |
| 🎯 **Point System** | Like/Dislike/Favourite links to influence discovery probability |
| 📺 **Embedded Preview** | View pages inside the app without leaving |
| ♻️ **Recycle Bin** | 30-day soft delete with restore or permanent delete |
| 📜 **History** | Full history of opened links with actions |
| 🔒 **Folder Lock** | 6-digit PIN protection for sensitive folders |
| 📤 **Export** | Export to JSON, CSV, PDF, HTML Bookmarks, or Print |
| 🌙 **Dark Mode** | Full light/dark theme with system preference |
| 📱 **PWA** | Install as a native app on mobile & desktop |
| 🔌 **Offline First** | Service Worker caches app shell for offline use |
| 🔐 **Firebase Auth** | Google + Email/Password authentication |
| ☁️ **Real-time Sync** | All data synced via Firebase Realtime Database |

---

## 🏗️ Project Structure

```
linkivo/
├── index.html              ← Single HTML entry point
├── app.json                ← App config (name, version, features, etc.)
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service Worker (offline support)
├── firebase.json           ← Firebase hosting config
├── .firebaserc             ← Firebase project aliases
├── firebase-config.js      ← 🔒 Firebase credentials (gitignored)
├── firebase-config.example.js
├── .gitignore
├── assets/
│   ├── css/
│   │   ├── variables.css   ← Design system tokens (colors, spacing, etc.)
│   │   ├── base.css        ← Global reset & app shell layout
│   │   ├── components.css  ← Shared UI: buttons, cards, modals, toasts
│   │   ├── nav.css         ← Sidebar & bottom navigation
│   │   ├── auth.css        ← Authentication pages
│   │   ├── home.css        ← Folder manager page
│   │   ├── folder.css      ← Folder view & links list
│   │   ├── links.css       ← Link cards
│   │   ├── random.css      ← Random discover page
│   │   ├── history.css     ← History page
│   │   └── settings.css    ← Settings page
│   ├── js/
│   │   ├── config.js       ← Loads app.json config
│   │   ├── firebase-init.js← Firebase SDK init & DB path helpers
│   │   ├── auth.js         ← Auth logic + UI controller
│   │   ├── router.js       ← Client-side SPA router
│   │   ├── utils.js        ← Shared utilities (toast, modal, theme, etc.)
│   │   └── app.js          ← Main entry point
│   ├── svg/
│   │   ├── icon.svg        ← App icon (standalone)
│   │   ├── logo-light.svg  ← Full logo (light mode)
│   │   └── logo-dark.svg   ← Full logo (dark mode)
│   └── icons/              ← PWA icons (72, 96, 128, 192, 512px)
└── docs/                   ← Documentation assets
```

---

## 🚀 Development Setup

### Prerequisites
- Modern browser (Chrome 90+, Firefox 88+, Safari 14+)
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A Firebase project (free Spark plan is sufficient)

### 1. Clone & Configure Firebase

```bash
git clone https://github.com/yourusername/linkivo.git
cd linkivo

# Copy and fill in your Firebase credentials
cp firebase-config.example.js firebase-config.js
# Edit firebase-config.js with your project's values
```

### 2. Firebase Setup (Realtime Database Rules)

In Firebase Console → Realtime Database → Rules:
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

In Firebase Console → Authentication → Sign-in methods, enable:
- **Google**
- **Email/Password**

### 3. Run Locally

```bash
# Using Firebase CLI (recommended)
firebase serve

# Or use any static server
npx serve .
python3 -m http.server 5000
```

Open: `http://localhost:5000`

### 4. Deploy to Firebase Hosting

```bash
firebase login
firebase deploy --only hosting
```

---

## 🎨 Design System

Linkivo uses a CSS custom property (variable) based design system defined in `variables.css`.

| Token | Value | Usage |
|---|---|---|
| `--primary` | `#3b82f6` | Primary blue |
| `--secondary` | `#22d3ee` | Cyan accent |
| `--gradient` | `135deg, #3b82f6 → #22d3ee` | Brand gradient |
| `--font-ui` | Outfit + DM Sans | UI text |
| `--r-md` | `12px` | Standard border radius |

---

## 🔑 Environment Variables

**Never commit `firebase-config.js`** — it is gitignored.

All sensitive values live only in `firebase-config.js`:
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
```

---

## 📋 Development Roadmap

| Step | Status | Description |
|---|---|---|
| **Step 1** | ✅ Complete | Project foundation, design system, auth, navigation shell |
| **Step 2** | 🔄 Planned | Import engine (10+ formats), folder CRUD, file manager |
| **Step 3** | 🔄 Planned | Links view, sorting/filtering, embedded preview, recycle bin |
| **Step 4** | 🔄 Planned | Random discover engine, history, point system |
| **Step 5** | 🔄 Planned | Settings, export, import, profile, PIN lock, app info |

---

## 🧠 Architecture Notes

- **Single HTML file** (`index.html`) — all pages loaded via JS
- **ES Modules** — native browser modules, no bundler required
- **Firebase Realtime Database** — all user data stored per-UID
- **Service Worker** — app shell cached for offline functionality
- **No frameworks** — pure HTML, CSS, JS for maximum compatibility

---

## 📄 License

MIT © 2025 Linkivo

---

<div align="center">
  Made with ❤️ · <a href="https://linkivo.web.app">linkivo.web.app</a>
</div>
