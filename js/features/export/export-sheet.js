/**
 * Linkivo — js/features/export/export-sheet.js  (v2.2.0)
 * Purpose: the Export popup. Pick a format (the Linkivo backup first, it re-imports fast), set its options (fields, sort, grouping, delimiter, date
 *          format, theme, file name), see a live preview of the first links, then download. Last format and options are remembered per format.
 *          Opened from the Library menu (whole library), a folder menu (that folder), the selection bar (selected links) and Settings.
 * API: openExport({ engine, scope, title? }) -> Promise<void>      downloadBlob(blob, name)
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { loadCss } from '../../core/css-loader.js';
import { plural, formatBytes } from '../../core/format.js';
import { logActivity } from '../../core/activity.js';
import appInfo from '../../core/app-info.js';
import { FORMATS, getFormat, defaultOptions } from './formats/index.js';
import { NATIVE_ID, collect, runExport, previewExport } from './export-engine.js';
import { pref, setPref, LIB } from '../library/lib-prefs.js';

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const NATIVE = { id: NATIVE_ID, label: 'Linkivo backup', desc: 'Everything: folders, tags, points and flags. Restores in seconds, no titles are fetched again.', ext: 'linkivo.json', options: [{ id: 'fileName', type: 'text', label: 'File name', default: '', placeholder: 'linkivo-{scope}-{date}' }] };


/** Chip group: any number of choices, at least one stays on. */
function multi(opt, value, set) {
  let cur = new Set(value || []);
  const chips = opt.choices.map((c) => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(cur.has(c.value)) }, c.label);
    b.classList.toggle('is-on', cur.has(c.value));
    b.addEventListener('click', () => {
      const next = new Set(cur);
      if (next.has(c.value)) next.delete(c.value); else next.add(c.value);
      if (!next.size) return;
      cur = next; b.classList.toggle('is-on', cur.has(c.value)); b.setAttribute('aria-pressed', String(cur.has(c.value))); set([...cur]);
    });
    return b;
  });
  return h('div', { class: 'ex-field' }, h('span', { class: 'label', text: opt.label }), h('div', { class: 'ex-multi' }, chips));
}

function control(opt, value, set) {
  const id = `ex-${opt.id}`;
  if (opt.type === 'switch') return h('label', { class: 'imp-sw' }, h('input', { type: 'checkbox', checked: !!value, on: { change: (e) => set(e.target.checked) } }), h('span', { text: opt.label }));
  if (opt.type === 'select') return h('div', { class: 'ex-field' }, h('label', { class: 'label', for: id, text: opt.label }), h('select', { class: 'select', id, on: { change: (e) => set(e.target.value) } }, opt.choices.map((c) => h('option', { value: c.value, text: c.label, selected: c.value === value }))));
  if (opt.type === 'multi') return multi(opt, value, set);
  return h('div', { class: 'ex-field' }, h('label', { class: 'label', for: id, text: opt.label }), h('input', { class: 'input', id, type: 'text', value: value ?? '', placeholder: opt.placeholder || '', on: { input: (e) => set(e.target.value) } }), opt.help && h('p', { class: 'help', text: opt.help }));
}

export async function openExport({ engine, scope = { type: 'all' }, title = 'Export' }) {
  await loadCss('/css/pages/data.css');
  const { links, folders } = collect(engine, scope);
  if (!links.length && scope.type !== 'folders' && scope.type !== 'all') { toast('There are no links to export.'); return; }
  const all = [NATIVE, ...FORMATS];
  let fmtId = all.some((f) => f.id === pref(LIB.exportFormat)) ? pref(LIB.exportFormat) : NATIVE_ID;
  const saved = () => pref(LIB.exportOpts) || {};
  let opts = {};
  const previewBox = h('pre', { class: 'ex-preview', 'aria-label': 'Preview', tabindex: '0' });
  const optsBox = h('div', { class: 'ex-opts' }), list = h('div', { class: 'ex-formats', role: 'radiogroup', 'aria-label': 'Format' });
  const go = h('button', { type: 'button', class: 'btn btn-primary' });
  const cur = () => (fmtId === NATIVE_ID ? NATIVE : getFormat(fmtId));

  let timer = 0, token = 0;
  function preview() { clearTimeout(timer); timer = setTimeout(async () => { const my = ++token; try { const t = await previewExport({ engine, scope, formatId: fmtId, options: opts }); if (my === token) previewBox.textContent = String(t).slice(0, 900) || '(nothing to show)'; } catch { if (my === token) previewBox.textContent = 'Preview is not available.'; } }, 150); }
  function paint() {
    const f = cur(); opts = fmtId === NATIVE_ID ? { ...(saved()[fmtId] || {}) } : defaultOptions(f, saved()[fmtId] || {});
    list.replaceChildren(...all.map((x) => h('button', { type: 'button', class: ['ex-fmt', x.id === fmtId && 'is-on'], role: 'radio', 'aria-checked': String(x.id === fmtId), on: { click: () => { fmtId = x.id; setPref(LIB.exportFormat, fmtId); paint(); } } },
      h('strong', { text: x.label }), x.id === NATIVE_ID && h('span', { class: 'badge is-on', text: 'Recommended' }), h('span', { class: 'help', text: x.desc }))));
    optsBox.replaceChildren(...f.options.map((o) => control(o, opts[o.id], (v) => { opts[o.id] = v; setPref(LIB.exportOpts, { ...saved(), [fmtId]: opts }); preview(); })));
    go.textContent = `Export ${plural(links.length, 'link')}`; go.disabled = !links.length && fmtId !== NATIVE_ID;
    preview();
  }
  go.addEventListener('click', async () => {
    go.disabled = true; go.textContent = 'Preparing...';
    try {
      const r = await runExport({ engine, scope, formatId: fmtId, options: opts, app: appInfo.version });
      downloadBlob(r.blob, r.name); await logActivity(engine, 'export', `${r.count} links as ${fmtId}`);
      toast(`Exported ${plural(r.count, 'link')} (${formatBytes(r.size)}).`); sheet.close();
    } catch (e) { toast('The export failed. Try another format.', { type: 'error' }); go.disabled = false; go.textContent = `Export ${plural(links.length, 'link')}`; }
  });
  const body = h('div', { class: 'form ex' }, h('p', { class: 'help', text: `${plural(folders.length, 'folder')}, ${plural(links.length, 'link')}. The Recycle Bin is not included.` }), list, h('span', { class: 'label', text: 'Options' }), optsBox, h('span', { class: 'label', text: 'Preview' }), previewBox,
    h('div', { class: 'imp-foot' }, h('button', { type: 'button', class: 'btn', on: { click: () => sheet.close() } }, 'Cancel'), go));
  const sheet = openSheet({ title, wide: true, body, actions: [] });
  paint();
}
