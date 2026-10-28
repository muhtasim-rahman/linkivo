// Linkivo v2.3.0: global search. Pure core (ranking, AND of words, history), speed on 5000 links, and the page in jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/library');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = await import('../../js/features/search/search-core.js');
const { Engine } = await import('../../js/engine/engine.js');
const { createMemoryDb } = await import('../../js/engine/idb.js');
const { installDataForTests } = await import('../../js/core/app-data.js');
const { createRouter } = await import('../../js/core/router.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { ROUTES } = await import('../../js/features/shell/routes.js');
const { CATALOG, SECTIONS } = await import('../../js/features/settings/catalog.js');

const L = (id, o) => ({ id, url: `https://${o.host || 'example.com'}/${id}`, host: o.host || 'example.com', ts: 1, up: 1, ...o });

test('links: every word must be found somewhere; title start ranks above address match', () => {
  const idx = S.createIndex();
  const links = [L('a', { title: 'React hooks guide' }), L('b', { title: 'Cooking', tags: 'react,hooks' }), L('c', { title: 'Other', url: 'https://x.test/react' }), L('d', { title: 'Reactive art' })];
  assert.deepEqual(idx.search(links, 'react hooks').map((r) => r.link.id), ['a', 'b'], 'both words needed; phrase in title first');
  assert.equal(idx.search(links, 'react')[0].link.id, 'a'); assert.deepEqual(idx.search(links, 'zzz'), []); assert.deepEqual(idx.search(links, '   '), []);
  assert.equal(idx.search([L('e', { title: 'Caf\u00e9 menu' })], 'cafe').length, 1, 'accents are ignored');
});

test('index follows edits: a changed title is found under the new words only', () => {
  const idx = S.createIndex(); const l = L('a', { title: 'Old name' });
  assert.equal(idx.search([l], 'old').length, 1); const l2 = { ...l, title: 'Fresh name', up: 2 };
  assert.equal(idx.search([l2], 'old').length, 0); assert.equal(idx.search([l2], 'fresh').length, 1);
});

test('speed: 5000 links, first search builds the index, later searches are instant', () => {
  const idx = S.createIndex(); const links = Array.from({ length: 5000 }, (_, i) => L('id' + i, { title: `Article ${i} about topic${i % 50}`, host: `site${i % 40}.com`, tags: i % 7 ? '' : 'seven', desc: 'some description text '.repeat(3) }));
  let t = performance.now(); const first = idx.search(links, 'topic7 article'); const build = performance.now() - t;
  t = performance.now(); for (let i = 0; i < 20; i++) idx.search(links, 'topic' + i); const each = (performance.now() - t) / 20;
  assert.ok(first.length > 0); assert.ok(build < 400, `first search ${build.toFixed(0)} ms`); assert.ok(each < 25, `later searches ${each.toFixed(1)} ms each`);
});

test('folders and settings: by name, label, caption and keywords; sorted by how early the word appears', () => {
  const f = S.searchFolders([{ name: 'Work reading' }, { name: 'Reading list' }, { name: 'Cooking' }], 'read');
  assert.deepEqual(f.map((r) => r.folder.name), ['Reading list', 'Work reading']);
  const s = S.searchSettings(CATALOG, SECTIONS, 'theme'); assert.ok(s.length && s[0].entry.id === 'theme' && s[0].sectionLabel);
  assert.ok(S.searchSettings(CATALOG, SECTIONS, 'clipboard').some((r) => r.entry.id === 'clipboard')); assert.deepEqual(S.searchSettings(CATALOG, SECTIONS, 'qqqq'), []);
});

test('highlightParts builds text parts (no HTML) and survives odd input', () => {
  assert.deepEqual(S.highlightParts('Hello World', ['wor']), [{ text: 'Hello ', hit: false }, { text: 'Wor', hit: true }, { text: 'ld', hit: false }]);
  assert.deepEqual(S.highlightParts('<b>x</b>', []), [{ text: '<b>x</b>', hit: false }]); assert.deepEqual(S.highlightParts('', ['a']), [], 'nothing to draw');
});

test('history: newest first, no duplicates, max 50, remove and clear', () => {
  let data = []; const store = { get: () => data, set: (v) => { data = v; } };
  S.pushHistory(store, 'React'); S.pushHistory(store, 'vue'); S.pushHistory(store, 'react'); assert.deepEqual(S.readHistory(store), ['react', 'vue']);
  S.pushHistory(store, 'a'); assert.equal(S.readHistory(store).length, 2, 'one letter is not saved');
  for (let i = 0; i < 80; i++) S.pushHistory(store, 'query ' + i); assert.equal(S.readHistory(store).length, S.HISTORY_MAX);
  S.removeHistory(store, 'query 79'); assert.ok(!S.readHistory(store).includes('query 79')); S.clearHistory(store); assert.deepEqual(S.readHistory(store), []);
});

test('Search page: categories, See more, history (5 shown), clear on logout, result opens the Preview', async () => {
  const e = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e.init(); installDataForTests(e, null);
  const f = await e.createFolder({ name: 'Theme ideas' });
  await e.addLinks(Array.from({ length: 25 }, (_, i) => ({ url: `https://t${i}.test/p`, title: `Theme post ${i}` })), { fid: f.id });
  setSession({ mode: 'guest', user: null, status: 'active' });
  const { prefs } = await import('../../js/core/local-prefs.js'); prefs.remove('search.history.guest'); prefs.remove('lib.openIn');
  const container = $('#page-root'); container.replaceChildren();
  const router = createRouter({ routes: ROUTES, container, getSession }); await router.start();
  await router.navigate('/search'); await tick(10);
  assert.match(container.textContent, /Search everything/, 'empty state first');
  const input = $('.sp-input'); input.value = 'theme'; input.dispatchEvent(new w.Event('input', { bubbles: true })); await waitFor(() => $('.sp-group'));
  const titles = $$('.sp-h').map((x) => x.firstChild.textContent); assert.deepEqual(titles, ['Pages', 'Settings', 'Folders', 'Links']);
  assert.equal($$('section[aria-label="Links"] .sp-item').length, 8, 'links start with 8'); assert.ok($('mark'), 'matches are marked');
  $('section[aria-label="Links"] .sp-more').click(); await tick(5); assert.equal($$('section[aria-label="Links"] .sp-item').length, 18, 'See more adds 10');
  const first = $('section[aria-label="Links"] .sp-item'); assert.match(first.getAttribute('href'), /^\/link\//);
  first.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); assert.deepEqual(JSON.parse(w.localStorage.getItem('lk:search.history.guest')), ['theme'], 'a tapped result saves the search');
  for (const q of ['aa1', 'bb2', 'cc3', 'dd4', 'ee5', 'ff6']) { const { pushHistory } = S; pushHistory({ get: () => prefs.get('search.history.guest', []), set: (v) => prefs.set('search.history.guest', v) }, q); }
  await router.navigate('/library'); await router.navigate('/search'); await tick(10);
  assert.equal($('.sp-input').value, 'theme', 'Back from a result returns to the same search');
  $('.sp-clear').click(); await tick(5);
  assert.equal($$('.sp-recent').length, 5, 'only 5 recent searches shown'); $('.sp-more').click(); await tick(5); assert.equal($$('.sp-recent').length, 7);
  const { clearSearchHistory } = await import('../../js/features/search/search-store.js'); clearSearchHistory(); assert.deepEqual(prefs.get('search.history.guest', []), []);
  router.destroy();
});
