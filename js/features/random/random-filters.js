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
import { folderTile } from '../library/folder-style.js';
import { emptyFilters, isCandidate } from '../../engine/picker.js';
import { MIN, MAX } from '../../engine/points.js';

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
const TOP_SITES = 10, TOP_TAGS = 15, FOLDERS_SHOWN = 12, SEARCH_CAP = 40;
const WEIGHTS = [['high', 'High chance', 'chevron-up'], ['normal', 'Normal chance', 'minus'], ['low', 'Low chance', 'chevron-down']];

/** Most used first. `pick(link)` returns the keys a link counts for (one host, or its tags). Pure and exported for the tests. */
export function rankCounts(links, pick) {
  const m = new Map();
  for (const l of links) { if (l.del) continue; for (const k of pick(l)) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
export const hostKeys = (l) => { const h0 = String(l.host || '').toLowerCase().replace(/^www\./, ''); return h0 ? [h0] : []; };
export const tagKeys = (l) => String(l.tags || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);
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
  const head = (title, set, onClear) => h('div', { class: 'rf-sh' }, h('h3', { class: 'rf-h', text: title }), set > 0 ? h('span', { class: 'rf-badge', text: String(set) }) : null,
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
    const none = Object.keys(f.folders).length === 0;
    const allBtn = h('button', { type: 'button', class: ['rf-f', 'rf-fall', none && 'is-on'], 'aria-pressed': String(none), on: { click: () => { f.folders = {}; changed(); } } }, h('span', { class: 'rf-fi', 'aria-hidden': 'true' }, icon('library', { size: 16 })), h('span', { class: 'rf-fname', text: 'All folders' }), h('span', { class: 'rf-n', text: String(engine.listLinks().length) }));
    const cards = list.map((fo) => {
      const w = f.folders[fo.id], on = !!w;
      const main = h('button', { type: 'button', class: 'rf-fmain', 'aria-pressed': String(on), title: fo.name, on: { click: () => { if (on) delete f.folders[fo.id]; else f.folders[fo.id] = 'normal'; changed(); } } },
        folderTile(fo, 24), h('span', { class: 'rf-fname', text: short(fo.name) }), h('span', { class: 'rf-n', text: String(fo.lc || 0) }));
      return h('div', { class: ['rf-f', on && 'is-on'] }, main, on ? weightButton(fo, w) : null);
    });
    const more = hidden ? h('button', { type: 'button', class: 'rf-more', on: { click: () => { ui.allFolders = true; paintFolders(); } } }, `Show ${hidden} more`) : (ui.allFolders && !q && all.length > FOLDERS_SHOWN ? h('button', { type: 'button', class: 'rf-more', on: { click: () => { ui.allFolders = false; paintFolders(); } } }, 'Show fewer') : null);
    foldersEl.replaceChildren(allBtn, ...cards, ...(more ? [more] : []));
    foldersEl.classList.toggle('is-empty-search', !!q && !cards.length);
  }

  // ---- narrowing -----------------------------------------------------------------------------------------------------------------------
  const PILLS = [['onlyFav', 'star', 'Favourites'], ['onlyLiked', 'thumb-up', 'Liked'], ['unseenOnly', 'eye', 'Never opened'], ['skipDisliked', 'thumb-down', 'Skip disliked']];
  const minI = h('input', { class: 'input rf-num', type: 'number', inputmode: 'numeric', min: String(MIN), max: String(MAX), value: String(f.minPts), 'aria-label': 'Lowest points' });
  const maxI = h('input', { class: 'input rf-num', type: 'number', inputmode: 'numeric', min: String(MIN), max: String(MAX), value: String(f.maxPts), 'aria-label': 'Highest points' });
  const range = () => { let a = Math.min(MAX, Math.max(MIN, num(minI.value, MIN))), b = Math.min(MAX, Math.max(MIN, num(maxI.value, MAX))); if (a > b) [a, b] = [b, a]; f.minPts = a; f.maxPts = b; minI.value = String(a); maxI.value = String(b); changed(); };
  minI.addEventListener('change', range); maxI.addEventListener('change', range);
  const narrowEl = h('div', { class: 'rf-narrow' });
  const narrowSet = () => PILLS.filter(([k]) => f[k]).length + (f.minPts > MIN || f.maxPts < MAX ? 1 : 0);
  const narrowHead = h('div');
  function paintNarrow() {
    narrowHead.replaceChildren(head('Narrow it down', narrowSet(), () => { for (const [k] of PILLS) f[k] = false; f.minPts = MIN; f.maxPts = MAX; minI.value = String(MIN); maxI.value = String(MAX); changed(); }));
    narrowEl.replaceChildren(h('div', { class: 'rf-pills' }, PILLS.map(([k, ic, label]) => h('button', { type: 'button', class: ['rf-pill', f[k] && 'is-on'], 'aria-pressed': String(!!f[k]), on: { click: () => { f[k] = !f[k]; changed(); } } }, icon(ic, { size: 16 }), h('span', { text: label })))),
      h('div', { class: 'rf-range' }, h('span', { class: 'rf-range-l' }, icon('points', { size: 16 }), 'Points'), minI, h('span', { class: 'rf-to', text: '\u2013' }), maxI));
  }

  const refocus = (box) => { const i = box.querySelector('.rf-search'); if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch { /* not a text field */ } } };   // the list is redrawn while typing; the caret must stay
  // ---- sites and tags ------------------------------------------------------------------------------------------------------------------
  const sitesHead = h('div'), sitesBody = h('div', { class: 'rf-choice' }), tagsHead = h('div'), tagsBody = h('div', { class: 'rf-choice' });
  function choiceChips(items, stateOf, onTap) {
    return h('div', { class: 'rf-chips' }, items.map(([k, n]) => { const st = stateOf(k); return h('button', { type: 'button', class: ['rf-c', st && `is-${st}`], 'aria-pressed': String(!!st), title: k, on: { click: () => onTap(k, st) } },
      st === 'in' ? icon('check', { size: 13 }) : st === 'out' ? icon('block', { size: 13 }) : null, h('span', { class: 'rf-cn', text: short(k, 22) }), n ? h('span', { class: 'rf-n', text: String(n) }) : null); }));
  }
  function paintSites() {
    const links = engine.listLinks(), ranked = rankCounts(links, hostKeys);
    sitesHead.replaceChildren(head('Sites', f.include.length + f.exclude.length, () => { f.include.length = 0; f.exclude.length = 0; changed(); }));
    const chosen = [...f.include, ...f.exclude], items = visibleChoices(ranked, chosen, { top: TOP_SITES, all: ui.allSites, q: ui.siteQ });
    const stateOf = (k) => (f.include.includes(k) ? 'in' : f.exclude.includes(k) ? 'out' : '');
    const tap = (k, st) => { const target = ui.siteMode === 'include' ? f.include : f.exclude, other = ui.siteMode === 'include' ? f.exclude : f.include;
      const oi = other.indexOf(k); if (oi >= 0) other.splice(oi, 1);
      const ti = target.indexOf(k); if (ti >= 0 && st) target.splice(ti, 1); else if (ti < 0) target.push(k); changed(); };
    const mode = h('div', { class: 'seg rf-mode', role: 'radiogroup', 'aria-label': 'What a tap does' }, [['include', 'Only these'], ['exclude', 'Leave out']].map(([v, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(ui.siteMode === v), text: label, on: { click: () => { ui.siteMode = v; paintSites(); } } })));
    const more = !ui.siteQ && ranked.length > TOP_SITES ? h('button', { type: 'button', class: 'rf-more', on: { click: () => { ui.allSites = !ui.allSites; paintSites(); } } }, ui.allSites ? 'Show fewer' : `See more (${ranked.length - TOP_SITES})`) : null;
    const input = search(ui.siteQ, 'Search sites', (v) => { ui.siteQ = v; paintSites(); refocus(sitesBody); });
    sitesBody.replaceChildren(h('div', { class: 'rf-tools' }, mode, input),
      items.length ? choiceChips(items, stateOf, tap) : h('p', { class: 'rf-none', text: ranked.length ? 'No site matches.' : 'Sites appear here once you have links.' }), more);
  }
  function paintTags() {
    const links = engine.listLinks(), ranked = rankCounts(links, tagKeys);
    tagsHead.replaceChildren(head('Tags', f.tags.length, () => { f.tags.length = 0; changed(); }));
    const items = visibleChoices(ranked, f.tags, { top: TOP_TAGS, all: ui.allTags, q: ui.tagQ });
    const stateOf = (k) => (f.tags.includes(k) ? 'in' : '');
    const tap = (k, st) => { const i = f.tags.indexOf(k); if (st && i >= 0) f.tags.splice(i, 1); else if (!st) f.tags.push(k); changed(); };
    const more = !ui.tagQ && ranked.length > TOP_TAGS ? h('button', { type: 'button', class: 'rf-more', on: { click: () => { ui.allTags = !ui.allTags; paintTags(); } } }, ui.allTags ? 'Show fewer' : `See more (${ranked.length - TOP_TAGS})`) : null;
    tagsBody.replaceChildren(ranked.length ? h('div', { class: 'rf-tools' }, search(ui.tagQ, 'Search tags', (v) => { ui.tagQ = v; paintTags(); refocus(tagsBody); })) : null,
      items.length ? choiceChips(items, stateOf, tap) : h('p', { class: 'rf-none', text: ranked.length ? 'No tag matches.' : 'Tags appear here once you tag links.' }), more);
  }

  const foldersHead = h('div');
  const folderSearch = search('', 'Search folders', (v) => { ui.folderQ = v; paintFolders(); });
  function paintAll() {
    foldersHead.replaceChildren(head('Folders', Object.keys(f.folders).length, () => { f.folders = {}; changed(); }));
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
