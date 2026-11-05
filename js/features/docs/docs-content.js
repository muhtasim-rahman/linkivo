/**
 * Linkivo — js/features/docs/docs-content.js  (v2.5.2)
 * Purpose: the text of the Documentation page, as data (one entry per topic) so the page and the tests share one source. Plain language, describes what the app really does.
 * API: TOPICS -> [{ id, title, icon, lead, parts: [{ h, p?, items? }] }]   findTopic(id)
 */
export const TOPICS = [
  { id: 'start', title: 'Getting started', icon: 'zap', lead: 'Linkivo keeps your links in folders you can search, preview and rediscover.', parts: [
    { h: 'Guest or account', p: 'A guest keeps everything on this device only: if the browser data is cleared, nothing can be recovered. An account stores your data online so every device shows the same library. Guests can log in later and move everything into the account.' },
    { h: 'Moving around', items: ['Phone: the floating bar at the bottom (Library, Random, Search, Menu). It hides while you scroll down.', 'Computer: the sidebar on the left. Collapse it with the arrow; when collapsed, the avatar opens the account menu.', 'Every page has its own address, and Back goes to the page above it.'] }] },
  { id: 'library', title: 'Library and folders', icon: 'library', lead: 'Folders hold links. Favourites collects every starred link.', parts: [
    { h: 'Folders', items: ['New folder: pick a name, colour and icon. Pin, rename, duplicate or merge from the three-dot menu.', 'Grid or list view, sort and filter at the top.', 'Deleting a folder moves it to the Recycle Bin for 15 days; Undo appears right after.'] },
    { h: 'Inside a folder', items: ['Search the folder, filter by site, sort, switch layout.', 'Select several links for bulk actions: move, copy, tag, favourite, delete.', 'Each link has a menu: open, copy, edit title, tags, read later, favourite, block.'] }] },
  { id: 'import', title: 'Import', icon: 'import', lead: 'Paste text or drop files; Linkivo finds every link.', parts: [
    { h: 'How it works', items: ['Over twenty formats: plain text, HTML bookmarks, JSON, CSV, Excel, Markdown, OPML and more.', 'A review list lets you pick, sort and fix before saving; duplicates are flagged.', 'Large imports run in chunks of 100, show progress, can be paused, stopped or undone, and continue after a reload.', 'Titles and pictures are fetched afterwards in the background.'] }] },
  { id: 'export', title: 'Export and backup', icon: 'download', lead: 'Your data is yours: export it any time.', parts: [
    { h: 'Formats', p: 'The Linkivo format keeps everything (folders, tags, points, flags, details) and re-imports in seconds. JSON, CSV, Excel, TXT, Markdown, bookmarks HTML, printable HTML and OPML are for other tools.' },
    { h: 'Good habits', items: ['Export the Linkivo format now and then, especially as a guest.', 'Locked folders are never included in an export while locked.'] }] },
  { id: 'preview', title: 'Link preview', icon: 'globe', lead: 'Open a link inside Linkivo with tabs for page, video, image and details.', parts: [
    { h: 'Tabs', items: ['Page: the site itself when it allows being shown; otherwise Linkivo skips to a tab that works.', 'Video and Image: playable or full-size when the site offers them.', 'Details: title, description, address, and which service supplied the data.'] },
    { h: 'Good to know', p: 'Some sites refuse to be shown inside another page. That is the site\'s choice; use Open in a new tab.' }] },
  { id: 'search', title: 'Search', icon: 'search', lead: 'One search for links, folders, pages and settings.', parts: [
    { h: 'Use it', items: ['Press Ctrl or Cmd + K, or the Search tab.', 'Results are grouped; See more shows the rest.', 'The last searches are remembered (turn it off in Settings > Search).'] }] },
  { id: 'random', title: 'Random Discover', icon: 'random', lead: 'Open a surprise from your own links.', parts: [
    { h: 'How it picks', p: 'Links you like get more weight, links you dislike less, blocked links none. Nothing repeats until your pool is used up. Choose folders and filters before you start.' },
    { h: 'Points', items: ['Like raises a link\'s chance, dislike lowers it, favourite raises it strongly.', 'Block removes a link from Random until you restore it.'] }] },
  { id: 'history', title: 'History, Activity and Stats', icon: 'history', lead: 'Three views on what you did, all inside Profile.', parts: [
    { h: 'What is where', items: ['History: links you opened, by day, with search and clear.', 'Activity: imports, exports, deletes and security changes.', 'Stats: totals, links added per month, biggest folders, sites and tags.'] }] },
  { id: 'security', title: 'App lock and locked folders', icon: 'lock', lead: 'A PIN for the app, and a separate code for locked folders.', parts: [
    { h: 'App lock', items: ['Settings > Security: turn it on and choose a 4 to 8 digit PIN.', 'Auto lock closes the app after it has been away; the PIN gate asks again before sensitive actions.', 'Forgot the PIN? Sign in again to choose a new one; your data is kept. A guest who forgets it must erase the device data.'] },
    { h: 'Locked folders (accounts)', items: ['Set a six-digit code in Settings > Security. Choose the symbol (@ # % $ !).', 'Type the symbol and code into the search box, for example @482913, to open them. Nothing else is needed and the box clears itself.', 'A wrong code looks like an ordinary search. It still counts toward the wrong-PIN lockout.', 'Hide the unlock entry to make the search box the only way in.', 'Locked data exists in the browser only while open: it is not in search, history or exports. Move a folder in or out from its menu.'] }] },
  { id: 'account', title: 'Account and sync', icon: 'user', lead: 'Sign-in, devices and your data online.', parts: [
    { h: 'Good to know', items: ['Most settings follow your account; theme, accent, motion and sidebar stay on the device unless you switch them on.', 'Deleting an account keeps it recoverable for 15 days, then removes it for good.', 'Your email is shown masked inside the app.'] }] },
  { id: 'settings', title: 'Settings', icon: 'settings', lead: 'Grouped by what they change; search them from the global search.', parts: [
    { h: 'Groups', items: ['Appearance, Behavior, Library and links, Search, Random Discover, Preview and metadata.', 'History and profile, Account and sync, Security, Import, export and backup.', 'Danger zone, App, Advanced (metadata tester, storage tools, debug log).'] }] },
  { id: 'shortcuts', title: 'Keyboard shortcuts', icon: 'terminal', lead: 'Press ? on most pages to see the list for that page.', parts: [
    { h: 'Common', items: ['Ctrl or Cmd + K: search.', '/ : focus the page\'s search field.', 'N: new folder (Library). A: add a link. I: import.', 'Esc: close a popup or leave selection.'] }] },
  { id: 'install', title: 'Install and updates', icon: 'install', lead: 'Install Linkivo like an app; it updates itself.', parts: [
    { h: 'Install', p: 'Use the Install card in Menu or Settings, or your browser\'s install option. Linkivo works offline for pages you already opened.' },
    { h: 'Updates', p: 'A new version is picked up when the app starts; a short notice offers to reload.' }] }
];
export const findTopic = (id) => TOPICS.find((t) => t.id === id) || null;
