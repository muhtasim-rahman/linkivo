// Linkivo v2.4.0: pages in jsdom: Random start page, Preview in random mode, History page, Back restores the folder's filters, history hooks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const { Engine } = await import('../../js/engine/engine.js');
const { createMemoryDb } = await import('../../js/engine/idb.js');
const { installDataForTests } = await import('../../js/core/app-data.js');
const { createRouter } = await import('../../js/core/router.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { ROUTES } = await import('../../js/features/shell/routes.js');
const { prefs } = await import('../../js/core/local-prefs.js');
const H = await import('../../js/core/history.js');
const RS = await import('../../js/features/random/random-session.js');
const PMEM = await import('../../js/core/page-memory.js');

const mkEngine = async () => { const e = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e.init(); return e; };
async function seed(e) {
  const f = await e.createFolder({ name: 'Reading' });
  const r = await e.addLinks([{ url: 'https://example.com/a', title: 'Alpha' }, { url: 'https://example.org/b', title: 'Beta' }, { url: 'https://example.net/c', title: 'Gamma' }], { fid: f.id });
  return { f, ids: r.added.map((x) => x.id) };
}
const boot = async (e) => { installDataForTests(e, null); setSession({ mode: 'guest', user: null, status: 'active' }); const container = $('#page-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'page-root' })); container.replaceChildren(); const router = createRouter({ routes: ROUTES, container, getSession }); await router.start(); return { router, container }; };

test('Random page: empty library shows a calm state; with links the panel counts matches and Start opens a random Preview', async () => {
  prefs.set('history.keep', '90d'); RS.resetSeen();
  let e = await mkEngine(); const { router, container } = await boot(e);
  await router.navigate('/random'); await tick(40);
  assert.match(container.textContent, /Nothing to discover yet/);
  e = await mkEngine(); const { ids } = await seed(e); installDataForTests(e, null);
  await router.navigate('/library'); await router.navigate('/random'); await waitFor(() => $('.rp-start'));
  assert.match($('.rp-live').textContent, /3 links match/);
  $('.rp-tg').click(); await tick(10); assert.match($('.rp-live').textContent, /No link matches/, 'Favourites only with no favourite');
  assert.equal($('.rp-start').disabled, true); $('.rp-tg').click(); await tick(10);
  $('.rp-start').click(); await waitFor(() => location.pathname.startsWith('/link/'));
  assert.match(location.search, /random=1/); const lid = decodeURIComponent(location.pathname.split('/')[2]);
  assert.ok(ids.includes(lid)); const l = e.getLink(lid);
  assert.equal(l.pt, 90, 'a random open costs 10 points'); assert.equal(l.oc, 1);
  await waitFor(() => $('.pv-act[aria-label="New random link"]')); assert.ok($('.pv-act[aria-label="Random filters"]'), 'filter icon in random mode');
  assert.equal((await H.list(e)).filter((x) => x.how === 'random').length, 1, 'the random open is in History once');
  $('.pv-act[aria-label="New random link"]').click(); await waitFor(() => decodeURIComponent(location.pathname.split('/')[2]) !== lid);
  assert.equal(RS.session.seen.size, 2, 'no repeat: two different links shown'); router.destroy();
});

test('Preview outside random mode records History; no random icons there', async () => {
  const e = await mkEngine(); const { ids } = await seed(e); const { router } = await boot(e);
  await router.navigate('/link/' + ids[0]); await waitFor(() => $('.pv-tab')); await tick(30);
  assert.equal((await H.list(e)).filter((x) => x.lid === ids[0] && x.how === 'preview').length, 1);
  assert.equal($('.pv-act[aria-label="New random link"]'), null); router.destroy();
});

test('History page: groups, search, an entry opens the Preview', async () => {
  const e = await mkEngine(); const { ids } = await seed(e); const { router, container } = await boot(e);
  await H.record(e, e.getLink(ids[0]), 'click'); await H.record(e, e.getLink(ids[1]), 'preview');
  await router.navigate('/profile/history'); await waitFor(() => $('.hp-row'));
  assert.equal($$('.hp-row').length, 2); assert.match($('.hp-day').textContent, /Today/);
  const s = $('.hp input[type=search]'); s.value = 'beta'; s.dispatchEvent(new window.Event('input')); await tick(200);
  assert.equal($$('.hp-row').length, 1); s.value = ''; s.dispatchEvent(new window.Event('input')); await tick(200);
  $('.hp-row .hp-main').click(); await waitFor(() => location.pathname.startsWith('/link/')); assert.ok(location.pathname.startsWith('/link/'), 'an entry opens the Preview');
  router.destroy();
});

test('Back from the Preview restores the folder search and scroll (ctx.pop); a fresh visit starts clean', async () => {
  PMEM.resetPageMemory();
  const e = await mkEngine(); const { f, ids } = await seed(e); const { router, container } = await boot(e);
  await router.navigate('/folder/' + f.id); await waitFor(() => $('.fp input[type=search]'));
  const s = $('.fp input[type=search]'); s.value = 'beta'; s.dispatchEvent(new window.Event('input')); await tick(250);
  assert.equal($$('.lrow').length, 1);
  await router.navigate('/link/' + ids[1]); await waitFor(() => $('.pv-tab'));
  history.back(); await waitFor(() => location.pathname === '/folder/' + f.id && $('.fp input[type=search]')); await tick(250);
  assert.equal($('.fp input[type=search]').value, 'beta', 'the search came back'); assert.equal($$('.lrow').length, 1, 'and the list is still filtered');
  await router.navigate('/library'); await router.navigate('/folder/' + f.id); await waitFor(() => $('.fp input[type=search]'));
  assert.equal($('.fp input[type=search]').value, '', 'opening the folder afresh starts clean'); router.destroy();
});
