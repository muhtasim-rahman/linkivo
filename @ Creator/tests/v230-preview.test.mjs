// Linkivo v2.3.0: Preview. Pure model (tabs, embeds, log), fetch-once rule, and the page in jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/library');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const M = await import('../../js/features/preview/preview-model.js');
const { Engine } = await import('../../js/engine/engine.js');
const { createMemoryDb } = await import('../../js/engine/idb.js');
const { installDataForTests } = await import('../../js/core/app-data.js');
const { createRouter } = await import('../../js/core/router.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { ROUTES } = await import('../../js/features/shell/routes.js');
const { prefs } = await import('../../js/core/local-prefs.js');
const { ensureMeta } = await import('../../js/features/preview/preview-meta.js');

const mkEngine = async () => { const e = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e.init(); return e; };
async function seed(e) {
  const f = await e.createFolder({ name: 'Reading' });
  const r = await e.addLinks([{ url: 'https://example.com/a', title: 'Alpha' }, { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Clip' }, { url: 'https://example.org/b' }], { fid: f.id });
  return { f, ids: r.added.map((x) => x.id) };
}

test('embedFor: YouTube, Vimeo and video files; channels and plain pages are not videos', () => {
  assert.equal(M.embedFor('https://youtu.be/dQw4w9WgXcQ').src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(M.embedFor('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5').src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(M.embedFor('https://m.youtube.com/shorts/abcdefghijk').kind, 'iframe');
  assert.equal(M.embedFor('https://www.youtube.com/@somechannel'), null);
  assert.equal(M.embedFor('https://vimeo.com/123456789').src, 'https://player.vimeo.com/video/123456789');
  assert.deepEqual(M.embedFor('https://cdn.example.com/v/clip.mp4?x=1'), { kind: 'file', src: 'https://cdn.example.com/v/clip.mp4?x=1' });
  assert.equal(M.embedFor('javascript:alert(1)'), null); assert.equal(M.embedFor('https://example.com/page'), null);
});

test('availableTabs: fixed order, only tabs that can work; a site that refuses framing has no Page tab', () => {
  const l = { url: 'https://example.com/a', host: 'example.com' };
  assert.deepEqual(M.availableTabs(l, null), ['page', 'shot', 'details']);
  assert.deepEqual(M.availableTabs(l, { image: 'https://x.test/i.jpg', nf: true }), ['photo', 'shot', 'details'], 'blocked frame: straight to a working tab');
  assert.deepEqual(M.availableTabs({ url: 'https://youtu.be/dQw4w9WgXcQ' }, { image: 'https://i.test/a.png', frameable: true }), ['page', 'photo', 'shot', 'video', 'details']);
  assert.deepEqual(M.availableTabs({ url: 'ftp://x/y' }, null), ['details']);
  assert.equal(M.frameState({ frameable: true }), true); assert.equal(M.frameState({ nf: true }), false); assert.equal(M.frameState({}), null);
});

test('pickTab: last used, else most used among the available, else the first', () => {
  const a = ['page', 'photo', 'details'];
  assert.equal(M.pickTab(a, 'photo', {}), 'photo'); assert.equal(M.pickTab(a, 'video', { details: 3, photo: 1 }), 'details');
  assert.equal(M.pickTab(a, null, {}), 'page'); assert.equal(M.pickTab([], 'x'), 'details');
});

test('log: packed into one short string and read back; long logs are cut under the 3000 character field', () => {
  const log = [{ engine: 'direct', ok: false, ms: 120, error: 'HTTP 403' }, { engine: 'jina', ok: true, ms: 800 }];
  assert.deepEqual(M.parseLog(M.packLog(log)), [{ engine: 'direct', ok: false, ms: 120, error: 'HTTP 403' }, { engine: 'jina', ok: true, ms: 800, error: '' }]);
  assert.ok(M.packLog(Array.from({ length: 400 }, (_, i) => ({ engine: 'e' + i, ok: true, ms: 5 }))).length < 3000); assert.deepEqual(M.parseLog(''), []);
});

test('detailsRows: leaves out image and video and every empty value', () => {
  const rows = M.detailsRows({ title: 'T', url: 'https://a.test/x', host: 'a.test', ts: 1700000000000 }, { image: 'https://i/x.png', video: 'https://v', site: 'A', checkedAt: 1700000100000, nf: true }, { folder: 'F' });
  const labels = rows.map((r) => r.label); assert.ok(labels.includes('Site name') && labels.includes('Folder'));
  assert.ok(!rows.some((r) => /image|video/i.test(r.label)) && !rows.some((r) => r.value === ''));
  assert.equal(rows.find((r) => r.label === 'Can be shown here').value, 'No, the site refuses');
});

test('ensureMeta: asks once, writes checkedAt, keeps the user title, stores nf; a failed network writes nothing', async () => {
  const e = await mkEngine(); const { ids } = await seed(e); let calls = 0;
  const fetch = async (urls) => { calls++; return new Map(urls.map((u) => [u, { url: u, ok: true, title: 'Fetched title', desc: 'Short', image: 'https://i.test/p.jpg', frameable: false, log: [{ engine: 'direct', ok: true, ms: 40 }] }])); };
  const a = await ensureMeta(e, ids[0], { fetch }); assert.equal(a.ok, true);
  const meta = await e.getLinkMeta(ids[0]); assert.ok(meta.checkedAt); assert.equal(meta.nf, true); assert.equal(meta.image, 'https://i.test/p.jpg'); assert.match(meta.log, /direct/);
  assert.equal(e.getLink(ids[0]).title, 'Fetched title');
  const b = await ensureMeta(e, ids[0], { fetch }); assert.equal(b.cached, true); assert.equal(calls, 1, 'second open does not ask again');
  await e.updateLinks([ids[2]], { title: 'Mine', tEdit: true }); await ensureMeta(e, ids[2], { fetch }); assert.equal(e.getLink(ids[2]).title, 'Mine', 'user title wins (D-079)');
  const bad = await ensureMeta(e, ids[1], { fetch: async () => { throw new Error('offline'); } }); assert.equal(bad.ok, false); assert.equal(await e.getLinkMeta(ids[1]), null, 'retried next time');
  const [x, y] = await Promise.all([ensureMeta(e, ids[1], { fetch }), ensureMeta(e, ids[1], { fetch })]); assert.equal(x, y, 'one request at a time per link');
});

test('Preview page: opens from the cache, shows only the working tabs, remembers the tab, fullscreen and actions work', async () => {
  const e = await mkEngine(); const { ids } = await seed(e); installDataForTests(e, null);
  await e.patchLinkMeta(ids[0], { image: 'https://i.test/p.jpg', nf: true, log: 'direct\t1\t10\t' });
  setSession({ mode: 'guest', user: null, status: 'active' });
  const container = $('#page-root'); container.replaceChildren(); prefs.remove('preview.tab'); prefs.remove('preview.tabUse');
  const router = createRouter({ routes: ROUTES, container, getSession }); await router.start();
  await router.navigate('/link/' + ids[0]); await waitFor(() => $('.pv-tab'));
  assert.deepEqual($$('.pv-tab[data-tab]').map((b) => b.dataset.tab), ['photo', 'shot', 'details'], 'framing refused: no Page tab, Photo first');
  assert.equal($('.pv-tab[aria-selected="true"]').dataset.tab, 'photo'); assert.ok($('.pv-img'));
  assert.equal(document.getElementById('app').dataset.nobar, undefined);   // the shell is not mounted in this test; the route flag is checked below
  assert.equal(ROUTES.find((r) => r.id === 'link').nobar, true);
  $('.pv-tab[data-tab="details"]').click(); await tick(5); assert.ok($('.pv-kv') && $('.pv-log li.is-ok'));
  assert.equal(prefs.get('preview.tab'), 'details', 'tab memory');
  $('.pv-act[aria-label="Favourite"]').click(); await tick(20); assert.equal(e.getLink(ids[0]).fv, true);
  assert.ok($('.pv-act.is-on'), 'bar follows the change');
  $('.pv-head .btn-icon[aria-label="Fullscreen"]').click(); assert.ok($('.pv-stage').classList.contains('is-full'));
  await router.navigate('/link/' + ids[0]); await tick(20);
  assert.equal($('.pv-tab[aria-selected="true"]').dataset.tab, 'details', 'reopens on the last used tab');
  router.destroy();
});

test('Preview page: a missing or deleted link shows a calm message instead of crashing', async () => {
  const e = await mkEngine(); installDataForTests(e, null);
  const container = $('#page-root'); container.replaceChildren();
  const router = createRouter({ routes: ROUTES, container, getSession }); await router.start();
  await router.navigate('/link/nope'); await tick(30);
  assert.match(container.textContent, /not available/); router.destroy();
});

test('link click: opens the Preview by default; Ctrl-click, middle click or the setting "New tab" keep the browser behaviour', async () => {
  const { openInPreview } = await import('../../js/features/library/link-actions.js');
  const nav = []; const router = { navigate: (p) => nav.push(p) }; const ev = (o = {}) => ({ defaultPrevented: false, button: 0, preventDefault() { this.defaultPrevented = true; }, ...o });
  prefs.remove('lib.openIn');
  assert.equal(openInPreview(ev(), { id: 'L1' }, router), true); assert.deepEqual(nav, ['/link/L1']);
  assert.equal(openInPreview(ev({ ctrlKey: true }), { id: 'L1' }, router), false); assert.equal(openInPreview(ev({ button: 1 }), { id: 'L1' }, router), false);
  prefs.set('lib.openIn', 'tab'); assert.equal(openInPreview(ev(), { id: 'L1' }, router), false); prefs.remove('lib.openIn');
});
