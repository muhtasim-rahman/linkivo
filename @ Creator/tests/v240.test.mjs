// Linkivo v2.4.0: picker (seeded RNG), history, page memory, router replace/pop, Random session, settings registry.
// Node + jsdom only; real browser behaviour (Back on a phone, the preview in random mode, layouts) is an owner test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const P = await import('../../js/engine/picker.js');
const H = await import('../../js/core/history.js');
const PMEM = await import('../../js/core/page-memory.js');
const { prefs } = await import('../../js/core/local-prefs.js');
const { CATALOG, SECTIONS } = await import('../../js/features/settings/catalog.js');

// small deterministic generator (mulberry32)
const seeded = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const NOW = Date.UTC(2026, 9, 30, 12);
const mk = (id, extra = {}) => ({ id, fid: 'f1', host: id + '.test', pt: 100, oc: 0, ts: NOW - 86400e3 * 30, ...extra });

test('filterPool: blocked, deleted, dead and the hard filters', () => {
  const links = [mk('a'), mk('b', { bl: true }), mk('c', { del: 1 }), mk('d', { dd: 1 }), mk('e', { fv: true }), mk('f', { fid: 'f2' }), mk('g', { pt: 500 }), mk('h', { oc: 2 }), mk('i', { tags: 'x,Y' })];
  assert.deepEqual(P.filterPool(links, {}).map((l) => l.id), ['a', 'e', 'f', 'g', 'h', 'i'], 'blocked, deleted and dead links are never in the pool');
  assert.deepEqual(P.filterPool(links, { fids: ['f2'] }).map((l) => l.id), ['f']);
  assert.deepEqual(P.filterPool(links, { fav: true }).map((l) => l.id), ['e']);
  assert.deepEqual(P.filterPool(links, { min: 200 }).map((l) => l.id), ['g']);
  assert.deepEqual(P.filterPool(links, { unseen: true }).map((l) => l.id).includes('h'), false);
  assert.deepEqual(P.filterPool(links, { tags: ['y'] }).map((l) => l.id), ['i']);
  assert.ok(P.filterPool(links, { skipDead: false }).some((l) => l.id === 'd'));
  assert.deepEqual(P.filterPool(links, { exclude: ['a.test'] }).some((l) => l.id === 'a'), false);
});

test('weightOf: points, fresh, recency, age, folder weight and the modes', () => {
  const base = mk('a');
  const w100 = P.weightOf(base, {}, NOW), w200 = P.weightOf(mk('b', { pt: 200 }), {}, NOW);
  assert.ok(Math.abs(w200 / w100 - 2) < 1e-9, 'gamma 1: double the points, double the weight');
  assert.ok(P.weightOf(base, { gamma: 0.5 }, NOW) < w100, 'soft influence flattens');
  const seen = mk('c', { oc: 5 });
  assert.ok(P.weightOf(base, {}, NOW) > P.weightOf(seen, {}, NOW), 'a never-opened link is fresher');
  assert.equal(P.recencyFactor(mk('d', { lo: NOW - 3600e3 }), NOW), 0.05); assert.equal(P.recencyFactor(mk('d', { lo: NOW - 10 * 3600e3 }), NOW), 0.2);
  assert.equal(P.recencyFactor(mk('d', { lo: NOW - 48 * 3600e3 }), NOW), 0.5); assert.equal(P.recencyFactor(mk('d', { lo: NOW - 100 * 3600e3 }), NOW), 0.8); assert.equal(P.recencyFactor(mk('d', { lo: NOW - 30 * 86400e3 }), NOW), 1);
  const recent = mk('r', { lo: NOW - 3600e3 });
  assert.ok(P.weightOf(recent, { avoidRecent: true }, NOW) < P.weightOf(recent, { avoidRecent: false }, NOW));
  assert.ok(Math.abs(P.weightOf(base, { folderWeights: { f1: 2 } }, NOW) / w100 - 2) < 1e-9, 'folder weight high = x2');
  assert.equal(P.weightOf(mk('x', { pt: 900 }), { mode: 'equal' }, NOW), P.weightOf(mk('y', { pt: 1 }), { mode: 'equal' }, NOW), 'equal mode ignores points');
  assert.ok(P.weightOf(mk('lo', { pt: 10 }), { mode: 'underdog' }, NOW) > P.weightOf(mk('hi', { pt: 900 }), { mode: 'underdog' }, NOW), 'underdog favours low points');
  assert.ok(P.weightOf(mk('old', { ts: NOW - 800 * 86400e3 }), {}, NOW) > P.weightOf(mk('new', { ts: NOW }), {}, NOW), 'old backlog gets a small lift');
});

test('pickNext: statistically sensible with a seeded RNG, no repeats until the pool is exhausted', () => {
  const pool = [mk('low', { pt: 20 }), mk('mid', { pt: 100 }), mk('high', { pt: 400 })];
  const rng = seeded(42), hits = { low: 0, mid: 0, high: 0 };
  for (let i = 0; i < 3000; i++) hits[P.pickNext(pool, { rng, now: NOW, avoidRecent: false }).id]++;   // no `seen`: every draw is independent
  assert.ok(hits.high > hits.mid && hits.mid > hits.low, `heavier links win more often: ${JSON.stringify(hits)}`);
  assert.ok(hits.low > 30, 'but a low link can still win');
  const seen = new Set(), order = [], r2 = seeded(7);
  for (let i = 0; i < 3; i++) order.push(P.pickNext(pool, { rng: r2, now: NOW, seen }).id);
  assert.equal(new Set(order).size, 3, 'three draws, three different links');
  const again = P.pickNext(pool, { rng: r2, now: NOW, seen, last: order[2] });
  assert.ok(again && again.id !== order[2], 'after the pool is exhausted the session restarts and does not repeat the last link at once');
  assert.equal(P.pickNext([], {}), null);
  assert.equal(P.pickNext([mk('only')], { seen: new Set(['only']), last: 'only' }).id, 'only', 'a pool of one still answers');
});

function fakeEngine() { const m = new Map(); return { db: { get: async (_s, k) => m.get(k), put: async (_s, r) => { m.set(r.key, r); } } }; }

test('history: records once, dedupes a double hook, honours none and the keep time, removes and clears', async () => {
  prefs.set('history.keep', '90d');
  const e = fakeEngine(), l = { id: 'l1', title: 'T', url: 'https://x.test/', host: 'x.test' };
  await H.record(e, l, 'click'); await H.record(e, l, 'preview');
  assert.equal((await H.list(e)).length, 1, 'two hooks for one open make one entry');
  await H.record(e, { ...l, id: 'l2' }, 'random'); assert.equal((await H.list(e)).length, 2); assert.equal((await H.list(e))[0].how, 'random', 'newest first');
  const id = (await H.list(e))[0].id; await H.removeIds(e, [id]); assert.equal((await H.list(e)).length, 1);
  prefs.set('history.keep', 'none'); await H.record(e, { ...l, id: 'l3' }, 'click'); assert.equal((await H.list(e)).length, 1, 'No history records nothing');
  prefs.set('history.keep', '1h');
  await e.db.put('meta', { key: 'history', value: [{ id: 'old', lid: 'o', title: 'o', url: 'https://o.test', host: 'o.test', how: 'click', ts: Date.now() - 2 * 3600e3 }, { id: 'new', lid: 'n', title: 'n', url: 'https://n.test', host: 'n.test', how: 'click', ts: Date.now() }] });
  assert.deepEqual((await H.list(e)).map((x) => x.id), ['new'], 'older than the keep time is dropped');
  prefs.set('history.keep', 'never'); assert.equal((await H.list(e)).length, 2, 'never delete keeps both');
  await H.clearAll(e); assert.equal((await H.list(e)).length, 0);
  assert.equal(H.keepMs('never'), null); assert.equal(H.keepMs('none'), 0); assert.equal(H.keepMs('24h'), 86400e3);
  prefs.remove('history.keep');
});

test('history: groupByDay labels Today and Yesterday', () => {
  const now = new Date(2026, 9, 30, 15).getTime();
  const g = H.groupByDay([{ ts: now - 3600e3 }, { ts: now - 5 * 3600e3 }, { ts: now - 86400e3 }, { ts: now - 5 * 86400e3 }], now);
  assert.equal(g[0].label, 'Today'); assert.equal(g[0].items.length, 2); assert.equal(g[1].label, 'Yesterday'); assert.equal(g.length, 3);
});

test('page memory: remembers per key, is capped, forgets', () => {
  PMEM.resetPageMemory(); assert.equal(PMEM.recall('folder:a'), null);
  PMEM.remember('folder:a', { q: 'x', top: 120 }); assert.deepEqual(PMEM.recall('folder:a'), { q: 'x', top: 120 });
  for (let i = 0; i < 40; i++) PMEM.remember('k' + i, { i });
  assert.equal(PMEM.recall('folder:a'), null, 'the oldest page is dropped past the cap'); assert.ok(PMEM.recall('k39'));
  PMEM.forget('k39'); assert.equal(PMEM.recall('k39'), null);
});

test('settings registry: Random and history entries exist with string values and a section', () => {
  assert.ok(SECTIONS.some((s) => s.id === 'random'));
  const ids = ['rndMode', 'rndGamma', 'rndAvoid', 'rndAuto', 'histKeep'].map((id) => CATALOG.find((e) => e.id === id));
  assert.ok(ids.every(Boolean)); assert.ok(ids.every((e) => e.section === 'random'));
  for (const e of ids.filter((x) => x.type === 'seg')) { assert.equal(typeof e.default, 'string'); assert.ok(e.options.every((o) => typeof o.value === 'string')); assert.ok(e.options.some((o) => o.value === e.default)); }
  assert.equal(CATALOG.find((e) => e.id === 'pvAdmin').section, 'account', 'the admin view switch lives in Account (owner)');
});

test('router: replace overwrites the history entry, pop is passed to mount, data-replace links keep `from`', async () => {
  const { createRouter } = await import('../../js/core/router.js');
  const seen = [];
  const mod = (name) => ({ mount: (_c, ctx) => { seen.push({ name, from: ctx.from, pop: ctx.pop, path: ctx.path }); return () => {}; } });
  const routes = [
    { id: 'folder', pattern: '/folder/:fid', title: 'F', parent: '/library', guard: 'open', load: async () => mod('folder') },
    { id: 'link', pattern: '/link/:lid', title: 'L', parent: '/library', guard: 'open', load: async () => mod('link') },
    { id: 'lib', pattern: '/library', title: 'Lib', parent: null, guard: 'open', load: async () => mod('lib') },
    { id: 'nf', pattern: '*', title: 'NF', parent: '/library', guard: 'open', load: async () => mod('nf') }
  ];
  const container = document.createElement('div'); document.body.appendChild(container);
  const r = createRouter({ routes, container, getSession: () => ({ mode: 'guest' }) });
  await r.start();
  await r.navigate('/folder/a'); await r.navigate('/link/1');
  const len = history.length;
  document.body.insertAdjacentHTML('beforeend', '<a id="rel" href="/link/2" data-replace>next</a>');
  document.getElementById('rel').click(); await new Promise((x) => setTimeout(x, 30));
  assert.equal(history.length, len, 'a data-replace link adds no history entry');
  assert.equal(location.pathname, '/link/2'); assert.equal(seen.at(-1).from, '/folder/a', 'it keeps where the Preview was opened from');
  await r.navigate('/link/3', { replace: true }); assert.equal(history.length, len, 'navigate({replace:true}) really replaces now');
  assert.equal(seen.at(-1).pop, false);
  r.destroy();
});
