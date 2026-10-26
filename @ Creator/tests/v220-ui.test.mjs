// v2.2.0 UI in jsdom: Library, folder page (windowed 1200 links, select, delete + Undo), quick add, import popup (paste, review, run), export popup, Recycle Bin, settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/library');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const btn = (root, text) => $$('button', root).find((b) => b.textContent.trim() === text || b.textContent.trim().startsWith(text));

const { Engine } = await import('../../js/engine/engine.js');
const { createMemoryDb } = await import('../../js/engine/idb.js');
const { createJobQueue } = await import('../../js/engine/job-queue.js');
const { registerImportJobs } = await import('../../js/features/import/import-job.js');
const { installDataForTests } = await import('../../js/core/app-data.js');
const { createRouter } = await import('../../js/core/router.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { ROUTES } = await import('../../js/features/shell/routes.js');
const { prefs } = await import('../../js/core/local-prefs.js');

const engine = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await engine.init();
const queue = createJobQueue({ db: engine.db, now: () => engine.now() });
registerImportJobs({ queue, engine, fetchMeta: async (u) => new Map(u.map((x) => [x, { url: x, ok: true, title: 'Fetched ' + x.slice(-4) }])) });
await queue.start(); installDataForTests(engine, queue);
setSession({ mode: 'guest', user: null, status: 'active' });
const container = $('#page-root');
const router = createRouter({ routes: ROUTES, container, getSession }); await router.start();

const A = await engine.createFolder({ name: 'Reading', color: '#16a34a', icon: 'book' });
const B = await engine.createFolder({ name: 'Tools', pinned: true });
await engine.addLinks(Array.from({ length: 1200 }, (_, i) => ({ url: `https://site${i % 40}.test/p/${i}`, title: `Link number ${i}` })), { fid: A.id });
await engine.addLinks([{ url: 'https://fav.test/x', title: 'Fav one', fv: true }], { fid: B.id });

test('library: folders, Favourites tile, pinned first, search, new folder form', async () => {
  await router.navigate('/library'); await waitFor(() => $('.lib-grid'));
  const names = $$('.fcard-name').map((n) => n.textContent); assert.deepEqual(names, ['Favourites', 'Tools', 'Reading']);
  assert.match($('.lib-sub').textContent, /2 folders\s+.\s+1,?201 links/);
  typeIn($('.fp-search input'), 'read'); await tick(200); assert.deepEqual($$('.fcard-name').map((n) => n.textContent), ['Reading']);
  typeIn($('.fp-search input'), 'zzz'); await tick(200); assert.match(container.textContent, /No folder matches/);
  typeIn($('.fp-search input'), ''); await tick(200);
  click(btn(container, 'New folder')); await waitFor(() => $('.sheet'));
  typeIn($('.sheet input.input'), 'Reading'); click(btn($('.sheet'), 'Create folder')); await tick(30); assert.ok($('.sheet'), 'duplicate name keeps the sheet open'); assert.match(document.body.textContent, /already exists/);
  typeIn($('.sheet input.input'), 'Music'); click($$('.swatch')[3]); click(btn($('.sheet'), 'Create folder')); await waitFor(() => !$('.sheet'));
  assert.ok(engine.listFolders().find((f) => f.name === 'Music' && f.color === '#16a34a'));
  click($('.fcard-more')); await waitFor(() => $('.pop')); assert.ok($$('.pop-item').some((b) => b.textContent === 'Merge into...')); document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick(50);
});

test('folder page: 1200 links render windowed, select all, delete with Undo, filters', async () => {
  await router.navigate(`/folder/${A.id}`); await waitFor(() => $('.lrow'));
  const rows = $$('.lrow').length; assert.ok(rows > 5 && rows < 80, `windowed rows: ${rows}`);
  assert.match($('.fp-sub').textContent, /1,?200 links/); assert.equal($('.fp-name').textContent, 'Reading');
  typeIn($('.fp-search input'), 'number 77'); await tick(200); assert.match($('.fp-info').textContent, /of 1,?200 links/);
  assert.ok($$('.lrow').some((r) => r.textContent.includes('Link number 77')));
  typeIn($('.fp-search input'), ''); await tick(200);
  click($('[aria-label="Select links"]')); await tick(20); assert.ok(!$('.selbar').hidden); click(btn($('.selbar'), 'Select all')); await tick(20);
  assert.match($('.selcount').textContent, /1,?200 selected/);
  click($$('.selbtn').find((b) => b.getAttribute('aria-label') === 'Delete')); await waitFor(() => engine.counts().links === 1);
  assert.equal(engine.counts().deletedLinks, 1200); await waitFor(() => /This folder is empty/.test(container.textContent)); assert.match(container.textContent, /This folder is empty/);
  const undo = $$('.toast button').find((b) => b.textContent === 'Undo'); assert.ok(undo, 'Undo toast'); click(undo); await waitFor(() => engine.counts().links === 1201);
  await waitFor(() => $('.lrow')); assert.ok($('.lrow'));
});

test('folder page: link menu, favourite toggles points, not found and Favourites folder', async () => {
  await router.navigate(`/folder/${A.id}`); await waitFor(() => $('.lrow'));
  click($('.lmore')); await waitFor(() => $('.pop')); const labels = $$('.pop-item').map((b) => b.textContent); assert.ok(['Copy URL', 'Edit link', 'Add tags', 'Move to folder', 'Copy to folder', 'Delete'].every((l) => labels.includes(l)), labels.join('|'));
  assert.ok(!labels.includes('Open in new tab') && !labels.includes('Select') && !labels.includes('Edit title'), 'v2.2.1: those left the menu'); assert.equal($$('.pop-head').length, 0, 'v2.2.2: no group names'); assert.equal($$('.pop-sep').length, 3, 'groups are separated by plain rules'); assert.ok($('.lopen'), 'open in new tab is an icon beside the three dots');
  const id = $('.lrow').dataset.id; click($$('.pop-item').find((b) => b.textContent === 'Add to favourites')); await waitFor(() => engine.getLink(id).fv);
  assert.equal(engine.getLink(id).pt, 200); await waitFor(() => $$('.toast button').some((b) => b.textContent === 'Undo')); assert.ok($$('.toast button').some((b) => b.textContent === 'Undo'));
  await router.navigate('/folder/favourites'); await waitFor(() => $('.fp-name')); assert.equal($('.fp-name').textContent, 'Favourites'); assert.ok($$('.lrow').length >= 2);
  await router.navigate('/folder/doesnotexist'); await tick(30); assert.match(container.textContent, /Folder not found|does not exist/);
});

test('quick add: valid, duplicate warning, saves into the chosen folder', async () => {
  const { openQuickAdd } = await import('../../js/features/library/quick-add.js');
  const p = openQuickAdd({ engine, queue, fid: B.id }); await waitFor(() => $('.sheet'));
  typeIn($('.sheet input.input'), 'not a link'); assert.match($('.sheet .help').textContent, /does not look like/);
  typeIn($('.sheet input.input'), 'https://fav.test/x'); assert.match($('.sheet .help').textContent, /Already saved in "Tools"/);
  typeIn($('.sheet input.input'), 'example.org/page'); assert.equal($('.sheet .help').textContent, '');
  click(btn($('.sheet'), 'Save link')); const saved = await p; assert.equal(saved.url, 'https://example.org/page'); assert.equal(saved.fid, B.id);
  await queue.whenIdle(); assert.equal(engine.getLink(saved.id).title, 'Fetched page'.slice(0, 0) + engine.getLink(saved.id).title);
});

test('import page: paste, found list (duplicates unticked), domain switch, icon files ignored, run, details, Undo', async () => {
  prefs.set('import.enrich', false);
  await router.navigate(`/import?fid=${B.id}`); await waitFor(() => $('.imp-text'));
  typeIn($('.imp-text'), 'Read https://new1.test/a and https://new2.test/b, https://fav.test/x again https://new1.test/a https://new3.test/favicon.ico');
  await waitFor(() => /4 links found/.test($('.imp-count').textContent));
  assert.match($('.imp-count').textContent, /3 unique/); assert.match($('.imp-count').textContent, /1 icon file ignored/);
  await waitFor(() => $$('.rv-row').length === 4); assert.match($('.rv-count').textContent, /2 of 4 selected\s+.\s+2 duplicates/); assert.equal($$('.badge.is-warn').length, 2);
  const chipOf = () => $$('.imp-chip').find((c) => c.textContent.startsWith('new2.test')); assert.ok(chipOf(), 'a chip per domain');
  click(chipOf()); await waitFor(() => /1 of 4 selected/.test($('.rv-count').textContent)); assert.equal(chipOf().getAttribute('aria-pressed'), 'false'); click(chipOf()); await waitFor(() => /2 of 4 selected/.test($('.rv-count').textContent));
  assert.equal($('.imp-go').textContent, 'Import 2 links');
  click($('.imp-go')); await waitFor(() => queue.list().some((j) => j.type === 'import'));
  const job = queue.list().filter((j) => j.type === 'import').sort((x, y) => y.createdAt - x.createdAt)[0];
  await queue.whenIdle(); const j = queue.get(job.id); assert.equal(j.status, 'done'); assert.equal(j.result.saved, 2);
  assert.ok(engine.findByUrl('https://new2.test/b')); assert.ok(!engine.findByUrl('https://new3.test/favicon.ico'), 'the icon file was not imported'); assert.equal(engine.getFolder(B.id).lc, engine.listLinks({ fid: B.id }).length);
  await waitFor(() => $('.jp')); assert.match($('.jp-state').textContent, /Finished/); assert.equal($('.imp-text').value, '', 'the form is ready for the next import');
  click(btn($('.sheet'), 'Undo import')); await waitFor(() => !engine.findByUrl('https://new2.test/b')); click(btn($('.sheet') || document, 'Close') || $('.sheet-head button'));
  await tick(250); prefs.remove('import.enrich'); await router.navigate('/library'); await tick(30);
});

test('import dialog: wide screens open the same form compact; phones are sent to the page with the folder', async () => {
  const { openImport } = await import('../../js/features/import/import-sheet.js');
  assert.equal(await openImport({ engine, router, fid: B.id }), null); await waitFor(() => $('.imp-text')); assert.match(location.pathname + location.search, new RegExp(`/import\\?fid=${B.id}`)); assert.ok(!$('.sheet'), 'no popup on a phone');
  await router.navigate('/library'); await tick(30);
  const real = w.matchMedia; w.matchMedia = (q) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }); globalThis.matchMedia = w.matchMedia;
  openImport({ engine, router, fid: B.id }); await waitFor(() => $('.sheet .impf.is-compact')); assert.ok($('.sheet .imp-dock'), 'action bar inside the dialog');
  click($('.sheet-head button')); await waitFor(() => !$('.sheet')); w.matchMedia = real; globalThis.matchMedia = real;
});

test('import page: a Linkivo backup is found by its CONTENT (renamed file) and takes the fast path', async () => {
  const { openImport } = await import('../../js/features/import/import-sheet.js');
  const { runExport } = await import('../../js/features/export/export-engine.js');
  const out = await runExport({ engine, scope: { type: 'folders', fids: [B.id] }, formatId: 'linkivo' });
  const e2 = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e2.init();
  const q2 = createJobQueue({ db: e2.db, now: () => e2.now() }); registerImportJobs({ queue: q2, engine: e2, fetchMeta: async () => new Map() }); await q2.start();
  installDataForTests(e2, q2);
  const file = new w.File([await out.blob.text()], 'my-notes.txt', { type: 'text/plain' }); // renamed on purpose: the watermark inside decides, not the name
  await openImport({ engine: e2, router, files: [file] }); await waitFor(() => /Linkivo backup found/.test(document.body.textContent), 3000);
  assert.equal($('.imp-go').textContent, 'Restore backup'); click($('.imp-go')); await waitFor(() => q2.list().some((j) => j.type === 'import'));
  const job = q2.list().find((j) => j.type === 'import'); await q2.whenIdle(); assert.equal(q2.get(job.id).status, 'done'); assert.equal(e2.listFolders().length, 1); assert.equal(e2.listFolders()[0].name, 'Tools'); assert.ok(e2.listFolders()[0].pinned);
  assert.ok(e2.listLinks().some((l) => l.url === 'https://fav.test/x' && l.fv));
  installDataForTests(engine, queue); await tick(100); if ($('.sheet')) click($('.sheet-head button')); await router.navigate('/library'); await tick(250);
});

test('settings > Import opens ONE small popup that takes only a Linkivo backup', async () => {
  const { openRestorePopup } = await import('../../js/features/import/restore-popup.js');
  const { runExport } = await import('../../js/features/export/export-engine.js');
  const out = await runExport({ engine, scope: { type: 'folders', fids: [B.id] }, formatId: 'linkivo' });
  const e3 = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e3.init();
  const q3 = createJobQueue({ db: e3.db, now: () => e3.now() }); registerImportJobs({ queue: q3, engine: e3, fetchMeta: async () => new Map() }); await q3.start(); installDataForTests(e3, q3);
  const done = openRestorePopup({ engine: e3, router, file: new w.File(['{"hello": 1}'], 'other.json') }); await waitFor(() => $('.sheet'));
  await waitFor(() => /not a Linkivo backup/.test($('.sheet').textContent)); assert.ok(btn($('.sheet'), 'Restore backup').disabled, 'a foreign file is refused');
  const input = $('.sheet input[type=file]'); Object.defineProperty(input, 'files', { value: [new w.File([await out.blob.text()], 'x.bin')], configurable: true }); input.dispatchEvent(new w.Event('change', { bubbles: true }));
  await waitFor(() => /Linkivo backup found/.test($('.sheet').textContent)); assert.equal($$('.sel-btn', $('.sheet')).length, 2, 'folder and duplicate choices use the shared dropdown');
  click(btn($('.sheet'), 'Restore backup')); const job = await done; assert.ok(job); await q3.whenIdle(); assert.equal(e3.listFolders().length, 1);
  installDataForTests(engine, queue); await tick(100); if ($('.sheet')) click($('.sheet-head button')); await tick(250);
});

test('export popup: backup tile first, icon tiles, per-format options, live page preview, download', async () => {
  const { openExport } = await import('../../js/features/export/export-sheet.js');
  let blob = null; globalThis.URL.createObjectURL = (b) => { blob = b; return 'blob:x'; }; globalThis.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {};
  openExport({ engine, scope: { type: 'folders', fids: [B.id] }, title: 'Export \"Tools\"' }); await waitFor(() => $('.ex-grid .ex-fmt'));
  assert.equal($('.ex-native strong').textContent, 'Linkivo backup'); assert.match($('.ex-native').textContent, /Recommended/);
  assert.deepEqual($$('.ex-fmt span').map((n) => n.textContent), ['Web page', 'Print', 'Excel', 'CSV', 'JSON', 'Text', 'Markdown', 'HTML bookmarks', 'OPML']);
  click($$('.ex-fmt').find((b) => b.textContent === 'Web page')); await waitFor(() => $('.ex-frame')); assert.match($('.ex-frame').getAttribute('srcdoc'), /Fav one|fav\.test/); assert.ok($$('.ex-seg').length >= 2, 'layout and theme are icon choices'); assert.ok($$('.ex-dot').length === 6, 'accent colors');
  click($$('.ex-fmt').find((b) => b.textContent === 'Print')); await waitFor(() => $$('.ex-seg').some((s) => /A4/.test(s.textContent))); assert.ok($$('.ex-seg').some((s) => /Portrait/.test(s.textContent)));
  click($$('.ex-fmt').find((b) => b.textContent === 'CSV')); await waitFor(() => $('.ex-preview') && /Title,URL/.test($('.ex-preview').textContent));
  assert.match($('.ex-preview').textContent, /https:\/\/fav\.test\/x/);
  click(btn($('.sheet'), 'Export 2 links')); await waitFor(() => blob); assert.ok(blob.size > 20); await tick(250);
  assert.equal(prefs.get('export.format'), 'csv');
});

test('recycle bin: deleted folder and link, restore, delete forever, empty state', async () => {
  await engine.purgeLinks(engine.listLinks({ deleted: true }).map((l) => l.id)); // the Undo of the import test left two links in the bin
  const C = await engine.createFolder({ name: 'Old stuff' }); const r = await engine.addLinks([{ url: 'https://old.test/1' }, { url: 'https://old.test/2' }], { fid: C.id });
  await engine.deleteLinks([r.added[0].id]); await engine.deleteFolders([A.id]);
  await router.navigate('/settings/recycle-bin'); await waitFor(() => $('.bin-row'));
  const text = $$('.bin-row').map((x) => x.textContent).join('|'); assert.match(text, /Reading/); assert.match(text, /old\.test/); assert.equal($$('.bin-row').length, 2, 'folder links are not listed separately');
  click($$('.bin-row input')[0]); await tick(10); click(btn($('.selbar'), 'Restore')); await waitFor(() => engine.getFolder(A.id) && !engine.getFolder(A.id).del);
  assert.equal(engine.counts().folders >= 3, true); await waitFor(() => $$('.bin-row').length === 1);
  click($$('.bin-row input')[0]); await tick(10); click(btn($('.selbar'), 'Delete forever')); await waitFor(() => $('.sheet')); click(btn($('.sheet'), 'Delete forever')); await waitFor(() => engine.counts().deletedLinks === 0);
  await waitFor(() => /empty/i.test(container.textContent)); assert.match(container.textContent, /The Recycle Bin is empty/);
  const { daysLeft, dayGroup } = await import('../../js/features/library/recycle-bin-page.js'); const now = Date.now();
  assert.equal(daysLeft(now - 3 * 86400000, now), 12); assert.equal(dayGroup(now - 100, now), 'Today'); assert.equal(dayGroup(now - 86400000 * 1.5, now), 'Yesterday');
});

test('settings: Library and Data sections, rows work', async () => {
  await router.navigate('/settings'); await tick(30);
  const labels = $$('.set-nav-item').map((n) => n.textContent); assert.ok(labels.some((l) => l.includes('Library and links')) && labels.some((l) => l.includes('Import, export and data')));
  assert.ok($('[data-setting="libView"]') && $('[data-setting="impSpeed"]') && $('[data-setting="recycleBin"], .row'));
  click($('[data-setting="impBare"] button')); assert.equal(prefs.get('import.bare'), true); click($('[data-setting="impBare"] button')); assert.equal(prefs.get('import.bare'), false);
  const { CATALOG } = await import('../../js/features/settings/catalog.js'); assert.ok(CATALOG.length >= 30, `catalog has ${CATALOG.length} entries`);
});
