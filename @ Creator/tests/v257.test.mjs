// Linkivo v2.5.7: tests for the owner's list (settings sync fixes, live History, locked-link history stored in the vault, pull-hold hint, preview never refetches, thin Random card trigger).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom } from './helpers/dom-env.mjs';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';
import { createMemoryDb } from '../../js/engine/idb.js';

setupDom('http://localhost/random');
const root = new URL('../../', import.meta.url);
const imp = (p) => import(new URL(p, root));
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------ 1. pull and hold hint
const { holdHint, HOLD_MS } = await imp('js/ui/pull-refresh.js');
test('pull hold hint counts 3, 2, 1 (never more than 3) and then says release', () => {
  assert.equal(HOLD_MS, 3500);
  assert.equal(holdHint(0), 'Hold 3 sec to reload, or release to refresh');
  assert.match(holdHint(0.4), /Hold 3 sec/); assert.match(holdHint(0.6), /Hold 2 sec/); assert.match(holdHint(0.9), /Hold 1 sec/);
  assert.equal(holdHint(1), 'Release to reload');
});
test('the hold setting exists (Behavior, device only, default on) and boot passes it to the gesture', async () => {
  const { CATALOG, LAYOUT } = await imp('js/features/settings/catalog.js');
  const e = CATALOG.find((x) => x.id === 'pullReload'); assert.ok(e); assert.equal(e.key, 'ui.pullReload'); assert.equal(e.default, true); assert.equal(e.local, true); assert.equal(e.section, 'behavior');
  assert.match(read('js/boot.js'), /holdEnabled: \(\) => prefs\.get\('ui\.pullReload', true\) !== false/);
});

// ------------------------------------------------ 2. settings sync
const { createSettingsSync } = await imp('js/core/settings-sync.js');
function fakeStore() {
  const m = new Map(), w = new Map();
  return { get: (k, d = null) => (m.has(k) ? m.get(k) : d), has: (k) => m.has(k), keys: () => [...m.keys()], set(k, v) { m.set(k, v); w.get(k)?.forEach((f) => f(v)); }, remove(k) { m.delete(k); }, onChange(k, f) { if (!w.has(k)) w.set(k, new Set()); w.get(k).add(f); return () => w.get(k).delete(f); } };
}
function fakeAdapter() {
  const a = { writes: [], cb: null, errCb: null, offs: 0, tree: {}, update: async (u) => { a.writes.push(u); }, get: async () => a.tree, watchValue: (p, cb, err) => { a.cb = cb; a.errCb = err; return () => { a.offs++; a.cb = null; }; } };
  return a;
}
test('settings sync: a setting reset on another device is reset here too (it used to come back)', async () => {
  const store = fakeStore(), ad = fakeAdapter(); store.set('ui.theme', 'dark');
  const s = createSettingsSync({ adapter: ad, uid: 'u1', store, keys: ['ui.theme', 'lib.view'] }); s.start();
  ad.cb({ ui_theme: 'dark' });                       // the account has it: now it is "known"
  ad.cb({});                                          // gone from the account: reset elsewhere
  assert.equal(store.has('ui.theme'), false, 'removed here as well');
  s.dispose();
});
test('settings sync: a key the account never had is still a first upload', async () => {
  const store = fakeStore(), ad = fakeAdapter(); store.set('lib.view', 'list');
  const s = createSettingsSync({ adapter: ad, uid: 'u1', store, keys: ['lib.view'] }); s.start(); ad.cb({});
  await s.push(); assert.equal(store.get('lib.view'), 'list'); assert.ok(ad.writes.some((u) => u['users/u1/settings/lib_view'] === 'list'));
  s.dispose();
});
test('settings sync: changes waiting for another account are dropped, the listener is restarted after a cancel, pull() applies the account', async () => {
  const store = fakeStore(); store.set('sync.dirty', { ui_theme: 1 }); store.set('sync.dirty.uid', 'someone-else'); store.set('ui.theme', 'dark');
  const ad = fakeAdapter(); const s = createSettingsSync({ adapter: ad, uid: 'u2', store, keys: ['ui.theme'] }); s.start();
  assert.equal(store.get('sync.dirty', null), null, 'the other account\'s list is gone');
  ad.errCb(new Error('permission_denied')); assert.equal(ad.offs, 1, 'the cancelled listener is released (a new one starts after a delay)');
  ad.tree = { ui_theme: 'light' }; await s.pull(); assert.equal(store.get('ui.theme'), 'light');
  s.dispose();
});
test('Random page options sync although they are not Settings rows; the catalog keeps its six Random defaults', async () => {
  const { EXTRA_SYNC_KEYS } = await imp('js/core/sync-choice.js');
  assert.deepEqual([...EXTRA_SYNC_KEYS], ['random.auto', 'random.gamma', 'random.drift']);
  assert.match(read('js/core/app-data.js'), /\.\.\.EXTRA_SYNC_KEYS/);
});
test('Settings rows, Library, Folder and Random follow pref changes live', () => {
  assert.match(read('js/features/settings/controls.js'), /const follow = /);
  assert.match(read('js/features/library/library-page.js'), /offPrefs/); assert.match(read('js/features/library/folder-page.js'), /offPrefs/); assert.match(read('js/features/random/random-page.js'), /offLive/);
});

// ------------------------------------------------ 3. History: live account list, locked entries stored in the vault
const { createHistory } = await imp('js/core/history.js');
test('history (account): another device\'s open shows up live', async () => {
  const fake = createFakeRtdb(), a = fake.adapter;
  const mk = () => createHistory({ db: createMemoryDb(), adapter: a, uid: 'u1', getKeep: () => '30d', getWhere: () => 'account' });
  const h1 = mk(), h2 = mk(); await h1.load(); await h2.load();
  await h1.record({ link: { id: 'L1', url: 'https://a.com', title: 'A' }, src: 'click' }); await wait();
  assert.deepEqual(h2.list().map((e) => e.lid), ['L1'], 'the second device sees it without a reload');
  h1.dispose(); h2.dispose();
});
test('history: a locked link\'s entry is stored in the vault, leaves memory on lock, returns on open, and moves back on unlock', async () => {
  const fake = createFakeRtdb(), a = fake.adapter;
  const h = createHistory({ db: createMemoryDb(), adapter: a, uid: 'u1', getKeep: () => '30d', getWhere: () => 'account' });
  await h.load();
  const e = await h.record({ link: { id: 'L1', url: 'https://a.com', title: 'A', lk: true }, src: 'click' });
  assert.ok(fake.tree[`vault/u1/history/${e.id}`], 'stored with the link (vault gate)'); assert.equal('lk' in fake.tree[`vault/u1/history/${e.id}`], false);
  assert.equal(Object.keys(fake.tree).some((k) => k.startsWith('history/u1/')), false, 'never in the normal list');
  h.wipeLocked(); assert.equal(h.list().length, 0, 'locked: nothing on screen');
  await h.loadLocked(); assert.deepEqual(h.list().map((x) => x.lid), ['L1'], 'unlocked: it is back');
  assert.equal(await h.restoreLinks(['L1']), 1);
  assert.ok(fake.tree[`history/u1/${e.id}`], 'moved back to the normal list'); assert.equal(`vault/u1/history/${e.id}` in fake.tree, false);
  // lock again: forgetLinks moves it into the vault
  await h.forgetLinks(['L1']); assert.ok(fake.tree[`vault/u1/history/${e.id}`]); assert.equal(`history/u1/${e.id}` in fake.tree, false);
  h.dispose();
});

// ------------------------------------------------ 4. preview, Random card, History page
test('preview: opening a link that was looked up never calls a fetch; only force does', () => {
  assert.match(read('js/features/preview/preview-meta.js'), /if \(!force && looked\) return \{ ok: true, cached: true \}/);
  assert.match(read('js/features/preview/preview-page.js'), /if \(!force && !needsFetch\(link\(\), meta\)\) return;/);
});
test('thin Random card: follows the Surprise button; a missing button never shows it', async () => {
  const { createMiniCard } = await imp('js/features/random/mini-card.js');
  const scroller = document.createElement('div'), card = document.createElement('div'), hub = document.createElement('div');
  const mini = createMiniCard({ scroller, card, hub, onGo() {}, trigger: () => null }); mini.sync();
  assert.equal(mini.el.classList.contains('is-on'), false);
  mini.destroy();
});
test('History page: one small Clear all button and an info button; no summary card', () => {
  const js = read('js/features/history/history-page.js'), css = read('css/pages/history.css');
  assert.match(js, /About clearing history/); assert.equal(/hs-card|clearHead|clearCard/.test(js), false); assert.equal(/\.hs-card \{/.test(css), false);
});
test('profile name sits under the banner and grows downward', () => {
  const css = read('css/pages/profile.css');
  assert.match(css, /\.pf2-id \{[^}]*align-items: flex-start/); assert.match(css, /\.pf2-who \{[^}]*padding-top: 46px/);
});
