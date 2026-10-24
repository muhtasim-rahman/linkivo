/**
 * Linkivo — js/features/settings/catalog.js  (v2.1.3)
 * Purpose: the declarative settings registry (D-030). The Settings page, the reset action and (from v2.3.0) Global search all read
 *          this one list, so a setting can not exist in one place and be missing in another. Each version adds the settings of the
 *          features it ships; v2.6.0 audits the catalog (minimum 30).
 * Entry: { id, section, type: 'seg'|'switch'|'swatch'|'custom', key (pref key), label, desc, default, options:[{value,label}],
 *          sensitive (needs the PIN gate when the app lock exists), keywords, since, custom (name of a custom row) }
 * API: SECTIONS  CATALOG  entriesFor(sectionId)  findSection(id)  findEntry(id)  resettableKeys()
 *      `tips` on an option: { value: 'text' } shown as a hover tooltip on that option (v2.1.3).
 */
import { KEYS, ACCENTS } from '../../core/appearance.js';

export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', desc: 'Theme, accent color, text size, motion and start screen', icon: 'palette' },
  { id: 'behavior', label: 'Behavior', desc: 'How pages and lists respond', icon: 'zap' },
  { id: 'library', label: 'Library and links', desc: 'How folders and link lists look and behave', icon: 'library' },
  { id: 'data', label: 'Import, export and data', desc: 'Import options, export, backup and the Recycle Bin', icon: 'database' },
  { id: 'account', label: 'Account and sync', desc: 'Sign-in, security and where your data lives', icon: 'user' },
  { id: 'app', label: 'App', desc: 'Install, updates, about and the developer', icon: 'install' },
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
  { id: 'pageTransitions', section: 'appearance', type: 'switch', key: KEYS.transitions, label: 'Page transitions', desc: 'Pages fade in when you move between them.', default: true, keywords: ['animation', 'smooth'], since: '2.1.2' },
  { id: 'splash', section: 'appearance', type: 'seg', key: KEYS.splash, label: 'Start animation', desc: 'Full plays the whole logo animation each time the app starts. Short only fades the logo in.', default: 'full', options: opt(['full', 'Full'], ['short', 'Short']), tips: { full: 'About three seconds, every start', short: 'Half a second' }, keywords: ['splash', 'logo', 'loading', 'intro'], since: '2.1.2' },
  { id: 'sidebarCollapsed', section: 'appearance', type: 'switch', key: 'ui.sidebarCollapsed', label: 'Collapse the sidebar', desc: 'Wide screens only.', default: false, keywords: ['navigation', 'sidebar'], since: '2.1.0' },

  // ---- Behavior
  // v2.1.3: "Pull down to refresh" and "Block right-click and long-press menus" were removed (owner): both are fixed behavior now. The section keeps
  // one real setting; v2.2.0 onward adds the library and import behavior settings here.
  { id: 'hideBar', section: 'behavior', type: 'switch', key: 'ui.hideBar', label: 'Hide bottom bar on scroll', desc: 'Phones only. The bar returns when you scroll up.', default: true, keywords: ['navigation', 'bottom bar', 'scroll'], since: '2.1.0' },

  // ---- Library and links (v2.2.0)
  { id: 'libView', section: 'library', type: 'seg', key: 'lib.view', label: 'Library layout', desc: 'Folders as a grid of cards or as a compact list.', default: 'grid', options: opt(['grid', 'Grid'], ['list', 'List']), keywords: ['folders', 'view', 'cards'], since: '2.2.0' },
  { id: 'libSort', section: 'library', type: 'seg', key: 'lib.sort', label: 'Folder order', desc: 'Pinned folders always stay on top.', default: 'manual', options: opt(['manual', 'Default'], ['name', 'Name'], ['recent', 'Recent'], ['links', 'Size']), keywords: ['sort', 'order', 'folders'], since: '2.2.0' },
  { id: 'folderView', section: 'library', type: 'seg', key: 'folder.view', label: 'Link layout', desc: 'Links inside a folder as rows or as cards.', default: 'list', options: opt(['list', 'List'], ['grid', 'Grid']), keywords: ['links', 'view', 'cards', 'rows'], since: '2.2.0' },
  { id: 'folderSort', section: 'library', type: 'seg', key: 'folder.sort', label: 'Link order', desc: 'Default order inside a folder.', default: 'folder', options: opt(['folder', 'Pinned'], ['new', 'Newest'], ['old', 'Oldest'], ['title', 'Title']), keywords: ['sort', 'order', 'links'], since: '2.2.0' },
  { id: 'showUrl', section: 'library', type: 'switch', key: 'lib.showUrl', label: 'Show the domain on links', desc: 'The site name under each link title.', default: true, keywords: ['domain', 'host', 'url'], since: '2.2.0' },
  { id: 'showAdded', section: 'library', type: 'switch', key: 'lib.showAdded', label: 'Show when a link was added', default: true, keywords: ['date', 'time', 'added'], since: '2.2.0' },
  { id: 'showPoints', section: 'library', type: 'switch', key: 'lib.showPoints', label: 'Show points on links', desc: 'The weight Random Discover uses. Useful while you tune it.', default: false, keywords: ['points', 'score', 'random'], since: '2.2.0' },
  { id: 'confirmDelete', section: 'library', type: 'switch', key: 'lib.confirmDelete', label: 'Type the name to delete a folder with links', desc: 'Off asks a simple yes or no. Deleted folders stay in the Recycle Bin for 15 days either way.', default: true, keywords: ['delete', 'confirm', 'safety'], since: '2.2.0' },
  { id: 'clipboard', section: 'library', type: 'switch', key: 'lib.clipboard', label: 'Look in the clipboard when adding a link', desc: 'Fills the address if you copied one. Your browser may ask for permission.', default: false, keywords: ['paste', 'clipboard', 'quick add'], since: '2.2.0' },

  // ---- Import, export and data (v2.2.0)
  { id: 'importData', section: 'data', type: 'custom', custom: 'importData', label: 'Import links', keywords: ['import', 'paste', 'files', 'bookmarks', 'restore'], since: '2.2.0' },
  { id: 'impReview', section: 'data', type: 'switch', key: 'import.review', label: 'Review links before importing', desc: 'See every link found and untick the ones you do not want.', default: true, keywords: ['import', 'review'], since: '2.2.0' },
  { id: 'impBare', section: 'data', type: 'switch', key: 'import.bare', label: 'Also find domains without https', desc: 'Picks up example.com/page written without a scheme. May catch a few extra words.', default: false, keywords: ['import', 'domain', 'bare', 'https'], since: '2.2.0' },
  { id: 'impDedupe', section: 'data', type: 'switch', key: 'import.dedupe', label: 'Skip links that are already saved', default: true, keywords: ['import', 'duplicates'], since: '2.2.0' },
  { id: 'impClean', section: 'data', type: 'switch', key: 'import.clean', label: 'Remove tracking parameters', desc: 'Drops utm_*, fbclid, gclid and similar from imported addresses.', default: false, keywords: ['import', 'utm', 'tracking', 'privacy'], since: '2.2.0' },
  { id: 'impEnrich', section: 'data', type: 'switch', key: 'import.enrich', label: 'Fetch titles after importing', desc: 'Reads each page title and description in the background through the metadata service.', default: true, keywords: ['import', 'metadata', 'title'], since: '2.2.0' },
  { id: 'impSpeed', section: 'data', type: 'seg', key: 'import.speed', label: 'Import speed', desc: 'Fast writes more groups of 100 links at once. Gentle is kinder to a weak connection.', default: 'normal', options: opt(['gentle', 'Gentle'], ['normal', 'Normal'], ['fast', 'Fast']), keywords: ['import', 'speed', 'parallel'], since: '2.2.0' },
  { id: 'exportData', section: 'data', type: 'custom', custom: 'exportData', label: 'Export library', keywords: ['export', 'backup', 'download', 'json', 'csv', 'excel'], since: '2.2.0' },
  { id: 'recycleBin', section: 'data', type: 'custom', custom: 'recycleBin', label: 'Recycle Bin', keywords: ['deleted', 'restore', 'trash', 'bin'], since: '2.2.0' },

  // ---- Account and sync
  { id: 'accountInfo', section: 'account', type: 'custom', custom: 'account', label: 'Account', keywords: ['sign in', 'log in', 'log out', 'email', 'guest', 'password', 'verification'], since: '2.1.0' },
  { id: 'sync', section: 'account', type: 'custom', custom: 'sync', label: 'Data and sync', keywords: ['database', 'cache', 'indexeddb', 'sync status', 'sync now', 'storage'], since: '2.1.0' },

  // ---- App
  { id: 'install', section: 'app', type: 'custom', custom: 'install', label: 'Install', keywords: ['pwa', 'home screen', 'app icon', 'desktop'], since: '2.1.0' },
  { id: 'autoUpdate', section: 'app', type: 'switch', key: 'update.auto', label: 'Update automatically', desc: 'When the app starts and a newer version exists, install it at once. Off asks you first.', default: true, keywords: ['version', 'new version', 'refresh'], since: '2.1.2' },
  { id: 'updates', section: 'app', type: 'custom', custom: 'update', label: 'Updates', keywords: ['version', 'refresh', 'new version', 'check'], since: '2.1.0' },
  { id: 'about', section: 'app', type: 'custom', custom: 'about', label: 'About', keywords: ['version', 'highlights', 'source', 'terms', 'privacy'], since: '2.1.0' },
  { id: 'developer', section: 'app', type: 'custom', custom: 'developer', label: 'Developer', keywords: ['developer', 'contact', 'github', 'website', 'email', 'muhtasim', 'turzo'], since: '2.1.3' },

  // ---- Advanced
  { id: 'worker', section: 'advanced', type: 'custom', custom: 'worker', label: 'Metadata service', keywords: ['worker', 'cloudflare', 'status'], since: '2.1.0' },
  { id: 'metaBrowser', section: 'advanced', type: 'switch', key: 'meta.browserFallback', label: 'Use extra metadata services from this device', desc: 'When the Worker cannot read a page, this device asks free public services itself (Dub, Jina Reader, AllOrigins, Microlink). They see the link, so turn this off if that matters to you.', default: true, keywords: ['metadata', 'fallback', 'privacy', 'title', 'favicon'], since: '2.1.3' },
  { id: 'tester', section: 'advanced', type: 'custom', custom: 'tester', label: 'Metadata tester', keywords: ['metadata', 'title', 'favicon', 'test urls'], since: '2.1.0' },
  { id: 'clearCache', section: 'advanced', type: 'custom', custom: 'clearCache', label: 'Clear app cache', keywords: ['cache', 'reload', 'stale', 'fix'], since: '2.1.2' },
  { id: 'debugLog', section: 'advanced', type: 'custom', custom: 'debug', label: 'Debug log', keywords: ['logs', 'errors'], since: '2.1.0' },
  { id: 'reset', section: 'advanced', type: 'custom', custom: 'reset', label: 'Reset settings', sensitive: true, keywords: ['defaults', 'restore'], since: '2.1.0' }
];

export const entriesFor = (sectionId) => CATALOG.filter((e) => e.section === sectionId);
export const resettableKeys = () => CATALOG.filter((e) => e.key).map((e) => e.key);
