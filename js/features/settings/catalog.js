/**
 * Linkivo — js/features/settings/catalog.js  (v2.1.0)
 * Purpose: the declarative settings registry (D-030). The Settings page, the reset action and (from v2.3.0) Global search all read
 *          this one list, so a setting can not exist in one place and be missing in another. Each version adds the settings of the
 *          features it ships; v2.6.0 audits the catalog (minimum 30).
 * Entry: { id, section, type: 'seg'|'switch'|'swatch'|'custom', key (pref key), label, desc, default, options:[{value,label}],
 *          sensitive (needs the PIN gate when the app lock exists), keywords, since, custom (name of a custom row) }
 * API: SECTIONS  CATALOG  entriesFor(sectionId)  findSection(id)  resettableKeys()
 */
import { KEYS, ACCENTS } from '../../core/appearance.js';

export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', desc: 'Theme, accent color, text size', icon: 'palette' },
  { id: 'account', label: 'Account and sync', desc: 'Sign-in and where your data lives', icon: 'user' },
  { id: 'app', label: 'App', desc: 'Install, updates, version', icon: 'install' },
  { id: 'advanced', label: 'Advanced', desc: 'Metadata tester, debug log, reset', icon: 'terminal' }
];
export const findSection = (id) => SECTIONS.find((s) => s.id === id) || null;

const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));

export const CATALOG = [
  { id: 'theme', section: 'appearance', type: 'seg', key: KEYS.theme, label: 'Theme', desc: 'System follows your device.', default: 'system', options: opt(['system', 'System'], ['light', 'Light'], ['dark', 'Dark']), keywords: ['dark mode', 'light mode', 'night'], since: '2.1.0' },
  { id: 'accent', section: 'appearance', type: 'swatch', key: KEYS.accent, label: 'Accent color', desc: 'Used for the active marker, focus rings and primary buttons.', default: 'blue', options: Object.entries(ACCENTS).map(([value, color]) => ({ value, label: value[0].toUpperCase() + value.slice(1), color })), keywords: ['color', 'colour', 'highlight'], since: '2.1.0' },
  { id: 'fontSize', section: 'appearance', type: 'seg', key: KEYS.fontSize, label: 'Text size', default: 'medium', options: opt(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']), keywords: ['font', 'bigger', 'smaller', 'zoom'], since: '2.1.0' },
  { id: 'density', section: 'appearance', type: 'seg', key: KEYS.density, label: 'Density', desc: 'Comfortable adds space around rows.', default: 'compact', options: opt(['compact', 'Compact'], ['comfortable', 'Comfortable']), keywords: ['spacing', 'padding', 'rows'], since: '2.1.0' },
  { id: 'reduceMotion', section: 'appearance', type: 'seg', key: KEYS.motion, label: 'Motion', desc: 'Reduce turns animations off, including the start screen.', default: 'system', options: opt(['system', 'System'], ['reduce', 'Reduce']), keywords: ['animation', 'accessibility'], since: '2.1.0' },
  { id: 'hideBar', section: 'appearance', type: 'switch', key: 'ui.hideBar', label: 'Hide bottom bar on scroll', desc: 'Phones only. The bar returns when you scroll up.', default: true, keywords: ['navigation', 'bottom bar'], since: '2.1.0' },
  { id: 'sidebarCollapsed', section: 'appearance', type: 'switch', key: 'ui.sidebarCollapsed', label: 'Collapse the sidebar', desc: 'Wide screens only.', default: false, keywords: ['navigation', 'sidebar'], since: '2.1.0' },

  { id: 'accountInfo', section: 'account', type: 'custom', custom: 'account', label: 'Account', keywords: ['sign in', 'log in', 'log out', 'email', 'guest', 'sync'], since: '2.1.0' },

  { id: 'install', section: 'app', type: 'custom', custom: 'install', label: 'Install', keywords: ['pwa', 'home screen', 'app icon'], since: '2.1.0' },
  { id: 'updates', section: 'app', type: 'custom', custom: 'update', label: 'Updates', keywords: ['version', 'refresh', 'new version'], since: '2.1.0' },
  { id: 'about', section: 'app', type: 'custom', custom: 'about', label: 'About', keywords: ['developer', 'version'], since: '2.1.0' },

  { id: 'worker', section: 'advanced', type: 'custom', custom: 'worker', label: 'Metadata service', keywords: ['worker', 'cloudflare', 'status'], since: '2.1.0' },
  { id: 'storage', section: 'advanced', type: 'custom', custom: 'storage', label: 'Storage', keywords: ['database', 'cache', 'indexeddb', 'sync status'], since: '2.1.0' },
  { id: 'tester', section: 'advanced', type: 'custom', custom: 'tester', label: 'Metadata tester', keywords: ['metadata', 'title', 'favicon', 'test urls'], since: '2.1.0' },
  { id: 'debugLog', section: 'advanced', type: 'custom', custom: 'debug', label: 'Debug log', keywords: ['logs', 'errors'], since: '2.1.0' },
  { id: 'reset', section: 'advanced', type: 'custom', custom: 'reset', label: 'Reset settings', sensitive: true, keywords: ['defaults', 'restore'], since: '2.1.0' }
];

export const entriesFor = (sectionId) => CATALOG.filter((e) => e.section === sectionId);
export const resettableKeys = () => CATALOG.filter((e) => e.key).map((e) => e.key);
