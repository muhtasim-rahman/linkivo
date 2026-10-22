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

## 6. Splash (v2.1.2)

Reference: `@ Creator/reference/splash-screen-v21.html` (the owner's v1 animation). v2.1.0 dropped it almost completely; the owner asked for it back in v2.1.2.
Spec:
- The v1 **logo-creation animation**: ripple, left ring pops and draws, shackle locks with sparkles and a shake while the tinted background grows from the ring, bar draws, second ring with its own ripple, wordmark types in (the two i-dots pop), tagline. NO url badges, no shrink, no spiral, no replay/theme buttons, no hard-coded version text.
- Timeline about 3.2 s (v1 was about 10 s with the url badges). Colors come from the brand variables (`--brand-a`, `--brand-b`), so the splash follows the accent color.
- Modes (`js/features/splash/splash.js`, setting "Start animation": Automatic | Always full | Short): **full** on the very first start (Automatic), **short** afterwards (finished logo fades in, about 0.6 s), **still** under reduced motion. Automatic = full once, then short.
- It ends when BOTH the animation and the app are ready (auth resolved, first route mounted). If loading outlasts it, separate **loading dots** appear; the animation itself is never extended.
- Markup is inline in `index.html` (animated SVG driven by script, allowed by RULES section 9); styles in `css/pages/splash.css`.
- Installed app: the operating system shows its own splash first (background color + icon from the manifest). A web page cannot remove it; `icon-384.png`/`icon-512.png` keep it sharp and `background_color` is white to match the icon tile. Our splash takes over as soon as the page paints.

## 6b. Chrome, login and settings (v2.1.2)

- **Sidebar** (no background, no divider). Collapsed: rounded-square icon buttons, the logo turns into an expand icon on hover; the active item is a rounded square. Expanded: full rows (icon and text), logo and name open the Library, hovering the logo does nothing. Import links uses the plus icon and is the filled accent item. Profile: collapsed = round avatar; expanded = outlined badge with avatar, name, masked email and a three-dot menu that opens and closes with the same button.
- **Wide screens**: the sidebar is fixed on the left; page content is centred (`max-width` 960, settings 1080) in the space that remains.
- **Pages** fade and rise in (240 ms, `.page-enter`), no exit animation; every new page starts at its top. A theme change glides for 320 ms (`theme-anim`).
- **Brand follows the accent**: logo mark (CSS mask of `assets/brand/logo-mark.svg`) and wordmark use `--brand-a`/`--brand-b`.
- **Login**: wide screens = art-and-overview column (rings that repeat the logo, thin and light; highlights) + compact form column; phones = one compact column that fits without scrolling. White rounded logo tile, theme switch always visible, Terms and Privacy agreement required to create an account.
- **Settings**: one page, a heading per category; wide screens get a sticky category list that follows the scroll. Row title and description are always on separate lines.
- **Artwork** lives in `assets/art/*.svg` and is painted with the brand gradient through a CSS mask (`.empty-art`).

## 7. Icons and brand files

- Icons for the PWA are generated from `assets/brand/logo.svg` on a **white background** by `@ Creator/tools/make-icons.mjs` into `assets/icons/` (192, 512, maskable 512, apple-touch 180, favicon 32/48/ico/svg, OG image). Wherever a background is required, use white.
- Folder category icon set (about 40, outline): folder, star, heart, bookmark, book, graduation, briefcase, code, terminal, palette, image, video, music, game, news, shopping, finance, health, food, travel, map, home, tool, flask, cpu, cloud, shield, lock, globe, chat, mail, calendar, clock, flag, fire, bulb, gift, user, users, mosque.

## 8. Anti-template checklist (review before shipping each version)

- Does any screen look like the same rounded card repeated with the same soft shadow? Replace with lists, lines and tone changes.
- Any gradient wash, eyebrow label, all-caps tracked label, "word - fragment" label, arrow appended to every link, or middle-dot-joined meta string? Remove.
- Is there exactly one memorable element per screen, and is the rest quiet?
- Are empty, loading and error states designed?
- Does it work with one thumb on a 360px wide phone, in dark and light, with reduced motion?
