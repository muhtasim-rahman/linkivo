/**
 * Linkivo — js/features/library/library-page.js  (v2.2.0, v2.2.1, v2.2.2)
 * Purpose: /library — every folder as a grid or list: search, filter, sort, the virtual Favourites folder, pin, and the three-dot menu with
 *          rename, color and icon, import here, export, duplicate, merge and delete. Works the same for guests and accounts (the engine hides the difference).
 * v2.2.1: flat minimal folder cards (css/pages/library.css), the shared dropdown for filter and sort, keyboard shortcuts (press ? to list them) and a refresh
 *          icon on wide screens.
 * v2.2.2 (owner request): the filter dropdown (all, pinned, with links, empty) is gone, Sort is an icon beside the search field on phones, and the
 *          "Add a link" button left the header (quick add stays in the folder page and on the key a).
 * Page module: mount(container, ctx) -> unmount;  refresh()
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openMenu } from '../../ui/popover.js';
import { createSelect } from '../../ui/select.js';
import { refreshButton } from '../../ui/refresh-button.js';
import { registerShortcuts } from '../../core/shortcuts.js';
import { openShortcutHelp } from '../../ui/shortcut-help.js';
import { emptyState } from '../../ui/empty-state.js';
import { skeletonList } from '../../ui/skeleton.js';
import { toast } from '../../ui/toast.js';
import { loadCss } from '../../core/css-loader.js';
import { getEngine, getQueue } from '../../core/app-data.js';
import { plural, relativeTime } from '../../core/format.js';
import { favouritesFolder, folderTile, colorOf, FAV_ID } from './folder-style.js';
import { folderMenuItems } from './folder-actions.js';
import { openFolderForm } from './pickers.js';
import { openQuickAdd } from './quick-add.js';
import { pref, setPref, LIB } from './lib-prefs.js';

const SORTS = { manual: 'Default order', name: 'Name A to Z', recent: 'Recently changed', links: 'Most links', new: 'Newest first', old: 'Oldest first' };
const FILTERS = { all: 'All folders', pinned: 'Pinned', filled: 'With links', empty: 'Empty' };

export function sortFolders(list, sort) {
  const by = { manual: (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.ts - b.ts, name: (a, b) => a.name.localeCompare(b.name), recent: (a, b) => b.up - a.up, links: (a, b) => (b.lc || 0) - (a.lc || 0), new: (a, b) => b.ts - a.ts, old: (a, b) => a.ts - b.ts }[sort] || (() => 0);
  return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || by(a, b));
}
export function filterFolders(list, { q = '', filter = 'all' }) {
  const needle = q.trim().toLowerCase();
  return list.filter((f) => (!needle || f.name.toLowerCase().includes(needle)) && (filter === 'all' || (filter === 'pinned' && f.pinned) || (filter === 'filled' && (f.lc || 0) > 0) || (filter === 'empty' && !(f.lc || 0))));
}

export async function mount(container, ctx) {
  if (!getEngine()) { container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'Your data is not ready', text: 'Wait a moment and try again, or reload the app.', actions: [{ label: 'Open library', href: '/library', primary: true }] }))); return () => {}; }
  await loadCss('/css/pages/library.css');
  const engine = getEngine(), queue = getQueue(), router = ctx.router;
  const st = { q: '', filter: 'all', sort: pref(LIB.sort), view: pref(LIB.view) };
  const page = h('div', { class: 'page lib page-enter' });
  container.appendChild(page);

  const sub = h('p', { class: 'page-sub lib-sub', 'aria-live': 'polite' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search folders', 'aria-label': 'Search folders', autocomplete: 'off' });
  const pairs = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
  // ! Unused since v2.2.2: the folder filter dropdown was removed (owner request). `filterFolders` and FILTERS stay because tests and a later search use them.
  const sortSel = createSelect({ options: pairs(SORTS), value: st.sort, label: 'Sort folders', lead: 'sort', compact: true, align: 'end', onChange: (v) => { st.sort = v; setPref(LIB.sort, v); update(); } });
  const viewBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Switch view' });
  const body = h('div', { class: 'lib-body' });
  page.append(
    h('header', { class: 'page-head is-stack lib-head' }, h('div', { class: 'lib-headrow' }, h('h1', { class: 'page-title', text: 'Library' }),
      h('div', { class: 'page-actions' }, refreshButton(() => refresh()), viewBtn,
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', on: { click: () => openFolderForm({ engine }) } }, icon('plus', { size: 18 }), 'New folder'))), sub),
    h('div', { class: 'fp-tools' }, h('div', { class: 'fp-search' }, icon('search', { size: 18 }), search), sortSel), body);

  function card(f, wide) {
    const virtual = f.id === FAV_ID;
    const more = virtual ? null : h('button', { type: 'button', class: 'btn-icon fcard-more', 'aria-label': `Actions for ${f.name}`, 'aria-haspopup': 'menu', on: { click: (e) => { const b = e.currentTarget; if (b._m?.isOpen()) return; b._m = openMenu(b, folderMenuItems({ engine, router, folder: engine.getFolder(f.id) || f, onSelectMode: () => router.navigate(`/folder/${f.id}?select=1`) })); } } }, icon('more', { size: 18 }));
    return h('div', { class: ['fcard-wrap', wide && 'is-row', virtual && 'is-virtual'], style: { '--fc': colorOf(f) } },
      h('a', { class: 'fcard', href: `/folder/${f.id}` }, folderTile(f, 36),
        h('span', { class: 'fcard-text' }, h('span', { class: 'fcard-name', text: f.name }), h('span', { class: 'fcard-meta', text: `${plural(f.lc || 0, 'link')}${!virtual && f.up ? '  \u00b7  ' + relativeTime(f.up) : ''}` })),
        f.pinned && h('span', { class: 'fcard-pin', 'aria-label': 'Pinned' }, icon('pin', { size: 14 }))), more);
  }

  function update() {
    const folders = engine.listFolders(), counts = engine.counts(), favCount = engine.listLinks().filter((l) => l.fv).length;
    sub.textContent = folders.length ? `${plural(counts.folders, 'folder')}  \u00b7  ${plural(counts.links, 'link')}` : '';
    viewBtn.replaceChildren(icon(st.view === 'grid' ? 'list' : 'grid', { size: 20 })); viewBtn.setAttribute('aria-label', st.view === 'grid' ? 'Switch to list' : 'Switch to grid');
    const syncing = engine.status().state === 'syncing';
    if (!folders.length && syncing) { body.replaceChildren(skeletonList(6)); return; }
    if (!folders.length) { body.replaceChildren(emptyState({ art: 'library', title: 'Your library is empty', text: 'Create a folder for a topic, or import links and let Linkivo file them for you.', actions: [{ label: 'New folder', primary: true, onClick: () => openFolderForm({ engine }) }, { label: 'Import links', href: '/import' }] })); return; }
    const list = sortFolders(filterFolders(folders, st), st.sort);
    const showFav = (!st.q.trim() || 'favourites'.includes(st.q.trim().toLowerCase())) && st.filter === 'all';
    const wide = st.view === 'list';
    const nodes = [...(showFav ? [card(favouritesFolder(favCount), wide)] : []), ...list.map((f) => card(f, wide))];
    if (!list.length && !showFav) { body.replaceChildren(emptyState({ art: 'search', title: 'No folder matches', text: 'Try another name or clear the filter.', actions: [{ label: 'Clear filters', onClick: () => { st.q = ''; st.filter = 'all'; search.value = ''; update(); } }] })); return; }
    body.replaceChildren(h('div', { class: ['lib-grid', wide && 'is-list'], role: 'list' }, nodes.map((n) => { n.setAttribute('role', 'listitem'); return n; })));
  }

  let t = 0; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; update(); }, 120); });
    viewBtn.addEventListener('click', () => { st.view = st.view === 'grid' ? 'list' : 'grid'; setPref(LIB.view, st.view); update(); });
  let raf = 0; const off = engine.subscribe((ev) => { if (ev.type === 'change' || ev.type === 'ready' || ev.type === 'sync') { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); } });
  // ---- keyboard (v2.2.1) ----
  const keys = [
    { keys: '/', desc: 'Search folders', run: () => search.focus() },
    { keys: 'mod+f', desc: 'Search folders', run: () => search.focus() },
    { keys: 'n', desc: 'New folder', run: () => openFolderForm({ engine }) },
    { keys: 'a', desc: 'Add a link', run: () => openQuickAdd({ engine, queue }) },
    { keys: 'i', desc: 'Import links', run: () => router.navigate('/import') },
    { keys: 'v', desc: 'Switch grid and list', run: () => viewBtn.click() },
    { keys: '?', desc: 'Show these shortcuts', run: () => openShortcutHelp(keys) }
  ];
  const offKeys = registerShortcuts(keys);
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; st.q = ''; search.blur(); update(); } });
  update();
  return () => { off(); offKeys(); cancelAnimationFrame(raf); clearTimeout(t); };
}

export async function refresh() { try { await getEngine()?.flush?.(); } catch { toast('Could not refresh.', { type: 'error' }); } }
