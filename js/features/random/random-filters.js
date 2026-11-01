/**
 * Linkivo — js/features/random/random-filters.js  (v2.4.1, rebuilt v2.4.2)
 * Purpose: the ONE filter panel of Random Discover. Folders (any number, each with a Low / Normal / High chance), narrowing switches, a points range,
 *          sites to include or leave out, and tags. The same panel is shown on the page before the first link and inside a popup while a link is open
 *          (spec: "folder selection and filters are merged into one panel"). It edits a filter object in place and calls onChange after every edit;
 *          the page owns the object, the picker (engine/picker.js) reads it. A live counter shows how many links are in play.
 *          v2.4.2 (owner): rebuilt compact and icon based. Folders are small cards with a short name; a click selects, and the chance (Low, Normal, High) is a small
 *          dropdown on the selected card. Every section has its own clear icon. Sites and tags show the 10 / 15 most used ones from the person's own links, the
 *          ones already chosen, "See more" for the rest and a search box (no free typing: only what really exists can be picked).
 * API: loadFilters(prefs, { folder }) -> filters     saveFilters(prefs, filters)     poolCount(links, filters, skipDead) -> number
 *      buildFilterPanel({ engine, filters, onChange }) -> { el, refresh() }
 */
import { h } from '../../core/dom.js';
import { prefs } from '../../core/local-prefs.js';
import { icon } from '../../ui/icons.js';
import { openMenu } from '../../ui/popover.js';
import { folderTile, faviconUrl } from '../library/folder-style.js';
import { buildRange } from './random-range.js';
import { emptyFilters, isCandidate } from '../../engine/picker.js';
import { MIN, MAX, pointsOf } from '../../engine/points.js';

const KEY = 'random.filters';
const num = (v, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/** Reads the saved filters (when "Remember my folders and filters" is on), or starts clean. `folder` presets one folder (the folder page's button). */
export function loadFilters(prefs, { folder = null } = {}) {
  const f = emptyFilters();
  if (folder) { f.folders[folder] = 'normal'; return f; }
  if (prefs.get('random.remember', true) === false) return f;
  const s = prefs.get(KEY, null);
  if (!s || typeof s !== 'object') return f;
  for (const [fid, w] of Object.entries(s.folders || {})) if (['low', 'normal', 'high'].includes(w)) f.folders[fid] = w;
  for (const k of ['include', 'exclude', 'tags']) f[k] = Array.isArray(s[k]) ? s[k].filter((x) => typeof x === 'string').slice(0, 30) : [];
  for (const k of ['onlyFav', 'onlyLiked', 'skipDisliked', 'unseenOnly']) f[k] = s[k] === true;
  f.minPts = Math.max(MIN, num(s.minPts, MIN)); f.maxPts = Math.min(MAX, num(s.maxPts, MAX));
  return f;
}
export function saveFilters(prefs, f) {
  if (prefs.get('random.remember', true) === false) { prefs.remove(KEY); return; }
  prefs.set(KEY, { folders: f.folders, include: f.include, exclude: f.exclude, tags: f.tags, onlyFav: f.onlyFav, onlyLiked: f.onlyLiked, skipDisliked: f.skipDisliked, unseenOnly: f.unseenOnly, minPts: f.minPts, maxPts: f.maxPts });
}
export const poolCount = (links, f, skipDead = true) => { const ff = { ...f, skipDead }; let n = 0; for (const l of links) if (isCandidate(l, ff)) n++; return n; };

const short = (s, n = 18) => { const t = String(s || '').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}\u2026` : t; };
/** Updates a list of keyed children IN PLACE: an element that already exists is kept (so CSS transitions run when its state changes), new ones fade in,
 *  gone ones leave. `data-k` is the key and `data-sig` says whether the inside changed. (v2.4.3, owner: no sharp cuts.) Exported for the tests. */
export function morph(box, kids) {
  const old = new Map([...box.children].filter((c) => c.dataset && c.dataset.k !== undefined).map((c) => [c.dataset.k, c]));
  const out = [];
  for (const nk of kids) {
    if (!nk) continue;
    const cur = old.get(nk.dataset.k);
    if (cur) {
      old.delete(nk.dataset.k);
      if (cur.className !== nk.className) cur.className = nk.className;
      for (const a of ['aria-pressed', 'aria-checked', 'title']) { const v = nk.getAttribute(a); if (v == null) cur.removeAttribute(a); else if (cur.getAttribute(a) !== v) cur.setAttribute(a, v); }
      if (cur.dataset.sig !== nk.dataset.sig) { cur.dataset.sig = nk.dataset.sig; cur.replaceChildren(...nk.childNodes); }
      out.push(cur);
    } else { nk.classList.add('rf-enter'); out.push(nk); }
  }
  out.forEach((n, i) => { if (box.children[i] !== n) box.insertBefore(n, box.children[i] || null); });
  for (const n of old.values()) n.remove();
}
const fill = (box, ...nodes) => box.replaceChildren(...nodes.flat().filter(Boolean));   // replaceChildren(null) would write the text "null" (v2.4.2 bug under Sites and Tags)
const TOP_SITES = 10, TOP_TAGS = 15, FOLDERS_SHOWN = 12, SEARCH_CAP = 40;
const WEIGHTS = [['high', 'High chance', 'chevron-up'], ['normal', 'Normal chance', 'minus'], ['low', 'Low chance', 'chevron-down']];

/** Most used first. `pick(link)` returns the keys a link counts for (one host, or its tags). Pure and exported for the tests. */
export function rankCounts(links, pick) {
  const m = new Map();
  for (const l of links) { if (l.del) continue; for (const k of pick(l)) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
export const hostKeys = (l) => { const h0 = String(l.host || '').toLowerCase().replace(/^www\./, ''); return h0 ? [h0] : []; };
/** v2.4.3: a link's own tags AND the keywords the page itself declared (kw, saved by the metadata fetch) are both offered as tags. */
export const tagKeys = (l) => [...new Set(`${l.tags || ''},${l.kw || ''}`.toLowerCase().split(',').map((t) => t.trim()).filter(Boolean))];
/** What a list of choices shows: the chosen ones first, then the top ones, or (while searching) every match. */
export function visibleChoices(ranked, chosen, { top, all = false, q = '' } = {}) {
  const query = String(q).trim().toLowerCase();
  if (query) return ranked.filter(([k]) => k.includes(query)).slice(0, SEARCH_CAP).map(([k, n]) => [k, n]);
  const pickedFirst = [...new Set(chosen)].map((k) => [k, (ranked.find((r) => r[0] === k) || [k, 0])[1]]);
  const rest = (all ? ranked : ranked.slice(0, top)).filter(([k]) => !chosen.includes(k));
  return [...pickedFirst, ...rest];
}

export function buildFilterPanel({ engine, filters, onChange }) {
  const f = filters;
  const counter = h('div', { class: 'rf-count', role: 'status', 'aria-live': 'polite' });
  const foldersEl = h('div', { class: 'rf-folders', role: 'group', 'aria-label': 'Folders' });
  const ui = { allFolders: false, folderQ: '', allSites: false, siteQ: '', siteMode: 'include', allTags: false, tagQ: '' };
  const changed = () => { paintAll(); onChange(f); };

  function paintCount() {
    const n = poolCount(engine.listLinks(), f, prefs.get('random.skipDead', true) !== false);
    counter.replaceChildren(h('strong', { text: n.toLocaleString() }), h('span', { text: n === 1 ? ' link in play' : ' links in play' }));
    counter.classList.toggle('is-zero', n === 0);
  }

  /** A section heading with its count and a clear icon (shown only while something in the section is set). */
  const head = (title, set, onClear, action = null) => h('div', { class: 'rf-sh' }, h('h3', { class: 'rf-h', text: title }), set > 0 ? h('span', { class: 'rf-badge', text: String(set) }) : null,
    action ? h('button', { type: 'button', class: 'rf-act', on: { click: action.onClick } }, action.label) : null,
    set > 0 ? h('button', { type: 'button', class: 'rf-clear', 'aria-label': `Clear ${title.toLowerCase()} filter`, 'data-tip': 'Clear', on: { click: onClear } }, icon('close', { size: 16 })) : null);
  const search = (value, placeholder, onInput) => { const i = h('input', { class: 'input rf-search', type: 'search', placeholder, 'aria-label': placeholder, value, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }); i.addEventListener('input', () => onInput(i.value)); return i; };

  // ---- folders -------------------------------------------------------------------------------------------------------------------------
  function weightButton(fo, w) {
    const cur = WEIGHTS.find((x) => x[0] === w) || WEIGHTS[1];
    const btn = h('button', { type: 'button', class: ['rf-w', `is-${cur[0]}`], 'aria-label': `${fo.name}: ${cur[1]}. Change`, 'aria-haspopup': 'menu', 'data-tip': cur[1] }, icon(cur[2], { size: 16 }));
    btn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(btn, WEIGHTS.map(([k, label, ic]) => ({ label, icon: ic, onSelect: () => { f.folders[fo.id] = k; changed(); } }))); });
    return btn;
  }
  function paintFolders() {
    const all = engine.listFolders().filter((x) => !x.del).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.name || '').localeCompare(b.name || ''));
    const q = ui.folderQ.trim().toLowerCase();
    let list = q ? all.filter((x) => (x.name || '').toLowerCase().includes(q)) : all;
    const hidden = !q && !ui.allFolders && list.length > FOLDERS_SHOWN ? list.filter((x, i) => i >= FOLDERS_SHOWN && !f.folders[x.id]).length : 0;
    if (hidden) list = list.filter((x, i) => i < FOLDERS_SHOWN || f.folders[x.id]);
        const cards = list.map((fo) => {
      const w = f.folders[fo.id], on = !!w;
      const main = h('button', { type: 'button', class: 'rf-fmain', 'aria-pressed': String(on), title: fo.name, on: { click: () => { if (on) delete f.folders[fo.id]; else f.folders[fo.id] = 'normal'; changed(); } } },
        folderTile(fo, 24), h('span', { class: 'rf-fname', text: short(fo.name) }), h('span', { class: 'rf-n', text: String(fo.lc || 0) }));
      return h('div', { class: ['rf-f', on && 'is-on'], 'data-k': fo.id, 'data-sig': `${w || ''}|${fo.name}|${fo.lc || 0}|${fo.color || ''}|${fo.icon || ''}` }, main, on ? weightButton(fo, w) : null);
    });
    const more = hidden ? h('button', { type: 'button', class: 'rf-more', 'data-k': '\u0000more', 'data-sig': String(hidden), on: { click: () => { ui.allFolders = true; paintFolders(); } } }, `Show ${hidden} more`) : (ui.allFolders && !q && all.length > FOLDERS_SHOWN ? h('button', { type: 'button', class: 'rf-more', 'data-k': '\u0000more', 'data-sig': 'fewer', on: { click: () => { ui.allFolders = false; paintFolders(); } } }, 'Show fewer') : null);
    morph(foldersEl, [...cards, more]);
    foldersEl.classList.toggle('is-empty-search', !!q && !cards.length);
  }

  // ---- narrowing -----------------------------------------------------------------------------------------------------------------------
  const PILLS = [['onlyFav', 'star', 'Favourites'], ['onlyLiked', 'thumb-up', 'Liked'], ['unseenOnly', 'eye', 'Never opened'], ['skipDisliked', 'thumb-down', 'Skip disliked']];
  // v2.4.3 (owner): two sub headings. "Show only" = four badges; "Point range" = ONE bar with two handles (random-range.js). The bar is built once and only
  // updated afterwards, so a drag is never interrupted by a redraw.
  const rangeBar = buildRange({ lo: f.minPts, hi: f.maxPts,
    onInput: (a, b) => { f.minPts = a; f.maxPts = b; paintCount(); onChange(f); },
    onCommit: () => changed() });
  const pillsEl = h('div', { class: 'rf-pills' });
  const sub = (t) => h('h4', { class: 'rf-sub', text: t });
  const narrowEl = h('div', { class: 'rf-narrow' }, sub('Show only'), pillsEl, sub('Point range'), rangeBar.el);
  const narrowSet = () => PILLS.filter(([k]) => f[k]).length + (f.minPts > MIN || f.maxPts < MAX ? 1 : 0);
  const narrowHead = h('div');
  function paintNarrow() {
    narrowHead.replaceChildren(head('Narrow it down', narrowSet(), () => { for (const [k] of PILLS) f[k] = false; f.minPts = MIN; f.maxPts = MAX; changed(); }));
    rangeBar.set(f.minPts, f.maxPts); rangeBar.setPoints(engine.listLinks().filter((l) => !l.del && !l.bl).map(pointsOf));
    morph(pillsEl, PILLS.map(([k, ic, label]) => h('button', { type: 'button', class: ['rf-pill', f[k] && 'is-on'], 'data-k': k, 'data-sig': 'x', 'aria-pressed': String(!!f[k]), on: { click: () => { f[k] = !f[k]; changed(); } } }, icon(ic, { size: 16 }), h('span', { text: label }))));
  }

  const refocus = (box) => { const i = box.querySelector('.rf-search'); if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch { /* not a text field */ } } };   // the list is redrawn while typing; the caret must stay
  // ---- sites and tags ------------------------------------------------------------------------------------------------------------------
  const sitesHead = h('div'), sitesBody = h('div', { class: 'rf-choice' }), tagsHead = h('div'), tagsBody = h('div', { class: 'rf-choice' });
  const siteChips = h('div', { class: 'rf-chips' }), tagChips = h('div', { class: 'rf-chips' });
  const siteNone = h('p', { class: 'rf-none' }), tagNone = h('p', { class: 'rf-none' });
  /** One round favicon before the site name (owner). A site whose icon does not load simply shows no icon. */
  const favImg = (host) => { const i = h('img', { class: 'rf-fav', src: faviconUrl(host), alt: '', width: '16', height: '16', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }); i.addEventListener('error', () => { i.style.visibility = 'hidden'; }); return i; };
  function chipsView(box, items, stateOf, onTap, withFav) {
    morph(box, items.map(([k, n]) => { const st = stateOf(k);
      return h('button', { type: 'button', class: ['rf-c', st && `is-${st}`], 'data-k': k, 'data-sig': `${st}|${n}`, 'aria-pressed': String(!!st), title: k, on: { click: () => onTap(k, stateOf(k)) } },
        withFav ? favImg(k) : (st === 'in' ? icon('check', { size: 13 }) : null), h('span', { class: 'rf-cn', text: short(k, 22) }), n ? h('span', { class: 'rf-n', text: String(n) }) : null); }));
  }
  const modeBtns = [['include', 'Only these'], ['exclude', 'Leave out']].map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(ui.siteMode === v), text: label, on: { click: () => { ui.siteMode = v; paintSites(); } } }));
  const siteSearch = search('', 'Search sites', (v) => { ui.siteQ = v; paintSites(); });
  const tagSearch = search('', 'Search tags', (v) => { ui.tagQ = v; paintTags(); });
  const siteTools = h('div', { class: 'rf-tools' }, h('div', { class: 'seg rf-mode', role: 'radiogroup', 'aria-label': 'What a tap does' }, ...modeBtns), siteSearch);
  const tagTools = h('div', { class: 'rf-tools' }, tagSearch);
  const siteMore = h('button', { type: 'button', class: 'rf-more', on: { click: () => { ui.allSites = !ui.allSites; paintSites(); } } });
  const tagMore = h('button', { type: 'button', class: 'rf-more', on: { click: () => { ui.allTags = !ui.allTags; paintTags(); } } });
  function paintSites() {
    const links = engine.listLinks(), ranked = rankCounts(links, hostKeys);
    sitesHead.replaceChildren(head('Sites', f.include.length + f.exclude.length, () => { f.include.length = 0; f.exclude.length = 0; changed(); }));
    const chosen = [...f.include, ...f.exclude], items = visibleChoices(ranked, chosen, { top: TOP_SITES, all: ui.allSites, q: ui.siteQ });
    const stateOf = (k) => (f.include.includes(k) ? 'in' : f.exclude.includes(k) ? 'out' : '');
    const tap = (k, st) => { const target = ui.siteMode === 'include' ? f.include : f.exclude, other = ui.siteMode === 'include' ? f.exclude : f.include;
      const oi = other.indexOf(k); if (oi >= 0) other.splice(oi, 1);
      const ti = target.indexOf(k); if (ti >= 0 && st) target.splice(ti, 1); else if (ti < 0) target.push(k); changed(); };
    modeBtns.forEach((b, i) => b.setAttribute('aria-checked', String(ui.siteMode === (i ? 'exclude' : 'include'))));
    chipsView(siteChips, items, stateOf, tap, true);
    siteNone.textContent = ranked.length ? 'No site matches.' : 'Sites appear here once you have links.'; siteNone.hidden = items.length > 0;
    siteMore.hidden = !(!ui.siteQ && ranked.length > TOP_SITES); siteMore.textContent = ui.allSites ? 'Show fewer' : `See more (${ranked.length - TOP_SITES})`;
    if (!sitesBody.firstChild) fill(sitesBody, siteTools, siteChips, siteNone, siteMore);
  }
  function paintTags() {
    const links = engine.listLinks(), ranked = rankCounts(links, tagKeys);
    tagsHead.replaceChildren(head('Tags', f.tags.length, () => { f.tags.length = 0; changed(); }));
    const items = visibleChoices(ranked, f.tags, { top: TOP_TAGS, all: ui.allTags, q: ui.tagQ });
    const stateOf = (k) => (f.tags.includes(k) ? 'in' : '');
    const tap = (k, st) => { const i = f.tags.indexOf(k); if (st && i >= 0) f.tags.splice(i, 1); else if (!st) f.tags.push(k); changed(); };
    tagTools.hidden = !ranked.length;
    chipsView(tagChips, items, stateOf, tap, false);
    tagNone.textContent = ranked.length ? 'No tag matches.' : 'Tags appear here once you tag links or the page declares keywords.'; tagNone.hidden = items.length > 0;
    tagMore.hidden = !(!ui.tagQ && ranked.length > TOP_TAGS); tagMore.textContent = ui.allTags ? 'Show fewer' : `See more (${ranked.length - TOP_TAGS})`;
    if (!tagsBody.firstChild) fill(tagsBody, tagTools, tagChips, tagNone, tagMore);
  }

  const foldersHead = h('div');
  const folderSearch = search('', 'Search folders', (v) => { ui.folderQ = v; paintFolders(); });
  function paintAll() {
    const total = engine.listFolders().filter((x) => !x.del).length, chosen = Object.keys(f.folders).length;
    foldersHead.replaceChildren(head('Folders', chosen, () => { f.folders = {}; changed(); }, total > 1 && chosen < total ? { label: 'Select all', onClick: () => { for (const x of engine.listFolders()) if (!x.del) f.folders[x.id] ||= 'normal'; changed(); } } : null));
    paintFolders(); paintNarrow(); paintSites(); paintTags(); paintCount();
  }

  const el = h('div', { class: 'rf' },
    h('section', { class: 'rf-sec' }, foldersHead, engine.listFolders().filter((x) => !x.del).length > FOLDERS_SHOWN ? h('div', { class: 'rf-tools' }, folderSearch) : null, foldersEl),
    h('section', { class: 'rf-sec' }, narrowHead, narrowEl),
    h('section', { class: 'rf-sec' }, sitesHead, sitesBody),
    h('section', { class: 'rf-sec' }, tagsHead, tagsBody));
  paintAll();
  return { el, counter, refresh() { paintAll(); } };
}
