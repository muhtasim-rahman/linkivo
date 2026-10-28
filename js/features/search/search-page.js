/**
 * Linkivo — js/features/search/search-page.js  (v2.3.0)
 * Purpose: global search, route /search (bottom bar, sidebar, Ctrl or Cmd + K). One field searches settings, folders and links at once; results come in
 *          categories that each start short and grow by 10 with "See more". With an empty field it lists the recent searches (5, then all 50 on request).
 *          A tapped result saves the search. Links open in the Preview (or a new tab, setting "Open links in"). Matching words are shown in bold.
 *          v2.3.1: the app's own pages are found too (Pages group); a setting result opens its category scrolled to THAT row, which flashes ("?focus="); results
 *          rise in one after another and new rows of "See more" rise in on their own; the search field is a sticky header with a small top gap and a fade under it.
 * Page module: mount(container, ctx)      Pure logic: search-core.js
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { prefs } from '../../core/local-prefs.js';
import { getEngine } from '../../core/app-data.js';
import { plural } from '../../core/format.js';
import { registerShortcuts } from '../../core/shortcuts.js';
import { faviconUrl, linkTitle, safeHref, folderTile } from '../library/folder-style.js';
import { CATALOG, SECTIONS } from '../settings/catalog.js';
import { appPages } from './search-pages.js';
import { staggerIn } from '../../ui/motion.js';
import { createIndex, searchFolders, searchSettings, searchPages, tokens, highlightParts, readHistory, pushHistory, removeHistory } from './search-core.js';
import { clearSearchHistory, historyStore } from './search-store.js';

const SHOW = { pages: 3, settings: 3, folders: 4, links: 8 }, STEP = 10, RECENT = 5;
let lastQuery = '';   // kept while the app stays open, so Back from a result returns to the same search
const index = createIndex();

const marked = (text, words) => highlightParts(text, words).map((p) => (p.hit ? h('mark', { text: p.text }) : p.text));

export async function mount(container, ctx) {
  await loadCss('/css/pages/search.css');
  const engine = getEngine(), router = ctx.router, store = historyStore();
  const st = { q: ctx.query.q || lastQuery, shown: { ...SHOW }, all: false };
  const input = h('input', { class: 'input sp-input', type: 'search', placeholder: 'Search links, folders, pages and settings', 'aria-label': 'Search links, folders, pages and settings', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search', value: st.q });
  const clear = h('button', { type: 'button', class: 'btn-icon sp-clear', 'aria-label': 'Clear search', hidden: !st.q, on: { click: () => { input.value = ''; setQuery(''); input.focus(); } } }, icon('close', { size: 18 }));
  const out = h('div', { class: 'sp-out', 'aria-live': 'polite' });
  const page = h('div', { class: 'page sp page-enter' }, h('h1', { class: 'sr-only', text: 'Search' }), h('div', { class: 'sp-head' }, h('div', { class: 'sp-bar' }, icon('search', { size: 20 }), input, clear)), out);
  container.appendChild(page);

  const keep = (q) => { if (prefs.get('search.recent', true) !== false) pushHistory(store, q); };   // v2.3.1: setting "Remember recent searches"
  const openFrom = (e, q) => { keep(q); return e; };

  function setQuery(q) { st.q = q; lastQuery = q; st.shown = { ...SHOW }; clear.hidden = !q; paint({ fresh: !st.had }); }   // rows rise in when results APPEAR (from the recent list or an empty result); later keystrokes just update them

  const added = [];   // v2.3.1: the rows that are new in this paint (all of them for a new query, only the newly shown ones after "See more")
  function group(title, count, items, kind, shown) {
    const more = count - shown, from = st.grow && st.grow.kind === kind ? st.grow.from : 0;
    if (st.fresh) added.push(...items); else if (st.grow && st.grow.kind === kind) added.push(...items.slice(from));
    return h('section', { class: 'sp-group', 'aria-label': title },
      h('h2', { class: 'sp-h' }, title, h('span', { class: 'sp-count', text: String(count) })),
      h('ul', { class: 'sp-list' }, items),
      more > 0 && h('button', { type: 'button', class: 'btn btn-sm sp-more', on: { click: () => { st.grow = { kind, from: shown }; st.shown[kind] += STEP; paint(); } } }, `See more (${Math.min(STEP, more)} of ${more})`));
  }
  const li = (...kids) => h('li', null, ...kids);

  const pages = appPages(SECTIONS);
  function paint({ fresh = false } = {}) {
    const q = st.q.trim(), ws = tokens(q);
    st.fresh = fresh; added.length = 0;
    if (!ws.length) { st.grow = null; st.had = false; return paintRecent(); }
    const withApp = prefs.get('search.pages', true) !== false;   // v2.3.1: setting "Find app pages and settings"
    const pgs = withApp ? searchPages(pages, q, 12) : [];
    const links = engine ? index.search(engine.listLinks(), q, 400) : [];
    const folders = engine ? searchFolders(engine.listFolders(), q) : [];
    const sets = withApp ? searchSettings(CATALOG, SECTIONS, q) : [];
    const tab = prefs.get('lib.openIn', 'preview') === 'tab';
    const nodes = [];
    if (pgs.length) nodes.push(group('Pages', pgs.length, pgs.slice(0, st.shown.pages).map((r) => li(h('a', { class: 'sp-item', href: r.page.path, on: { click: (e) => openFrom(e, q) } }, h('span', { class: 'sp-ic' }, icon(r.page.icon, { size: 18 })), h('span', { class: 'sp-t' }, h('span', { class: 'sp-name' }, marked(r.page.label, ws)), h('span', { class: 'sp-sub', text: r.page.desc }))))), 'pages', st.shown.pages));
    if (sets.length) nodes.push(group('Settings', sets.length, sets.slice(0, st.shown.settings).map((r) => li(h('a', { class: 'sp-item', href: `/settings/${r.section}?focus=${encodeURIComponent(r.entry.id)}`, on: { click: (e) => openFrom(e, q) } }, h('span', { class: 'sp-ic' }, icon(SECTIONS.find((s) => s.id === r.section)?.icon || 'settings', { size: 18 })), h('span', { class: 'sp-t' }, h('span', { class: 'sp-name' }, marked(r.entry.label, ws)), h('span', { class: 'sp-sub', text: r.sectionLabel }))))), 'settings', st.shown.settings));
    if (folders.length) nodes.push(group('Folders', folders.length, folders.slice(0, st.shown.folders).map((r) => li(h('a', { class: 'sp-item', href: `/folder/${encodeURIComponent(r.folder.id)}`, on: { click: (e) => openFrom(e, q) } }, folderTile(r.folder, 32), h('span', { class: 'sp-t' }, h('span', { class: 'sp-name' }, marked(r.folder.name, ws)), h('span', { class: 'sp-sub', text: plural(r.folder.lc || 0, 'link') }))))), 'folders', st.shown.folders));
    if (links.length) nodes.push(group('Links', links.length, links.slice(0, st.shown.links).map(({ link: l }) => {
      const f = engine.getFolder(l.fid);
      const a = h('a', { class: 'sp-item', href: tab ? safeHref(l.url) : `/link/${encodeURIComponent(l.id)}`, target: tab ? '_blank' : null, rel: tab ? 'noopener noreferrer' : null, 'data-native': tab ? '' : null, on: { click: (e) => openFrom(e, q) } },
        h('span', { class: 'sp-fav', 'aria-hidden': 'true' }, h('img', { src: faviconUrl(l.host), alt: '', width: '20', height: '20', loading: 'lazy', referrerpolicy: 'no-referrer', on: { error: (e) => e.target.remove() } })),
        h('span', { class: 'sp-t' }, h('span', { class: 'sp-name' }, marked(linkTitle(l), ws)), h('span', { class: 'sp-sub' }, marked(l.host || l.url, ws), f ? ` \u00b7 ${f.name}` : '')));
      return li(a);
    }), 'links', st.shown.links));
    out.replaceChildren(...(nodes.length ? nodes : [h('div', { class: 'sp-empty' }, icon('search', { size: 28 }), h('strong', { text: 'Nothing found' }), h('span', { text: 'Try fewer or different words. Every word you type must appear somewhere in the link, folder, page or setting.' }))]));
    st.had = nodes.length > 0;
    staggerIn(added.map((x) => x.firstElementChild || x), { step: 22, max: 14 });
    st.grow = null; st.fresh = false;
  }

  function paintRecent() {
    const hist = prefs.get('search.recent', true) !== false ? readHistory(store) : [];
    if (!hist.length) { out.replaceChildren(h('div', { class: 'sp-empty' }, icon('search', { size: 28 }), h('strong', { text: 'Search everything' }), h('span', { text: 'Type a word from a title, address, tag or description. Folders and settings are found too.' }))); return; }
    const list = st.all ? hist : hist.slice(0, RECENT);
    out.replaceChildren(h('section', { class: 'sp-group', 'aria-label': 'Recent searches' },
      h('h2', { class: 'sp-h' }, 'Recent searches', h('button', { type: 'button', class: 'link sp-clearall', on: { click: () => { clearSearchHistory(); paint(); } } }, 'Clear all')),
      h('ul', { class: 'sp-list' }, list.map((q) => li(h('div', { class: 'sp-recent' },
        h('button', { type: 'button', class: 'sp-item', on: { click: () => { input.value = q; setQuery(q); input.focus(); } } }, h('span', { class: 'sp-ic' }, icon('history', { size: 18 })), h('span', { class: 'sp-t' }, h('span', { class: 'sp-name', text: q }))),
        h('button', { type: 'button', class: 'btn-icon sp-x', 'aria-label': `Remove ${q} from recent searches`, on: { click: () => { removeHistory(store, q); paint(); } } }, icon('close', { size: 16 })))))),
      !st.all && hist.length > RECENT && h('button', { type: 'button', class: 'btn btn-sm sp-more', on: { click: () => { st.all = true; paint(); } } }, `Show all ${hist.length}`)));
  }

  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => setQuery(input.value), 70); clear.hidden = !input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); setQuery(input.value); keep(input.value); input.blur(); } });
  const off = registerShortcuts([{ keys: 'mod+k', desc: 'Search', inInput: true, run: (e) => { e.preventDefault(); input.focus(); input.select(); } }, { keys: '/', desc: 'Focus the search field', run: (e) => { e.preventDefault(); input.focus(); } }]);
  const offEngine = engine ? engine.subscribe((e) => { if (e.type === 'change' && st.q.trim()) paint(); }) : () => {};   // a data change repaints without the rise animation
  paint();
  setTimeout(() => input.focus({ preventScroll: true }), 60);
  return () => { clearTimeout(timer); off(); offEngine(); };
}
