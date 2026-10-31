/**
 * Linkivo — js/features/random/random-filters.js  (v2.4.1)
 * Purpose: the ONE filter panel of Random Discover. Folders (any number, each with a Low / Normal / High chance), narrowing switches, a points range,
 *          sites to include or leave out, and tags. The same panel is shown on the page before the first link and inside a popup while a link is open
 *          (spec: "folder selection and filters are merged into one panel"). It edits a filter object in place and calls onChange after every edit;
 *          the page owns the object, the picker (engine/picker.js) reads it. A live counter shows how many links are in play.
 * API: loadFilters(prefs, { folder }) -> filters     saveFilters(prefs, filters)     poolCount(links, filters, skipDead) -> number
 *      buildFilterPanel({ engine, filters, onChange }) -> { el, refresh() }
 */
import { h } from '../../core/dom.js';
import { prefs } from '../../core/local-prefs.js';
import { icon } from '../../ui/icons.js';
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

/** A row of removable chips with a small text box (sites, tags). `clean` turns what was typed into the stored value, or '' to ignore it. */
function chipBox({ label, placeholder, values, clean, onChange }) {
  const list = h('div', { class: 'rf-chips' });
  const input = h('input', { class: 'input rf-input', type: 'text', placeholder, 'aria-label': label, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const paint = () => list.replaceChildren(...values.map((v, i) => h('span', { class: 'rf-chip' }, h('span', { text: v }), h('button', { type: 'button', class: 'rf-x', 'aria-label': `Remove ${v}`, on: { click: () => { values.splice(i, 1); paint(); onChange(); } } }, icon('close', { size: 14 })))));
  const add = () => { for (const part of input.value.split(',')) { const v = clean(part); if (v && !values.includes(v) && values.length < 30) values.push(v); } input.value = ''; paint(); onChange(); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } });
  input.addEventListener('blur', () => { if (input.value.trim()) add(); });
  paint();
  return h('div', { class: 'rf-field' }, h('label', { class: 'rf-label' }, h('span', { text: label }), input), list);
}

export function buildFilterPanel({ engine, filters, onChange }) {
  const f = filters;
  const counter = h('div', { class: 'rf-count', role: 'status', 'aria-live': 'polite' });
  const foldersEl = h('div', { class: 'rf-folders', role: 'group', 'aria-label': 'Folders' });
  const changed = () => { paintFolders(); paintCount(); onChange(f); };

  function paintCount() {
    const n = poolCount(engine.listLinks(), f, prefs.get('random.skipDead', true) !== false);
    counter.replaceChildren(h('strong', { text: n.toLocaleString() }), h('span', { text: n === 1 ? ' link in play' : ' links in play' }));
    counter.classList.toggle('is-zero', n === 0);
  }

  function paintFolders() {
    const folders = engine.listFolders().filter((x) => !x.del).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.name || '').localeCompare(b.name || ''));
    const none = Object.keys(f.folders).length === 0;
    const all = h('button', { type: 'button', class: ['rf-all', none && 'is-on'], 'aria-pressed': String(none), on: { click: () => { f.folders = {}; changed(); } } }, icon('library', { size: 18 }), h('span', { text: 'All folders' }), h('span', { class: 'rf-n', text: String(engine.listLinks().length) }));
    const rows = folders.map((fo) => {
      const w = f.folders[fo.id], on = !!w;
      const pick = h('button', { type: 'button', class: ['rf-folder', on && 'is-on'], 'aria-pressed': String(on), on: { click: () => { if (on) delete f.folders[fo.id]; else f.folders[fo.id] = 'normal'; changed(); } } },
        folderTile(fo, 28), h('span', { class: 'rf-fname', text: fo.name }), h('span', { class: 'rf-n', text: String(fo.lc || 0) }), h('span', { class: 'rf-tick', 'aria-hidden': 'true' }, on ? icon('check', { size: 14 }) : null));
      const weight = on ? h('div', { class: 'seg rf-weight', role: 'radiogroup', 'aria-label': `Chance for ${fo.name}` }, ['low', 'normal', 'high'].map((k) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(w === k), text: k === 'low' ? 'Low' : k === 'high' ? 'High' : 'Normal', on: { click: () => { f.folders[fo.id] = k; changed(); } } }))) : null;
      return h('div', { class: ['rf-frow', on && 'is-on'] }, pick, weight);
    });
    foldersEl.replaceChildren(all, ...rows);
  }

  const sw = (label, desc, key) => {
    const btn = h('button', { type: 'button', class: 'switch-hit', role: 'switch', 'aria-label': label, 'aria-checked': String(!!f[key]), on: { click: (e) => { e.stopPropagation(); flip(); } } }, h('span', { class: 'switch', 'aria-checked': String(!!f[key]) }));
    const flip = () => { f[key] = !f[key]; btn.setAttribute('aria-checked', String(f[key])); btn.firstChild.setAttribute('aria-checked', String(f[key])); changed(); };
    const row = h('div', { class: 'row is-toggle rf-sw', on: { click: flip } }, h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), h('span', { class: 'row-end' }, btn));
    return row;
  };

  const minI = h('input', { class: 'input rf-num', type: 'number', inputmode: 'numeric', min: String(MIN), max: String(MAX), value: String(f.minPts), 'aria-label': 'Lowest points' });
  const maxI = h('input', { class: 'input rf-num', type: 'number', inputmode: 'numeric', min: String(MIN), max: String(MAX), value: String(f.maxPts), 'aria-label': 'Highest points' });
  const range = () => { let a = Math.min(MAX, Math.max(MIN, num(minI.value, MIN))), b = Math.min(MAX, Math.max(MIN, num(maxI.value, MAX))); if (a > b) [a, b] = [b, a]; f.minPts = a; f.maxPts = b; minI.value = String(a); maxI.value = String(b); changed(); };
  minI.addEventListener('change', range); maxI.addEventListener('change', range);

  const host = (v) => v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const el = h('div', { class: 'rf' },
    h('section', { class: 'rf-sec' }, h('h3', { class: 'rf-h', text: 'Folders' }), h('p', { class: 'rf-help', text: 'Pick none for every folder, or choose some and give each a Low, Normal or High chance.' }), foldersEl),
    h('section', { class: 'rf-sec' }, h('h3', { class: 'rf-h', text: 'Narrow it down' }),
      h('div', { class: 'group rf-group' }, sw('Favourites only', 'Links you added to favourites.', 'onlyFav'), sw('Liked only', 'Links with more than the starting 100 points.', 'onlyLiked'), sw('Never opened only', 'Links Random has not shown you yet.', 'unseenOnly'), sw('Skip disliked links', 'Links you pointed down since their last random open.', 'skipDisliked')),
      h('div', { class: 'rf-field' }, h('span', { class: 'rf-label-t', text: 'Points between' }), h('div', { class: 'rf-range' }, minI, h('span', { class: 'rf-to', text: 'and' }), maxI))),
    h('section', { class: 'rf-sec' }, h('h3', { class: 'rf-h', text: 'Sites and tags' }),
      chipBox({ label: 'Only these sites', placeholder: 'example.com', values: f.include, clean: host, onChange: changed }),
      chipBox({ label: 'Leave out these sites', placeholder: 'example.com', values: f.exclude, clean: host, onChange: changed }),
      chipBox({ label: 'Tags (any of)', placeholder: 'work, read', values: f.tags, clean: (v) => v.trim().toLowerCase().slice(0, 30), onChange: changed })));
  paintFolders(); paintCount();
  return { el, counter, refresh() { paintFolders(); paintCount(); } };
}
