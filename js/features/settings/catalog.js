/**
 * Linkivo — js/features/settings/catalog.js  (v2.1.1)
 * Purpose: the declarative settings registry (D-030). The Settings page, the reset action and (from v2.3.0) Global search all read this one list.
 *          Each version adds the settings of the features it ships; v2.6.0 audits the catalog (minimum 30).
 * Entry: { id, section, type: 'seg'|'switch'|'swatch'|'select'|'custom', key (pref key), label, desc, default, options:[{value,label}],
 *          sensitive, keywords, since, custom (name of a custom row) }
 * API: SECTIONS  CATALOG  entriesFor(sectionId)  findSection(id)  resettableKeys()
 */
import { KEYS, ACCENTS } from '../../core/appearance.js';

export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', desc: 'Theme, accent color, text size and motion.', icon: 'palette' },
  { id: 'controls', label: 'Controls', desc: 'How the app responds to touch and mouse.', icon: 'zap' },
  { id: 'app', label: 'App', desc: 'What opens first, updates and installing.', icon: 'install' },
  { id: 'account', label: 'Account and sync', desc: 'Who is signed in and where your data lives.', icon: 'user' },
  { id: 'data', label: 'Data and storage', desc: 'Space used on this device and the app cache.', icon: 'database' },
  { id: 'about', label: 'About', desc: 'The app, its developer and legal pages.', icon: 'info' },
  { id: 'advanced', label: 'Advanced', desc: 'Metadata tester, debug log and reset.', icon: 'terminal' }
];
export const findSection = (id) => SECTIONS.find((s) => s.id === id) || null;

const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));

export const CATALOG = [
  { id: 'theme', section: 'appearance', type: 'seg', key: KEYS.theme, label: 'Theme', desc: 'System follows your device.', default: 'system', options: opt(['system', 'System'], ['light', 'Light'], ['dark', 'Dark']), keywords: ['dark mode', 'light mode', 'night'], since: '2.1.0' },
  { id: 'accent', section: 'appearance', type: 'swatch', key: KEYS.accent, label: 'Accent color', desc: 'Colors the logo, active markers, focus rings and buttons.', default: 'blue', options: Object.entries(ACCENTS).map(([value, color]) => ({ value, label: value[0].toUpperCase() + value.slice(1), color })), keywords: ['color', 'colour', 'highlight', 'logo'], since: '2.1.0' },
  { id: 'fontSize', section: 'appearance', type: 'seg', key: KEYS.fontSize, label: 'Text size', default: 'medium', options: opt(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']), keywords: ['font', 'bigger', 'smaller', 'zoom'], since: '2.1.0' },
  { id: 'density', section: 'appearance', type: 'seg', key: KEYS.density, label: 'Density', desc: 'Comfortable adds space around rows.', default: 'compact', options: opt(['compact', 'Compact'], ['comfortable', 'Comfortable']), keywords: ['spacing', 'padding', 'rows'], since: '2.1.0' },
  { id: 'contrast', section: 'appearance', type: 'seg', key: KEYS.contrast, label: 'Contrast', desc: 'High contrast darkens lines and secondary text.', default: 'normal', options: opt(['normal', 'Normal'], ['high', 'High']), keywords: ['accessibility', 'readability'], since: '2.1.1' },
  { id: 'links', section: 'appearance', type: 'seg', key: KEYS.links, label: 'Links', desc: 'Underline links so they stand out without color.', default: 'normal', options: opt(['normal', 'Normal'], ['underline', 'Underlined']), keywords: ['underline', 'accessibility'], since: '2.1.1' },
  { id: 'reduceMotion', section: 'appearance', type: 'seg', key: KEYS.motion, label: 'Motion', desc: 'Reduce turns animations off, including the start animation.', default: 'system', options: opt(['system', 'System'], ['reduce', 'Reduce']), keywords: ['animation', 'accessibility'], since: '2.1.0' },
  { id: 'startAnimation', section: 'appearance', type: 'seg', key: KEYS.startAnimation, label: 'Start animation', desc: 'Auto plays the full logo animation once, then a short one.', default: 'auto', options: opt(['auto', 'Auto'], ['full', 'Always full'], ['short', 'Always short']), keywords: ['splash', 'loading', 'intro'], since: '2.1.1' },
  { id: 'pageTransitions', section: 'appearance', type: 'switch', key: KEYS.pageTransitions, label: 'Page transitions', desc: 'A soft fade when a page opens.', default: true, keywords: ['animation', 'fade'], since: '2.1.1' },
  { id: 'hideBar', section: 'appearance', type: 'switch', key: 'ui.hideBar', label: 'Hide bottom bar on scroll', desc: 'Phones only. The bar returns when you scroll up.', default: true, keywords: ['navigation', 'bottom bar'], since: '2.1.0' },
  { id: 'sidebarCollapsed', section: 'appearance', type: 'switch', key: 'ui.sidebarCollapsed', label: 'Collapse the sidebar', desc: 'Wide screens only.', default: false, keywords: ['navigation', 'sidebar'], since: '2.1.0' },

  { id: 'pullRefresh', section: 'controls', type: 'switch', key: KEYS.pullRefresh, label: 'Pull to refresh', desc: 'Phones: pull down from the top of a page to reload the app.', default: true, keywords: ['reload', 'refresh', 'swipe'], since: '2.1.1' },
  { id: 'contextMenu', section: 'controls', type: 'switch', key: KEYS.contextMenu, label: 'Allow the browser menu', desc: 'Right-click on PC and long-press on phones. Off keeps the app clean; text fields always keep copy and paste.', default: false, keywords: ['right click', 'long press', 'context menu', 'select text'], since: '2.1.1' },

  { id: 'startPage', section: 'app', type: 'select', key: 'app.startPage', label: 'Open on start', desc: 'The page Linkivo opens first.', default: 'library', options: opt(['library', 'Library'], ['random', 'Random Discover'], ['search', 'Search']), keywords: ['home', 'first page', 'startup'], since: '2.1.1' },
  { id: 'autoUpdate', section: 'app', type: 'switch', key: 'app.autoUpdate', label: 'Install updates automatically', desc: 'When off, Linkivo asks before it reloads into a new version.', default: true, keywords: ['update', 'new version'], since: '2.1.1' },
  { id: 'install', section: 'app', type: 'custom', custom: 'install', label: 'Install', keywords: ['pwa', 'home screen', 'app icon'], since: '2.1.0' },
  { id: 'updates', section: 'app', type: 'custom', custom: 'update', label: 'Updates', keywords: ['version', 'refresh', 'new version'], since: '2.1.0' },

  { id: 'accountInfo', section: 'account', type: 'custom', custom: 'account', label: 'Account', keywords: ['sign in', 'log in', 'log out', 'email', 'guest', 'sync', 'password', 'name'], since: '2.1.0' },

  { id: 'storage', section: 'data', type: 'custom', custom: 'storage', label: 'Storage', keywords: ['database', 'cache', 'indexeddb', 'sync status'], since: '2.1.0' },
  { id: 'estimate', section: 'data', type: 'custom', custom: 'estimate', label: 'Space used', keywords: ['quota', 'size', 'disk'], since: '2.1.1' },
  { id: 'persist', section: 'data', type: 'custom', custom: 'persist', label: 'Keep data on this device', keywords: ['persistent storage', 'evict', 'guest'], since: '2.1.1' },
  { id: 'clearCache', section: 'data', type: 'custom', custom: 'clearCache', label: 'Clear app cache', keywords: ['cache', 'reload', 'fix'], since: '2.1.1' },

  { id: 'about', section: 'about', type: 'custom', custom: 'about', label: 'About Linkivo', keywords: ['version', 'highlights'], since: '2.1.1' },
  { id: 'developer', section: 'about', type: 'custom', custom: 'developer', label: 'Developer', keywords: ['author', 'contact', 'github'], since: '2.1.1' },
  { id: 'legal', section: 'about', type: 'custom', custom: 'legal', label: 'Documentation and legal', keywords: ['terms', 'privacy', 'docs'], since: '2.1.1' },

  { id: 'worker', section: 'advanced', type: 'custom', custom: 'worker', label: 'Metadata service', keywords: ['worker', 'cloudflare', 'status'], since: '2.1.0' },
  { id: 'tester', section: 'advanced', type: 'custom', custom: 'tester', label: 'Metadata tester', keywords: ['metadata', 'title', 'favicon', 'test urls'], since: '2.1.0' },
  { id: 'debugLog', section: 'advanced', type: 'custom', custom: 'debug', label: 'Debug log', keywords: ['logs', 'errors'], since: '2.1.0' },
  { id: 'reset', section: 'advanced', type: 'custom', custom: 'reset', label: 'Reset settings', sensitive: true, keywords: ['defaults', 'restore'], since: '2.1.0' }
];

export const entriesFor = (sectionId) => CATALOG.filter((e) => e.section === sectionId);
export const resettableKeys = () => CATALOG.filter((e) => e.key).map((e) => e.key);
