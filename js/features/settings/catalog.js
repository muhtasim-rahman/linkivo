/**
 * Linkivo — js/features/settings/catalog.js  (v2.1.2)
 * Purpose: the declarative settings registry (D-030). The Settings page, the reset action and (from v2.3.0) Global search all read
 *          this one list, so a setting can not exist in one place and be missing in another. Each version adds the settings of the
 *          features it ships; v2.6.0 audits the catalog (minimum 30).
 * Entry: { id, section, type: 'seg'|'switch'|'swatch'|'custom', key (pref key), label, desc, default, options:[{value,label}],
 *          sensitive (needs the PIN gate when the app lock exists), keywords, since, custom (name of a custom row) }
 * API: SECTIONS  CATALOG  entriesFor(sectionId)  findSection(id)  resettableKeys()
 */
import { KEYS, ACCENTS } from '../../core/appearance.js';

export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', desc: 'Theme, accent color, text size, motion and start screen', icon: 'palette' },
  { id: 'behavior', label: 'Behavior', desc: 'How the app responds to touch and mouse', icon: 'zap' },
  { id: 'account', label: 'Account and sync', desc: 'Sign-in, security and where your data lives', icon: 'user' },
  { id: 'app', label: 'App', desc: 'Install, updates and about', icon: 'install' },
  { id: 'advanced', label: 'Advanced', desc: 'Metadata tester, storage tools, debug log, reset', icon: 'terminal' }
];
export const findSection = (id) => SECTIONS.find((s) => s.id === id) || null;

const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));

export const CATALOG = [
  // ---- Appearance
  { id: 'theme', section: 'appearance', type: 'seg', key: KEYS.theme, label: 'Theme', desc: 'System follows your device.', default: 'system', options: opt(['system', 'System'], ['light', 'Light'], ['dark', 'Dark']), keywords: ['dark mode', 'light mode', 'night'], since: '2.1.0' },
  { id: 'accent', section: 'appearance', type: 'swatch', key: KEYS.accent, label: 'Accent color', desc: 'Colors the active marker, buttons, focus rings and the Linkivo logo and name.', default: 'blue', options: Object.entries(ACCENTS).map(([value, color]) => ({ value, label: value[0].toUpperCase() + value.slice(1), color })), keywords: ['color', 'colour', 'highlight', 'logo'], since: '2.1.0' },
  { id: 'fontSize', section: 'appearance', type: 'seg', key: KEYS.fontSize, label: 'Text size', default: 'medium', options: opt(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']), keywords: ['font', 'bigger', 'smaller', 'zoom'], since: '2.1.0' },
  { id: 'density', section: 'appearance', type: 'seg', key: KEYS.density, label: 'Density', desc: 'Comfortable adds space around rows.', default: 'compact', options: opt(['compact', 'Compact'], ['comfortable', 'Comfortable']), keywords: ['spacing', 'padding', 'rows'], since: '2.1.0' },
  { id: 'reduceMotion', section: 'appearance', type: 'seg', key: KEYS.motion, label: 'Motion', desc: 'Reduce turns animations off, including the start screen.', default: 'system', options: opt(['system', 'System'], ['reduce', 'Reduce']), keywords: ['animation', 'accessibility'], since: '2.1.0' },
  { id: 'pageTransitions', section: 'appearance', type: 'switch', key: KEYS.transitions, label: 'Page transitions', desc: 'Pages fade in when you move between them.', default: true, keywords: ['animation', 'smooth'], since: '2.1.2' },
  { id: 'splash', section: 'appearance', type: 'seg', key: KEYS.splash, label: 'Start animation', desc: 'Automatic plays the full logo animation on the first start, then a short one.', default: 'auto', options: opt(['auto', 'Automatic'], ['full', 'Always full'], ['short', 'Short']), keywords: ['splash', 'logo', 'loading', 'intro'], since: '2.1.2' },
  { id: 'hideBar', section: 'appearance', type: 'switch', key: 'ui.hideBar', label: 'Hide bottom bar on scroll', desc: 'Phones only. The bar returns when you scroll up.', default: true, keywords: ['navigation', 'bottom bar'], since: '2.1.0' },
  { id: 'sidebarCollapsed', section: 'appearance', type: 'switch', key: 'ui.sidebarCollapsed', label: 'Collapse the sidebar', desc: 'Wide screens only.', default: false, keywords: ['navigation', 'sidebar'], since: '2.1.0' },

  // ---- Behavior
  { id: 'pullRefresh', section: 'behavior', type: 'switch', key: KEYS.pullRefresh, label: 'Pull down to refresh', desc: 'Phones: drag a page down from the top to reload it and look for updates.', default: true, keywords: ['reload', 'refresh', 'swipe'], since: '2.1.2' },
  { id: 'blockContextMenu', section: 'behavior', type: 'switch', key: KEYS.blockMenu, label: 'Block right-click and long-press menus', desc: 'Keeps the browser menu out of the way. Text fields still allow copy and paste.', default: true, keywords: ['context menu', 'right click', 'long press', 'select text'], since: '2.1.2' },

  // ---- Account and sync
  { id: 'accountInfo', section: 'account', type: 'custom', custom: 'account', label: 'Account', keywords: ['sign in', 'log in', 'log out', 'email', 'guest', 'password', 'verification'], since: '2.1.0' },
  { id: 'sync', section: 'account', type: 'custom', custom: 'sync', label: 'Data and sync', keywords: ['database', 'cache', 'indexeddb', 'sync status', 'sync now', 'storage'], since: '2.1.0' },

  // ---- App
  { id: 'install', section: 'app', type: 'custom', custom: 'install', label: 'Install', keywords: ['pwa', 'home screen', 'app icon', 'desktop'], since: '2.1.0' },
  { id: 'autoUpdate', section: 'app', type: 'switch', key: 'update.auto', label: 'Update automatically', desc: 'When the app starts and a newer version exists, install it at once. Off asks you first.', default: true, keywords: ['version', 'new version', 'refresh'], since: '2.1.2' },
  { id: 'updates', section: 'app', type: 'custom', custom: 'update', label: 'Updates', keywords: ['version', 'refresh', 'new version', 'check'], since: '2.1.0' },
  { id: 'about', section: 'app', type: 'custom', custom: 'about', label: 'About', keywords: ['developer', 'version', 'contact', 'github', 'source'], since: '2.1.0' },

  // ---- Advanced
  { id: 'worker', section: 'advanced', type: 'custom', custom: 'worker', label: 'Metadata service', keywords: ['worker', 'cloudflare', 'status'], since: '2.1.0' },
  { id: 'tester', section: 'advanced', type: 'custom', custom: 'tester', label: 'Metadata tester', keywords: ['metadata', 'title', 'favicon', 'test urls'], since: '2.1.0' },
  { id: 'clearCache', section: 'advanced', type: 'custom', custom: 'clearCache', label: 'Clear app cache', keywords: ['cache', 'reload', 'stale', 'fix'], since: '2.1.2' },
  { id: 'debugLog', section: 'advanced', type: 'custom', custom: 'debug', label: 'Debug log', keywords: ['logs', 'errors'], since: '2.1.0' },
  { id: 'reset', section: 'advanced', type: 'custom', custom: 'reset', label: 'Reset settings', sensitive: true, keywords: ['defaults', 'restore'], since: '2.1.0' }
];

export const entriesFor = (sectionId) => CATALOG.filter((e) => e.section === sectionId);
export const resettableKeys = () => CATALOG.filter((e) => e.key).map((e) => e.key);
