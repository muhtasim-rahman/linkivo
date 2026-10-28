/**
 * Linkivo — js/features/search/search-pages.js  (v2.3.1)
 * Purpose: the pages of the app as search entries (owner: "include the various pages in search"). Typing "recycle", "history" or "privacy" finds the page itself,
 *          and every settings category is a page of its own (/settings/<section>). Pure data + one helper, so the list is tested.
 * API: appPages(sections) -> [{ id, label, desc, path, icon, keywords }]
 */
const BASE = [
  { id: 'library', label: 'Library', desc: 'All your folders', path: '/library', icon: 'library', keywords: ['folders', 'home', 'links'] },
  { id: 'favourites', label: 'Favourites', desc: 'Links you marked with a heart', path: '/folder/favourites', icon: 'heart', keywords: ['favorite', 'liked', 'heart'] },
  { id: 'random', label: 'Random Discover', desc: 'Open a random saved link', path: '/random', icon: 'random', keywords: ['shuffle', 'discover', 'surprise'] },
  { id: 'import', label: 'Import links', desc: 'Paste links or add files and bookmarks', path: '/import', icon: 'plus', keywords: ['add', 'paste', 'upload', 'bookmarks', 'restore'] },
  { id: 'menu', label: 'Menu', desc: 'Profile, quick settings and app info', path: '/menu', icon: 'menu', keywords: ['more', 'about'] },
  { id: 'profile', label: 'Profile', desc: 'Your account and history', path: '/profile', icon: 'user', keywords: ['account', 'me', 'badge'] },
  { id: 'history', label: 'History', desc: 'Links you opened', path: '/profile/history', icon: 'history', keywords: ['recent', 'opened', 'visited'] },
  { id: 'bin', label: 'Recycle Bin', desc: 'Deleted folders and links, kept 15 days', path: '/settings/recycle-bin', icon: 'trash', keywords: ['deleted', 'restore', 'trash', 'bin'] },
  { id: 'docs', label: 'Documentation', desc: 'How every feature works', path: '/docs', icon: 'book', keywords: ['help', 'guide', 'how to', 'manual'] },
  { id: 'terms', label: 'Terms', desc: 'The rules of using Linkivo', path: '/terms', icon: 'file', keywords: ['conditions', 'legal'] },
  { id: 'privacy', label: 'Privacy', desc: 'What is stored and where', path: '/privacy', icon: 'shield', keywords: ['data', 'legal', 'policy'] }
];

export function appPages(sections = []) {
  return [...BASE, ...sections.map((s) => ({ id: 'settings-' + s.id, label: `Settings: ${s.label}`, desc: s.desc || 'Settings', path: `/settings/${s.id}`, icon: s.icon || 'settings', keywords: ['settings', 'preferences', s.label] }))];
}
