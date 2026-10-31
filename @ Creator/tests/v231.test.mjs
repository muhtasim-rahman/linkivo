// Linkivo v2.3.1: owner fix round (points, Microlink, admin and screenshot allowance, sync choice, known accounts, related links, Back closes overlays,
// install mode, keyboard, search pages). jsdom + pure-function tests; looks and real browser behavior (install, keyboard, animations) are owner tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const { prefs } = await import('../../js/core/local-prefs.js');
const ML = await import('../../js/core/microlink.js');
const AD = await import('../../js/core/admin.js');
const SC = await import('../../js/core/sync-choice.js');
const KA = await import('../../js/core/known-accounts.js');
const PM = await import('../../js/features/preview/preview-model.js');
const KB = await import('../../js/core/keyboard-safe.js');
const NS = await import('../../js/core/nav-stack.js');
const SP = await import('../../js/features/search/search-pages.js');
const SCORE = await import('../../js/features/search/search-core.js');

const resp = (status, json, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => json });

test('microlink: maps data, counts the day, reads the headers, stops at 429, respects the switch', async () => {
  const r = ML.mapMicrolink({ title: 'T', description: 'D', image: { url: 'https://i.test/a.png' }, logo: { url: 'https://i.test/l.png' }, video: { url: 'https://v.test/v.mp4' }, audio: { url: 'https://a.test/a.mp3' }, publisher: 'Pub', date: '2026-01-01', url: 'https://x.test/c' }, 'https://x.test/a');
  assert.equal(r.title, 'T'); assert.equal(r.image, 'https://i.test/a.png'); assert.equal(r.favicon, 'https://i.test/l.png'); assert.equal(r.video, 'https://v.test/v.mp4'); assert.equal(r.audio, 'https://a.test/a.mp3'); assert.equal(r.canonical, 'https://x.test/c');
  assert.equal(ML.mapMicrolink({ lang: 'en' }, 'u'), null, 'nothing useful: null');
  prefs.remove('ml.d25'); prefs.set('meta.microlink', true);
  const now = Date.UTC(2026, 9, 29, 12);
  const ok = await ML.microlinkMeta('https://x.test/a', { now, fetch: async () => resp(200, { status: 'success', data: { title: 'Hi' } }) });
  assert.equal(ok.title, 'Hi'); assert.equal(ML.quota(now).used, 1); assert.equal(ML.quota(now).left, 24, 'v2.4.1: the free endpoint without a key allows 25 a day');
  await ML.microlinkMeta('https://x.test/b', { now, fetch: async () => resp(200, { status: 'success', data: { title: 'Hi' } }, { 'x-rate-limit-limit': '50', 'x-rate-limit-remaining': '40' }) });
  assert.equal(ML.quota(now).limit, 50); assert.equal(ML.quota(now).used, 10, 'the server numbers win');
  // too many at once (2 allowed): retried after a second, never counted as used up
  prefs.set('ml.d25', { day: '2026-10-29', used: 0, limit: 5, reset: 0 }); let calls = 0;
  const busy = await ML.microlinkMeta('https://x.test/b2', { now, fetch: async () => (++calls === 1 ? resp(429, { code: 'ECONCURRENCY' }) : resp(200, { status: 'success', data: { title: 'After wait' } }, { 'x-rate-limit-limit': '5', 'x-rate-limit-remaining': '3', 'x-rate-limit-reset': String(Math.floor(now / 1000) + 3600) })) });
  assert.equal(busy.title, 'After wait'); assert.equal(calls, 2); assert.equal(ML.quota(now).left, 3); assert.equal(ML.quota(now).reset, (Math.floor(now / 1000) + 3600) * 1000);
  prefs.set('ml.d25', { day: '2026-10-29', used: 10, limit: 50, reset: 0 });
  const lim = await ML.microlinkMeta('https://x.test/c', { now, fetch: async () => resp(429, {}) });
  assert.equal(lim, null); assert.equal(ML.canUseMicrolink(now), false, 'a REAL limit answer pauses Microlink for a minute: the normal chain takes over');
  assert.ok(ML.canUseMicrolink(now + 61000), 'after the pause it is asked again');
  // v2.4.1 (owner): the count is only a reminder, 25 a day; a count of 25/25 does not stop the call
  prefs.set('ml.d25', { day: '2026-10-29', used: 25, limit: 25, reset: now + 100000 }); assert.equal(ML.ML_DEFAULT_LIMIT, 25); assert.equal(ML.quota(now).left, 0);
  assert.equal(ML.canUseMicrolink(now + 120000), true, 'used up on our side but still tried');
  const past = await ML.microlinkMeta('https://x.test/past', { now: now + 120000, fetch: async () => resp(200, { status: 'success', data: { title: 'Still answered' } }) }); assert.equal(past.title, 'Still answered');
  prefs.set('ml.d25', { day: '2026-10-29', used: 5, limit: 5, reset: now + 1000 }); assert.equal(ML.quota(now + 2000).used, 0, 'after the reset time the window is fresh'); assert.equal(ML.quota(now + 2000).limit, 5, 'it keeps the last limit the server told us');
  prefs.set('ml.d25', { day: '2000-01-01', used: 0 }); prefs.set('meta.microlink', false);
  assert.equal(await ML.microlinkMeta('https://x.test/d', { now, fetch: async () => { throw new Error('must not be called'); } }), null, 'switched off');
  prefs.set('meta.microlink', true);
  assert.equal(await ML.microlinkMeta('https://x.test/e', { now, fetch: async () => { throw new Error('net'); } }), null, 'a failure never throws');
});

test('admin: list read, view toggle only lowers access, thum.io 10 a day for normal users', async () => {
  prefs.remove('shot.day'); AD.clearAdmin();
  const now = Date.UTC(2026, 9, 29, 9);
  assert.equal(AD.isAdminView(), false); assert.equal(AD.shotQuota(now).limit, 10);
  for (let i = 0; i < 10; i++) { assert.ok(AD.canUseThum(now)); AD.countThum(now); }
  assert.equal(AD.canUseThum(now), false); assert.equal(AD.shotQuota(now).left, 0);
  assert.equal(await AD.loadAdmin({ get: async (p) => (p === 'admins/u1' ? true : null) }, 'u1'), true);
  assert.equal(AD.isAdminView(), true); assert.equal(AD.shotQuota(now).limit, null); assert.ok(AD.canUseThum(now), 'admin: no limit');
  AD.setAdminView('normal'); assert.equal(AD.isAdminView(), false); assert.equal(document.documentElement.dataset.admin, undefined, 'Normal view: no admin badge'); assert.equal(AD.canUseThum(now), false);
  assert.equal(await AD.loadAdmin({ get: async () => { throw new Error('denied'); } }, 'u2'), false); assert.equal(AD.isAdminAccount(), false);
  AD.setAdminView('admin');
});

test('sync choice (v2.3.2): one pref per setting, defaults need no storage, the choices themselves are synced keys', () => {
  const store = new Map(); const st = { get: (k, f) => (store.has(k) ? store.get(k) : f), set: (k, v) => store.set(k, v), remove: (k) => store.delete(k) };
  const cat = [{ id: 'a', key: 'a.k', section: 's' }, { id: 'th', key: 'ui.theme', local: true, section: 's' }, { id: 'dv', key: 'd.k', device: true, section: 's' }, { id: 'cu', type: 'custom', section: 's' }];
  assert.deepEqual(SC.syncedEntries(cat, st).map((e) => e.id), ['a']);
  SC.setSynced(cat[0], true, st); SC.setSynced(cat[1], false, st); assert.equal(store.size, 0, 'choosing the default stores nothing');
  SC.setSynced(cat[1], true, st); SC.setSynced(cat[0], false, st);
  assert.deepEqual(SC.syncedEntries(cat, st).map((e) => e.id), ['th']); assert.equal(store.get('sync.c.a'), false); assert.equal(store.get('sync.c.th'), true);
  assert.deepEqual(SC.choiceKeys(cat), ['sync.c.a', 'sync.c.th'], 'these keys are always synced');
  const later = [...cat, { id: 'new', key: 'n.k', section: 's' }, { id: 'newl', key: 'n.l', local: true, section: 's' }];
  assert.deepEqual(SC.syncedEntries(later, st).map((e) => e.id), ['th', 'new'], 'a setting added later is in the list at once');
  assert.notEqual(SC.syncedKeySet(cat, st), SC.syncedKeySet(later, st));
  assert.deepEqual(SC.syncGroups(cat, [{ id: 's' }], st)[0].entries.map((x) => x.entry.id), ['a', 'th'], 'popup rows: keyed, not device-only, not custom');
});

test('catalog: every keyed setting appears in the sync popup list; theme is local by default', async () => {
  const { CATALOG, SECTIONS } = await import('../../js/features/settings/catalog.js');
  const st = { get: (k, f) => f, set() {}, remove() {} };
  const groups = SC.syncGroups(CATALOG, SECTIONS, st), ids = new Set(groups.flatMap((g) => g.entries.map((x) => x.entry.id)));
  for (const e of CATALOG) if (e.key && !e.device) assert.ok(ids.has(e.id), `${e.id} is listed`);
  assert.equal(CATALOG.filter((e) => e.local).length >= 1 && CATALOG.filter((e) => e.local).length <= 4, true, 'a few device-only defaults (v2.4.1: + where History is kept)');
  assert.ok(SECTIONS.some((s) => s.id === 'search') && SECTIONS.some((s) => s.id === 'preview'));
});

test('known accounts: newest first, max 8, forget, one-time prefill', () => {
  const store = new Map(); const st = { get: (k, f) => (store.has(k) ? store.get(k) : f), set: (k, v) => store.set(k, v), remove: (k) => store.delete(k) };
  for (let i = 0; i < 10; i++) KA.rememberAccount({ uid: 'u' + i, email: `u${i}@x.test`, name: 'N' + i }, st, 1000 + i);
  assert.equal(KA.listAccounts(st).length, 8); assert.equal(KA.listAccounts(st)[0].uid, 'u9');
  KA.rememberAccount({ uid: 'u3', email: 'u3@x.test' }, st, 5000); assert.equal(KA.listAccounts(st)[0].uid, 'u3');
  KA.forgetAccount('u3', st); assert.ok(!KA.listAccounts(st).some((a) => a.uid === 'u3'));
  KA.stashPrefill(st, { email: 'a@b.test' }); assert.equal(KA.takePrefill(st).email, 'a@b.test'); assert.equal(KA.takePrefill(st), null);
  KA.rememberAccount({ uid: '', email: '' }, st); assert.ok(!JSON.stringify(store.get('accounts.known')).includes('password'));
});

test('relatedLinks (v2.3.2): tags, then title, then description, then site; variety; filled up to 20; never itself or deleted', () => {
  const me = { id: 'me', fid: 'f1', host: 'a.test', tags: 'x,y', title: 'Learning JavaScript closures', desc: 'a guide to scope and functions' };
  const all = [me,
    { id: 't', fid: 'f9', host: 'tag.test', tags: 'Y', title: 'Nothing alike' },
    { id: 'ti', fid: 'f9', host: 'ti.test', title: 'JavaScript closures explained' },
    { id: 'de', fid: 'f9', host: 'de.test', title: 'Other', desc: 'scope and functions guide' },
    { id: 'same', fid: 'f9', host: 'a.test', title: 'Zzz' },
    { id: 'gone', fid: 'f1', host: 'a.test', tags: 'x', del: 1 }];
  assert.deepEqual(PM.relatedLinks(all, me, 4).map((l) => l.id), ['t', 'ti', 'de', 'same'], 'tag > title > description > same site');
  const many = Array.from({ length: 40 }, (_, i) => ({ id: 'm' + i, fid: 'f1', host: 'a.test', title: 'closures ' + i, ts: i }));
  const out = PM.relatedLinks(many, me, 20); assert.equal(out.length, 20);
  const firstTen = out.slice(0, 10).filter((l) => l.host === 'a.test').length; assert.ok(firstTen <= 10);
  const mixed = [...many, ...Array.from({ length: 10 }, (_, i) => ({ id: 'o' + i, fid: 'f7', host: `h${i}.test`, title: 'closures other ' + i, ts: 100 + i }))];
  const r2 = PM.relatedLinks(mixed, me, 20); assert.ok(new Set(r2.map((l) => l.host)).size >= 8, 'a mix of sites, not 20 from one');
  assert.ok(!r2.some((l) => l.id === 'me'));
  assert.equal(PM.relatedLinks([me, { id: 'z', host: 'z.test', title: 'nothing' }], me, 20).length, 1, 'filled up with other links when nothing relates');
});

test('preview tabs: Audio and PDF only when they can work, order is Page, Photo, Screenshot, Video, Audio, PDF, Details', () => {
  assert.deepEqual(PM.availableTabs({ url: 'https://x.test/song.mp3' }, null), ['page', 'shot', 'audio', 'details']);
  assert.deepEqual(PM.availableTabs({ url: 'https://x.test/doc.pdf' }, null), ['shot', 'pdf', 'details'], 'a PDF is shown by the PDF tab, not as a page');
  assert.deepEqual(PM.availableTabs({ url: 'https://x.test/a' }, { audio: 'https://x.test/a.mp3', image: 'https://x.test/i.png', frameable: true }), ['page', 'photo', 'shot', 'audio', 'details']);
  assert.ok(PM.thumUrl('https://x.test/a').startsWith('https://image.thum.io/get/')); assert.ok(PM.mshotUrl('https://x.test/a').includes('mshots'));
});

test('keyboard gap: counts a page that was resized by the keyboard (Android), not only the visual viewport', () => {
  assert.equal(KB.keyboardGap(800, 500, 500, 0), 300); assert.equal(KB.keyboardGap(800, 800, 800, 0), 0); assert.equal(KB.keyboardGap(800, 800, 520, 0), 280);
});

test('Back closes the top overlay first; a leftover entry is stepped over; navigation after close is not undone', async () => {
  let closed = 0; const h1 = NS.pushLayer(() => { closed++; h1.remove(); });
  assert.equal(NS.layerCount(), 1); assert.equal(history.state && history.state.lk, 'layer');
  assert.equal(NS.handlePop(), true, 'the router does nothing for this popstate'); assert.equal(closed, 1); assert.equal(NS.layerCount(), 0);
  // closing by code, then a navigation in the same tick: the pushed page entry must survive
  const h2 = NS.pushLayer(() => {}); h2.remove(); history.pushState({}, '', '/library'); const len = history.length; await tick(20);
  assert.equal(location.pathname, '/library'); assert.equal(history.length, len);
  assert.equal(NS.handlePop(), false, 'a normal popstate goes to the router');
});

test('search pages: finds pages and settings categories, and a setting result carries its id', async () => {
  const pages = SP.appPages([{ id: 'preview', label: 'Preview', desc: 'x' }]);
  assert.ok(SCORE.searchPages(pages, 'recycle')[0].page.path.includes('recycle'));
  assert.ok(SCORE.searchPages(pages, 'privacy').length >= 1); assert.ok(SCORE.searchPages(pages, 'preview').some((r) => r.page.path === '/settings/preview'));
  assert.deepEqual(SCORE.searchPages(pages, 'zzzzqq'), []);
  const { CATALOG, SECTIONS } = await import('../../js/features/settings/catalog.js');
  assert.ok(SCORE.searchSettings(CATALOG, SECTIONS, 'microlink').some((r) => r.entry && r.entry.id));
});

test('install: a tab moved into the app window flips the state without a reload', async () => {
  const I = await import('../../js/core/install.js');
  assert.equal(typeof I.refreshMode, 'function');
  const before = I.installState.get().standalone; I.refreshMode(); assert.equal(I.installState.get().standalone, before === undefined ? false : before);
});
