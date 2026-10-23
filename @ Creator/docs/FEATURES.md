# Linkivo v2: Feature Specification

Source of truth for WHAT the app does. Everything here comes from the product owner (Turzo) unless marked **[proposal]**.
A proposal is the planner's suggestion: show it to the owner at the start of the version that builds it, then freeze it.
Which version builds what: see `PLAN-v2.0_to_v2.5.md`. How it is built: see `ARCHITECTURE.md`. How it looks: see `DESIGN.md`.

Language of the UI: **English only**. No emojis anywhere (icons only). The app is for fully public use.

---

## 1. Modes: account and guest

- Sign-in: Google and email/password (already configured in Firebase). Email/password users get a verification email (soft: the app works, a small banner nags) **[proposal]**.
- **Guest mode.** The login page has a "Visit as guest" button. No account, everything is stored locally on the device (IndexedDB).
  - After pressing it, a popup states clearly: nothing is stored online, everything is fully local, and if app data is cleared nothing can be recovered.
  - Settings and layout may differ for guests (no account, no cloud sync, no server-enforced lock).
  - Settings always shows a "Account and sync" section for guests with a **Log in and sync** button. It creates/logs into an account and moves ALL guest data to it, then leaves nothing in local guest storage.
  - Guest users get periodic backup reminders and the app asks the browser for persistent storage.
- Email addresses shown anywhere in the UI are masked: keep the first 2 and last 2 characters of the part before `@`, replace the middle with `******` (example: `tu******99@gmail.com`).
- Profile picture change is OUT of scope for now (maybe imgbb later).

## 2. Navigation

### Mobile (bottom bar)
Icon-based, light animation, clean. Floating glass effect (blur). Hides on scroll down, returns smoothly on scroll up.
Order left to right: **Library**, **Random Discover**, **Import Links** (center, plus icon, the primary action), **Search**, **Menu**.

### PC (sidebar)
Collapsible sidebar. Items: **Import Links**, **Library**, **Random Discover**, **Search**, **Settings**.
At the bottom: theme toggle (icon only when collapsed; toggle switch with text when expanded) above the profile badge.
Profile badge: expanded = avatar + name + masked email + three-dot; collapsed = avatar only. Click opens the Profile page.
The three-dot opens **Log out** (always asks for confirmation; asks for the app PIN too when the app lock is on).
Header may use the logo SVG and the wordmark SVG (`assets/brand`). PC header design is the designer's call.
History is NOT in the sidebar or menu (it lives inside the Profile page). Recycle Bin is NOT in the sidebar or menu (it lives in Settings).

### Back button and URLs
- Every page has its own URL path (`/library`, `/folder/:id`, `/settings/security`, ...).
- On mobile the back button follows a **defined navigation order (parent chain)**, not the browser history. Overlays (sheets, modals, preview) close first.
- Details and test cases: `ARCHITECTURE.md` section "Router and back logic".

### Mobile Menu page
Top to bottom: profile banner (opens Profile page), link to Settings, app information banner (logo, name, version, short details, features), links to Documentation / Terms / Privacy, developer banner at the very bottom.
On PC the app information and developer banners are placed under Settings for now.

## 3. Library (all folders)

- Folders in grid or list view. Each shows: name, custom color, category icon, link count, last-updated time, three-dot menu.
- A system folder named **Favourites** is always present (virtual: it lists every favourited link across folders).
- Top: a folder-only search bar (compact). On the same line: filter and sort icons.
- Folder three-dot menu: pin to top, rename, change color/icon, import to this folder, export this folder (opens the export popup of section 6b with this folder preselected), delete folder (asks for the PIN on the first folder deletion after login; if no PIN exists, the user types the folder name to confirm), move to vault, and other useful options (duplicate, merge into another folder, select links).
- If any vault folder exists, a small "unlock vault" option sits at the bottom of the page (see section 9; it can be hidden by a setting).

## 4. Folder view (links inside a folder)

- Header: back button, folder color theme, folder icon, folder name.
- Search bar searches only this folder.
- Controls: import links, export links, multi-select (with actions), grid/list toggle, a horizontally scrollable filter-by-domain row, sort-by dropdown, and an important **Random from this folder** button (selects this folder and opens Random Discover).
- On mobile there is not enough room: keep the most used controls visible and move the rest into a three-dot menu.
- Every horizontally scrollable bar has fade effects on both edges.
- Link row shows (compact): favicon, title, URL, domain, added time, points.
- Link three-dot menu: pin, add to favourites, point up (like), point down (dislike), move to another folder, copy to another folder, block from random, copy URL, open in new tab, delete. Plus: tags, read later, edit title.
- Multi-select actions: move, copy, delete, favourite, block, tag, export, select all/none. Bulk actions show an Undo toast.

## 5. Link preview

Opens when a link is clicked, uses the metadata collected by the metadata Worker. Layout is similar to v1.3.0 but cleaner.
- Header: favicon, title, URL. Mobile: full screen, no bottom nav, compact. PC: not full width: a right-aligned rounded panel, layout inspired by YouTube's watch page. A fullscreen icon sits at the top.
- Compact action bar at the bottom; less important actions inside a three-dot menu.
- Tabs in the main area, in this order, only when available:
  1. **Embedded page** (iframe). Many sites block framing. The Worker reports `frameable`; if blocked this tab is not shown (or shows a clear fallback).
  2. **Video** (hidden when no video was found).
  3. **Photo / thumbnail** (first priority image), then **Screenshot**.
  4. **Details** (last): all collected metadata EXCEPT image/video, plus a **log of which engines/platforms were used and which failed**.
- The app remembers the tab the user uses most / used last (local storage) and opens that tab first; if it is unavailable, the next one in order.
- The same preview component is reused inside Random Discover, with an extra icon (at the bottom) to open a new random link.

## 6. Import

Import is a popup (sheet on mobile) with two tabs. It must be nicer, faster and more customizable than v1.

### Tab 1: Paste text
- Any text in any format. Links are extracted automatically and separated in an advanced way: links with no separator but a space, links glued to punctuation, Markdown links, HTML `href`, links inside JSON/CSV text.
- Toggle: **include links without `https://`** (bare domains like `example.com/page`). Default OFF.

### Tab 2: Upload files
- 20 to 30 popular formats. Show the 5 to 7 most popular; the rest appear under **See more**. Up to **10 files** at once. No size limit for now.
- Suggested set: popular = TXT, HTML (bookmarks), JSON, CSV, Excel (XLSX/XLS), PDF, Word (DOCX). More = Markdown, RTF, TSV, ODS, ODT, PPTX, XML/OPML, YAML, INI, LOG, EML, URL/WEBLOC shortcuts, JSONL, XLSM, XHTML.
- NOT supported for now: zip/archives, images, other hard formats.
- Small **yellow warning note** when: a file is big, there are very many links, many files are added, or a very large text was pasted.

### Review list (both tabs)
- Extracted links are listed with select/deselect and **Select all**.
- Sort at the top: by domain, by name, or by import sequence.
- Customization options (default folder, new folder, dedupe, tags, clean tracking params, fetch metadata after import).
- Closing the popup while there are uploaded files, pasted text or extracted links asks for confirmation.

### Saving (upload view)
- **Save links** starts uploading as fast as possible. The popup layout changes to an upload view:
  - overall progress with details (saved, skipped duplicates, failed, speed, ETA);
  - a live text list of the 5 to 10 links being processed right now; finished ones get a tick and then fade out;
  - **Pause / Resume, Stop, Undo** (Undo moves everything imported by this run to the Recycle Bin);
  - **Minimize**: the popup shrinks to a chip in a corner (above the bottom bar on mobile); the upload keeps running; **View details** reopens the popup.
- Writes: chunks of **100 links**, several chunks **in parallel** (default 4, adaptive).
- Metadata: after saving, titles/favicons/descriptions/keywords are fetched through the Worker in the background (works while the app is open; resumes after reload; server-side continuation when the app is closed arrives in v2.5.0). Titles that came from bookmarks or files are re-checked too: the fetched title wins unless the user edited it manually.
- Must be resumable after reload and have real error handling (retry failed, report failed).

## 6b. Export and the native Linkivo format

Export must be beautiful, fast and flexible. There is ONE main export in the app's own database-shaped format (the **Linkivo backup**), which makes re-importing very fast, plus several other formats with formatting options.

### Where it opens
Library folder three-dot ("Export this folder", folder preselected), Folder view header, multi-select ("Export selected"), Settings > Data, and Profile. In guest mode it works exactly the same (offline).

### The export popup (sheet on mobile, dialog on PC; one scrollable view, not a wizard)
1. **Format**: a compact list, each with a one-line description. The Linkivo backup is first and marked recommended.
2. **Scope**: whole library, selected folders, selected links, Favourites, or the current filter/search result. Optional: include the vault (only when it is unlocked and the PIN was verified, with its own clear warning). The Recycle Bin is never exported.
3. **Options** (only the ones that make sense for the chosen format) and a **live preview** of the first few output items that updates as options change.
4. One primary button. Large exports show progress and never freeze the UI. Result: **Download**, **Copy** (for text formats) and **Share** (when the device supports sharing files), plus a short summary (items, size, file name).
The last used options are remembered per format. Default file name: `linkivo-<scope>-<YYYY-MM-DD>.<ext>`.

### Formats
| Format | File | Notes |
|---|---|---|
| **Linkivo backup (main)** | `.linkivo.json` | Database-shaped: folders, links, points, flags, tags, notes, metadata; optional history and non-sensitive settings; vault only when chosen. Re-imports through the **fast path**. Optional passphrase encryption arrives in v2.6.0. |
| JSON (readable) | `.json` | Array of objects with the chosen fields; flat or grouped by folder. |
| CSV | `.csv` | UTF-8 with optional BOM (Excel friendly); delimiter comma, semicolon or tab; chosen columns. |
| Excel | `.xlsx` | One sheet or one sheet per folder, styled header, sensible column widths, clickable URLs. |
| Text | `.txt` | Line template with tokens (`{title}`, `{url}`, `{domain}`, `{tags}`, `{folder}`, `{added}`, `{points}`), optional numbering, folder headings or URLs only. |
| Markdown | `.md` | List or table style, folder headings, `[title](url)` links, optional description and tags. |
| HTML bookmarks | `.html` | Standard Netscape bookmarks file that every browser can import; folders become bookmark folders. |
| Printable page | `.html` | Clean, self-contained, grouped, print-friendly, light or dark. |
| OPML | `.opml` | Outline for readers and outliners. |
| PDF | `.pdf` | Formatted document. v2.6.0. |

### Formatting options (shown per format)
Fields to include (title, URL, domain, description, tags, folder, added date, points, favourite and read-later flags), sort order, grouping (by folder, by domain, flat), date format, skip blocked links, only favourites or only a tag, file name pattern, line template, numbering, separators, Markdown style (list or table), printable theme, line endings.

### Import side (fast path)
When the Import popup receives a `.linkivo.json` file it recognizes it and switches to a **Restore from Linkivo backup** view: backup date, source app version, counts of folders, links, tags and history, and the options: merge into existing folders by name or restore as new folders; for duplicates (same normalized URL) skip, keep both, or update the existing link. Then the normal upload view runs (progress, pause, stop, Undo, minimize). No URL extraction, no network metadata fetch, original creation times and points are kept.

## 7. Metadata (Worker-first)

- At add time the must-haves are title, favicon, URL. Also collect meta tags, description and keywords in the same request when possible (they power search).
- Videos, thumbnails, screenshots are loaded at preview time, not at import time.
- Engine order: own Cloudflare Worker (highest limit) first, then fallbacks in descending order of free limit. The exact order is verified at build time (`ARCHITECTURE.md` section "Metadata Worker").
- The weekly "refresh all URLs" system is DROPPED for now.

## 8. Random Discover

- Main page layout: **folder selection and filters are merged into one panel**, shown on the main page before the first link opens. While a link is open, a **filter icon** opens the same options in a popup where they can be edited and saved.
- Preview is embedded (section 5) with an icon at the bottom to open a new random link.
- Ideas from v1.3.0 are kept and extended (modes, avoid recent, skip disliked/blocked, only starred/liked, auto-advance with countdown).

### Points system (owner rules, fixed)
- Every link starts at **100** points. Blocked links are excluded from random.
- A link opened **by random** (not by clicking it elsewhere) loses **10** points every time.
- After a random open, **like** gives **+50**, the next like **+20**, the next **+10**, then likes are disabled until the next random open of that link.
- **Dislike**: **-50**, once per random open.
- **Add to favourites**: **+100**. **Remove from favourites**: **-120**. **Block**: points become **0** (the previous value is remembered and restored on unblock **[proposal]**).
- The same actions work from the normal preview, but like/dislike there can only be used **once per week** per link.
- Points never go below 1 for non-blocked links and are capped at 1000 **[proposal, confirmed by owner]**.
- Random picking uses the filters first, then points as priority.

### Advanced calculation **[proposal]**
The owner asked for a more advanced calculation than the fixed rules. Proposed weight for each candidate link:

```
W = (points ^ gamma) x fresh x recency x age x folderWeight
```
- `gamma` (default 1.0, setting "Point influence", 0.5 soft to 1.5 sharp).
- `fresh = 1 + 0.6 / (1 + openCount)`: never-opened links get x1.6, fading to x1.0.
- `recency` (when "avoid recent" is on): opened less than 6h ago x0.05, 24h x0.2, 72h x0.5, 7d x0.8, older x1.
- `age = 1 + min(0.25, daysSinceAdded / 730)`: very old unopened backlog gets a small lift.
- `folderWeight`: low / normal / high per selected folder (0.5 / 1 / 2).
- Pick with weighted sampling without replacement (key = random^(1/W), take the largest). No repeats in a session until the pool is exhausted.
- Modes: Balanced (default, formula above), Points only, Equal, Underdog (inverse points), Fresh first.
- Hard filters: folders, domains include/exclude, tags, only favourites/liked, min/max points, skip recently disliked, skip dead links, unseen only.
- Optional "gentle drift" (default OFF): points slowly move toward 100 (+1/-1 per 14 days) so nothing stays stuck forever.
Freeze the final numbers with the owner at the start of v2.4.0.

## 9. Security: app lock and vault

- **App lock** is OFF by default. Each user has their own PIN (stored server-side as a peppered hash; see `ARCHITECTURE.md`). When it is ON, **no user data can be read or written until the PIN is verified** (enforced by database rules through a server-issued unlock session, not only by the UI).
- **Vault**: folders can be moved to the vault. While the vault is locked, **vault folders' data cannot be read or written** (not in the database, not in the local cache, not in the DOM, not in search, not in history).
- One shared PIN for all vault folders. By default it is the SAME PIN as the app lock. In Settings the user can set a separate vault PIN. If no PIN exists when the first folder is moved to the vault, ask the user to create one.
- Unlock entry: a small "unlock vault" option at the bottom of Library, with a **setting to hide it**. When hidden, the user types the correct PIN into the **search bar**; on a correct PIN the folder-unlock option appears.
- Forgetting the PIN must **never lose data** and must be easy to resolve: "Forgot PIN" asks the user to re-authenticate (Google popup or password) and then set a new PIN. Guests have no server: for guests, forgot PIN means erasing local data (offer a backup export first).
- **Sensitive settings** (security, account, data deletion, exports of vault, etc.) need PIN verification when the app lock is on. After one successful verification, no further PIN prompt for **5 minutes** while the app stays open.
- Logging out, resetting settings and deleting the account ask for confirmation and, when the app lock is on, the PIN.

## 10. Account deletion and recovery

- Deleting the account does NOT delete data immediately. The account is **marked as deleted**; after **15 days** everything (data and the Firebase Auth user) is permanently deleted.
- A full **summary** of the account (counts of folders, links, vault folders, join date, last login) is shown at deletion time and again at recovery time.
- When a user with a deleted account logs in, an extra step asks: **Reactivate this account?** (with the summary). Yes restores everything; No signs out.

## 11. Recycle Bin (inside Settings)

- Deleted folders and links are first only marked as deleted and kept for **15 days**, then removed permanently.
- Items are grouped by **deletion date** so a given day's deletions can be multi-selected and restored or deleted together. Also: search, select all, restore, delete forever, empty bin.

## 12. History (inside the Profile page)

- A new, more advanced page inspired by v1.3.0: date-grouped, search, three-dot actions per item, multi-select with actions, clear all.
- **Auto-delete schedule** in Settings: no history / 1 hour / 24 hours / 3 days / 7 days / 30 days / 90 days / 365 days / never.
- When the vault is locked, vault history is not shown (or is replaced by blurred dummy rows). Real vault data must never be in the DOM.

## 13. Global search

- Category-wise results: about 3 to 5 **settings**, 2 to 6 **folders**, about 10 top **links**. Uses metadata (title, URL, domain, description, keywords, tags).
- Do not show too many at once; **See more** loads a few more at a time.
- Search history is kept in local storage only (last 50). Before typing, show 5 recent searches with **See more** (10 more each time). Keyed per user, cleared on logout.
- Vault content never appears while the vault is locked.

## 14. Profile page

Comprehensive profile page (designer's choice of contents): account info (masked email), sign-in methods, security entry points, stats, **History** section, sign out, delete account. Basic profile/account settings live here; sensitive ones need the PIN gate. (No picture upload for now.)

## 15. Settings

Roughly 30+ useful settings grouped in categories, giving users a lot of freedom. Declared in one registry (`js/features/settings/catalog.js`): id, section, type, default, sensitive flag, search keywords, version introduced. Suggested catalog (final list is audited in v2.6.0, minimum 30):

| Section | Settings |
|---|---|
| Appearance | theme (system/light/dark), accent color, font size, density (compact/comfortable), reduce motion, default view (grid/list), folder card style, hide bottom bar on scroll, sidebar collapsed by default |
| Library and links | default sort, show favicon, show URL, show points, show added time, confirm before delete, open links in (preview/new tab), default folder for quick-add |
| Import | include links without https (default off), dedupe on/off, clean tracking parameters, fetch metadata after import, import speed (gentle/normal/fast), clipboard link detection |
| Random | default mode, point influence, avoid recent (hours), skip disliked, auto-advance seconds, default filters, gentle drift |
| Security | app lock on/off, change PIN, auto-lock time, lock when app goes to background, separate vault PIN, hide vault unlock entry, forgot PIN |
| History | record history on/off, auto-delete schedule, clear history |
| Data | export, backup and restore (encrypted), storage usage, clear cache, Recycle Bin (15 days) |
| Account and sync | profile, change password, linked providers, guest: log in and sync, delete account, log out |
| App | install status and install button, check for updates, version, documentation, terms, privacy, developer |
| Advanced | metadata tester, debug log viewer, reset settings |

Rules: sensitive settings are PIN-gated (5-minute window). Settings must be searchable from Global search. NOT wanted: any "Private open"/incognito option.

## 16. Install and update

- The app must always auto-update: no stale cache, ever (details in `ARCHITECTURE.md`).
- If the app is not installed, show an install banner. Closing it hides it for **7 days**.
- Settings always shows the install status in a clear, nice way (installed / not installed + install button).

## 17. Extra features (all approved)

Web Share Target (share a link from another Android app into Linkivo), dead-link checker, smart duplicate detection, tags and read-later, quick-add (clipboard detection and shortcut), encrypted backup and restore (optional passphrase on the native backup format, v2.6.0), activity log, undo for bulk actions.

## 18. Pages: Terms, Privacy, Documentation (last step, v2.6.0)

Terms and Privacy: simple design. Documentation: fully designed, well structured (how to use every feature). Privacy text must honestly say: the app owner can technically see stored data in the database; guest data never leaves the device; during metadata lookup a link is sent to the app's server but not stored by the lookup.
A final advanced `README.md` for GitHub is delivered in v2.6.0.

## 19. Explicitly out of scope (for now)

Admin panel (the data model stays admin-ready), profile picture upload, push notifications, weekly refresh-all, anything that needs a paid plan.


## v2.1.2 additions (foundation fixes)

- **Start animation**: the owner's v1 logo animation (no url badges) on the first start, a short version afterwards; Settings > Appearance > Start animation: Automatic, Always full, Short.
- **Navigation chrome**: sidebar redesign (collapsed rounded-square icons, expand icon on logo hover, full rows when expanded, profile badge with a toggling three-dot menu), centred page content on wide screens, page fade-in, every page starts at its top, theme switch transition, accent color also colors the logo and wordmark.
- **Login**: redesigned (art-and-overview column on wide screens, compact form, theme switch, Terms and Privacy agreement for new accounts, white logo tile).
- **Settings**: one page with category headings and, on wide screens, a sticky scroll-synced category list; new settings: page transitions, start animation, pull to refresh, block right-click and long-press, update automatically; Account and sync gained reset-password email, Sync now and guest backup note; Advanced gained Clear app cache.
- **About / Menu**: new layout with app header, highlights, developer card (photo, website, GitHub, email) and links.
- **Updates**: automatic update when the app opens; popup while it is in use; pull down on a phone to refresh the page and check for a new version.
- **Metadata**: works for blocked sites through preview-crawler retries, Jina Reader and Wayback; always returns a usable partial result for live sites; more fields (author, published date, keywords, language, canonical, theme color, feed).
- **SEO**: per-route title, description, robots and canonical; private pages noindex; `robots.txt`, `sitemap.xml`, Open Graph and JSON-LD in `index.html`.


## v2.1.3 additions (polish, metadata rescue)

- **Start animation**: Full (default, every start) or Short. No grid, smaller logo, never a blank first paint.
- **Pull to refresh** (phones): an in-app refresh on content pages only (library, folder, history, profile); layout now, each page adds its own refresh when it has data. No setting. Replaces the v2.1.2 behavior (which also checked for updates and re-opened the page).
- **Right-click and long-press**: always blocked, no setting; text stays selectable, a text selection keeps Copy, an image opens a small menu (Open image in new tab, Copy image link, Download image).
- **Tooltips**: hover on PC; long-press names on the mobile bar.
- **Install banner**: own ticket design; never shown when installed; status only in Settings > App.
- **Developer**: separate compact section after About (Settings > App and Menu).
- **Settings on phones**: sticky, scrollable category bar. **Menu**: Quick settings (theme, accent, text size, hide bar).
- **Password reset**: confirmation, PIN gate when the lock is on, one email per address every 5 minutes, 5 per hour per device; verification email: 2 minutes. Same limits on the login page.
- **Metadata**: Worker first, then this device asks Dub, Jina Reader, AllOrigins, JSONLink and Microlink when the Worker result is weak; floor = title from the URL plus the favicon. Switch in Settings > Advanced. Settings > App warns when the deployed Worker is older than the app expects.
- **Theme switch**: one cross-fade, all colors together.
