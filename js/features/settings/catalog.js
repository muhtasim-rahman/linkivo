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
  { id: 'search', label: 'Search', desc: 'What global search looks through and remembers', icon: 'search' },
  { id: 'random', label: 'Random Discover', desc: 'How the next link is picked, what is skipped and the automatic mode', icon: 'random' },
  { id: 'history', label: 'History', desc: 'Where the list of opened links is kept and for how long', icon: 'history' },
  { id: 'preview', label: 'Preview', desc: 'The link preview: tabs, related links, metadata and screenshot services', icon: 'globe' },
  { id: 'account', label: 'Account and sync', desc: 'Sign-in, security and where your data lives', icon: 'user' },
  { id: 'data', label: 'Import, export and data', desc: 'Import options, export, backup and the Recycle Bin', icon: 'database' },
  { id: 'danger', label: 'Danger zone', desc: 'Actions that reset settings, sign you out or erase data on this device', icon: 'alert' },
  { id: 'app', label: 'App', desc: 'Version, links and the developer', icon: 'install' },
  { id: 'advanced', label: 'Advanced', desc: 'Metadata tester, storage tools, debug log, reset', icon: 'terminal' }
];
export const findSection = (id) => SECTIONS.find((s) => s.id === id) || null;
export const findEntry = (id) => CATALOG.find((e) => e.id === id) || null;

const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));

export const CATALOG = [
  // ---- Appearance
  { id: 'theme', local: true, section: 'appearance', type: 'seg', key: KEYS.theme, label: 'Theme', desc: 'System follows your device.', default: 'system', options: opt(['system', 'System'], ['light', 'Light'], ['dark', 'Dark']), tips: { system: 'Follow the theme of your device', light: 'Always use the light theme', dark: 'Always use the dark theme' }, keywords: ['dark mode', 'light mode', 'night'], since: '2.1.0' },
  { id: 'accent', local: true, section: 'appearance', type: 'swatch', key: KEYS.accent, label: 'Accent color', desc: 'Colors the active marker, buttons, focus rings and the Linkivo logo and name.', default: 'blue', options: Object.entries(ACCENTS).map(([value, color]) => ({ value, label: value[0].toUpperCase() + value.slice(1), color })), keywords: ['color', 'colour', 'highlight', 'logo'], since: '2.1.0' },
  { id: 'fontSize', section: 'appearance', type: 'seg', key: KEYS.fontSize, label: 'Text size', default: 'medium', options: opt(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']), tips: { small: '13 px text', medium: '14 px text', large: '16 px text' }, keywords: ['font', 'bigger', 'smaller', 'zoom'], since: '2.1.0' },
  { id: 'density', section: 'appearance', type: 'seg', key: KEYS.density, label: 'Density', desc: 'Comfortable adds space around rows.', default: 'compact', options: opt(['compact', 'Compact'], ['comfortable', 'Comfortable']), keywords: ['spacing', 'padding', 'rows'], since: '2.1.0' },
  { id: 'reduceMotion', section: 'appearance', type: 'seg', key: KEYS.motion, label: 'Motion', desc: 'Reduce turns animations off, including the start screen.', default: 'system', options: opt(['system', 'System'], ['reduce', 'Reduce']), keywords: ['animation', 'accessibility'], since: '2.1.0' },
  { id: 'splash', section: 'appearance', type: 'seg', key: KEYS.splash, label: 'Start animation', desc: 'Full plays the whole logo animation each time the app starts. Short only fades the logo in.', default: 'full', options: opt(['full', 'Full'], ['short', 'Short']), tips: { full: 'About three seconds, every start', short: 'Half a second' }, keywords: ['splash', 'logo', 'loading', 'intro'], since: '2.1.2' },

  // ---- Behavior
  // v2.1.3: "Pull down to refresh" and "Block right-click and long-press menus" were removed (owner): both are fixed behavior now. The section keeps
  // one real setting; v2.2.0 onward adds the library and import behavior settings here.
  // v2.2.2 (owner): "Collapse the sidebar" moved here from Appearance, it is about behavior.
  { id: 'sidebarCollapsed', local: true, section: 'behavior', type: 'switch', key: 'ui.sidebarCollapsed', label: 'Collapse the sidebar', desc: 'Wide screens only.', default: false, keywords: ['navigation', 'sidebar'], since: '2.1.0' },
  { id: 'hideBar', section: 'behavior', type: 'switch', key: 'ui.hideBar', label: 'Hide bottom bar on scroll', desc: 'Phones only. The bar returns when you scroll up.', default: true, keywords: ['navigation', 'bottom bar', 'scroll'], since: '2.1.0' },

  // ---- Library and links (v2.2.0)
  { id: 'libView', section: 'library', type: 'seg', key: 'lib.view', label: 'Library layout', desc: 'Folders as a grid of cards or as a compact list.', default: 'grid', options: opt(['grid', 'Grid'], ['list', 'List']), keywords: ['folders', 'view', 'cards'], since: '2.2.0' },
  { id: 'libSort', section: 'library', type: 'seg', key: 'lib.sort', label: 'Folder order', desc: 'Pinned folders always stay on top.', default: 'manual', options: opt(['manual', 'Default'], ['name', 'Name'], ['recent', 'Recent'], ['links', 'Size']), keywords: ['sort', 'order', 'folders'], since: '2.2.0' },
  { id: 'folderView', section: 'library', type: 'seg', key: 'folder.view', label: 'Link layout', desc: 'Links inside a folder as rows or as cards.', default: 'list', options: opt(['list', 'List'], ['grid', 'Grid']), keywords: ['links', 'view', 'cards', 'rows'], since: '2.2.0' },
  // v2.2.2 (owner): "Link order" was removed. Pinned links always stay on top; the order below them is the Sort control of the folder page.
  { id: 'openIn', section: 'library', type: 'seg', key: 'lib.openIn', label: 'Open links in', desc: 'Preview shows the page, video, photo and details inside Linkivo. New tab opens the site itself.', default: 'preview', options: opt(['preview', 'Preview'], ['tab', 'New tab']), keywords: ['preview', 'open', 'new tab', 'click'], since: '2.3.0' },
  { id: 'showUrl', section: 'library', type: 'switch', key: 'lib.showUrl', label: 'Show the domain on links', desc: 'The site name under each link title.', default: true, keywords: ['domain', 'host', 'url'], since: '2.2.0' },
  { id: 'showPoints', section: 'library', type: 'switch', key: 'lib.showPoints', label: 'Show points on links', desc: 'The weight Random Discover uses. Useful while you tune it.', default: false, keywords: ['points', 'score', 'random'], since: '2.2.0' },
  { id: 'confirmDelete', section: 'library', type: 'switch', key: 'lib.confirmDelete', label: 'Type the name to delete a folder with links', desc: 'Off asks a simple yes or no. Deleted folders stay in the Recycle Bin for 15 days either way.', default: true, keywords: ['delete', 'confirm', 'safety'], since: '2.2.0' },
  { id: 'clipboard', section: 'library', type: 'switch', key: 'lib.clipboard', onOn: 'clipboard', label: 'Look in the clipboard for links', desc: 'Once your browser allows clipboard access, links you copied are suggested for import when the app opens, and fill the Add link field. Works in Chrome and Edge; other browsers cannot read the clipboard quietly.', default: true, keywords: ['paste', 'clipboard', 'quick add', 'import', 'suggestion'], since: '2.2.0' },

  { id: 'toastTime', section: 'behavior', type: 'seg', key: 'toast.duration', label: 'Toast time', desc: 'How long a small message stays on screen. Messages with Undo stay at least 5 seconds.', default: '2500', options: opt(['1000', '1 s'], ['2000', '2 s'], ['2500', '2.5 s'], ['3000', '3 s'], ['3500', '3.5 s'], ['4000', '4 s'], ['5000', '5 s'], ['10000', '10 s']), keywords: ['toast', 'message', 'time', 'duration', 'notification'], since: '2.3.2' },

  // ---- Search and Preview (v2.3.1, owner: the v2.3.0 pages had no settings of their own)
  { id: 'searchRecent', section: 'search', type: 'switch', key: 'search.recent', label: 'Remember recent searches', desc: 'The last 50 searches are listed when the field is empty. Off keeps no list.', default: true, keywords: ['history', 'recent', 'privacy'], since: '2.3.1' },
  { id: 'searchPages', section: 'search', type: 'switch', key: 'search.pages', label: 'Find app pages and settings', desc: 'Search also lists pages such as Library or Recycle Bin and single settings.', default: true, keywords: ['pages', 'settings', 'menu'], since: '2.3.1' },
  { id: 'pvTab', section: 'preview', type: 'seg', key: 'preview.defaultTab', label: 'Tab that opens first', desc: 'Last used remembers your choice per device. A tab that does not exist for a link is skipped.', default: 'last', options: opt(['last', 'Last used'], ['page', 'Page'], ['photo', 'Thumbnail'], ['shot', 'Screenshot'], ['details', 'Details']), keywords: ['preview', 'default', 'tab', 'page', 'screenshot'], since: '2.3.1' },
  { id: 'pvRelated', section: 'preview', type: 'switch', key: 'preview.related', label: 'Show related links', desc: 'Wide screens only. Up to 20 links from the same folder, site or with the same tags.', default: true, keywords: ['preview', 'related', 'side', 'list'], since: '2.3.1' },
  { id: 'pvMicrolink', section: 'preview', type: 'switch', key: 'meta.microlink', label: 'Use Microlink first', suffix: 'mlLeft', info: 'Microlink reads the widest range of pages, plus video and audio. The free use is about 25 lookups a day. The number is a reminder: Microlink is still asked when it reads 0, and when it gives nothing the next service takes over. A link is looked up once and the answer is stored, so opening it again costs nothing.', desc: 'Reads the widest range of pages, plus video and audio. When it gives nothing the normal services take over.', default: true, keywords: ['microlink', 'metadata', 'api', 'limit', 'video', 'audio'], since: '2.3.1' },
  { id: 'pvThum', section: 'preview', type: 'switch', key: 'preview.thum', label: 'Use thum.io for screenshots', suffix: 'thumLeft', info: 'thum.io makes the Screenshot tab picture. Normal accounts get 10 a day; after that WordPress mShots is used.', desc: 'When it is off or used up, WordPress mShots makes the screenshot.', default: true, keywords: ['screenshot', 'thum', 'thumbnail', 'image'], since: '2.3.1' },

  // ---- Random Discover and History (v2.4.1)
  { id: 'rndMode', section: 'random', type: 'seg', key: 'random.mode', label: 'How links are picked', desc: 'Balanced favours links with more points and ones you have not opened lately. Points only ignores everything else. Equal chance treats all links the same.', default: 'balanced', options: opt(['balanced', 'Balanced'], ['points', 'Points only'], ['equal', 'Equal chance'], ['underdog', 'Low points first'], ['fresh', 'Never opened first']), keywords: ['random', 'mode', 'weight', 'points', 'shuffle'], since: '2.4.1' },
  { id: 'rndGamma', section: 'random', type: 'seg', key: 'random.gamma', label: 'Point influence', desc: 'How strongly points steer the pick. Sharp makes high-point links come up much more often.', default: 'normal', options: opt(['soft', 'Soft'], ['normal', 'Normal'], ['sharp', 'Sharp']), keywords: ['points', 'weight', 'random'], since: '2.4.1' },
  { id: 'rndAvoid', section: 'random', type: 'seg', key: 'random.avoid', label: 'Avoid links opened recently', desc: 'A link opened inside this time is much less likely to come up again.', default: '24h', options: opt(['off', 'Off'], ['6h', '6 hours'], ['24h', '1 day'], ['72h', '3 days'], ['7d', '7 days']), keywords: ['recent', 'repeat', 'random'], since: '2.4.1' },
  { id: 'rndAuto', section: 'random', type: 'seg', key: 'random.auto', label: 'Open the next link by itself', desc: 'A countdown shows on screen; any tap on the page stops it.', default: 'off', options: opt(['off', 'Off'], ['15', '15 seconds'], ['30', '30 seconds'], ['60', '1 minute'], ['120', '2 minutes']), keywords: ['auto', 'advance', 'timer', 'random'], since: '2.4.1' },
  { id: 'rndSkipDead', section: 'random', type: 'switch', key: 'random.skipDead', label: 'Skip links that look dead', desc: 'Links the dead-link check marked are left out.', default: true, keywords: ['dead', 'broken', 'random'], since: '2.4.1' },
  { id: 'rndRemember', section: 'random', type: 'switch', key: 'random.remember', label: 'Remember my folders and filters', desc: 'Random Discover opens with the choices you made last time on this device.', default: true, keywords: ['filters', 'folders', 'random'], since: '2.4.1' },
  { id: 'rndDrift', section: 'random', type: 'switch', key: 'random.drift', label: 'Let points drift back toward 100', desc: 'Points that have not been touched for weeks move slowly back to the start value, so no link stays stuck on top or bottom.', default: false, keywords: ['points', 'drift', 'random'], since: '2.4.1' },
  { id: 'histKeep', section: 'history', type: 'custom', custom: 'historyKeep', key: 'history.keep', label: 'Keep history for', default: '7d', keywords: ['history', 'time', 'delete', 'clear', 'days'], since: '2.4.1' },
  { id: 'histWhere', section: 'history', type: 'seg', local: true, key: 'history.where', label: 'Where history is kept', desc: 'This device keeps it private to this browser. Account shows the same list on every device you sign in on (guests always use this device). Each place has its own list.', default: 'local', options: opt(['local', 'This device'], ['account', 'My account']), keywords: ['history', 'sync', 'local', 'cloud'], since: '2.4.1' },
  { id: 'histOpen', section: 'history', type: 'custom', custom: 'historyOpen', label: 'Open History', keywords: ['history', 'opened', 'recent'], since: '2.4.1' },

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
  { id: 'pvAdmin', section: 'account', type: 'custom', custom: 'adminView', label: 'View the app as', keywords: ['admin', 'normal user', 'test'], since: '2.3.1' },   // v2.4.1: moved to Account; the row draws nothing for accounts that are not admins
  { id: 'syncPick', section: 'account', type: 'custom', custom: 'syncPick', label: 'Select which settings to sync', keywords: ['sync', 'settings', 'account', 'device', 'local'], since: '2.3.1' },
  { id: 'sync', section: 'account', type: 'custom', custom: 'sync', label: 'Data and sync', keywords: ['database', 'cache', 'indexeddb', 'sync status', 'sync now', 'storage'], since: '2.1.0' },

  // ---- App
  // v2.2.2 (owner): install, Update automatically (updates happen by themselves), Updates and the separate About and Developer rows are gone.
  // The section shows the app details only: the same card as the mobile Menu page, with the links as rows.
  { id: 'appDetails', section: 'app', type: 'custom', custom: 'appDetails', label: 'App details', keywords: ['version', 'about', 'developer', 'source code', 'privacy', 'terms', 'report', 'documentation', 'highlights', 'turzo', 'muhtasim'], since: '2.2.2' },

  // ---- Advanced
  { id: 'worker', section: 'advanced', type: 'custom', custom: 'worker', label: 'Metadata service', keywords: ['worker', 'cloudflare', 'status'], since: '2.1.0' },
  { id: 'tester', section: 'advanced', type: 'custom', custom: 'tester', label: 'Metadata tester', keywords: ['metadata', 'title', 'favicon', 'test urls'], since: '2.1.0' },
  { id: 'debugLog', section: 'advanced', type: 'custom', custom: 'debug', label: 'Debug log', keywords: ['logs', 'errors'], since: '2.1.0' },
  // ---- Danger zone (v2.2.3, owner request): the important actions live here because the Advanced section will be removed later. v2.3.0 order (owner): log out, clear app cache, reset all settings, clear local storage data, delete account
  { id: 'logout', section: 'danger', type: 'custom', custom: 'logout', label: 'Log out', keywords: ['sign out', 'leave', 'guest'], since: '2.2.3' },
  { id: 'clearCache', section: 'danger', type: 'custom', custom: 'clearCache', label: 'Clear app cache', keywords: ['cache', 'reload', 'stale', 'fix'], since: '2.1.2' },
  { id: 'reset', section: 'danger', type: 'custom', custom: 'reset', label: 'Reset all settings', sensitive: true, keywords: ['defaults', 'restore'], since: '2.1.0' },
  { id: 'clearLocal', section: 'danger', type: 'custom', custom: 'clearLocal', label: 'Clear local storage data', sensitive: true, keywords: ['erase', 'wipe', 'storage', 'cache', 'cookies', 'log out', 'local data', 'reset app'], since: '2.2.3' },
  { id: 'deleteAccount', section: 'danger', type: 'custom', custom: 'deleteAccount', label: 'Delete account', sensitive: true, keywords: ['remove account', 'close account', 'erase account', 'delete data'], since: '2.2.4' }
];

export const entriesFor = (sectionId) => CATALOG.filter((e) => e.section === sectionId);
export const resettableKeys = () => CATALOG.filter((e) => e.key).map((e) => e.key);
