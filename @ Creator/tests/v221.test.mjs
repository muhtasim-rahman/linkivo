// v2.2.1: settings sync (offline-safe), backup watermark, favicon filter, shared dropdown, scroll rows, shortcuts, sheet drag rule, keyboard height,
// designed page exports, extra page data (linkMeta), import form helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/library');
const imp = (p) => import(new URL('../../' + p, import.meta.url));
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ---------------------------------------------------------------- settings sync
const { createSettingsSync, encodeKey, toRemote, fromRemote, buildKeyTable } = await imp('js/core/settings-sync.js');
function fakeStore() {
  const m = new Map(), watchers = new Map();
  return { get: (k, d = null) => (m.has(k) ? m.get(k) : d), has: (k) => m.has(k), set(k, v) { m.set(k, v); watchers.get(k)?.forEach((f) => f(v)); }, remove(k) { m.delete(k); }, onChange(k, f) { if (!watchers.has(k)) watchers.set(k, new Set()); watchers.get(k).add(f); return () => watchers.get(k).delete(f); }, m };
}
function fakeAdapter() {
  const a = { writes: [], fail: false, cb: null, update: async (u) => { if (a.fail) throw new Error('offline'); a.writes.push(u); }, watchValue: (path, cb) => { a.cb = cb; return () => { a.cb = null; }; } };
  return a;
}
test('settings sync: keys are database-safe and values round-trip', () => {
  assert.equal(encodeKey('ui.theme'), 'ui_theme'); assert.equal(encodeKey('a'.repeat(60)).length, 40);
  assert.equal(toRemote(true), true); assert.equal(toRemote('x'.repeat(201)), null); assert.equal(toRemote({ a: 1 }), '{"a":1}'); assert.equal(toRemote(NaN), null);
  assert.deepEqual(fromRemote('{"a":1}', {}), { a: 1 }); assert.equal(fromRemote('dark', 'system'), 'dark');
  assert.equal(buildKeyTable(['ui.theme', 'lib.view']).get('lib_view'), 'lib.view');
});
test('settings sync: a change is pushed once, offline it stays dirty (and survives a restart), then goes out when the connection is back', async () => {
  const store = fakeStore(), ad = fakeAdapter(); const keys = ['ui.theme', 'lib.view'];
  const s = createSettingsSync({ adapter: ad, uid: 'u1', store, keys }); s.start(); ad.cb({});
  ad.fail = true; store.set('ui.theme', 'dark'); await s.push();
  assert.equal(s.state().status, 'waiting'); assert.deepEqual(Object.keys(store.get('sync.dirty')), ['ui_theme'], 'saved for the next start');
  s.dispose();
  const ad2 = fakeAdapter(); const s2 = createSettingsSync({ adapter: ad2, uid: 'u1', store, keys }); s2.start(); // a new session sees the saved dirty list
  ad2.cb({ ui_theme: 'light' });                                     // the server still has the old value: the unsent local change wins
  assert.equal(store.get('ui.theme'), 'dark'); await s2.push();
  assert.deepEqual(ad2.writes[0], { 'users/u1/settings/ui_theme': 'dark' }); assert.equal(store.get('sync.dirty', null), null, 'dirty list cleared after the push'); assert.equal(s2.state().status, 'synced'); s2.dispose();
});
test('settings sync: remote changes arrive without echoing back, unknown keys are ignored, first run uploads what this device customised', async () => {
  const store = fakeStore(), ad = fakeAdapter(); store.set('lib.view', 'list');
  const s = createSettingsSync({ adapter: ad, uid: 'u1', store, keys: ['ui.theme', 'lib.view'] }); s.start();
  ad.cb({ ui_theme: 'dark', secret_other: 'x' });
  assert.equal(store.get('ui.theme'), 'dark'); assert.equal(store.has('secret.other'), false);
  await s.push(); assert.equal(ad.writes.length, 1); assert.deepEqual(ad.writes[0], { 'users/u1/settings/lib_view': 'list' }, 'only the local customisation went up; the remote value did not echo');
  s.dispose();
});

// ---------------------------------------------------------------- backup watermark
const { buildBackup, validateBackup, isBackup, makeWatermark } = await imp('js/features/export/native-format.js');
test('backup watermark: found by content, renamed or edited files still import, tampering is reported not refused', () => {
  const b = buildBackup({ folders: [{ id: 'f1', name: 'A', ts: 1, up: 1 }], links: [{ id: 'l1', fid: 'f1', url: 'https://a.test/', ts: 1, up: 1 }], now: 5 });
  assert.equal(Object.keys(b)[0], 'watermark'); assert.equal(b.watermark.app, 'Linkivo'); assert.match(b.watermark.id, /^[0-9a-f]{8}$/);
  assert.equal(validateBackup(JSON.parse(JSON.stringify(b))).backup.verified, true);
  const noFormat = { ...b }; delete noFormat.format; assert.ok(isBackup(noFormat), 'the watermark alone identifies it'); assert.equal(validateBackup(noFormat).ok, true);
  const edited = JSON.parse(JSON.stringify(b)); edited.links.push({ id: 'l2', fid: 'f1', url: 'https://b.test/' }); const v = validateBackup(edited); assert.equal(v.ok, true); assert.equal(v.backup.verified, false);
  assert.equal(isBackup({ hello: 1 }), false); assert.notEqual(makeWatermark({ ...b, exportedAt: 6 }).id, b.watermark.id);
});

// ---------------------------------------------------------------- favicon filter, import form helpers
const { isIconUrl } = await imp('js/core/url-tools.js');
test('icon files are recognised, real pages are not', () => {
  for (const u of ['https://a.test/favicon.ico', 'https://a.test/assets/apple-touch-icon-180x180.png', 'https://a.test/x/android-chrome-192x192.png', 'https://www.google.com/s2/favicons?domain=a.test', 'https://icons.duckduckgo.com/ip3/a.test.ico', 'https://t2.gstatic.com/faviconV2?url=a', 'https://a.test/img/logo.ico']) assert.equal(isIconUrl(u), true, u);
  for (const u of ['https://a.test/', 'https://a.test/blog/favicon-guide', 'https://a.test/icons', 'https://a.test/photo.png', 'not a url']) assert.equal(isIconUrl(u), false, u);
});
const { applySelection, domainCounts, collectWarnings } = await imp('js/features/import/import-form.js');
test('import form: ticks survive a rebuild, a switched-off domain unticks its links, counts per domain', () => {
  const rows = [{ key: 'a', host: 'x.test' }, { key: 'b', host: 'x.test' }, { key: 'c', host: 'y.test', dupOf: 'f' }, { key: 'd', host: 'z.test', repeat: true }];
  applySelection(rows, { manual: new Map(), off: new Set(['x.test']) }); assert.deepEqual(rows.map((r) => r.selected), [false, false, false, false]);
  applySelection(rows, { manual: new Map([['a', true]]), off: new Set(['x.test']) }); assert.equal(rows[0].selected, true, 'the user tick beats the domain switch');
  applySelection(rows, { manual: new Map(), off: new Set() }); assert.deepEqual(rows.map((r) => r.selected), [true, true, false, false]);
  assert.deepEqual(domainCounts(rows), [['x.test', 2], ['y.test', 1], ['z.test', 1]]); assert.equal(collectWarnings({ files: [], found: 3000, pasteSize: 0 }).length, 1);
});

// ---------------------------------------------------------------- shared dropdown
const { createSelect, selectSummary } = await imp('js/ui/select.js');
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
test('dropdown: shows the choice, opens the shared list with a check mark, selects, closes; multi stays open', async () => {
  const opts = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma' }];
  assert.equal(selectSummary(opts, 'b'), 'Beta'); assert.equal(selectSummary(opts, ['a', 'b', 'c'], true), '3 selected'); assert.equal(selectSummary(opts, [], true, 'None'), 'None');
  let got = null; const sel = createSelect({ options: opts, value: 'a', onChange: (v) => { got = v; } }); document.body.appendChild(sel);
  assert.equal(sel.textContent, 'Alpha'); click(sel); await waitFor(() => document.querySelector('.pop'));
  assert.equal(document.querySelector('.pop-item[aria-checked="true"]').textContent, 'Alpha'); click($$('.pop-item')[1]); await tick(5);
  assert.equal(got, 'b'); assert.equal(sel.textContent, 'Beta'); assert.ok(!document.querySelector('.pop'), 'single choice closes the list'); assert.equal(sel.getValue(), 'b');
  let multi = null; const m = createSelect({ options: opts, value: ['a'], multi: true, onChange: (v) => { multi = v; } }); document.body.appendChild(m); click(m); await waitFor(() => document.querySelector('.pop'));
  click($$('.pop-item')[2]); await tick(5); assert.deepEqual(multi, ['a', 'c']); assert.ok(document.querySelector('.pop'), 'multi stays open'); click($$('.pop-item')[0]); assert.deepEqual(multi, ['c']);
  document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick(5);
});
test('link menu: headings and separators render without being focusable items', async () => {
  const { openMenu } = await imp('js/ui/popover.js'); const a = document.createElement('button'); document.body.appendChild(a);
  const m = openMenu(a, [{ heading: 'Link' }, { label: 'One' }, { separator: true }, { label: 'Two', checked: true }]); await tick(5);
  assert.equal($$('.pop-head').length, 1); assert.equal($$('.pop-item').length, 2); assert.equal($$('[role=menuitemradio]').length, 1); m.close();
});

// ---------------------------------------------------------------- scroll rows, shortcuts, keyboard, sheet drag
const { dragDelta, shouldDrag, attachScrollRow } = await imp('js/ui/scroll-row.js');
test('scroll row: mouse drag maths, a few pixels is still a click, arrows appear only where there is more to see', () => {
  assert.equal(dragDelta(100, 60, 200), 240); assert.equal(dragDelta(100, 160, 200), 140); assert.equal(shouldDrag(3), false); assert.equal(shouldDrag(-9), true);
  const host = document.createElement('div'); const row = document.createElement('div'); row.className = 'fade-x'; host.appendChild(row); document.body.appendChild(host);
  Object.defineProperty(row, 'scrollWidth', { value: 600 }); Object.defineProperty(row, 'clientWidth', { value: 300 }); Object.defineProperty(host, 'clientWidth', { value: 400 }); const off = attachScrollRow(row);
  // v2.2.2: the buttons are columns beside the row (host is a flex row) and a button that has nothing to do is dimmed (is-off), not removed
  const [prev, next] = host.querySelectorAll('.srow-btn'); assert.ok(host.classList.contains('srow') && host.classList.contains('has-arrows'), 'the row overflows: arrows are reserved'); assert.ok(prev.classList.contains('is-off') && !next.classList.contains('is-off'), 'at the left edge only "next" is active'); assert.ok(host.firstElementChild === prev && host.lastElementChild === next, 'prev and next are separate columns around the row'); off(); assert.equal(host.querySelectorAll('.srow-btn').length, 0);
});
const { matchKey, describeKeys } = await imp('js/core/shortcuts.js');
test('shortcuts: modifiers and symbols match exactly, labels are readable', () => {
  const ev = (o) => ({ key: 'a', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
  assert.equal(matchKey(ev({ ctrlKey: true }), 'mod+a'), true); assert.equal(matchKey(ev({ metaKey: true }), 'mod+a'), true); assert.equal(matchKey(ev({}), 'mod+a'), false);
  assert.equal(matchKey(ev({ key: 'A', ctrlKey: true, shiftKey: true }), 'mod+a'), false); assert.equal(matchKey(ev({ key: 'Escape' }), 'escape'), true);
  assert.equal(matchKey(ev({ key: '?', shiftKey: true }), '?'), true); assert.equal(matchKey(ev({ key: '/' }), '/'), true); assert.equal(matchKey(ev({ key: 'Delete' }), 'delete'), true);
  assert.equal(describeKeys('mod+a'), 'Ctrl + A'); assert.equal(describeKeys('escape'), 'Esc');
});
test('shortcuts: never while typing in a field or while a popup is open', async () => {
  const { registerShortcuts } = await imp('js/core/shortcuts.js'); let hits = 0; const off = registerShortcuts([{ keys: 'n', run: () => { hits++; } }, { keys: 'escape', inInput: true, run: () => { hits += 10; } }]);
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key(document.body, 'n'); assert.equal(hits, 1); const input = document.createElement('input'); document.body.appendChild(input); key(input, 'n'); assert.equal(hits, 1, 'typing is left alone'); key(input, 'Escape'); assert.equal(hits, 11);
  const { openSheet } = await imp('js/ui/sheet.js'); const sh = openSheet({ title: 'x', body: document.createElement('div'), actions: [] }); key(document.body, 'n'); assert.equal(hits, 11, 'a popup owns the keys'); sh.close(); await tick(250); off();
});
const { keyboardHeight, isTextField } = await imp('js/core/keyboard-safe.js');
test('keyboard-safe: the keyboard height is what the visible viewport lost; only text fields count', () => {
  assert.equal(keyboardHeight(800, 500, 0), 300); assert.equal(keyboardHeight(800, 800, 0), 0); assert.equal(keyboardHeight(800, 500, 100), 200); assert.equal(keyboardHeight(800, 900, 0), 0);
  const i = document.createElement('input'), c = document.createElement('input'); c.type = 'checkbox'; assert.equal(isTextField(i), true); assert.equal(isTextField(c), false); assert.equal(isTextField(document.createElement('textarea')), true); assert.equal(isTextField(null), false);
});
const { dragOutcome, openSheet } = await imp('js/ui/sheet.js');
test('sheet drag: far enough or a quick flick closes it, a short slow drag springs back; beforeClose can refuse', async () => {
  assert.equal(dragOutcome(200, 600, 500), 'close'); assert.equal(dragOutcome(60, 800, 500), 'back'); assert.equal(dragOutcome(40, 50, 500), 'close', 'flick'); assert.equal(dragOutcome(10, 10, 500), 'back'); assert.equal(dragOutcome(-30, 100, 500), 'back');
  let allow = false; const sh = openSheet({ title: 'T', body: document.createElement('div'), actions: [], beforeClose: async () => allow });
  assert.ok(document.querySelector('.sheet-head.is-draggable') || document.querySelector('.sheet-grab.is-draggable'), 'drag handle is wired');
  await sh.requestClose(); assert.ok(document.querySelector('.sheet'), 'refused'); allow = true; await sh.requestClose(); await tick(250); assert.ok(!document.querySelector('.sheet'));
});

// ---------------------------------------------------------------- designed page exports
const { renderPage, hrefOf } = await imp('js/features/export/formats/page-render.js');
const { getFormat, defaultOptions } = await imp('js/features/export/formats/index.js'); const { groupOf, iconOf } = await imp('js/features/export/export-sheet.js');
const ITEMS = [{ id: '1', title: 'Cafe <script>alert(1)</script>', url: 'https://a.test/x?q=1&r=2', host: 'a.test', desc: 'D & "E"', tags: 'x,y', folder: 'News', added: Date.UTC(2026, 9, 23), points: 100 },
  { id: '2', title: 'Bad', url: 'javascript:alert(1)', host: '', folder: 'News', added: 1, points: 100 }, { id: '3', title: 'Other', url: 'https://b.test/', host: 'b.test', folder: 'Dev', added: 2, points: 100 }];
test('page export: escapes everything, drops non-http links, carries the watermark, header and footer; layouts and groups work', async () => {
  assert.equal(hrefOf('javascript:alert(1)'), null); assert.equal(hrefOf('https://x.test'), 'https://x.test');
  const o = { ...defaultOptions(getFormat('webpage')), show: ['icon', 'url', 'desc', 'tags', 'added', 'num'] };
  const html = await renderPage(ITEMS, o, { mode: 'web', label: 'news', now: Date.UTC(2026, 9, 24) });
  assert.ok(!html.includes('<script>alert'), 'title is escaped'); assert.match(html, /&lt;script&gt;/); assert.ok(!/href="javascript:/.test(html)); assert.match(html, /name="generator" content="Linkivo 2\.2\.\d+"/); assert.match(html, /<!-- Exported by Linkivo 2\.2\.\d+/);
  assert.match(html, /class="top"/); assert.match(html, /Developed by <a href="https:\/\/mdturzo\.web\.app">Muhtasim Rahman/); assert.match(html, /linkivo\.web\.app/); assert.match(html, /<h2>.*News.*<small>2<\/small>/); assert.match(html, /3 links/);
  assert.ok(!/<script/i.test(html.replace(/&lt;script&gt;/g, '')), 'no script in the file');
  const table = await renderPage(ITEMS, { ...o, layout: 'table' }, { mode: 'web' }); assert.match(table, /<table class="tb">/); const cards = await renderPage(ITEMS, { ...o, layout: 'cards', group: 'none' }, { mode: 'web' }); assert.match(cards, /class="cards"/); assert.ok(!/<h2>/.test(cards));
  const noHead = await renderPage(ITEMS, { ...o, header: false, footer: false }, { mode: 'web' }); assert.ok(!/class="top"/.test(noHead) && !/class="ft"/.test(noHead));
  const dark = await renderPage(ITEMS, { ...o, theme: 'dark', accent: 'rose' }, { mode: 'web' }); assert.match(dark, /--bg:#0b1730/); assert.match(dark, /--ac:#e11d48/);
});
test('print export: page size, direction, margins, repeating header and footer, page numbers, black and white', async () => {
  const o = { ...defaultOptions(getFormat('print')), pageSize: 'a5', orientation: 'landscape', margin: 'wide' };
  const html = await renderPage(ITEMS, o, { mode: 'print' });
  assert.match(html, /@page\{size:A5 landscape;margin:22mm/); assert.match(html, /counter\(page\)/); assert.match(html, /<thead><tr><td><header/); assert.match(html, /<tfoot><tr><td><footer/);
  assert.ok(!/counter\(page\)/.test(await renderPage(ITEMS, { ...o, pageNumbers: false }, { mode: 'print' }))); assert.match(await renderPage(ITEMS, { ...o, color: 'mono' }, { mode: 'print' }), /--ac:#111/);
  const blob = await getFormat('print').build(ITEMS, o, { label: 'x' }); assert.match(await blob.text(), /<!DOCTYPE html>/); assert.equal(getFormat('printable'), null, 'the old printable page is not listed any more');
});
test('export popup helpers: options are grouped, every format has an icon', () => {
  assert.equal(groupOf({ id: 'sort' }), 'order'); assert.equal(groupOf({ id: 'x', type: 'multi' }), 'content'); assert.equal(groupOf({ id: 'layout', group: 'layout' }), 'layout'); assert.equal(iconOf(getFormat('csv')), 'table');
});

// ---------------------------------------------------------------- extra page data (linkMeta)
const { Engine } = await imp('js/engine/engine.js'); const { createMemoryDb } = await imp('js/engine/idb.js'); const { metaExtras } = await imp('js/features/import/import-job.js');
test('metadata: every field the Worker returns is mapped, saved in its own tree, and removed with the link', async () => {
  const x = metaExtras({ title: 'T', desc: 'Long text', image: 'https://i.test/a.png', site: 'Site', author: 'Ann', lang: 'en', published: '2026-01-01', canonical: 'https://a.test/', favicon: 'https://a.test/f.ico', type: 'article', themeColor: '#fff', frameable: true, video: '' });
  assert.deepEqual(Object.keys(x).sort(), ['author', 'canon', 'frameable', 'icon', 'image', 'lang', 'long', 'pub', 'site', 'theme', 'type']); assert.equal(metaExtras({ title: 'only' }), null); assert.equal(metaExtras(null), null);
  const e = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e.init(); const f = await e.createFolder({ name: 'A' }); const { added } = await e.addLinks([{ url: 'https://a.test/1' }, { url: 'https://a.test/2' }], { fid: f.id });
  assert.equal(await e.saveLinkMeta([[added[0].id, x], [added[1].id, { notAField: 1 }], ['ghost', x]]), 1, 'unknown fields and unknown links are dropped');
  const stored = (await e.db.getAll('linkMeta')); assert.equal(stored.length, 1); assert.equal(stored[0].id, added[0].id); assert.equal(stored[0].site, 'Site'); assert.ok(stored[0].checkedAt > 0); assert.equal(stored[0].frameable, true);
  await e.deleteLinks([added[0].id]); assert.equal((await e.db.getAll('linkMeta')).length, 1, 'kept while the link sits in the Recycle Bin'); await e.purgeLinks([added[0].id]); assert.equal((await e.db.getAll('linkMeta')).length, 0, 'gone with the link');
});
test('rules: linkMeta accepts the new fields and still refuses oversized or foreign ones', async () => {
  const rules = JSON.parse((await import('node:fs')).readFileSync(new URL('../rules/database.rules.json', import.meta.url), 'utf8')).rules;
  const rec = rules.linkMeta.$uid.$lid; assert.ok(rec, 'linkMeta rule exists'); for (const f of ['site', 'author', 'lang', 'pub', 'canon', 'icon', 'type', 'theme']) assert.ok(rec[f], `rule for ${f}`);
  assert.equal(rec.$other['.validate'], false);
});
