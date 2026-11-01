// Linkivo v2.4.2: offline sync honesty, boot timeouts, hover gating, filter ranking, Microlink 25, two widths, settings catalog, admin chip, History/Recycle pick tile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupDom, tick } from './helpers/dom-env.mjs';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';

const { w } = setupDom('http://localhost/library');
const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const { createMemoryDb } = await import('../../js/engine/idb.js');

test('Sync now offline: says offline, does not stamp Last synced, and works again when online', async () => {
  const { createCloudEngine } = await import('../../js/engine/cloud-engine.js');
  const e = await createCloudEngine({ uid: 'u1', adapter: createFakeRtdb().adapter, db: createMemoryDb() });
  await tick(5); assert.equal(await e.syncNow(), true); const stamp = e.status().lastSync;
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  await tick(5); assert.equal(await e.syncNow(), false, 'offline is not a success'); assert.equal(e.status().state, 'offline'); assert.equal(e.status().lastSync, stamp, 'the time does not move');
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  await tick(5); assert.equal(await e.syncNow(), true); assert.ok(e.status().lastSync >= stamp);
  e.dispose();
});

test('withTimeout: a call that never answers is cut off, a quick one passes', async () => {
  const { withTimeout } = await import('../../js/core/utils.js');
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'x'), (e) => e.code === 'lk/timeout');
  assert.equal(await withTimeout(Promise.resolve(5), 50), 5);
});

test('account status: offline answers at once, a hanging read cannot stop the boot', async () => {
  const { loadAccountStatus } = await import('../../js/features/auth/account-status.js');
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true });
  assert.equal(await loadAccountStatus({ mods: {}, db: null }, { uid: 'u' }), 'active');
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });
  const hang = { mods: { database: { ref: () => ({}), get: () => new Promise(() => {}), update: () => new Promise(() => {}) } }, db: {} };
  const t0 = Date.now(); assert.equal(await loadAccountStatus(hang, { uid: 'u' }), 'active'); assert.ok(Date.now() - t0 < 6000, 'gave up after its own limit');
});

test('hover gating: every :hover rule sits in @media (hover: hover); the tool is idempotent and keeps unrelated rules', async () => {
  const { wrapHover, findUnwrapped } = await import('../../@ Creator/tools/hover-wrap.mjs');
  const src = '.a { color: red; }\n.b:hover, .c { color: blue; }\n@media (min-width: 900px) { .d:hover { x: 1; } }\n@media (hover: hover) { .e:hover { y: 2; } }\n@keyframes k { from { opacity: 0; } to { opacity: 1; } }\n';
  const out = wrapHover(src);
  assert.deepEqual(findUnwrapped(out), []); assert.equal(wrapHover(out), out, 'idempotent');
  assert.match(out, /\.c \{ color: blue; \}/); assert.match(out, /@media \(hover: hover\) \{ \.b:hover/); assert.match(out, /@media \(min-width: 900px\) \{ @media \(hover: hover\)/); assert.match(out, /@keyframes k/);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.css') ? [path.join(d, e.name)] : []));
  for (const f of walk(new URL('css', root).pathname)) assert.deepEqual(findUnwrapped(fs.readFileSync(f, 'utf8')), [], f);
});

test('Microlink: the allowance is 25 whatever an old stored value or a header says; Random follows its own switches', async () => {
  const ML = await import('../../js/core/microlink.js'); const { prefs } = await import('../../js/core/local-prefs.js');
  const now = Date.UTC(2026, 10, 1, 10); const day = new Date(now).toISOString().slice(0, 10);
  prefs.set('ml.d25', { day, used: 3, limit: 5, reset: 0 }); assert.equal(ML.quota(now).limit, 25); assert.equal(ML.quota(now).left, 22);
  const C = await import('../../js/features/preview/preview-ctx.js');
  C.setInRandom(false); assert.equal(C.microlinkAllowed(), true); assert.equal(C.thumAllowed(), true);
  C.setInRandom(true); assert.equal(C.microlinkAllowed(), false, 'off by default inside Random'); assert.equal(C.thumAllowed(), false);
  prefs.set('random.microlink', true); prefs.set('random.thum', true); assert.equal(C.microlinkAllowed(), true); assert.equal(C.thumAllowed(), true);
  prefs.remove('random.microlink'); prefs.remove('random.thum'); C.setInRandom(false);
});

test('Random filters: top sites and tags are ranked, chosen ones stay visible, search finds the rest', async () => {
  const F = await import('../../js/features/random/random-filters.js');
  const links = []; for (let i = 0; i < 30; i++) links.push({ host: `site${i}.test`, tags: i % 2 ? 'a,b' : 'c' }); for (let i = 0; i < 5; i++) links.push({ host: 'big.test', tags: 'a' }); links.push({ host: 'gone.test', del: 1 });
  const hosts = F.rankCounts(links, F.hostKeys); assert.equal(hosts[0][0], 'big.test'); assert.equal(hosts[0][1], 5); assert.ok(!hosts.some(([h]) => h === 'gone.test'), 'deleted links do not count');
  const top = F.visibleChoices(hosts, [], { top: 10 }); assert.equal(top.length, 10);
  const withChosen = F.visibleChoices(hosts, ['site29.test'], { top: 10 }); assert.equal(withChosen[0][0], 'site29.test', 'a chosen site is always shown, first'); assert.equal(withChosen.length, 10 + 1 - (top.some(([h]) => h === 'site29.test') ? 1 : 0));
  assert.equal(F.visibleChoices(hosts, [], { top: 10, all: true }).length, hosts.length);
  assert.deepEqual(F.visibleChoices(hosts, [], { top: 10, q: 'site2' }).every(([h]) => h.includes('site2')), true);
  const tags = F.rankCounts(links, F.tagKeys); assert.equal(tags[0][0], 'a'); assert.ok(tags.length === 3);
});

test('Settings catalog: Random keeps six defaults, no Open History row, Preview before History, admin entry flagged, sync defaults', async () => {
  const C = await import('../../js/features/settings/catalog.js');
  assert.equal(C.CATALOG.filter((e) => e.section === 'random').length, 6, 'Random Discover keeps six defaults');
  assert.ok(!C.CATALOG.some((e) => e.id === 'histOpen'));
  const ids = C.SECTIONS.map((s) => s.id); assert.ok(ids.indexOf('preview') < ids.indexOf('history'), 'Preview comes before History');
  assert.equal(C.findEntry('pvAdmin').admin, true); assert.ok(C.CATALOG.findIndex((e) => e.id === 'pvAdmin') > C.CATALOG.findIndex((e) => e.id === 'sync'), 'View the app as sits below Data and sync');
  assert.deepEqual(C.CATALOG.filter((e) => e.local).map((e) => e.id).sort(), C.CATALOG.filter((e) => e.local).map((e) => e.id).sort());
  const local = C.CATALOG.filter((e) => e.local && ['theme', 'accent', 'reduceMotion', 'sidebarCollapsed'].includes(e.id)); assert.ok(local.length >= 3, 'theme, accent colour, motion and collapsed sidebar stay on this device by default');
  assert.ok(!C.findEntry('histWhere').local, 'Where history is kept is synced by default');
  assert.ok(C.findEntry('pvTab').options.some((o) => o.value === 'video') && C.findEntry('pvTab').options.some((o) => o.value === 'pdf'), 'Tab that opens first has Video and PDF');
  assert.equal(C.findEntry('rndMicrolink').default, false); assert.equal(C.findEntry('rndThum').default, false);
});

test('Admin chip is a plain element that css shows only for admins', async () => {
  const { adminChip } = await import('../../js/ui/admin-badge.js'); const el = adminChip(); assert.equal(el.className, 'admin-chip'); assert.equal(el.textContent, 'Admin');
  assert.match(read('css/pages/pages.css') + read('css/components/kit.css') + read('css/pages/settings.css'), /html\[data-admin[^\]]*\] \.admin-chip|\.admin-chip/);
});

test('Two page widths only; the scrollbar lock exists for the enter animation', () => {
  const tokens = read('css/core/tokens.css'), layout = read('css/core/layout.css');
  assert.match(tokens, /--w-normal: 960px/); assert.match(tokens, /--w-wide: 1240px/); assert.match(layout, /\.page\.is-wide \{ --content-max: var\(--w-wide\)/); assert.match(layout, /#page-root\.is-entering \{ overflow-y: hidden/);
  for (const f of ['css/pages/history.css', 'css/pages/random.css', 'css/pages/settings.css', 'css/pages/library.css', 'css/pages/search.css']) assert.ok(!/\.(hs|rnd|set|lib|sp)\s*\{[^}]*max-width:\s*\d{3,4}px/.test(read(f)), `${f}: no private page width`);
});

test('Pick tile: favicon becomes a check box (hover, selecting, ticked) and toggles without leaking the click', async () => {
  const { pickTile, faviconFace } = await import('../../js/ui/pick-tile.js'); let n = 0;
  const t = pickTile({ face: faviconFace('example.com', ''), on: false, selecting: false, label: 'Select x', onToggle: () => { n++; } });
  const parent = w.document.createElement('div'); let leaked = 0; parent.addEventListener('click', () => { leaked++; }); parent.append(t); w.document.body.append(parent);
  t.querySelector('.pk-box').click(); assert.equal(n, 1); assert.equal(leaked, 0, 'the row click does not also fire');
  assert.equal(pickTile({ face: faviconFace('a.b', ''), on: true, selecting: true, onToggle() {} }).className.includes('is-on'), true);
  assert.match(read('css/components/kit.css'), /\.pk-row:hover \.pk-box \{ opacity: 1; \}/);
});

test('Profile thumbnail source: only a saved https screenshot address is used', async () => {
  const { shotFromMeta } = await import('../../js/features/shell/pages/profile-thumbs.js');
  assert.equal(shotFromMeta({ shot: 'https://image.thum.io/get/x' }), 'https://image.thum.io/get/x'); assert.equal(shotFromMeta({ shot: 'javascript:alert(1)' }), ''); assert.equal(shotFromMeta(null), '');
  const { Engine } = await import('../../js/engine/engine.js'); assert.equal(typeof Engine.prototype.peekLinkMeta, 'function');
});

test('Offline start: the Firebase files are cached at install; boot has a watchdog; versions agree', () => {
  const sw = read('sw.js'), loader = read('js/core/firebase-loader.js');
  const v = /FIREBASE_VERSION = '([\d.]+)'/.exec(sw)[1]; assert.ok(loader.includes(v), 'sw.js and firebase-loader.js use the same SDK version');
  assert.match(sw, /FIREBASE_FILES/); assert.match(read('js/boot.js'), /startWatchdog/);
  const app = JSON.parse(read('app.json')); assert.equal(app.version, '2.4.2'); assert.match(sw, /VERSION = '2\.4\.2'/);
});
