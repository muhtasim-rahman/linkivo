/**
 * Linkivo — js/features/export/export-sheet.js  (v2.2.1)
 * Purpose: the Export popup, redesigned (owner request): minimal, icon first, little text. The Linkivo backup (the app's own format, it restores fast) is the
 *          big highlighted tile; the other formats are icon tiles. Every format shows only ITS options, in small groups (content, layout, style,
 *          order, filter) built from the option lists in formats/*.js: segmented icon choices, color dots, chips, switches and the shared dropdown.
 *          The designed formats (Web page, Print) show a live miniature of the page; the others a short text preview. Last format and options are remembered.
 *          Opened from the Library menu (whole library), a folder menu (that folder), the selection bar (selected links) and Settings.
 * v2.2.3 (owner): when the whole library is exported (Settings, Library menu) a row of folder chips shows every folder SELECTED; tap a chip to leave a
 *          folder out (the scope becomes those folders), the first chip selects or clears all.
 * API: openExport({ engine, scope, title? }) -> Promise<void>      downloadBlob(blob, name)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { createSelect } from '../../ui/select.js';
import { loadCss } from '../../core/css-loader.js';
import { plural, formatBytes } from '../../core/format.js';
import { logActivity } from '../../core/activity.js';
import appInfo from '../../core/app-info.js';
import { FORMATS, getFormat, defaultOptions } from './formats/index.js';
import { NATIVE_ID, collect, runExport, previewExport, previewHtml } from './export-engine.js';
import { pref, setPref, LIB } from '../library/lib-prefs.js';

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const NATIVE = { id: NATIVE_ID, label: 'Linkivo backup', icon: 'shield', ext: 'linkivo.json', options: [] };
const ICONS = { json: 'code', csv: 'table', xlsx: 'table', txt: 'file', md: 'file', bookmarks: 'bookmark', opml: 'share' };
const GROUPS = { content: ['Content', 'list'], layout: ['Layout', 'panel'], style: ['Style', 'palette'], order: ['Order', 'sort'], filter: ['Filter', 'filter'] };
const GROUP_BY_ID = { sort: 'order', group: 'order', dateFormat: 'order', skipBlocked: 'filter', onlyFavourites: 'filter', onlyTag: 'filter', delimiter: 'style', lineEnding: 'style', bom: 'style', pretty: 'style', header: 'layout', sheets: 'layout' };
/** Which group an option belongs to: its own `group`, else by id, else by control type. Pure, tested. */
export const groupOf = (o) => o.group || GROUP_BY_ID[o.id] || (o.type === 'multi' ? 'content' : o.type === 'switch' ? 'layout' : 'style');
export const iconOf = (f) => f.icon || ICONS[f.id] || 'file';

function control(opt, value, set) {
  const label = h('span', { class: 'ex-label', text: opt.label });
  if (opt.type === 'switch') return h('label', { class: 'ex-toggle' }, h('input', { type: 'checkbox', checked: !!value, on: { change: (e) => set(e.target.checked) } }), h('span', { text: opt.label }));
  if (opt.type === 'seg') {
    const seg = h('div', { class: 'seg ex-seg', role: 'radiogroup', 'aria-label': opt.label }, opt.choices.map((c) => h('button', { type: 'button', role: 'radio', 'data-v': c.value, 'aria-checked': String(c.value === value), 'data-tip': c.label,
      on: { click: () => { set(c.value); for (const b of seg.children) b.setAttribute('aria-checked', String(b.dataset.v === c.value)); } } }, c.icon && icon(c.icon, { size: 16 }), h('span', { text: c.label }))));
    return h('div', { class: 'ex-field' }, label, seg);
  }
  if (opt.type === 'swatch') {
    const row = h('div', { class: 'ex-swatches', role: 'radiogroup', 'aria-label': opt.label }, opt.choices.map((c) => h('button', { type: 'button', role: 'radio', class: 'ex-dot', style: { '--dot': c.color }, 'data-v': c.value, 'aria-label': c.label, 'aria-checked': String(c.value === value),
      on: { click: () => { set(c.value); for (const b of row.children) b.setAttribute('aria-checked', String(b.dataset.v === c.value)); } } }, icon('check', { size: 14 }))));
    return h('div', { class: 'ex-field' }, label, row);
  }
  if (opt.type === 'select') return h('div', { class: 'ex-field' }, label, createSelect({ options: opt.choices, value, label: opt.label, block: true, small: true, onChange: set }));
  if (opt.type === 'multi') {
    let cur = new Set(value || []);
    const chips = opt.choices.map((c) => { const b = h('button', { type: 'button', class: ['chip', cur.has(c.value) && 'is-on'], 'aria-pressed': String(cur.has(c.value)) }, c.label); b.addEventListener('click', () => { const next = new Set(cur); if (next.has(c.value)) next.delete(c.value); else next.add(c.value); if (!next.size) return; cur = next; b.classList.toggle('is-on', cur.has(c.value)); b.setAttribute('aria-pressed', String(cur.has(c.value))); set([...cur]); }); return b; });
    return h('div', { class: 'ex-field' }, label, h('div', { class: 'ex-multi' }, chips));
  }
  return h('div', { class: 'ex-field' }, label, h('input', { class: 'input', type: 'text', value: value ?? '', placeholder: opt.placeholder || '', 'aria-label': opt.label, on: { input: (e) => set(e.target.value) } }));
}

export async function openExport({ engine, scope = { type: 'all' }, title = 'Export' }) {
  await Promise.all([loadCss('/css/pages/data.css'), loadCss('/css/pages/library.css')]);   // library.css: the chip look
  let { links, folders } = collect(engine, scope);
  const allFolders = scope.type === 'all' ? engine.listFolders() : [];   // v2.2.3: the folder chips exist only when the whole library is the scope
  const picked = new Set(allFolders.map((f) => f.id));
  if (!links.length && scope.type !== 'folders' && scope.type !== 'all') { toast('There are no links to export.'); return; }
  const all = [NATIVE, ...FORMATS];
  let fmtId = all.some((f) => f.id === pref(LIB.exportFormat)) ? pref(LIB.exportFormat) : NATIVE_ID;
  const saved = () => pref(LIB.exportOpts) || {};
  let opts = {}, fileName = '';
  const cur = () => all.find((f) => f.id === fmtId);
  const nativeTile = h('button', { type: 'button', class: 'ex-native', role: 'radio', on: { click: () => pick(NATIVE_ID) } },
    h('span', { class: 'ex-native-ic' }, icon('shield', { size: 24 })), h('span', { class: 'ex-native-t' }, h('strong', { text: 'Linkivo backup' }), h('span', { text: 'Everything, restores fast' })), h('span', { class: 'badge', text: 'Recommended' }));
  const grid = h('div', { class: 'ex-grid', role: 'radiogroup', 'aria-label': 'Format' });
  const previewBox = h('div', { class: 'ex-preview-wrap' });
  const optsBox = h('div', { class: 'ex-opts' });
  const fileInput = h('input', { class: 'input', type: 'text', placeholder: 'linkivo-{scope}-{date}', 'aria-label': 'File name', maxlength: '80', on: { input: (e) => { fileName = e.target.value; } } });
  const go = h('button', { type: 'button', class: 'btn btn-primary' });
  const scopeRow = h('div', { class: 'ex-scope' });
  const folderBox = h('div', { class: 'ex-folders', role: 'group', 'aria-label': 'Folders to export', hidden: allFolders.length < 2 });
  const paintScope = () => scopeRow.replaceChildren(h('span', { class: 'ex-chip' }, icon('folder', { size: 16 }), plural(folders.length, 'folder')), h('span', { class: 'ex-chip' }, icon('link', { size: 16 }), plural(links.length, 'link')));
  /** Pure-ish: every folder selected = the whole library; fewer = just those folders. */
  function recollect() {
    scope = picked.size === allFolders.length ? { type: 'all' } : { type: 'folders', fids: [...picked] };
    ({ links, folders } = collect(engine, scope));
    paintScope(); paintFolders();
    go.textContent = `Export ${plural(links.length, 'link')}`; go.disabled = !links.length && fmtId !== NATIVE_ID; preview();
  }
  function paintFolders() {
    const allOn = picked.size === allFolders.length;
    const chip = (label, on, fn, n) => h('button', { type: 'button', class: ['chip', on && 'is-on'], 'aria-pressed': String(on), on: { click: fn } }, label, n != null && h('span', { class: 'chip-n', text: String(n) }));
    folderBox.replaceChildren(chip(allOn ? 'All folders' : 'Select all', allOn, () => { if (allOn) picked.clear(); else for (const f of allFolders) picked.add(f.id); recollect(); }),
      ...allFolders.map((f) => chip(f.name, picked.has(f.id), () => { if (picked.has(f.id)) picked.delete(f.id); else picked.add(f.id); recollect(); }, f.lc || 0)));
  }

  function pick(id) { fmtId = id; setPref(LIB.exportFormat, id); paint(); }
  let timer = 0, token = 0;
  function preview() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const my = ++token, f = cur();
      try {
        if (fmtId === NATIVE_ID) { previewBox.replaceChildren(); return; }
        const html = f.visual ? await previewHtml({ engine, scope, formatId: fmtId, options: opts }) : null;
        if (my !== token) return;
        if (html) {
          const frame = h('iframe', { class: 'ex-frame', sandbox: '', title: 'Preview', srcdoc: html, tabindex: '-1', loading: 'lazy' });
          const box = h('div', { class: 'ex-pv' }, frame); previewBox.replaceChildren(box);
          const fit = () => { frame.style.transform = `scale(${(box.clientWidth || 360) / 900})`; }; fit();
          if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(box);
        } else { const t = await previewExport({ engine, scope, formatId: fmtId, options: opts }); if (my === token) previewBox.replaceChildren(h('pre', { class: 'ex-preview', 'aria-label': 'Preview', tabindex: '0', text: String(t).slice(0, 700) })); }
      } catch { if (my === token) previewBox.replaceChildren(); }
    }, 180);
  }
  function paint() {
    const f = cur(); opts = fmtId === NATIVE_ID ? {} : defaultOptions(f, saved()[fmtId] || {});
    nativeTile.setAttribute('aria-checked', String(fmtId === NATIVE_ID)); nativeTile.classList.toggle('is-on', fmtId === NATIVE_ID);
    grid.replaceChildren(...FORMATS.map((x) => h('button', { type: 'button', class: ['ex-fmt', x.id === fmtId && 'is-on'], role: 'radio', 'aria-checked': String(x.id === fmtId), 'data-tip': x.desc || x.label, on: { click: () => pick(x.id) } }, icon(iconOf(x), { size: 22 }), h('span', { text: x.label }))));
    const groups = new Map();
    for (const o of f.options.filter((x) => x.id !== 'fileName')) { const g = groupOf(o); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); }
    const order = Object.keys(GROUPS).filter((g) => groups.has(g));
    optsBox.replaceChildren(...order.map((g, idx) => h('details', { class: 'ex-sec', open: idx < 2 }, h('summary', null, icon(GROUPS[g][1], { size: 16 }), h('span', { text: GROUPS[g][0] })),
      h('div', { class: 'ex-sec-body' }, groups.get(g).map((o) => control(o, opts[o.id], (v) => { opts[o.id] = v; setPref(LIB.exportOpts, { ...saved(), [fmtId]: opts }); preview(); }))))));
    if (fmtId !== NATIVE_ID || true) optsBox.appendChild(h('div', { class: 'ex-file' }, icon('file', { size: 16 }), fileInput, h('span', { class: 'ex-ext', text: '.' + f.ext })));
    go.textContent = `Export ${plural(links.length, 'link')}`; go.disabled = !links.length && fmtId !== NATIVE_ID;
    preview();
  }
  go.addEventListener('click', async () => {
    go.disabled = true; go.textContent = 'Preparing...';
    try {
      const r = await runExport({ engine, scope, formatId: fmtId, options: { ...opts, fileName: fileName.trim() || undefined }, app: appInfo.version });
      downloadBlob(r.blob, r.name); await logActivity(engine, 'export', `${r.count} links as ${fmtId}`);
      toast(`Exported ${plural(r.count, 'link')} (${formatBytes(r.size)}).`); sheet.close();
    } catch (e) { toast('The export failed. Try another format.', { type: 'error' }); go.disabled = false; go.textContent = `Export ${plural(links.length, 'link')}`; }
  });
  const body = h('div', { class: 'form ex' }, scopeRow, folderBox, nativeTile, grid, previewBox, optsBox, h('div', { class: 'imp-foot' }, h('button', { type: 'button', class: 'btn', on: { click: () => sheet.close() } }, 'Cancel'), go));
  const sheet = openSheet({ title, wide: true, body, actions: [] });
  paintScope(); if (allFolders.length > 1) paintFolders();
  paint();
}
