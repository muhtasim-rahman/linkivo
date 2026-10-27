/**
 * Linkivo — js/features/settings/catalog.js  (v2.1.3, v2.2.2)
 * Purpose: the declarative settings registry (D-030). The Settings page, the reset action and (from v2.3.0) Global search all read
 *          this one list, so a setting can not exist in one place and be missing in another. Each version adds the settings of the
 *          features it ships; v2.6.0 audits the catalog (minimum 30).
 * Entry: { id, section, type: 'seg'|'switch'|'swatch'|'custom', key (pref key), label, desc, default, options:[{value,label}],
 *          sensitive (needs the PIN gate when the app lock exists), keywords, since, custom (name of a custom row) }
 * API: SECTIONS  CATALOG  entriesFor(sectionId)  findSection(id)  findEntry(id)  resettableKeys()
 *      `top: true` (v2.2.2): not drawn inside its section; the wide-screen Settings page shows it as a card at the very top (phones have it in the Menu).
 *      `onOn: 'clipboard'` on a switch runs a helper when the switch is turned ON by the user (needs a user gesture, e.g. the clipboard permission prompt).
 *      `tips` on an option: { value: 'text' } shown as a hover tooltip on that option (v2.1.3).
 */
import { KEYS, ACCENTS } from '../../core/appearance.js';

export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', desc: 'Theme, accent color, text size, motion and start screen', icon: 'palette' },
  { id: 'behavior', label: 'Behavior', desc: 'How pages and lists respond', icon: 'zap' },
  { id: 'library', label: 'Library and links', desc: 'How folders and link lists look and behave', icon: 'library' },
  { id: 'data', label: 'Import, export and data', desc: 'Import options, export, backup and the Recycle Bin', icon: 'database' },
  { id: 'account', label: 'Account and sync', desc: 'Sign-in, security and where your data lives', icon: 'user' },
  { id: 'app', label: 'App', desc: 'Version, links and the developer', icon: 'install' },
  { id: 'danger', label: 'Danger zone', desc: 'Actions that reset settings, sign you out or erase data on this device', icon: 'alert' },
  { id: 'advanced', label: 'Advanced', desc: 'Metadata tester, storage tools, debug log, reset', icon: 'terminal' }
];
export const findSection = (id) => SECTIONS.find((s) => s.id === id) || null;
export const findEntry = (id) => CATALOG.find((e) => e.id === id) || null;

const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));

export const CATALOG = [
  // ---- Appearance
  { id: 'theme', section: 'appearance', type: 'seg', key: KEYS.theme, label: 'Theme', desc: 'System follows your device.', default: 'system', options: opt(['system', 'System'], ['light', 'Light'], ['dark', 'Dark']), tips: { system: 'Follow the theme of your device', light: 'Always use the light theme', dark: 'Always use the dark theme' }, keywords: ['dark mode', 'light mode', 'night'], since: '2.1.0' },
  { id: 'accent', section: 'appearance', type: 'swatch', key: KEYS.accent, label: 'Accent color', desc: 'Colors the active marker, buttons, focus rings and the Linkivo logo and name.', default: 'blue', options: Object.entries(ACCENTS).map(([value, color]) => ({ value, label: value[0].toUpperCase() + value.slice(1), color })), keywords: ['color', 'colour', 'highlight', 'logo'], since: '2.1.0' },
  { id: 'fontSize', section: 'appearance', type: 'seg', key: KEYS.fontSize, label: 'Text size', default: 'medium', options: opt(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']), tips: { small: '13 px text', medium: '14 px text', large: '16 px text' }, keywords: ['font', 'bigger', 'smaller', 'zoom'], since: '2.1.0' },
  { id: 'density', section: 'appearance', type: 'seg', key: KEYS.density, label: 'Density', desc: 'Comfortable adds space around rows.', default: 'compact', options: opt(['compact', 'Compact'], ['comfortable', 'Comfortable']), keywords: ['spacing', 'padding', 'rows'], since: '2.1.0' },
  { id: 'reduceMotion', section: 'appearance', type: 'seg', key: KEYS.motion, label: 'Motion', desc: 'Reduce turns animations off, including the start screen.', default: 'system', options: opt(['system', 'System'], ['reduce', 'Reduce']), keywords: ['animation', 'accessibility'], since: '2.1.0' },
  { id: 'splash', section: 'appearance', type: 'seg', key: KEYS.splash, label: 'Start animation', desc: 'Full plays the whole logo animation each time the app starts. Short only fades the logo in.', default: 'full', options: opt(['full', 'Full'], ['short', 'Short']), tips: { full: 'About three seconds, every start', short: 'Half a second' }, keywords: ['splash', 'logo', 'loading', 'intro'], since: '2.1.2' },

  // ---- Behavior
  // v2.1.3: "Pull down to refresh" and "Block right-click and long-press menus" were removed (owner): both are fixed behavior now. The section keeps
  // one real setting; v2.2.0 onward adds the library and import behavior settings here.
  // v2.2.2 (owner): "Collapse the sidebar" moved here from Appearance, it is about behavior.
  { id: 'sidebarCollapsed', section: 'behavior', type: 'switch', key: 'ui.sidebarCollapsed', label: 'Collapse the sidebar', desc: 'Wide screens only.', default: false, keywords: ['navigation', 'sidebar'], since: '2.1.0' },
  { id: 'hideBar', section: 'behavior', type: 'switch', key: 'ui.hideBar', label: 'Hide bottom bar on scroll', desc: 'Phones only. The bar returns when you scroll up.', default: true, keywords: ['navigation', 'bottom bar', 'scroll'], since: '2.1.0' },

  // ---- Library and links (v2.2.0)
  { id: 'libView', section: 'library', type: 'seg', key: 'lib.view', label: 'Library layout', desc: 'Folders as a grid of cards or as a compact list.', default: 'grid', options: opt(['grid', 'Grid'], ['list', 'List']), keywords: ['folders', 'view', 'cards'], since: '2.2.0' },
  { id: 'libSort', section: 'library', type: 'seg', key: 'lib.sort', label: 'Folder order', desc: 'Pinned folders always stay on top.', default: 'manual', options: opt(['manual', 'Default'], ['name', 'Name'], ['recent', 'Recent'], ['links', 'Size']), keywords: ['sort', 'order', 'folders'], since: '2.2.0' },
  { id: 'folderView', section: 'library', type: 'seg', key: 'folder.view', label: 'Link layout', desc: 'Links inside a folder as rows or as cards.', default: 'list', options: opt(['list', 'List'], ['grid', 'Grid']), keywords: ['links', 'view', 'cards', 'rows'], since: '2.2.0' },
  // v2.2.2 (owner): "Link order" was removed. Pinned links always stay on top; the order below them is the Sort control of the folder page.
  { id: 'showUrl', section: 'library', type: 'switch', key: 'lib.showUrl', label: 'Show the domain on links', desc: 'The site name under each link title.', default: true, keywords: ['domain', 'host', 'url'], since: '2.2.0' },
  { id: 'showPoints', section: 'library', type: 'switch', key: 'lib.showPoints', label: 'Show points on links', desc: 'The weight Random Discover uses. Useful while you tune it.', default: false, keywords: ['points', 'score', 'random'], since: '2.2.0' },
  { id: 'confirmDelete', section: 'library', type: 'switch', key: 'lib.confirmDelete', label: 'Type the name to delete a folder with links', desc: 'Off asks a simple yes or no. Deleted folders stay in the Recycle Bin for 15 days either way.', default: true, keywords: ['delete', 'confirm', 'safety'], since: '2.2.0' },
  { id: 'clipboard', section: 'library', type: 'switch', key: 'lib.clipboard', onOn: 'clipboard', label: 'Look in the clipboard for links', desc: 'Once your browser allows clipboard access, links you copied are suggested for import when the app opens, and fill the Add link field. Works in Chrome and Edge; other browsers cannot read the clipboard quietly.', default: true, keywords: ['paste', 'clipboard', 'quick add', 'import', 'suggestion'], since: '2.2.0' },

  // ---- Import, export and data (v2.2.0)
  { id: 'importData', section: 'data', type: 'custom', custom: 'importData', label: 'Import links', keywords: ['import', 'paste', 'files', 'bookmarks', 'restore'], since: '2.2.0' },
  // v2.2.1: removed (owner asked to drop unimportant options): pageTransitions (Motion covers it), showAdded (the date always shows), impReview (the found links are always listed on the Import page).
  { id: 'impIcons', section: 'data', type: 'switch', key: 'import.skipIcons', label: 'Ignore favicons and icon files', desc: 'favicon.ico, apple-touch-icon and similar files are not imported as links.', default: true, keywords: ['import', 'favicon', 'icon', 'ico'], since: '2.2.1' },
  { id: 'keepAwake', section: 'data', type: 'switch', key: 'import.keepAwake', label: 'Keep the screen on while importing', desc: 'A sleeping phone pauses the browser. Works where the browser allows it, and only while a task runs.', default: true, keywords: ['import', 'wake lock', 'sleep', 'screen'], since: '2.2.1' },
  { id: 'impBare', section: 'data', type: 'switch', key: 'import.bare', label: 'Also find domains without https', desc: 'Picks up example.com/page written without a scheme. May catch a few extra words.', default: false, keywords: ['import', 'domain', 'bare', 'https'], since: '2.2.0' },
  { id: 'impDedupe', section: 'data', type: 'switch', key: 'import.dedupe', label: 'Skip links that are already saved', default: true, keywords: ['import', 'duplicates'], since: '2.2.0' },
  { id: 'impClean', section: 'data', type: 'switch', key: 'import.clean', label: 'Remove tracking parameters', desc: 'Drops utm_*, fbclid, gclid and similar from imported addresses.', default: false, keywords: ['import', 'utm', 'tracking', 'privacy'], since: '2.2.0' },
  { id: 'impEnrich', section: 'data', type: 'switch', key: 'import.enrich', label: 'Fetch titles after importing', desc: 'Reads each page title and description in the background through the metadata service.', default: true, keywords: ['import', 'metadata', 'title'], since: '2.2.0' },
  { id: 'impAutoClear', section: 'data', type: 'switch', key: 'import.autoClear', label: 'Auto delete recent imports', desc: 'Removes entries of the Recent imports list that are older than 7 days. Your imported links are never touched.', default: false, keywords: ['import', 'history', 'recent', 'log', 'clear', 'delete', '7 days'], since: '2.2.3' },
  { id: 'metaBrowser', section: 'data', type: 'switch', key: 'meta.browserFallback', label: 'Use extra metadata services from this device', desc: 'When the Worker cannot read a page, this device asks free public services itself (Dub, Jina Reader, AllOrigins, Microlink). They see the link, so turn this off if that matters to you.', default: true, keywords: ['metadata', 'fallback', 'privacy', 'title', 'favicon'], since: '2.1.3' },   // v2.2.3: moved out of Advanced (that section will be removed)
  { id: 'impSpeed', section: 'data', type: 'seg', key: 'import.speed', label: 'Import speed', desc: 'Fast writes more groups of 100 links at once. Gentle is kinder to a weak connection.', default: 'normal', options: opt(['gentle', 'Gentle'], ['normal', 'Normal'], ['fast', 'Fast']), keywords: ['import', 'speed', 'parallel'], since: '2.2.0' },
  { id: 'exportData', section: 'data', type: 'custom', custom: 'exportData', label: 'Export library', keywords: ['export', 'backup', 'download', 'json', 'csv', 'excel'], since: '2.2.0' },
  { id: 'recycleBin', section: 'data', type: 'custom', custom: 'recycleBin', top: true, label: 'Recycle Bin', keywords: ['deleted', 'restore', 'trash', 'bin'], since: '2.2.0' },

  // ---- Account and sync
  { id: 'accountInfo', section: 'account', type: 'custom', custom: 'account', label: 'Account', keywords: ['sign in', 'log in', 'log out', 'email', 'guest', 'password', 'verification'], since: '2.1.0' },
  { id: 'sync', section: 'account', type: 'custom', custom: 'sync', label: 'Data and sync', keywords: ['database', 'cache', 'indexeddb', 'sync status', 'sync now', 'storage'], since: '2.1.0' },

  // ---- App
  // v2.2.2 (owner): install, Update automatically (updates happen by themselves), Updates and the separate About and Developer rows are gone.
  // The section shows the app details only: the same card as the mobile Menu page, with the links as rows.
  { id: 'appDetails', section: 'app', type: 'custom', custom: 'appDetails', label: 'App details', keywords: ['version', 'about', 'developer', 'source code', 'privacy', 'terms', 'report', 'documentation', 'highlights', 'turzo', 'muhtasim'], since: '2.2.2' },

  // ---- Advanced
  { id: 'worker', section: 'advanced', type: 'custom', custom: 'worker', label: 'Metadata service', keywords: ['worker', 'cloudflare', 'status'], since: '2.1.0' },
  { id: 'tester', section: 'advanced', type: 'custom', custom: 'tester', label: 'Metadata tester', keywords: ['metadata', 'title', 'favicon', 'test urls'], since: '2.1.0' },
  { id: 'debugLog', section: 'advanced', type: 'custom', custom: 'debug', label: 'Debug log', keywords: ['logs', 'errors'], since: '2.1.0' },
  // ---- Danger zone (v2.2.3, owner request): the important actions live here because the Advanced section will be removed later
  { id: 'clearCache', section: 'danger', type: 'custom', custom: 'clearCache', label: 'Clear app cache', keywords: ['cache', 'reload', 'stale', 'fix'], since: '2.1.2' },
  { id: 'reset', section: 'danger', type: 'custom', custom: 'reset', label: 'Reset all settings', sensitive: true, keywords: ['defaults', 'restore'], since: '2.1.0' },
  { id: 'logout', section: 'danger', type: 'custom', custom: 'logout', label: 'Log out', keywords: ['sign out', 'leave', 'guest'], since: '2.2.3' },
  { id: 'clearLocal', section: 'danger', type: 'custom', custom: 'clearLocal', label: 'Clear local storage data', sensitive: true, keywords: ['erase', 'wipe', 'storage', 'cache', 'cookies', 'log out', 'local data', 'reset app'], since: '2.2.3' }
];

export const entriesFor = (sectionId) => CATALOG.filter((e) => e.section === sectionId);
export const resettableKeys = () => CATALOG.filter((e) => e.key).map((e) => e.key);
