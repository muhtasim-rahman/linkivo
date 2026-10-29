/**
 * Linkivo — js/features/library/folder-page.js  (v2.2.0, v2.2.1, v2.2.2)
 * Purpose: /folder/:fid — the links of one folder (or the virtual Favourites folder) with search, domain chips, sort, list/grid, windowed rendering
 *          for thousands of links, multi-select with a bulk bar (Undo on every change) and the folder header actions. A deleted or unknown
 *          folder shows a designed "not found" state.
 * v2.2.1: the selection bar is a dock (always fixed at the bottom), the "Show" filter uses the shared dropdown, domain chips scroll like every row,
 *          keyboard shortcuts (press ? to list them), a refresh icon on wide screens, and the link menu is the shorter grouped one.
 * v2.2.2: tab title "<name> - Folder | Linkivo"; the Show and Sort controls have the same height, on phones they share ONE row (Sort is an icon);
 *          the select icon of the header lives in the three-dot menu on phones; the selection bar is icon based (ui/sel-bar.js); a link row's favicon
 *          becomes a checkbox on hover (css) and a click on it starts selecting.
 * Page module: mount(container, ctx) -> unmount;  refresh(ctx)
 */
import { h, clear } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openMenu } from '../../ui/popover.js';
import { createSelect } from '../../ui/select.js';
import { attachScrollRow } from '../../ui/scroll-row.js';
import { mountDock } from '../../ui/dock.js';
import { selBarContent } from '../../ui/sel-bar.js';
import { refreshButton } from '../../ui/refresh-button.js';
import { registerShortcuts } from '../../core/shortcuts.js';
import { openShortcutHelp } from '../../ui/shortcut-help.js';
import { emptyState } from '../../ui/empty-state.js';
import { toast } from '../../ui/toast.js';
import { createVirtualList } from '../../ui/virtual-list.js';
import { loadCss } from '../../core/css-loader.js';
import { getEngine, getQueue } from '../../core/app-data.js';
import { plural } from '../../core/format.js';
import { isEnabled } from '../../core/flags.js';
import { FAV_ID, favouritesFolder, colorOf, folderTile } from './folder-style.js';
import { createLinkRow, ROW_HEIGHT, CARD_HEIGHT, CARD_MIN_WIDTH } from './link-row.js';
import { linkMenuItems, bulk, openInPreview } from './link-actions.js';
import { runCheck } from '../check/check-sheet.js';
import { folderMenuItems } from './folder-actions.js';
import { openQuickAdd } from './quick-add.js';
import { pref, setPref, LIB } from './lib-prefs.js';

/** v2.3.2 (owner): the title's font size follows its length so a long name does not crowd the header; CSS keeps at most 2 lines with an ellipsis. */
export const lenClass = (name) => { const n = [...String(name || '')].length; return n > 40 ? 'xs' : n > 25 ? 's' : n > 15 ? 'm' : 'l'; };
const SORTS = { new: 'Newest first', old: 'Oldest first', title: 'Title A to Z', domain: 'Domain', 'pts-hi': 'Points high to low', 'pts-lo': 'Points low to high' };
const SCOPES = { all: 'All links', fv: 'Favourites', rl: 'Read later', pn: 'Pinned', bl: 'Blocked', dd: 'Dead links' };   // v2.3.0: dd = flagged by the link checker
const text = (l) => `${l.title || ''} ${l.url} ${l.host || ''} ${l.desc || ''} ${l.tags || ''} ${l.kw || ''}`.toLowerCase();

export function sortLinks(list, sort) {
  // v2.2.2 (owner): pinned links are ALWAYS first, whatever the sort; the old 'folder' value (Pinned, then newest) now means plain newest
  const by = { folder: (a, b) => b.ts - a.ts, new: (a, b) => b.ts - a.ts, old: (a, b) => a.ts - b.ts, title: (a, b) => (a.title || a.host || a.url).localeCompare(b.title || b.host || b.url), domain: (a, b) => (a.host || '').localeCompare(b.host || '') || b.ts - a.ts, 'pts-hi': (a, b) => (b.pt ?? 100) - (a.pt ?? 100), 'pts-lo': (a, b) => (a.pt ?? 100) - (b.pt ?? 100) }[sort] || ((a, b) => b.ts - a.ts);
  return [...list].sort((a, b) => (b.pn ? 1 : 0) - (a.pn ? 1 : 0) || by(a, b));
}
export function filterLinks(list, { q = '', domain = null, scope = 'all' }) {
  const needle = q.trim().toLowerCase();
  return list.filter((l) => (!domain || l.host === domain) && (scope === 'all' || !!l[scope]) && (!needle || text(l).includes(needle)));
}

export async function mount(container, ctx) {
  if (!getEngine()) { container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'Your data is not ready', text: 'Wait a moment and try again, or reload the app.', actions: [{ label: 'Open library', href: '/library', primary: true }] }))); return () => {}; }
  await loadCss('/css/pages/library.css');
  const engine = getEngine(), queue = getQueue(), router = ctx.router;
  const fid = ctx.params.fid, isFav = fid === FAV_ID;
  const scroller = document.getElementById('page-root') || document.scrollingElement;
  const st = { q: '', domain: null, scope: 'all', sort: pref(LIB.fsort) === 'folder' ? 'new' : pref(LIB.fsort), view: pref(LIB.fview), selecting: ctx.query.select === '1', selected: new Set(), last: -1, rows: [] };
  const sourceLinks = () => (isFav ? engine.listLinks().filter((l) => l.fv) : engine.listLinks({ fid }));
  const folder = () => (isFav ? favouritesFolder(sourceLinks().length) : engine.getFolder(fid));
  const page = h('div', { class: 'page fp page-enter' });
  container.appendChild(page);

  if (!folder() || folder().del) { page.append(h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Folder not found' })), emptyState({ art: 'lost', title: 'This folder does not exist', text: 'It may have been deleted. Deleted folders stay in the Recycle Bin for 15 days.', actions: [{ label: 'Open library', href: '/library', primary: true }, { label: 'Open Recycle Bin', href: '/settings/recycle-bin' }] })); return () => {}; }

  // ---- static parts ---------------------------------------------------------------------------------------------------
  const title = h('h1', { class: 'page-title fp-name' }), sub = h('p', { class: 'fp-sub', 'aria-live': 'polite' }), tile = h('span', { class: 'fp-tile' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search in this folder', 'aria-label': 'Search in this folder', autocomplete: 'off' });
  const scopeSel = createSelect({ options: Object.entries(SCOPES).map(([value, label]) => ({ value, label })), value: 'all', label: 'Show', onChange: (v) => { st.scope = v; update(); } });
  scopeSel.classList.add('fp-scope');
  const sortBtn = createSelect({ options: Object.entries(SORTS).map(([value, label]) => ({ value, label })), value: st.sort || 'new', label: 'Sort links', lead: 'sort', compact: true, align: 'end', onChange: (v) => { st.sort = v; setPref(LIB.fsort, v); update(); } });
  sortBtn.classList.add('fp-sort');
  const chips = h('div', { class: 'fp-chips fade-x', role: 'toolbar', 'aria-label': 'Filter by domain' });
  const chipRow = h('div', { class: 'fp-chiprow' }, chips);
  const info = h('div', { class: 'fp-info', role: 'status' });
  const viewBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Switch view' });
  const selBtn = h('button', { type: 'button', class: 'btn-icon fp-sel', 'aria-label': 'Select links', 'aria-pressed': 'false' }, icon('check-square', { size: 20 }));
  const moreBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'More actions', 'aria-haspopup': 'menu' }, icon('more-h', { size: 20 }));
  const bar = h('div', { class: 'selbar', role: 'toolbar', 'aria-label': 'Selected links', hidden: true });
  const body = h('div', { class: 'fp-body' });

  page.append(
    h('header', { class: 'fp-head' },
      h('button', { type: 'button', class: 'btn-icon fp-back', 'aria-label': 'Back to library', on: { click: () => router.navigate('/library') } }, icon('arrow-left', { size: 20 })),
      tile, h('div', { class: 'fp-titles' }, title, sub),
      h('div', { class: 'page-actions fp-actions' }, !isFav && h('button', { type: 'button', class: 'btn btn-sm fp-add', on: { click: () => openQuickAdd({ engine, queue, fid }) } }, icon('plus', { size: 18 }), h('span', { class: 'fp-add-t', text: 'Add link' })), refreshButton(() => refresh()), viewBtn, selBtn, moreBtn)),
    h('div', { class: 'fp-tools' }, h('div', { class: 'fp-search' }, icon('search', { size: 18 }), search), scopeSel, sortBtn), chipRow, info, body);
  const removeDock = mountDock(bar);
  const detachChips = attachScrollRow(chips);

  let vl = null;
  const paintHead = () => {
    const f = folder(); if (!f) return;
    title.textContent = f.name; title.dataset.len = lenClass(f.name); title.title = f.name; document.title = `${f.name} - Folder | Linkivo`;   // v2.2.2
    tile.replaceChildren(folderTile(f, 44)); page.style.setProperty('--fc', colorOf(f));
    sub.textContent = plural(sourceLinks().length, 'link');
    viewBtn.replaceChildren(icon(st.view === 'grid' ? 'list' : 'grid', { size: 20 })); viewBtn.setAttribute('aria-label', st.view === 'grid' ? 'Switch to list' : 'Switch to grid');
    selBtn.setAttribute('aria-pressed', String(st.selecting)); selBtn.classList.toggle('is-on', st.selecting);
  };

  function paintChips(all) {
    const counts = new Map(); for (const l of all) if (l.host) counts.set(l.host, (counts.get(l.host) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 24);
    chipRow.hidden = top.length < 2;
    chips.replaceChildren(h('button', { type: 'button', class: ['chip', !st.domain && 'is-on'], 'aria-pressed': String(!st.domain), on: { click: () => { st.domain = null; update(); } } }, 'All'),
      ...top.map(([d, n]) => h('button', { type: 'button', class: ['chip', st.domain === d && 'is-on'], 'aria-pressed': String(st.domain === d), on: { click: () => { st.domain = st.domain === d ? null : d; update(); } } }, d, h('span', { class: 'chip-n', text: String(n) }))));
  }

  const show = () => ({ url: pref(LIB.showUrl), points: pref(LIB.showPoints), added: pref(LIB.showAdded) });
  const renderRow = (l) => createLinkRow(l, { card: st.view === 'grid', selecting: st.selecting, selected: st.selected.has(l.id), show: show() });

  function paintBar() {
    const n = st.selected.size;
    bar.hidden = !st.selecting; if (!st.selecting) return;
    const ids = () => [...st.selected];
    const done = (promise) => promise.then((c) => { if (c) { st.selected.clear(); paintBar(); vl?.refresh(); } });
    const allOn = st.rows.length > 0 && st.rows.length === st.selected.size;
    bar.replaceChildren(...selBarContent({
      count: n, allOn, closeLabel: 'Done selecting', onClose: () => setSelecting(false),
      onAll: () => { st.selected = new Set(allOn ? [] : st.rows.map((l) => l.id)); paintBar(); vl?.refresh(); },
      actions: [
        { icon: 'folder', label: 'Move', onClick: () => done(bulk.move(engine, ids())) },
        { icon: 'heart', label: 'Favourite', onClick: () => done(bulk.favourite(engine, ids())) },
        { icon: 'trash', label: 'Delete', danger: true, onClick: () => done(bulk.remove(engine, ids())) }],
      more: () => [
        { label: 'Check links', icon: 'refresh', onSelect: () => { runCheck({ engine, queue, router, ids: ids() }); } },
        { label: 'Add tags', icon: 'tag', onSelect: () => done(bulk.addTags(engine, ids())) },
        { label: 'Copy to folder', icon: 'copy', onSelect: () => done(bulk.copy(engine, ids())) }, { label: 'Read later', icon: 'clock', onSelect: () => done(bulk.readLater(engine, ids())) }, { label: 'Pin', icon: 'pin', onSelect: () => done(bulk.pin(engine, ids())) },
        { label: 'Block from Random', icon: 'block', onSelect: () => done(bulk.block(engine, ids())) }, { label: 'Export selection', icon: 'download', onSelect: () => import('../export/export-sheet.js').then((m) => m.openExport({ engine, scope: { type: 'links', lids: ids() }, title: `Export ${plural(n, 'link')}` })) }]
    }));
  }

  function setSelecting(on) { st.selecting = on; if (!on) st.selected.clear(); page.classList.toggle('is-selecting', on); page.classList.toggle('has-dock', on); paintHead(); paintBar(); vl?.refresh(); }

  function update() {
    const f = folder(); if (!f || f.del) { router.navigate('/library', { replace: true }); return; }
    const all = sourceLinks(); st.rows = sortLinks(filterLinks(all, st), st.sort);
    for (const id of [...st.selected]) if (!st.rows.some((l) => l.id === id)) st.selected.delete(id);
    paintHead(); paintChips(all); paintBar();
    info.textContent = st.rows.length === all.length ? '' : `${st.rows.length} of ${all.length} links`;
    if (!all.length) {
      vl?.destroy(); vl = null;
      body.replaceChildren(emptyState({ art: isFav ? 'search' : 'import', title: isFav ? 'No favourites yet' : 'This folder is empty', text: isFav ? 'Open a link menu and choose "Add to favourites". Favourites from every folder appear here.' : 'Add a link, or import many at once from a file or pasted text.', actions: isFav ? [] : [{ label: 'Add link', primary: true, onClick: () => openQuickAdd({ engine, queue, fid }) }, { label: 'Import links', onClick: () => import('../import/import-sheet.js').then((m) => m.openImport({ engine, router, fid })) }] }));
      return;
    }
    if (!st.rows.length) { vl?.destroy(); vl = null; body.replaceChildren(emptyState({ art: 'search', title: 'No links match', text: 'Try another word, or clear the filters.', actions: [{ label: 'Clear filters', onClick: () => { st.q = ''; st.domain = null; st.scope = 'all'; search.value = ''; scopeSel.setValue('all'); update(); } }] })); return; }
    const card = st.view === 'grid';
    if (!vl) { clear(body); vl = createVirtualList({ scroller, rowHeight: card ? CARD_HEIGHT : ROW_HEIGHT, minColWidth: card ? CARD_MIN_WIDTH : 0, gap: card ? 10 : 0, render: renderRow }); vl.el.setAttribute('role', 'list'); vl.el.setAttribute('aria-label', 'Links'); body.appendChild(vl.el); vl.setLayout({ rowHeight: card ? CARD_HEIGHT : ROW_HEIGHT, minColWidth: card ? CARD_MIN_WIDTH : 0 }); }
    else vl.setLayout({ rowHeight: card ? CARD_HEIGHT : ROW_HEIGHT, minColWidth: card ? CARD_MIN_WIDTH : 0 });
    vl.el.classList.toggle('is-grid', card); vl.setItems(st.rows);
  }

  // ---- events ---------------------------------------------------------------------------------------------------------
  let t = 0; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; update(); }, 120); });
    viewBtn.addEventListener('click', () => { st.view = st.view === 'grid' ? 'list' : 'grid'; setPref(LIB.fview, st.view); vl?.destroy(); vl = null; update(); });
  selBtn.addEventListener('click', () => setSelecting(!st.selecting));
  moreBtn.addEventListener('click', () => {
    const f = folder();
    const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 899px)').matches;   // v2.2.2: the header's select icon is hidden on phones, so the menu offers it
    const pick = phone ? [{ label: st.selecting ? 'Done selecting' : 'Select links', icon: 'check-square', onSelect: () => setSelecting(!st.selecting) }, { separator: true }] : [];
    const items = isFav ? [...pick, { label: 'Check links', icon: 'refresh', onSelect: () => runCheck({ engine, queue, router, ids: sourceLinks().map((l) => l.id), title: 'Checking favourites' }) }, { label: 'Export favourites', icon: 'download', onSelect: () => import('../export/export-sheet.js').then((m) => m.openExport({ engine, scope: { type: 'favourites' }, title: 'Export favourites' })) }]
      : [...pick, ...(isEnabled('randomFromFolder') ? [{ label: 'Random from this folder', icon: 'random', onSelect: () => router.navigate(`/random?folder=${fid}`) }] : []), { label: 'Add link', icon: 'plus', onSelect: () => openQuickAdd({ engine, queue, fid }) }, { label: 'Check links', icon: 'refresh', onSelect: () => runCheck({ engine, queue, router, ids: sourceLinks().map((l) => l.id), title: 'Checking folder' }) }, { separator: true }, ...folderMenuItems({ engine, router, folder: f })];
    moreBtn._m = openMenu(moreBtn, items);
  });
  body.addEventListener('click', (e) => {
    const row = e.target.closest('.lrow'); if (!row) return;
    const id = row.dataset.id, act = e.target.closest('[data-act]')?.dataset.act, l = engine.getLink(id); if (!l) return;
    if (act === 'menu') { const a = e.target.closest('[data-act]'); a._m = openMenu(a, linkMenuItems({ engine, link: l })); return; }
    if (act === 'toggle' && !st.selecting) {   // v2.2.2: the favicon turned into a checkbox on hover: a click on it starts selecting
      e.preventDefault(); setSelecting(true); st.selected.add(id); st.last = st.rows.findIndex((x) => x.id === id); paintBar(); vl?.refresh(); return;
    }
    if (act === 'open' && !st.selecting && e.target.closest('.lmain') && openInPreview(e, l, router)) return;   // v2.3.0: the row opens the Preview
    if (st.selecting && act !== 'menu') {
      e.preventDefault();
      const idx = st.rows.findIndex((x) => x.id === id);
      if (e.shiftKey && st.last >= 0) { const [a, b] = [Math.min(st.last, idx), Math.max(st.last, idx)]; for (let i = a; i <= b; i++) st.selected.add(st.rows[i].id); }
      else st.selected.has(id) ? st.selected.delete(id) : st.selected.add(id);
      st.last = idx; paintBar(); vl?.refresh();
    }
  });
  // ---- keyboard (v2.2.1): never while typing in a field or while a popup is open (core/shortcuts.js decides) ----
  const removeSelected = () => { if (st.selected.size) bulk.remove(engine, [...st.selected], { ask: true }).then((c) => { if (c) { st.selected.clear(); paintBar(); vl?.refresh(); } }); };
  const keys = [
    { keys: 'mod+a', desc: 'Select all links', run: () => { if (!st.selecting) setSelecting(true); st.selected = new Set(st.rows.map((l) => l.id)); paintBar(); vl?.refresh(); } },
    { keys: 'escape', desc: 'Clear the selection, then leave select mode', run: () => { if (st.selected.size) { st.selected.clear(); paintBar(); vl?.refresh(); } else if (st.selecting) setSelecting(false); } },
    { keys: 'delete', desc: 'Delete the selected links', run: removeSelected },
    { keys: 'backspace', desc: 'Delete the selected links, or go back to the Library', run: () => { if (st.selecting && st.selected.size) removeSelected(); else if (!st.selecting) router.navigate('/library'); } },
    { keys: '/', desc: 'Search in this folder', run: () => search.focus() },
    { keys: 'mod+f', desc: 'Search in this folder', run: () => search.focus() },
    { keys: 's', desc: 'Select links', run: () => setSelecting(!st.selecting) },
    { keys: 'n', desc: 'Add a link', run: () => { if (!isFav) openQuickAdd({ engine, queue, fid }); } },
    { keys: 'i', desc: 'Import links into this folder', run: () => { if (!isFav) import('../import/import-sheet.js').then((m) => m.openImport({ engine, router, fid })); } },
    { keys: '?', desc: 'Show these shortcuts', run: () => openShortcutHelp(keys) }
  ];
  const offKeys = registerShortcuts(keys);
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; st.q = ''; search.blur(); update(); } });

  page.classList.toggle('is-selecting', st.selecting); page.classList.toggle('has-dock', st.selecting);
  let raf = 0; const off = engine.subscribe((ev) => { if (ev.type === 'change' || ev.type === 'ready') { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); } });
  update();
  return () => { off(); offKeys(); removeDock(); detachChips(); cancelAnimationFrame(raf); clearTimeout(t); vl?.destroy(); };
}

export async function refresh() { try { await getEngine()?.flush?.(); } catch { toast('Could not refresh.', { type: 'error' }); } }
