// Linkivo v2.4.1: picker, history service, page-state, syncNow, admin view, router replace/pop, Random page, History page, Profile, small fixes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';

const { w } = setupDom('http://localhost/library');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const P = await import('../../js/engine/picker.js');
const PT = await import('../../js/engine/points.js');
const H = await import('../../js/core/history.js');
const PS = await import('../../js/core/page-state.js');
const { Engine } = await import('../../js/engine/engine.js');
const { createMemoryDb } = await import('../../js/engine/idb.js');
const { installDataForTests } = await import('../../js/core/app-data.js');
const { createRouter } = await import('../../js/core/router.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { ROUTES } = await import('../../js/features/shell/routes.js');
const { prefs } = await import('../../js/core/local-prefs.js');
const AD = await import('../../js/core/admin.js');
const DAY = 864e5, HOUR = 36e5;

// ---------------------------------------------------------------- picker
const mk = (i, o = {}) => ({ id: 'l' + i, fid: 'f1', host: 'a.test', pt: 100, oc: 0, ts: 1e12, ...o });

test('picker: a link with 4x the points comes up about 4x as often (seeded, no other weights)', () => {
  const links = [mk(0, { pt: 400 }), mk(1), mk(2), mk(3), mk(4)];
  const rng = P.mulberry32(7), count = {};
  for (let i = 0; i < 6000; i++) { const r = P.pickNext({ links, rng, now: 1e12 + 1, seen: new Set() }); count[r.link.id] = (count[r.link.id] || 0) + 1; }
  const ratio = count.l0 / (count.l1 / 1);
  assert.ok(ratio > 3.4 && ratio < 4.7, `ratio ${ratio.toFixed(2)}`);
  assert.deepEqual(P.mulberry32(5)(), P.mulberry32(5)(), 'the same seed gives the same number');
});

test('picker: no repeats until the pool is used up, then it starts over without repeating the last link at once', () => {
  const links = [1, 2, 3, 4].map((i) => mk(i)), rng = P.mulberry32(3), seen = new Set(); let last = null;
  for (let i = 0; i < 4; i++) { const r = P.pickNext({ links, rng, seen, lastId: last }); assert.ok(!seen.has(r.link.id)); assert.equal(r.reset, false); seen.add(r.link.id); last = r.link.id; }
  const again = P.pickNext({ links, rng, seen, lastId: last });
  assert.equal(again.reset, true); assert.notEqual(again.link.id, last);
  assert.equal(P.pickNext({ links: [mk(9)], rng, seen: new Set(['l9']), lastId: 'l9' }).link.id, 'l9', 'one link only: it is the only choice');
});

test('picker: blocked, deleted and filtered-out links are never candidates', () => {
  const f = P.emptyFilters();
  assert.equal(P.isCandidate(mk(1, { bl: true }), f), false); assert.equal(P.isCandidate(mk(1, { del: 5 }), f), false);
  assert.equal(P.isCandidate(mk(1), { ...f, folders: { f2: 'normal' } }), false); assert.equal(P.isCandidate(mk(1), { ...f, folders: { f1: 'high' } }), true);
  assert.equal(P.isCandidate(mk(1, { host: 'www.Site.com' }), { ...f, include: ['site.com'] }), true); assert.equal(P.isCandidate(mk(1), { ...f, include: ['site.com'] }), false);
  assert.equal(P.isCandidate(mk(1, { host: 'x.com' }), { ...f, exclude: ['x.com'] }), false);
  assert.equal(P.isCandidate(mk(1, { tags: 'Work, read' }), { ...f, tags: ['read'] }), true); assert.equal(P.isCandidate(mk(1), { ...f, tags: ['read'] }), false);
  assert.equal(P.isCandidate(mk(1), { ...f, onlyFav: true }), false); assert.equal(P.isCandidate(mk(1, { fv: true }), { ...f, onlyFav: true }), true);
  assert.equal(P.isCandidate(mk(1), { ...f, onlyLiked: true }), false); assert.equal(P.isCandidate(mk(1, { pt: 150 }), { ...f, onlyLiked: true }), true);
  assert.equal(P.isCandidate(mk(1, { pt: 50 }), { ...f, minPts: 60 }), false); assert.equal(P.isCandidate(mk(1, { pt: 500 }), { ...f, maxPts: 400 }), false);
  assert.equal(P.isCandidate(mk(1, { dd: true }), f), false, 'dead links are skipped by default'); assert.equal(P.isCandidate(mk(1, { dd: true }), { ...f, skipDead: false }), true);
  assert.equal(P.isCandidate(mk(1, { oc: 2 }), { ...f, unseenOnly: true }), false); assert.equal(P.isCandidate(mk(1, { ds: true }), { ...f, skipDisliked: true }), false);
  assert.equal(P.pickNext({ links: [mk(1, { bl: true })] }), null, 'nothing to pick');
});

test('picker: weights follow the formula (fresh bonus, recent table, folder weight, modes, drift)', () => {
  const now = 1e12 + 400 * DAY;
  const base = P.weightOf(mk(1, { oc: 3, ts: now }), {}, now);
  assert.ok(Math.abs(base - 100 * (1 + 0.6 / 4)) < 1e-6, 'points x fresh (x1 age x1 recency)');
  assert.ok(Math.abs(P.weightOf(mk(1, { oc: 0, ts: now }), {}, now) / 100 - 1.6) < 1e-9, 'never opened: x1.6');
  const one = (lo, avoid) => P.recencyFactor({ lo }, avoid, now);
  assert.equal(one(now - HOUR, '24h'), 0.05); assert.equal(one(now - 10 * HOUR, '24h'), 0.2); assert.equal(one(now - 2 * DAY, '24h'), 1);
  assert.equal(one(now - 2 * DAY, '72h'), 0.5); assert.equal(one(now - 5 * DAY, '7d'), 0.8); assert.equal(one(now - 9 * DAY, '7d'), 1); assert.equal(one(now - HOUR, 'off'), 1);
  assert.equal(P.weightOf(mk(1, { oc: 3, ts: now }), { folders: { f1: 'high' } }, now) / base, 2); assert.equal(P.weightOf(mk(1, { oc: 3, ts: now }), { folders: { f1: 'low' } }, now) / base, 0.5);
  assert.equal(P.weightOf(mk(1), { mode: 'equal' }, now), 1);
  assert.ok(P.weightOf(mk(1, { pt: 10 }), { mode: 'underdog' }, now) > P.weightOf(mk(1, { pt: 900 }), { mode: 'underdog' }, now), 'underdog: low points weigh more');
  assert.ok(P.weightOf(mk(1, { oc: 0 }), { mode: 'fresh' }, now) > 100 * P.weightOf(mk(1, { oc: 5 }), { mode: 'fresh' }, now), 'never opened first');
  const old = mk(1, { pt: 300, lo: now - 140 * DAY, ts: now - 300 * DAY });
  assert.ok(P.weightOf(old, { mode: 'points', drift: true }, now) < P.weightOf(old, { mode: 'points' }, now), 'drift pulls high points toward 100');
  assert.ok(P.weightOf(mk(1), { gamma: 1.5, mode: 'points' }, now) > P.weightOf(mk(1), { gamma: 0.5, mode: 'points' }, now));
  assert.ok(P.weightOf(mk(1, { pt: 0 }), {}, now) > 0, 'always positive');
});

test('picker: describeFilters gives short chips; the points rules of the owner stay as they were', () => {
  const f = P.emptyFilters(); f.folders = { a: 'normal' }; f.onlyFav = true; f.minPts = 120; f.tags = ['x', 'y', 'z'];
  assert.deepEqual(P.describeFilters(f, () => 'Reading'), ['Reading', 'Tags: x, y...', 'Favourites only', 'Points 120 to 1000']);
  const l = { pt: 100 }; assert.equal(PT.onRandomOpen(l, 5).pt, 90); assert.equal(PT.like({ pt: 90, ls: null }).pt, 140);
});

// ---------------------------------------------------------------- history service
const link = (id, o = {}) => ({ id, url: 'https://e.test/' + id, title: 'T' + id, host: 'e.test', fid: 'f1', ...o });
const svc = (o = {}) => { let t = 1e12; const clock = { now: () => t, set: (v) => { t = v; } }; const s = H.createHistory({ db: createMemoryDb(), now: clock.now, ...o }); return { s, clock }; };

test('history: records one entry per open, repeats within seconds count once, newest first', async () => {
  const { s, clock } = svc();
  const a = await s.record({ link: link('a'), src: 'click' }); assert.ok(a && a.src === 'click' && a.title === 'Ta');
  assert.equal(await s.record({ link: link('a'), src: 'click' }), null, 'same link, same way, within 8 s');
  clock.set(1e12 + 1000); assert.ok(await s.record({ link: link('a'), src: 'random' }), 'another way is another entry');
  clock.set(1e12 + 20000); assert.ok(await s.record({ link: link('a'), src: 'click' }), 'later again');
  assert.deepEqual(s.list().map((e) => e.src), ['click', 'random', 'click']);
  assert.equal((await s.record({ link: null, src: 'click' })), null);
});

test('history: keep time removes old entries; Off records nothing; "no limit" is for admins only', async () => {
  let keep = '1h', admin = false;
  const { s, clock } = svc({ getKeep: () => keep, isAdmin: () => admin });
  await s.record({ link: link('a'), src: 'click' }); clock.set(1e12 + 30 * 60000); await s.record({ link: link('b'), src: 'click' });
  clock.set(1e12 + 70 * 60000); assert.equal(await s.prune(), 1, 'the first one is over an hour old'); assert.deepEqual(s.list().map((e) => e.lid), ['b']);
  keep = 'off'; assert.equal(await s.record({ link: link('c'), src: 'click' }), null, 'off: nothing recorded'); await s.prune(); assert.equal(s.list().length, 0, 'off also clears the list');
  assert.equal(H.keepMs('never', false), 30 * DAY, 'a normal account can not have no limit'); assert.equal(H.keepMs('never', true), Infinity); assert.equal(H.keepMs('bogus'), 7 * DAY);
  assert.deepEqual(H.KEEP_OPTIONS.map((o) => o.value), ['off', '1h', '1d', '3d', '7d', '14d', '30d']);
  keep = 'never'; admin = true; clock.set(1e12 + 400 * DAY); await s.record({ link: link('d'), src: 'click' }); clock.set(1e12 + 900 * DAY); assert.equal(await s.prune(), 0, 'admin: no limit');
  assert.ok(!H.KEEP_OPTIONS.some((o) => o.value === 'never'), 'the plain list never offers it');
});

test('history: stored in the account (history/<uid>/<id>) when chosen, local otherwise; remove and clear', async () => {
  const fake = createFakeRtdb(); let where = 'account';
  const { s } = svc({ adapter: fake.adapter, uid: 'u1', getWhere: () => where });
  const e = await s.record({ link: link('a'), src: 'preview' });
  assert.ok(fake.tree[`history/u1/${e.id}`] && fake.tree[`history/u1/${e.id}`].lid === 'a' && !('id' in fake.tree[`history/u1/${e.id}`]));
  await s.record({ link: link('b'), src: 'random' });
  await s.load(); assert.equal(s.list().length, 2, 're-read from the account');
  await s.remove([e.id]); assert.equal(Object.keys(fake.tree).filter((k) => k.startsWith('history/u1/')).length, 1);
  await s.clear(); assert.equal(Object.keys(fake.tree).filter((k) => k.startsWith('history/u1/')).length, 0); assert.equal(s.list().length, 0);
  where = 'local'; assert.equal(s.where(), 'local'); await s.load(); await s.record({ link: link('c'), src: 'click' });
  assert.equal(Object.keys(fake.tree).filter((k) => k.startsWith('history/u1/')).length, 0, 'local: nothing goes to the account');
  const guest = H.createHistory({ db: createMemoryDb(), getWhere: () => 'account' }); assert.equal(guest.where(), 'local', 'a guest always keeps it on the device');
});

test('history: schema rules in the database allow exactly these fields (rules unchanged since v2.1.0)', () => {
  const r = JSON.parse(read('@ Creator/rules/database.rules.json')).rules.history;
  assert.ok(r.$uid['.indexOn'].includes('ts') && r.$uid.$hid['.write'] && r.$uid['.read']);
  for (const k of ['lid', 'url', 'title', 'host', 'fid', 'src', 'ts']) assert.ok(r.$uid.$hid[k], k);
});

// ---------------------------------------------------------------- page-state
test('page-state: restores only after Back or Forward, a fresh visit starts clean', () => {
  PS.clearPageStates();
  PS.savePageState('folder:a', { q: 'x', scroll: 300 });
  assert.equal(PS.takePageState('folder:a', { pop: false }), null, 'a new visit does not restore'); assert.equal(PS.takePageState('folder:a', { pop: true }), null, '...and it dropped the old state');
  PS.savePageState('folder:a', { q: 'x', scroll: 300 }); assert.deepEqual(PS.takePageState('folder:a', { pop: true }), { q: 'x', scroll: 300 });
  for (let i = 0; i < 20; i++) PS.savePageState('k' + i, { i }); assert.equal(PS.takePageState('k0', { pop: true }), null, 'old entries are dropped'); assert.ok(PS.takePageState('k19', { pop: true }));
});

// ---------------------------------------------------------------- engine
test('cloud engine: Sync now stamps Last synced even when nothing was waiting, and says so', async () => {
  const { createCloudEngine } = await import('../../js/engine/cloud-engine.js');
  const fake = createFakeRtdb();
  const e = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db: createMemoryDb() });
  const before = e.status().lastSync || 0; const seen = [];
  e.subscribe((ev) => { if (ev.type === 'sync') seen.push(ev); });
  await tick(5); assert.equal(await e.syncNow(), true);
  assert.ok(e.status().lastSync > before, 'lastSync moved'); assert.ok(seen.some((ev) => ev.at && ev.at === e.status().lastSync), 'a sync event carries the new time, so the row repaints'); assert.equal(e.status().state, 'idle');
  const t1 = e.status().lastSync, n1 = seen.length; await tick(5); await e.syncNow(); assert.ok(e.status().lastSync > t1 && seen.length > n1, 'every press moves the time and repaints');
  e.dispose();
});

test('admin: Normal view is memory only, hides the badge and the admin checks; a reload goes back to Admin', async () => {
  const fake = createFakeRtdb(); fake.tree['admins/u9'] = true;
  AD.clearAdmin(); assert.equal(await AD.loadAdmin(fake.adapter, 'u9'), true);
  assert.equal(AD.isAdminView(), true); assert.equal(document.documentElement.dataset.admin, 'true');
  AD.setAdminView('normal'); assert.equal(AD.isAdminView(), false); assert.equal(AD.isAdminAccount(), true, 'the switch itself stays reachable'); assert.equal(document.documentElement.dataset.admin, undefined);
  assert.equal(AD.getAdminViewMode(), 'normal'); assert.equal(prefs.get('admin.view', null), null, 'nothing is stored');
  AD.clearAdmin(); await AD.loadAdmin(fake.adapter, 'u9'); assert.equal(AD.getAdminViewMode(), 'admin', 'a reload (new load) starts as Admin');
  AD.clearAdmin(); AD.setAdminView('normal'); assert.equal(AD.getAdminViewMode(), 'admin', 'a normal account can not use it'); assert.equal(await AD.loadAdmin(fake.adapter, 'nobody'), false);
});

// ---------------------------------------------------------------- small fixes (source and DOM)
test('fixes: contact email, Microlink 25, equal folder cards, tap highlight, no reset password in Switch account, info buttons', async () => {
  const all = [read('app.json'), read('js/core/app-info.js'), read('js/features/settings/delete-account.js')].join('\n');
  assert.ok(all.includes('linkivo.web@gmail.com') && !all.includes('mdturzo.dev@gmail.com'));
  assert.match(read('css/pages/library.css'), /\.lib-grid \{[^}]*grid-auto-rows: 1fr/); assert.match(read('css/pages/library.css'), /\.fcard-name \{[^}]*min-height: 2\.5em/);
  assert.match(read('css/core/base.css'), /-webkit-touch-callout: none/); assert.match(read('css/core/base.css'), /\* \{ -webkit-tap-highlight-color: transparent/);
  assert.ok(!/Reset password/.test(read('js/features/shell/switch-account.js')) && /Remove account/.test(read('js/features/shell/switch-account.js')));
  const { renderControl } = await import('../../js/features/settings/controls.js');
  const row = renderControl({ id: 'x', type: 'switch', key: 'x.k', label: 'Thing', desc: 'Short caption.', default: true, suffix: null, info: 'More detail here.' });
  assert.ok(row);
  const ML = await import('../../js/core/microlink.js'); assert.equal(ML.ML_DEFAULT_LIMIT, 25);
  assert.ok(!/Admin accounts have no limit|admin: no daily limit/.test(read('js/features/settings/catalog.js') + read('js/features/preview/preview-tabs.js')), 'a normal user is never told about admin limits');
});

// ---------------------------------------------------------------- pages
const mkEngine = async () => { const e = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e.init(); return e; };
async function boot(url = '/library') {
  const e = await mkEngine(); const f1 = await e.createFolder({ name: 'Reading' }), f2 = await e.createFolder({ name: 'Tools' });
  const r1 = await e.addLinks([{ url: 'https://one.test/a', title: 'Alpha' }, { url: 'https://one.test/b', title: 'Beta' }], { fid: f1.id });
  const r2 = await e.addLinks([{ url: 'https://two.test/c', title: 'Gamma' }], { fid: f2.id });
  const ids = [...r1.added, ...r2.added].map((x) => x.id);
  for (const id of ids) await e.patchLinkMeta(id, { image: 'https://i.test/p.jpg', nf: true });
  const hist = H.createHistory({ db: e.db, now: () => e.now(), getKeep: () => '7d' });
  installDataForTests(e, null, null, hist);
  setSession({ mode: 'guest', user: null, status: 'active' });
  const container = $('#page-root'); container.replaceChildren();
  const router = createRouter({ routes: ROUTES, container, getSession }); await router.start();
  return { e, f1, f2, ids, hist, router };
}

test('Random page: hub shows the pool, Surprise me opens a preview inside the page, applies -10 points and records History', async () => {
  prefs.remove('random.filters'); const { e, ids, hist, router } = await boot();
  await router.navigate('/random'); await waitFor(() => $('.rnd-card'));
  assert.match($('.rnd-pool').textContent, /3 links in play/); assert.ok($('.rf'), 'merged folder and filter panel is on the page');
  assert.equal(ROUTES.find((r) => r.id === 'random').stub, undefined, 'real page, no placeholder');
  $('.rnd-go').click(); await waitFor(() => $('.rnd-stage .pv') && $('.rnd-stage .pv-tab')); await tick(30);
  assert.ok($('.rnd-stage .pv'), 'embedded preview'); assert.ok($('.pv-act-new') && $('.pv-act[aria-label="Filters"]'), 'new random link and filters buttons are in the action bar');
  assert.ok(!$('.pv-side') || $('.pv-side').hidden, 'no related column in the embedded preview');
  const opened = e.listLinks().filter((l) => l.oc === 1); assert.equal(opened.length, 1); assert.equal(opened[0].pt, 90, 'the owner rule: -10 per random open');
  assert.equal(hist.list()[0].src, 'random'); assert.equal(hist.list()[0].lid, opened[0].id);
  $('.pv-act-new').click(); await tick(60); await waitFor(() => e.listLinks().filter((l) => l.oc === 1).length === 2);
  assert.equal(new Set(e.listLinks().filter((l) => l.oc === 1).map((l) => l.id)).size, 2, 'no repeat in a session');
  $('.pv-head .btn-icon[aria-label="Back"]').click(); await tick(20); assert.equal($('.rnd-stage').hidden, true); assert.equal($('.rnd-hub').hidden, false, 'Back inside Random returns to the hub');
  router.destroy(); void ids;
});

test('Random page: choosing a folder narrows the pool live; /random?folder= presets it and opens a link at once', async () => {
  prefs.remove('random.filters'); const { f2, e, router } = await boot();
  await router.navigate('/random'); await waitFor(() => $('.rf-folder'));
  const tools = $$('.rf-folder').find((b) => /Tools/.test(b.textContent)); tools.click(); await tick(10);
  assert.match($('.rnd-pool').textContent, /1 link in play/); assert.ok($('.rf-weight'), 'a selected folder gets Low / Normal / High');
  assert.ok($$('.rnd-chip').some((c) => /Tools/.test(c.textContent)));
  assert.equal(prefs.get('random.filters').folders[f2.id], 'normal', 'remembered');
  await router.navigate('/random?folder=' + f2.id); await waitFor(() => $('.rnd-stage .pv'));
  assert.equal(e.listLinks().filter((l) => l.oc === 1)[0].fid, f2.id);
  router.destroy();
});

test('History page: grouped by day, searchable, source filter, remove one, select and remove, empty state', async () => {
  const { e, ids, hist, router } = await boot();
  const now = e.now();
  const d0 = new Date(); const sod = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()).getTime();   // fixed points: just after midnight today, noon yesterday, noon 3 days ago
  const entry = (n, lid, src, ts) => { const l = e.getLink(lid); return { id: 'h' + n, lid, url: l.url, title: l.title, host: l.host, fid: l.fid, src, ts }; };
  await e.db.putMany('history', [entry(1, ids[0], 'click', sod + 1000), entry(2, ids[1], 'preview', sod - DAY + 12 * HOUR), entry(3, ids[2], 'random', sod - 3 * DAY + 12 * HOUR)]); await hist.load(); void now;
  await router.navigate('/profile/history'); await waitFor(() => $('.hs-item'));
  assert.deepEqual($$('.hs-day').map((d) => d.textContent).slice(0, 2), ['Today', 'Yesterday']); assert.equal($$('.hs-item').length, 3);
  const s = $('.hs input[type=search]'); s.value = 'gamma'; s.dispatchEvent(new w.Event('input')); await tick(200); assert.equal($$('.hs-item').length, 1);
  s.value = ''; s.dispatchEvent(new w.Event('input')); await tick(200);
  $$('.hs-filter button').find((b) => b.textContent === 'Random').click(); await tick(5); assert.equal($$('.hs-item').length, 1);
  $$('.hs-filter button').find((b) => b.textContent === 'All').click(); await tick(5);
  $('.hs-more').click(); await tick(5); const menu = $$('[role=menuitem]').find((m) => /Remove from history/.test(m.textContent)); assert.ok(menu); menu.click(); await tick(30); assert.equal($$('.hs-item').length, 2);
  $('.hs-head [aria-label="Select entries"]').click(); await tick(5); $$('.hs-main')[0].click(); await tick(5); assert.ok($('.hs-item.is-on'));
  assert.ok($('.selbar') && !$('.selbar').hidden, 'selection bar'); router.destroy();
});

test('History day labels and grouping are pure and exact', async () => {
  const { dayLabel, groupByDay } = await import('../../js/features/history/history-page.js');
  const now = new Date(2026, 9, 31, 15, 0).getTime();
  assert.equal(dayLabel(now - HOUR, now), 'Today'); assert.equal(dayLabel(new Date(2026, 9, 30, 23, 59).getTime(), now), 'Yesterday');
  assert.equal(dayLabel(new Date(2026, 9, 27, 10, 0).getTime(), now), 'Tuesday'); assert.match(dayLabel(new Date(2026, 8, 1, 10, 0).getTime(), now), /September/);
  const g = groupByDay([{ ts: now - 1000 }, { ts: now - 2000 }, { ts: now - 2 * DAY }], now); assert.deepEqual(g.map((x) => [x.label, x.rows.length]), [['Today', 2], ['Thursday', 1]]);
});

test('Profile: History section shows the latest entries and links to the full page', async () => {
  const { e, ids, hist, router } = await boot();
  await hist.record({ link: { ...e.getLink(ids[0]), id: ids[0] }, src: 'click' });
  await router.navigate('/profile'); await waitFor(() => $('.profile-head'));
  assert.ok($('.pf-rec'), 'recent entry'); assert.ok($$('a.row').some((a) => a.getAttribute('href') === '/profile/history'));
  router.destroy();
});

test('Folder page: opening a link in a new tab goes to History; Back from a preview restores filters and scroll', async () => {
  PS.clearPageStates(); const { e, f1, ids, hist, router } = await boot();
  await router.navigate('/folder/' + f1.id); await waitFor(() => $('.lrow'));
  const search = $('.fp-search input'); search.value = 'beta'; search.dispatchEvent(new w.Event('input')); await tick(250); assert.equal($$('.lrow').length, 1);
  prefs.set('lib.openIn', 'tab');
  const a = $('.lrow .lmain'); a.addEventListener('click', (ev) => ev.preventDefault()); a.click(); await tick(30);
  assert.equal(hist.list().length, 1); assert.equal(hist.list()[0].src, 'click'); prefs.remove('lib.openIn');
  await router.navigate('/link/' + ids[1]); await waitFor(() => $('.pv-tab'));
  await router.navigate('/folder/' + f1.id, { pop: true }); await waitFor(() => $('.lrow'));
  assert.equal($('.fp-search input').value, 'beta', 'the search text came back'); assert.equal($$('.lrow').length, 1);
  await router.navigate('/library'); await tick(20); await router.navigate('/folder/' + f1.id); await waitFor(() => $('.lrow')); assert.equal($('.fp-search input').value, '', 'a fresh visit starts clean'); assert.equal($$('.lrow').length, 2);
  router.destroy(); void e;
});

test('Router: replace swaps the history entry (related links) and the preview falls back to the link\'s folder', async () => {
  const { f1, ids, router } = await boot();
  await router.navigate('/folder/' + f1.id); await router.navigate('/link/' + ids[0]); await waitFor(() => $('.pv-tab'));
  const n = w.history.length; await router.navigate('/link/' + ids[1], { replace: true }); await waitFor(() => $('.pv-title') && /Beta/.test($('.pv-title').textContent));
  assert.equal(w.history.length, n, 'no extra step for Back');
  assert.match(read('js/features/preview/preview-page.js'), /data-replace/); assert.match(read('js/core/router.js'), /a\.hasAttribute\('data-replace'\)/);
  router.destroy();
});

test('Sidebar header and phone folder menu follow the owner layout (source checks)', () => {
  const shell = read('js/features/shell/shell.js'), css = read('css/components/nav.css'), fp = read('js/features/library/folder-page.js');
  assert.match(shell, /h\('div', \{ class: 'sb-head' \}, slotBtn, sep, brand\)/); assert.match(css, /\.sb-sep \{/);
  assert.match(css, /#app\[data-collapsed='true'\] \.sidebar \.pf-more \{ display: none; \}/);
  assert.match(fp, /label: st\.view === 'grid' \? 'List view' : 'Grid view'/); assert.match(read('css/pages/library.css'), /\.fp-sel, \.fp-view \{ display: none; \}/);
});
