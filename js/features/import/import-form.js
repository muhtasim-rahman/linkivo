/**
 * Linkivo — js/features/import/import-form.js  (v2.2.1, v2.2.2)
 * Purpose: the whole Import experience as ONE form (owner request: no popup on the Import page). The /import page shows it full size; every other
 *          page opens the same form COMPACT in a dialog (phones go to /import instead, no bottom popup). It replaces the v2.2.0 popup and its
 *          separate review step: the links that were found are listed right under the input, with domain chips to switch whole sites off.
 *          Sections: input (paste text or files) -> options -> found links (domains, search, sort, ticks) -> action bar.
 *          A Linkivo backup file switches the form to the restore panel (import-backup.js).
 * API: createImportForm({ engine, router, fid?, files?, compact? }) -> { el, dockEl, addFiles(files), dirty(), reset(), destroy(), onStarted(fn) }
 *      collectWarnings({ files, found, pasteSize }) -> string[]      fileSig(file) -> string      stashFiles(files) / takeFiles()  (files handed to the Import page from another page)      stashText(text) / takeText()  (v2.2.2: clipboard suggestion)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { createSelect } from '../../ui/select.js';
import { createVirtualList } from '../../ui/virtual-list.js';
import { attachScrollRow } from '../../ui/scroll-row.js';
import { prefs } from '../../core/local-prefs.js';
import { formatBytes, plural } from '../../core/format.js';
import { extractLinks } from '../../core/extract.js';
import { dedupeKey, isIconUrl } from '../../core/url-tools.js';
import { keepAwakeWhile } from '../../core/wake-lock.js';
import { getQueue } from '../../core/app-data.js';
import { FORMATS } from './parsers.js';
import { createParseClient } from './parse-client.js';
import { readBackupText } from './native-import.js';
import { startImport } from './import-job.js';
import { buildRows, sortRows } from './import-review.js';
import { createBackupPanel, runRestore } from './import-backup.js';
import { openFolderPicker } from '../library/pickers.js';
import { pref, setPref, LIB } from '../library/lib-prefs.js';

const BIG_FILE = 5e6, MANY_FILES = 10, MANY_LINKS = 2000, BIG_PASTE = 1e6;
const SORTS = [{ value: 'order', label: 'Found order' }, { value: 'domain', label: 'Domain' }, { value: 'title', label: 'Title' }];

export function collectWarnings({ files, found, pasteSize }) {
  const w = [];
  if (pasteSize > BIG_PASTE) w.push('That is a lot of pasted text. Reading it may take a moment.');
  if (files.length > MANY_FILES) w.push(`${files.length} files at once is a lot. Consider importing them in smaller groups.`);
  for (const f of files) if (f.size > BIG_FILE) w.push(`${f.name} is large (${formatBytes(f.size)}). Reading it can take a while.`);
  if (found > MANY_LINKS) w.push(`${plural(found, 'link')} found. The import runs in the background: you can minimize it and keep using the app.`);
  for (const f of files) for (const m of f.warnings || []) w.push(m);
  return w;
}

/** v2.2.2 pure: identifies a file for the duplicate check. Exported for tests. */
export const fileSig = (f) => `${f.name}|${f.size}|${f.lastModified || 0}`;

// Files dropped on another page cannot cross a page change by themselves: they wait here until the Import page mounts.
let stash = [];
export const stashFiles = (files) => { stash = [...files]; };
export const takeFiles = () => { const f = stash; stash = []; return f; };
// v2.2.2: text for the paste box that was found in the clipboard (see clipboard-suggest.js)
let textStash = '';
export const stashText = (t) => { textStash = String(t || ''); };
export const takeText = () => { const t = textStash; textStash = ''; return t; };

/** Pure: the rows with the user's own ticks kept (manual) and whole domains switched off (off). Exported for tests. */
export function applySelection(rows, { manual, off }) {
  for (const r of rows) r.selected = manual.has(r.key) ? manual.get(r.key) : !r.dupOf && !r.repeat && !off.has(r.host);
  return rows;
}
export function domainCounts(rows, limit = 40) {
  const m = new Map(); for (const r of rows) if (r.host) m.set(r.host, (m.get(r.host) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

export function createImportForm({ engine, router = null, fid = null, files = [], compact = false, text = '' }) {
  const queue = getQueue();
  const parser = createParseClient();
  const st = { tab: files.length ? 'files' : 'paste', text: '', paste: [], files: [], backup: null, q: '', sort: 'order', rows: [], view: [], manual: new Map(), off: new Set(), seq: 0,
    target: fid && engine.getFolder(fid) ? fid : (engine.getFolder(prefs.get('lib.lastFolder', '')) ? prefs.get('lib.lastFolder', '') : engine.listFolders()[0]?.id || null),
    opts: { bare: pref(LIB.impBare), dedupe: pref(LIB.impDedupe), clean: pref(LIB.impClean), enrich: pref(LIB.impEnrich), icons: pref(LIB.impIcons) } };
  let startedCb = () => {}, busy = false, destroyed = false, detachChips = () => {};
  const targetName = () => (st.target && engine.getFolder(st.target)?.name) || 'a new folder "Imported links"';
  const rawLinks = () => [...st.paste, ...st.files.flatMap((f) => f.links)];
  const dirty = () => !!st.text.trim() || st.files.length > 0;

  // ---- input ----------------------------------------------------------------------------------------------------------
  const ta = h('textarea', { class: 'input imp-text', rows: compact ? '5' : '8', placeholder: 'Paste links, a list, an article, HTML, Markdown, JSON or CSV. Linkivo finds every link in it.', 'aria-label': 'Text with links', spellcheck: 'false', enterkeyhint: 'done' });
  const count = h('p', { class: 'imp-count', role: 'status', 'aria-live': 'polite' });
  const filesBox = h('div', { class: 'imp-files' });
  const fileInput = h('input', { type: 'file', multiple: true, hidden: true, accept: FORMATS.flatMap((f) => f.exts.map((e) => '.' + e)).join(','), on: { change: (e) => { addFiles(e.target.files); e.target.value = ''; } } });
  const drop = h('div', { class: 'imp-drop', tabindex: '0', role: 'button', 'aria-label': 'Choose files or drop them here', on: { click: () => fileInput.click(), keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } },
    dragover: (e) => { e.preventDefault(); drop.classList.add('is-over'); }, dragleave: () => drop.classList.remove('is-over'), drop: (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('is-over'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); } } },   // v2.2.2: stopPropagation, the page also listens for drops and added every file a second time
    icon('upload', { size: 26 }), h('strong', { text: 'Choose files or drop them here' }), h('span', { class: 'help', text: 'Many files at once are fine.' }));
  const formats = h('details', { class: 'imp-formats' }, h('summary', { text: 'Supported file types' }),
    h('div', { class: 'imp-fmt' }, FORMATS.map((f) => h('span', { class: ['badge', f.popular && 'is-on'], text: f.label, title: f.exts.map((e) => '.' + e).join(' ') }))), h('p', { class: 'help', text: 'Old Excel (.xls) is not supported: save it as .xlsx first.' }));
  const tabs = h('div', { class: 'seg imp-tabs', role: 'tablist' }, [['paste', 'type', 'Paste text'], ['files', 'upload', 'Files']].map(([t, ic, label]) => h('button', { type: 'button', role: 'tab', 'data-t': t, on: { click: () => { st.tab = t; paintTabs(); } } }, icon(ic, { size: 16 }), label)));
  const pasteBtn = h('button', { type: 'button', class: 'btn btn-sm', on: { click: async () => { try { const t = await navigator.clipboard.readText(); if (t) { ta.value = st.text = (st.text ? st.text + '\n' : '') + t; reparse(); } else toast('The clipboard is empty.'); } catch { toast('The browser blocked clipboard access.', { type: 'error' }); } } } }, icon('copy', { size: 16 }), 'Paste from clipboard');
  const clearBtn = h('button', { type: 'button', class: 'btn btn-sm btn-quiet', on: { click: () => reset() } }, icon('close', { size: 16 }), 'Clear');
  const paneP = h('div', { class: 'imp-pane' }, ta, h('div', { class: 'imp-row' }, pasteBtn, clearBtn, count));
  const paneF = h('div', { class: 'imp-pane' }, drop, fileInput, filesBox, formats);
  const warnBox = h('div', { class: 'imp-warn', role: 'status' });
  const backup = createBackupPanel({ onChange: () => paintAction() });

  // ---- options ------------------------------------------------------------------------------------------------------
  const folderBtn = h('button', { type: 'button', class: 'btn imp-folder', on: { click: async () => { const f = await openFolderPicker({ engine, title: 'Import into' }); if (f) { st.target = f; paintOpts(); } } } });
  const sw = (key, label, hint) => h('label', { class: 'imp-sw' }, h('input', { type: 'checkbox', checked: st.opts[key], on: { change: (e) => { st.opts[key] = e.target.checked; if (key === 'bare') reparse(); else rebuild(); } } }), h('span', { class: 'imp-sw-t' }, h('span', { text: label }), hint && h('span', { class: 'help', text: hint })));
  const optsBody = h('div', { class: 'imp-opts-body' });
  const optsBox = compact ? h('details', { class: 'imp-card imp-opts' }, h('summary', { text: 'Options' }), optsBody) : h('section', { class: 'imp-card imp-opts', 'aria-label': 'Options' }, optsBody);
  function paintOpts() {
    folderBtn.replaceChildren(icon('folder', { size: 18 }), h('span', { text: targetName() }), icon('chevron-down', { size: 16 }));
    optsBody.replaceChildren(h('div', { class: 'imp-target' }, h('span', { class: 'label', text: 'Import into' }), folderBtn),
      ...(st.backup ? [] : [sw('icons', 'Ignore favicons and icon files', 'favicon.ico, apple-touch-icon and similar files are not saved as links'), sw('dedupe', 'Skip links that are already saved'), sw('clean', 'Remove tracking parameters', 'utm, fbclid and similar'), sw('enrich', 'Fetch titles after importing'), sw('bare', 'Also find domains without https', 'example.com/page')]));
  }

  // ---- found links ------------------------------------------------------------------------------------------------------
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search found links', 'aria-label': 'Search found links', autocomplete: 'off' });
  const sortSel = createSelect({ options: SORTS, value: st.sort, label: 'Sort found links', small: true, onChange: (v) => { st.sort = v; repaintList(true); } });
  const chips = h('div', { class: 'imp-chips fade-x', role: 'toolbar', 'aria-label': 'Domains found' });
  const chipHost = h('div', { class: 'imp-chiprow' }, chips);
  const listEl = h('div', { class: 'rv-list imp-list', role: 'list', 'aria-label': 'Found links' });
  const foundCount = h('span', { class: 'rv-count', role: 'status' });
  const foundTitle = h('h2', { class: 'imp-h2 is-inline', text: 'Found links' });
  const vl = createVirtualList({ scroller: listEl, rowHeight: 56, render: (r) => h('label', { class: ['rv-row', r.selected && 'is-on'], role: 'listitem' },
    h('input', { type: 'checkbox', checked: r.selected, 'aria-label': `Import ${r.title || r.url}`, on: { change: (e) => { r.selected = e.target.checked; st.manual.set(r.key, r.selected); repaintList(false); } } }),
    h('span', { class: 'rv-text' }, h('span', { class: 'rv-title', text: r.title || r.host || r.url }), h('span', { class: 'rv-url', text: r.url })),
    r.dupOf && h('span', { class: 'badge is-warn', text: `In ${engine.getFolder(r.dupOf)?.name || 'library'}` }), !r.dupOf && r.repeat && h('span', { class: 'badge is-warn', text: 'Repeated' })) });
  listEl.appendChild(vl.el);
  const setAll = (fn) => () => { for (const r of st.view) { r.selected = fn(r); st.manual.set(r.key, r.selected); } repaintList(false); };
  const tools = h('div', { class: 'rv-tools' }, h('div', { class: 'fp-search' }, icon('search', { size: 18 }), search), sortSel,
    h('div', { class: 'imp-quick' }, h('button', { type: 'button', class: 'btn btn-sm', on: { click: setAll(() => true) } }, 'All'), h('button', { type: 'button', class: 'btn btn-sm', on: { click: setAll(() => false) } }, 'None'), h('button', { type: 'button', class: 'btn btn-sm', on: { click: setAll((r) => !r.dupOf && !r.repeat) } }, 'No duplicates')));
  const foundBox = h('section', { class: 'imp-card imp-found', 'aria-label': 'Found links', hidden: true }, h('div', { class: 'imp-found-head' }, foundTitle, foundCount), chipHost, tools, listEl);
  detachChips = attachScrollRow(chips, { arrows: !compact });
  let t = 0; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; repaintList(true); }, 120); });

  /** Rebuilds the rows from the parsed links (after text, files or an option changed) and keeps the user's own ticks. */
  function rebuild() {
    const all = rawLinks(); const ignored = st.opts.icons ? all.filter((l) => isIconUrl(l.url)).length : 0;
    st.ignored = ignored;
    const kept = st.opts.icons ? all.filter((l) => !isIconUrl(l.url)) : all;
    st.kept = kept;
    st.rows = applySelection(buildRows(kept, engine), st);
    paintChips(); repaintList(true); paintCount(); paintAction();
  }
  function paintChips() {
    const top = domainCounts(st.rows);
    chipHost.hidden = top.length < 2;
    chips.replaceChildren(...top.map(([d, n]) => h('button', { type: 'button', class: ['chip imp-chip', st.off.has(d) && 'is-off'], 'aria-pressed': String(!st.off.has(d)), 'data-tip': st.off.has(d) ? 'Switch this domain on' : 'Switch this domain off',
      on: { click: () => { const off = !st.off.has(d); off ? st.off.add(d) : st.off.delete(d); for (const r of st.rows) if (r.host === d) { st.manual.delete(r.key); r.selected = !off && !r.dupOf && !r.repeat; } paintChips(); repaintList(false); } } }, d, h('span', { class: 'chip-n', text: String(n) }))));
  }
  function repaintList(reset) {
    const q = st.q.trim().toLowerCase();
    foundBox.hidden = !st.rows.length || !!st.backup;
    if (reset) { st.view = sortRows(st.rows, st.sort).filter((r) => !q || `${r.title} ${r.url}`.toLowerCase().includes(q)); vl.setItems(st.view); } else vl.refresh();
    const n = st.rows.filter((r) => r.selected).length, dups = st.rows.filter((r) => r.dupOf || r.repeat).length;
    foundCount.textContent = `${n} of ${st.rows.length} selected${dups ? `  \u00b7  ${plural(dups, 'duplicate')}` : ''}`;
    paintAction();
  }

  // ---- action bar -----------------------------------------------------------------------------------------------------
  const goBtn = h('button', { type: 'button', class: 'btn btn-primary imp-go', on: { click: () => proceed() } });
  const actionInfo = h('span', { class: 'imp-action-info', role: 'status' });
  const dockEl = h('div', { class: 'imp-dock' }, actionInfo, goBtn);
  function paintAction() {
    const reading = st.files.some((f) => f.status === 'reading');
    const n = st.rows.filter((r) => r.selected).length;
    if (st.backup) { goBtn.disabled = busy || reading; goBtn.textContent = 'Restore backup'; actionInfo.textContent = ''; return; }
    goBtn.disabled = busy || reading || n === 0;
    goBtn.textContent = reading ? 'Reading...' : n ? `Import ${plural(n, 'link')}` : 'Import';
    actionInfo.textContent = n ? `into ${targetName()}` : '';
  }
  function paintCount() {
    const found = st.kept || rawLinks(), n = found.length, uniq = new Set(found.map((l) => dedupeKey(l.url) || l.url)).size;
    count.textContent = st.backup ? '' : n ? `${plural(n, 'link')} found${uniq !== n ? `  \u00b7  ${uniq} unique` : ''}${st.ignored ? `  \u00b7  ${plural(st.ignored, 'icon file')} ignored` : ''}` : (st.text.trim() || st.files.length ? 'No links found yet.' : '');
    warnBox.replaceChildren(...collectWarnings({ files: st.files, found: n, pasteSize: st.text.length }).map((m) => h('p', { class: 'imp-note' }, icon('alert', { size: 16 }), m)));
  }
  function paintTabs() { for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.t === st.tab)); paneP.hidden = st.tab !== 'paste'; paneF.hidden = st.tab !== 'files'; }
  function paintFiles() {
    filesBox.replaceChildren(...st.files.map((f, i) => h('div', { class: 'imp-file' }, icon(f.status === 'error' ? 'alert' : 'link', { size: 18 }),
      h('span', { class: 'imp-fname', text: f.name }), h('span', { class: 'imp-fmeta', text: f.status === 'reading' ? 'Reading...' : f.status === 'backup' ? 'Linkivo backup' : f.status === 'empty' ? 'No links' : f.status === 'error' ? 'Failed' : plural(f.links.length, 'link') }),
      h('button', { type: 'button', class: 'btn-icon is-sm', 'aria-label': `Remove ${f.name}`, on: { click: () => { if (f.status === 'backup') { st.backup = null; backup.hide(); } st.files.splice(i, 1); paintFiles(); rebuild(); paintOpts(); } } }, icon('close', { size: 16 })))));
  }

  // ---- parsing --------------------------------------------------------------------------------------------------------
  let timer = 0, token = 0;
  async function reparse() {
    const my = ++token, text = st.text;
    if (!text.trim()) { st.paste = []; rebuild(); return; }
    try { const r = await parser.parseText(text, { bare: st.opts.bare }); if (my === token && !destroyed) { st.paste = r.links; rebuild(); } } catch { if (my === token && !destroyed) { st.paste = extractLinks(text, { bare: st.opts.bare }); rebuild(); } }
  }
  ta.addEventListener('input', () => { st.text = ta.value; clearTimeout(timer); timer = setTimeout(reparse, 160); });
  ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); proceed(); } });

  async function addFiles(list) {
    const again = [];
    for (const file of [...list]) {
      // v2.2.2: the same file (name, size, last change) is added once, however it arrives (drop, picker, page drop)
      const sig = fileSig(file);
      if (st.files.some((f) => f.sig === sig)) { again.push(file.name); continue; }
      const entry = { name: file.name, size: file.size, sig, status: 'reading', links: [], warnings: [], format: '' }; st.files.push(entry); st.tab = 'files'; paintTabs(); paintFiles(); paintAction();
      try {
        // v2.2.1: a backup is recognised by its CONTENT (the watermark), never by the file name
        if (file.size < 200e6) {
          const head = await file.slice(0, 600).text();
          if (/^\s*\{/.test(head) && (head.includes('linkivo-backup') || head.includes('"Linkivo"'))) {
            const r = readBackupText(await file.text());
            if (r.ok) { st.backup = { name: file.name, backup: r.backup }; entry.status = 'backup'; backup.show(file.name, r.backup); paintFiles(); paintOpts(); rebuild(); continue; }
            entry.warnings.push(`${file.name}: ${r.error}`);
          }
        }
        const r = await parser.parseFile(file, { bare: st.opts.bare });
        Object.assign(entry, { status: r.links.length ? 'ready' : 'empty', links: r.links.map((l) => ({ ...l, src: file.name })), warnings: r.warnings || [], format: r.format });
      } catch (e) { Object.assign(entry, { status: 'error', warnings: [`${file.name}: could not be read.`] }); }
      if (destroyed) return;
      paintFiles(); rebuild();
    }
    if (again.length) toast(again.length === 1 ? `${again[0]} is already added.` : `${again.length} files were already added.`);
  }

  // ---- start ------------------------------------------------------------------------------------------------------
  async function ensureTarget() {
    if (st.target && engine.getFolder(st.target)) return st.target;
    const f = await engine.createFolder({ name: 'Imported links', color: '#2563eb', icon: 'import', order: engine.listFolders().length }); st.target = f.id; return f.id;
  }
  async function proceed() {
    if (busy || goBtn.disabled) return;
    busy = true; paintAction();
    try {
      let job;
      if (st.backup) job = await runRestore({ engine, queue, backup: st.backup.backup, state: backup.state });
      else {
        const picked = st.rows.filter((r) => r.selected && (!st.opts.dedupe || !r.repeat));
        const fidTarget = await ensureTarget(); prefs.set('lib.lastFolder', fidTarget);
        setPref(LIB.impBare, st.opts.bare); setPref(LIB.impDedupe, st.opts.dedupe); setPref(LIB.impClean, st.opts.clean); setPref(LIB.impEnrich, st.opts.enrich); setPref(LIB.impIcons, st.opts.icons);
        job = await startImport({ queue, engine, items: picked.map((x) => ({ url: x.url, title: x.title || undefined })), fid: fidTarget, options: { dedupe: st.opts.dedupe, cleanTracking: st.opts.clean, enrich: st.opts.enrich, speed: pref(LIB.impSpeed) }, title: `Importing ${plural(picked.length, 'link')}` });
      }
      if (job) { if (pref(LIB.keepAwake)) keepAwakeWhile(queue); startedCb(job); }
    } catch (e) { toast('The import could not start.', { type: 'error' }); }
    busy = false; paintAction();
  }

  function reset() {
    st.text = ''; ta.value = ''; st.paste = []; st.files = []; st.backup = null; st.manual.clear(); st.off.clear(); st.q = ''; search.value = '';
    backup.hide(); paintFiles(); paintOpts(); rebuild(); paintCount();
  }

  // ---- assemble -------------------------------------------------------------------------------------------------------
  const el = h('div', { class: ['impf', compact && 'is-compact'] },
    h('section', { class: 'imp-card imp-input', 'aria-label': 'Links to import' }, tabs, paneP, paneF, backup.el, warnBox), optsBox, foundBox);
  paintTabs(); paintOpts(); paintFiles(); paintCount(); paintAction();
  if (files.length) addFiles(files);
  if (text) { ta.value = st.text = text; reparse(); }   // v2.2.2: text handed over by the clipboard suggestion
  return {
    el, dockEl, addFiles, dirty, reset,
    onStarted(fn) { startedCb = fn; },
    focus() { if (st.tab === 'paste' && !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) ta.focus(); },
    destroy() { destroyed = true; clearTimeout(timer); clearTimeout(t); detachChips(); vl.destroy(); parser.dispose(); }
  };
}
