# Linkivo v2: Design System

Mobile-first, compact and clean, responsive up to PC. It must NOT look like a typical AI-generated website.
No emojis anywhere. Icons only (one consistent inline-SVG icon set, `js/ui/icons.js`, outline style, 1.75px stroke, 24px grid, drawn or adapted so every icon is available offline).

## 1. Identity

Subject: a personal link library, a place for hundreds or thousands of links that you can lock, sort and rediscover.
Brand mark (`assets/brand/logo.svg`): a padlock whose body is two chain rings joined by a bar, blue to cyan gradient. Wordmark: "linkivo" in Outfit with gradient dots on the two i's.
The memorable thing: **the ring**. Rings frame the avatar, show progress (import, uploads, loading), mark the active nav item and shape the loader. Everything else stays quiet.
Use the brand gradient (`#3b82f6` to `#22d3ee`) only for the logo, the ring progress and one primary moment per screen. Do not use gradient washes as decoration.

## 2. Tokens (declare in `css/core/tokens.css`)

Light: `--bg #eef2f8`, `--surface #ffffff`, `--surface-2 #f4f7fb`, `--line #d6dfed`, `--text #0c1629`, `--sub #566d8a`.
Dark: `--bg #060d1a`, `--surface #0b1730`, `--surface-2 #0f1f3d`, `--line #17294a`, `--text #d4e6f6`, `--sub #7f9bb8`.
Accent (user choice, default blue): blue `#3b82f6`, emerald `#10b981`, violet `#8b5cf6`, rose `#f43f5e`, amber `#f59e0b`, slate `#64748b`. Status: success `#10b981`, warning `#f59e0b`, danger `#ef4444`.
Folder colors: a curated palette of 12 (not arbitrary pickers only).
Spacing scale 4px (4, 8, 12, 16, 20, 24, 32). Radius scale with meaning: controls 10px, list groups 14px, sheets and panels 22px, pills and rings full. Do not apply one radius to everything.
Elevation: almost flat. Use 1px lines and surface tone changes first; shadows only for floating things (bottom bar, popovers, sheets).
Density: compact by default (44px minimum touch target, 36px compact rows with 44px hit areas); a "comfortable" option raises padding.
Theme: system by default, user override. Respect `prefers-reduced-motion`. Keep contrast AA.

## 3. Typography

Three roles, clearly different, loaded from Google Fonts with `display=swap` and real fallback stacks (cached by the service worker; self-hosting is an optional v2.6.0 improvement):
- **Outfit** (600 to 700): brand, page titles, big numbers.
- **Figtree** (400 to 600): all interface text.
- **JetBrains Mono** (400 to 500): URLs, domains, IDs, counts in details views.
Scale (px): 11, 12, 13 (body in lists), 14 (default body), 16, 20, 26, 34. Sentence case everywhere.
Do not use all-caps tracked labels, do not accent one word of a heading, do not add eyebrow labels above content, do not number things that are not a sequence.
Keep line length under 80 characters in reading areas (docs, terms, details).

## 4. Layout and components

- Dense lists beat cards: link rows are divided by 1px lines, not boxed cards. Folders may be tiles in grid view: a colored tab edge like a physical folder, icon, name, count, relative time.
- Every list has loading skeletons, an empty state that tells the user what to do next (verb-first button), and an error state that says what failed and how to fix it. Errors never apologize.
- Horizontally scrollable bars (filters, tabs, chips) always have edge fade masks.
- Bottom bar (mobile): floating glass pill, 5 items, center Import is the only filled button; active item gets the ring marker; hides on scroll down and returns on scroll up (transform + opacity, 200 to 260 ms, no layout shift). Respect `env(safe-area-inset-bottom)`.
- Sidebar (PC): 264px expanded, 72px collapsed, smooth width transition, tooltips when collapsed, theme toggle and profile badge pinned at the bottom.
- Sheets (mobile) become centered dialogs or right panels on PC. Every overlay registers a back-layer (see ARCHITECTURE section 7).
- Toasts: minimal, one line, bottom-center above the bottom bar, 2.5 s, never stacked more than two.
- Preview (PC): right-aligned rounded panel, 70 to 80 percent width, YouTube-watch-page feeling: large media area, compact info and actions beside or below. Mobile: full screen.
- Export popup: format picker as a compact list with a short description each (the native Linkivo backup is first and marked recommended), then scope and options in one scrollable view (not a wizard), a live preview of the first few output lines, and one primary button. Remember the last used options per format.
- Task chip: small ring-progress chip for minimized uploads/jobs, above the bottom bar (mobile) or bottom-right (PC); tapping reopens details.
- Words: write from the user's side, plain verbs, same action name everywhere ("Save links" then toast "Links saved"). No filler, no marketing tone, no clever errors.

## 5. Motion

Motion answers an action (open, expand, confirm) or marks one moment (the splash). No scattered entrance animations on every section, no hover transitions on everything.
Durations: micro 120 ms, standard 200 ms, large 320 ms. Easing `cubic-bezier(0.2, 0, 0, 1)`. Animate transform and opacity only. Lists with 100+ rows must not animate per row.

## 6. Splash (v2.1.0)

Reference: `@ Creator/reference/splash-screen-v21.html` (v1 timeline is about 10 s, far too long).
New spec:
- Logo animation only (shackle draws, left ring, bar, right ring); wordmark fades in. NO url badges, no spiral, no replay/theme buttons, no fake dashboard skeleton, no hard-coded version text.
- Logo scaled to about `min(38vw, 200px)`.
- Target 1.2 to 1.8 s; hard maximum 2.5 s. Overlap the stages instead of running them in sequence.
- It ends when the app is ready (auth state resolved and first route mounted). If the app is still loading after the animation, show separate **loading dots** under the logo; never extend the animation itself.
- First run may play the animation fully; later launches play a shorter fade-in of the finished logo (about 0.6 s). Reduced motion: skip to the finished logo.
- Colors from the theme tokens, background `--bg`. Use `assets/brand/text-dark.svg` / `text-white.svg` for the wordmark (these use Outfit; wait for the font or inline outlines).

## 7. Icons and brand files

- Icons for the PWA are generated from `assets/brand/logo.svg` on a **white background** by `@ Creator/tools/make-icons.mjs` into `assets/icons/` (192, 512, maskable 512, apple-touch 180, favicon 32/48/ico/svg, OG image). Wherever a background is required, use white.
- Folder category icon set (about 40, outline): folder, star, heart, bookmark, book, graduation, briefcase, code, terminal, palette, image, video, music, game, news, shopping, finance, health, food, travel, map, home, tool, flask, cpu, cloud, shield, lock, globe, chat, mail, calendar, clock, flag, fire, bulb, gift, user, users, mosque.

## 8. Anti-template checklist (review before shipping each version)

- Does any screen look like the same rounded card repeated with the same soft shadow? Replace with lists, lines and tone changes.
- Any gradient wash, eyebrow label, all-caps tracked label, "word - fragment" label, arrow appended to every link, or middle-dot-joined meta string? Remove.
- Is there exactly one memorable element per screen, and is the rest quiet?
- Are empty, loading and error states designed?
- Does it work with one thumb on a 360px wide phone, in dark and light, with reduced motion?

## 9. Changes agreed in v2.1.1 (override the sections above where they differ)
- Splash: the owner's original logo animation (not a 1.5 s logo-only version); modes full / short / still; URL badges removed; version badge shows the real version.
- Sidebar: no filled background, 272px / 80px, 54px rows, 24px icons; expanded active row fully highlighted, collapsed active icon in a rounded square; profile badge = avatar + name + masked email + three dots (collapsed: avatar only); logo behavior as in CONTEXT.
- Login: side panel with the chain pattern (thin rings with a small shackle, like the logo), white logo tile, four-point overview; one compact form column; theme switch; terms agreement on sign-up.
- Pages are centred, max 1040px. Settings: one page with category headings. About / Developer / legal blocks replace the old app-details layout.
- Add links uses the plus icon. Icons and art are SVG files in assets/.
