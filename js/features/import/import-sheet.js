/**
 * Linkivo — js/features/import/import-sheet.js  (v2.2.0)
 * Purpose: the Import popup. Two tabs (paste text, files), live link count from the parse worker, a Linkivo-backup fast path, options (folder, bare
 *          domains, skip duplicates, remove tracking, fetch titles), warnings, a review step, then a persisted import job and its progress sheet.
 *          Closing with unsaved input asks first. Steps are separate sheets in a loop so "Back" from the review keeps everything.
 * API: openImport({ engine, router?, fid?, files? }) -> Promise<job|null>
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { loadCss } from '../../core/css-loader.js';
import { prefs } from '../../core/local-prefs.js';
import { formatBytes, plural } from '../../core/format.js';
import { extractLinks } from '../../core/extract.js';
import { dedupeKey } from '../../core/url-tools.js';
import { getQueue } from '../../core/app-data.js';
import { FORMATS } from './parsers.js';
import { createParseClient } from './parse-client.js';
import { readBackupText, describeBackup, planRestore } from './native-import.js';
import { startImport } from './import-job.js';
import { buildRows, openReview } from './import-review.js';
import { openJobDetails } from './import-progress.js';
import { openFolderPicker } from '../library/pickers.js';
import { pref, setPref, LIB } from '../library/lib-prefs.js';

const BIG_FILE = 5e6, MANY_FILES = 10, MANY_LINKS = 2000, BIG_PASTE = 1e6;

export function collectWarnings({ files, found, pasteSize }) {
  const w = [];
  if (pasteSize > BIG_PASTE) w.push('That is a lot of pasted text. Reading it may take a moment.');
  if (files.length > MANY_FILES) w.push(`${files.length} files at once is a lot. Consider importing them in smaller groups.`);
  for (const f of files) if (f.size > BIG_FILE) w.push(`${f.name} is large (${formatBytes(f.size)}). Reading it can take a while.`);
  if (found > MANY_LINKS) w.push(`${plural(found, 'link')} found. The import runs in the background: you can minimize it and keep using the app.`);
  for (const f of files) for (const m of f.warnings || []) w.push(m);
  return w;
}

export async function openImport({ engine, router = null, fid = null, files = [] }) {
  await loadCss('/css/pages/data.css');
  const queue = getQueue();
  const parser = createParseClient();
  const st = { tab: files.length ? 'files' : 'paste', text: '', paste: [], files: [], backup: null, target: fid && engine.getFolder(fid) ? fid : (engine.getFolder(prefs.get('lib.lastFolder', '')) ? prefs.get('lib.lastFolder', '') : engine.listFolders()[0]?.id || null),
    opts: { bare: pref(LIB.impBare), dedupe: pref(LIB.impDedupe), clean: pref(LIB.impClean), enrich: pref(LIB.impEnrich) }, restore: { folderMode: 'merge', duplicates: 'skip' }, seq: 0 };
  const found = () => st.paste.length + st.files.reduce((n, f) => n + f.links.length, 0);
  const dirty = () => !!st.text.trim() || st.files.length > 0;
  let repaintFiles = () => {};                          // set by the main step; addFiles may start before that step exists (files passed in)
  let result = null;

  async function addFiles(list) {
    for (const file of [...list]) {
      const entry = { name: file.name, size: file.size, status: 'reading', links: [], warnings: [], format: '' }; st.files.push(entry); st.tab = 'files'; repaintFiles();
      try {
        if (/\.json$/i.test(file.name) && file.size < 200e6) { const head = await file.slice(0, 400).text(); if (head.includes('linkivo-backup')) { const r = readBackupText(await file.text()); if (r.ok) { st.backup = { name: file.name, backup: r.backup }; entry.status = 'backup'; repaintFiles(); continue; } entry.warnings.push(`${file.name}: ${r.error}`); } }
        const r = await parser.parseFile(file, { bare: st.opts.bare });
        Object.assign(entry, { status: r.links.length ? 'ready' : 'empty', links: r.links.map((l) => ({ ...l, src: file.name })), warnings: r.warnings || [], format: r.format });
      } catch (e) { Object.assign(entry, { status: 'error', warnings: [`${file.name}: could not be read.`] }); }
      repaintFiles();
    }
  }

  async function begin(items, extra = {}) {
    const fidTarget = await ensureTarget(); if (!fidTarget) return null;
    prefs.set('lib.lastFolder', fidTarget);
    setPref(LIB.impBare, st.opts.bare); setPref(LIB.impDedupe, st.opts.dedupe); setPref(LIB.impClean, st.opts.clean); setPref(LIB.impEnrich, st.opts.enrich);
    const job = await startImport({ queue, engine, items, fid: fidTarget, options: { dedupe: st.opts.dedupe, cleanTracking: st.opts.clean, enrich: st.opts.enrich, speed: pref(LIB.impSpeed), ...extra.options }, updates: extra.updates, folderIds: extra.folderIds, title: extra.title });
    return job;
  }
  async function ensureTarget() {
    if (st.target && engine.getFolder(st.target)) return st.target;
    const f = await engine.createFolder({ name: 'Imported links', color: '#2563eb', icon: 'import', order: engine.listFolders().length }); st.target = f.id; return f.id;
  }
  const targetName = () => (st.target && engine.getFolder(st.target)?.name) || 'a new folder "Imported links"';

  // ---- step 1: input ------------------------------------------------------------------------------------------------
  function stepMain() {
    return new Promise((resolve) => {
      let outcome = 'cancel';
      const ta = h('textarea', { class: 'input imp-text', rows: '7', placeholder: 'Paste links, a list, an article, HTML, Markdown, JSON or CSV. Linkivo finds every link in it.', 'aria-label': 'Text with links', spellcheck: 'false', value: st.text });
      const count = h('p', { class: 'imp-count', role: 'status', 'aria-live': 'polite' });
      const filesBox = h('div', { class: 'imp-files' });
      const warnBox = h('div', { class: 'imp-warn', role: 'status' });
      const folderBtn = h('button', { type: 'button', class: 'btn imp-folder', on: { click: async () => { const f = await openFolderPicker({ engine, title: 'Import into' }); if (f) { st.target = f; paintOpts(); } } } });
      const opts = h('div', { class: 'imp-opts' });
      const input = h('input', { type: 'file', multiple: true, hidden: true, accept: FORMATS.flatMap((f) => f.exts.map((e) => '.' + e)).join(','), on: { change: (e) => { addFiles(e.target.files); e.target.value = ''; } } });
      const drop = h('div', { class: 'imp-drop', tabindex: '0', role: 'button', 'aria-label': 'Choose files or drop them here', on: { click: () => input.click(), keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } },
        dragover: (e) => { e.preventDefault(); drop.classList.add('is-over'); }, dragleave: () => drop.classList.remove('is-over'), drop: (e) => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); } } },
        icon('upload', { size: 28 }), h('strong', { text: 'Choose files or drop them here' }), h('span', { class: 'help', text: 'Many files at once are fine.' }));
      const formats = h('details', { class: 'imp-formats' }, h('summary', { text: 'Supported file types' }),
        h('div', { class: 'imp-fmt' }, FORMATS.map((f) => h('span', { class: ['badge', f.popular && 'is-on'], text: f.label, title: f.exts.map((e) => '.' + e).join(' ') }))), h('p', { class: 'help', text: 'Old Excel (.xls) is not supported: save it as .xlsx first.' }));
      const tabs = h('div', { class: 'seg imp-tabs', role: 'tablist' }, ['paste', 'files'].map((t) => h('button', { type: 'button', role: 'tab', 'data-t': t, on: { click: () => { st.tab = t; paintTabs(); } }, text: t === 'paste' ? 'Paste text' : 'Files' })));
      const sw = (key, label) => h('label', { class: 'imp-sw' }, h('input', { type: 'checkbox', checked: st.opts[key], on: { change: (e) => { st.opts[key] = e.target.checked; if (key === 'bare') reparse(); } } }), h('span', { text: label }));
      const go = h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => proceed() } });
      const backupCard = h('div', { class: 'imp-backup', hidden: true });

      let timer = 0, token = 0;
      async function reparse() {
        const my = ++token; const text = st.text;
        if (!text.trim()) { st.paste = []; paintCount(); return; }
        try { const r = await parser.parseText(text, { bare: st.opts.bare }); if (my === token) { st.paste = r.links; paintCount(); } } catch { if (my === token) { st.paste = extractLinks(text, { bare: st.opts.bare }); paintCount(); } }
      }
      ta.addEventListener('input', () => { st.text = ta.value; clearTimeout(timer); timer = setTimeout(reparse, 160); });
      const pasteBtn = h('button', { type: 'button', class: 'btn btn-sm', on: { click: async () => { try { const t = await navigator.clipboard.readText(); if (t) { ta.value = st.text = (st.text ? st.text + '\n' : '') + t; reparse(); } else toast('The clipboard is empty.'); } catch { toast('The browser blocked clipboard access.', { type: 'error' }); } } } }, icon('copy', { size: 16 }), 'Paste from clipboard');

      function paintTabs() { for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.t === st.tab)); ta.parentElement.hidden = st.tab !== 'paste'; filesBox.parentElement.hidden = st.tab !== 'files'; }
      function paintOpts() {
        folderBtn.replaceChildren(icon('folder', { size: 18 }), h('span', { text: targetName() }), icon('chevron-down', { size: 16 }));
        opts.replaceChildren(h('div', { class: 'imp-target' }, h('span', { class: 'label', text: 'Import into' }), folderBtn),
          ...(st.backup ? [] : [sw('bare', 'Also find domains without https (example.com)'), sw('dedupe', 'Skip links that are already saved'), sw('clean', 'Remove tracking parameters (utm, fbclid)'), sw('enrich', 'Fetch titles after importing')]));
      }
      function paintFiles() {
        filesBox.replaceChildren(...st.files.map((f, i) => h('div', { class: 'imp-file' }, icon(f.status === 'error' ? 'alert' : 'link', { size: 18 }),
          h('span', { class: 'imp-fname', text: f.name }), h('span', { class: 'imp-fmeta', text: f.status === 'reading' ? 'Reading...' : f.status === 'backup' ? 'Linkivo backup' : f.status === 'empty' ? 'No links' : f.status === 'error' ? 'Failed' : plural(f.links.length, 'link') }),
          h('button', { type: 'button', class: 'btn-icon', 'aria-label': `Remove ${f.name}`, on: { click: () => { if (f.status === 'backup') st.backup = null; st.files.splice(i, 1); paintFiles(); } } }, icon('close', { size: 16 })))));
        paintCount(); paintOpts();
      }
      function paintCount() {
        const n = found(), uniq = new Set([...st.paste, ...st.files.flatMap((f) => f.links)].map((l) => dedupeKey(l.url) || l.url)).size;
        count.textContent = st.backup ? '' : n ? `${plural(n, 'link')} found${uniq !== n ? `  \u00b7  ${uniq} unique` : ''}` : (st.text.trim() || st.files.length ? 'No links found yet.' : '');
        const w = collectWarnings({ files: st.files, found: n, pasteSize: st.text.length });
        warnBox.replaceChildren(...w.map((m) => h('p', { class: 'imp-note' }, icon('alert', { size: 16 }), m)));
        if (st.backup) { const d = describeBackup(st.backup.backup); backupCard.hidden = false; backupCard.replaceChildren(h('strong', { text: 'Linkivo backup found' }), h('p', { class: 'help', text: `${st.backup.name}: ${plural(d.folders, 'folder')}, ${plural(d.links, 'link')}${d.tags ? `, ${plural(d.tags, 'tag')}` : ''}. No titles are fetched again: it restores fast.` }),
          h('div', { class: 'imp-restore' }, h('label', { class: 'label', text: 'Folders' }), h('select', { class: 'select', 'aria-label': 'Folders', on: { change: (e) => { st.restore.folderMode = e.target.value; } } }, [['merge', 'Merge with folders of the same name'], ['new', 'Always create new folders']].map(([v, l]) => h('option', { value: v, text: l, selected: st.restore.folderMode === v }))),
            h('label', { class: 'label', text: 'Links already saved' }), h('select', { class: 'select', 'aria-label': 'Links already saved', on: { change: (e) => { st.restore.duplicates = e.target.value; } } }, [['skip', 'Skip them'], ['update', 'Update them from the backup'], ['both', 'Keep both']].map(([v, l]) => h('option', { value: v, text: l, selected: st.restore.duplicates === v })))));
        } else backupCard.hidden = true;
        const busy = st.files.some((f) => f.status === 'reading');
        go.disabled = busy || (st.backup ? false : n === 0);
        go.textContent = busy ? 'Reading...' : st.backup ? 'Restore backup' : n ? (pref(LIB.impReview) ? `Review ${plural(n, 'link')}` : `Import ${plural(n, 'link')}`) : 'Review links';
      }
      async function proceed() {
        go.disabled = true;
        try {
          if (st.backup) {
            const plan = await planRestore(engine, st.backup.backup, st.restore);
            if (!plan.items.length && !plan.updates.length) { toast(plan.skipped ? 'Everything in this backup is already saved.' : 'The backup has no links to restore.'); go.disabled = false; return; }
            const fidT = plan.folderIds[0] || await ensureTarget(); st.target = fidT;
            result = await startImport({ queue, engine, items: plan.items, fid: fidT, updates: plan.updates, folderIds: plan.folderIds, title: 'Restoring backup', options: { perItemFolder: true, kind: 'native', enrich: false, dedupe: st.restore.duplicates !== 'both' } });
            outcome = 'started'; sheet.close(); return;
          }
          outcome = pref(LIB.impReview) ? 'review' : 'direct'; sheet.close();
        } catch (e) { toast('The import could not start.', { type: 'error' }); go.disabled = false; }
      }
      const body = h('div', { class: 'form imp' }, tabs,
        h('div', { class: 'imp-pane' }, ta, h('div', { class: 'imp-row' }, pasteBtn, count)),
        h('div', { class: 'imp-pane' }, drop, input, filesBox, formats), backupCard, warnBox, opts,
        h('div', { class: 'imp-foot' }, h('button', { type: 'button', class: 'btn', on: { click: () => sheet.close() } }, 'Cancel'), go));
      const sheet = openSheet({ title: 'Import links', wide: true, body, actions: [], dismissible: false, onClose: () => resolve(outcome) });
      // dismissible=false so a stray tap never loses typed text; the header close button and Escape ask first
      sheet.el.querySelector('.sheet-head')?.append(h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Close', on: { click: async () => { if (!dirty() || await confirmDialog({ title: 'Discard this import?', message: 'The pasted text and chosen files will be lost.', confirmLabel: 'Discard', danger: true })) sheet.close(); } } }, icon('close')));
      repaintFiles = paintFiles; st.tab = st.tab || 'paste'; paintTabs(); paintFiles(); paintCount(); if (st.text) reparse();
      setTimeout(() => { if (st.tab === 'paste') ta.focus(); }, 80);
    });
  }

  if (files.length) addFiles(files);
  for (;;) {
    const out = await stepMain();
    if (out === 'review' || out === 'direct') {
      const rows = buildRows([...st.paste, ...st.files.flatMap((f) => f.links)], engine);
      if (out === 'review') {
        const r = await openReview({ engine, rows, targetName: targetName() });
        if (r.action === 'back') continue;
        if (r.action !== 'import') break;
        result = await begin(r.rows.map((x) => ({ url: x.url, title: x.title || undefined })), { title: `Importing ${plural(r.rows.length, 'link')}` });
      } else {
        const picked = st.opts.dedupe ? rows.filter((x) => !x.repeat) : rows;
        result = await begin(picked.map((x) => ({ url: x.url, title: x.title || undefined })), { title: `Importing ${plural(picked.length, 'link')}` });
      }
    }
    break;
  }
  parser.dispose();
  if (result) openJobDetails({ queue, engine, router, jobId: result.id });
  return result;
}

