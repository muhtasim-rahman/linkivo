// Linkivo v2.5.6: tests for the owner's list (pull-and-hold reload, thin Random card, server default settings, red unlock-all step, vault page data, purge signal, README).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupDom, tick } from './helpers/dom-env.mjs';
import { createRulesEngine } from './helpers/rules-eval.mjs';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';

setupDom('http://localhost/random');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = new URL('../../', import.meta.url);
const imp = (p) => import(new URL(p, root));
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------ 1. pull and hold (reload)
const { holdState, FULL, SLACK, HOLD_MS, initPullRefresh } = await imp('js/ui/pull-refresh.js');
const touch = (el, type, y, x = 100) => { const e = new window.Event(type, { bubbles: true }); e.touches = type === 'touchend' ? [] : [{ clientY: y, clientX: x }]; el.dispatchEvent(e); };

test('hold rule: starts at the full pull, is cancelled by a small raise, finishes after 5 seconds', () => {
  assert.equal(HOLD_MS, 5000);
  assert.deepEqual(holdState({ pull: FULL - 1 }), { holding: false, progress: 0, done: false }, 'not pulled all the way: nothing starts');
  assert.deepEqual(holdState({ pull: FULL }), { holding: true, progress: 0, done: false }, 'full pull starts it');
  assert.equal(holdState({ pull: FULL, holding: true, elapsed: 2500 }).progress, 0.5);
  assert.equal(holdState({ pull: FULL - SLACK, holding: true, elapsed: 1000 }).holding, true, 'a tiny wobble inside the slack keeps it');
  assert.deepEqual(holdState({ pull: FULL - SLACK - 1, holding: true, elapsed: 1000 }), { holding: false, progress: 0, done: false }, 'a small raise cancels it');
  assert.equal(holdState({ pull: FULL, holding: true, elapsed: HOLD_MS }).done, true);
  assert.equal(holdState({ pull: FULL, holding: true, elapsed: HOLD_MS * 9 }).progress, 1, 'progress never passes 1');
});

test('pull and hold: letting go before 5 seconds is the normal refresh, after 5 seconds it reloads', async () => {
  const realNow = Date.now; let t = 1_000_000; Date.now = () => t;
  try {
    const scroller = document.createElement('div'); document.body.appendChild(scroller);
    let refresh = 0, reload = 0;
    const destroy = initPullRefresh({ scroller, enabled: () => true, onRefresh: async () => { refresh++; }, onReload: () => { reload++; } });
    const chip = [...document.querySelectorAll('.ptr')].pop();
    // a) full pull, let go at once
    touch(scroller, 'touchstart', 50); touch(scroller, 'touchmove', 600);
    assert.ok(chip.classList.contains('is-holding'), 'the second ring shows once the pull is full');
    touch(scroller, 'touchend', 600); await tick(5);
    assert.equal(refresh, 1); assert.equal(reload, 0); assert.ok(!chip.classList.contains('is-holding'));
    await tick(40);
    // b) full pull, hold 5 seconds, let go: reload (and no ordinary refresh)
    touch(scroller, 'touchstart', 50); touch(scroller, 'touchmove', 600);
    t += 2600; await sleepMs(120); assert.ok(parseFloat(chip.style.getPropertyValue('--h')) > 0.4 && !chip.classList.contains('is-holdready'), 'the ring fills while held');
    t += 2600; await sleepMs(120); assert.ok(chip.classList.contains('is-holdready'), 'ready: let go now to reload');
    touch(scroller, 'touchend', 600); await tick(5);
    assert.equal(reload, 1); assert.equal(refresh, 1, 'no refresh on top of the reload');
    destroy();
  } finally { Date.now = realNow; }
});

test('pull and hold: raising the finger a little cancels the countdown, even after 5 seconds', async () => {
  const realNow = Date.now; let t = 2_000_000; Date.now = () => t;
  try {
    const scroller = document.createElement('div'); document.body.appendChild(scroller);
    let reload = 0; const destroy = initPullRefresh({ scroller, enabled: () => true, onRefresh: async () => {}, onReload: () => { reload++; } });
    const chip = [...document.querySelectorAll('.ptr')].pop();
    touch(scroller, 'touchstart', 50); touch(scroller, 'touchmove', 600); assert.ok(chip.classList.contains('is-holding'));
    touch(scroller, 'touchmove', 230);                                   // lifted: pull about 90, below FULL - SLACK (102)
    assert.ok(!chip.classList.contains('is-holding'), 'the ring is gone');
    t += 6000; await sleepMs(120); touch(scroller, 'touchend', 230); await tick(5);
    assert.equal(reload, 0, 'no reload');
    destroy();
  } finally { Date.now = realNow; }
});

// ------------------------------------------------ 2. the thin Random card
const { miniShouldShow, createMiniCard, MINI_SLACK } = await imp('js/features/random/mini-card.js');
test('thin card rule: shown only after the big card is above the top edge and the hub is on screen', () => {
  assert.equal(miniShouldShow({ cardBottom: 300, rootTop: 0 }), false, 'card still visible');
  assert.equal(miniShouldShow({ cardBottom: MINI_SLACK, rootTop: 0 }), false, 'exactly at the edge');
  assert.equal(miniShouldShow({ cardBottom: -10, rootTop: 0 }), true, 'scrolled past');
  assert.equal(miniShouldShow({ cardBottom: -10, rootTop: 0, hubHidden: true }), false, 'a link is playing: the hub is hidden');
});
test('thin card: slides in on scroll, slides out when the card is back, can not be focused while hidden', async () => {
  const scroller = document.createElement('div'), card = document.createElement('div'), hub = document.createElement('div');
  let top = 100, went = 0; card.getBoundingClientRect = () => ({ bottom: top + 200 }); scroller.getBoundingClientRect = () => ({ top: 0 });
  document.body.append(scroller, card, hub);
  const m = createMiniCard({ scroller, card, hub, onGo: () => { went++; } }); scroller.appendChild(m.el);
  m.paint(1234, 0); assert.match(m.el.textContent, /1,234 links in play/); assert.ok(!m.el.classList.contains('is-on')); assert.ok(m.el.hasAttribute('inert'));
  top = -400; scroller.dispatchEvent(new window.Event('scroll')); await sleepMs(40);
  assert.ok(m.el.classList.contains('is-on')); assert.ok(!m.el.hasAttribute('inert'));
  m.el.querySelector('button').click(); assert.equal(went, 1);
  top = 100; scroller.dispatchEvent(new window.Event('scroll')); await sleepMs(40);
  assert.ok(!m.el.classList.contains('is-on')); assert.ok(m.el.hasAttribute('inert'));
  m.paint(0, 0); assert.equal(m.el.querySelector('button').disabled, true, 'nothing in play: the button is off');
  m.paint(1, 3); assert.match(m.el.textContent, /1 link in play · 3 seen/);
  m.destroy();
});
test('random page wires the thin card and the css hides it on wide screens', () => {
  assert.match(read('js/features/random/random-page.js'), /createMiniCard\(\{ scroller: container/);
  const css = read('css/pages/random.css'); assert.match(css, /\.rnd-minihost \{ display: none; \}/); assert.match(css, /@media \(max-width: 899px\) \{\s*\.rnd-minihost \{ display: block; position: sticky; top: 0;/);
});

// ------------------------------------------------ 3. server default settings
const { prefs } = await imp('js/core/local-prefs.js');
const { cleanDefaults, eligibleEntries, refreshServerDefaults, applyCachedDefaults, DEFAULTS_CACHE } = await imp('js/core/app-defaults.js');
const { CATALOG } = await imp('js/features/settings/catalog.js');
const enc = (k) => k.replace(/[^a-zA-Z0-9_-]/g, '_');
const pick = (type) => eligibleEntries(CATALOG).find((e) => e.type === type);

test('server defaults: only ordinary settings with valid values get through', () => {
  const sw = pick('switch'), seg = pick('seg'); assert.ok(sw && seg);
  const other = seg.options.find((o) => o.value !== seg.default) || seg.options[0];
  const raw = { [enc(sw.key)]: !sw.default, [enc(seg.key)]: other.value, nonsense_key: 'x', [enc('lock.scope')]: 'account' };
  const sec = CATALOG.find((e) => e.section === 'security' && e.key); if (sec) raw[enc(sec.key)] = 'x';
  const out = cleanDefaults(raw, CATALOG);
  assert.equal(out[sw.key], !sw.default); assert.equal(out[seg.key], other.value);
  assert.ok(!('nonsense_key' in out) && !Object.values(out).includes('account')); if (sec) assert.ok(!(sec.key in out), 'security settings can not be set from the server');
  assert.deepEqual(cleanDefaults({ [enc(seg.key)]: 'not-an-option', [enc(sw.key)]: 'true' }, CATALOG), {}, 'a value the setting does not have is ignored (a string is not a switch value)');
  assert.deepEqual(cleanDefaults(null, CATALOG), {}); assert.deepEqual(cleanDefaults([1, 2], CATALOG), {});
  for (const e of eligibleEntries(CATALOG)) assert.ok(!['security', 'account', 'admin', 'danger', 'app', 'advanced'].includes(e.section) && !e.sensitive && !e.admin);
});

test('server defaults: they answer only while nothing is stored; the person own value always wins; has() ignores them', () => {
  const seg = pick('seg'), key = seg.key; prefs.remove(key); prefs.setDefaults({});
  const seen = []; const off = prefs.onChange(key, (v) => seen.push(v));
  const server = seg.options.find((o) => o.value !== seg.default).value;
  assert.deepEqual(prefs.setDefaults({ [key]: server }), [key]); assert.equal(prefs.get(key, seg.default), server); assert.equal(prefs.has(key), false, 'not "stored on this device"'); assert.ok(!prefs.keys('').includes(key));
  assert.deepEqual(seen, [server], 'the page hears about the new default');
  prefs.set(key, seg.default); assert.equal(prefs.get(key, 'x'), seg.default, 'own value wins');
  assert.deepEqual(prefs.setDefaults({ [key]: seg.options[seg.options.length - 1].value }), [], 'a changed default does not touch a setting the person changed');
  assert.equal(prefs.get(key, 'x'), seg.default);
  prefs.remove(key); assert.equal(prefs.get(key, 'x'), seg.options[seg.options.length - 1].value, 'after a reset the owner default applies again');
  off(); prefs.setDefaults({}); prefs.remove(key); prefs.remove(DEFAULTS_CACHE);
});

test('server defaults: refresh reads the public node, cleans, caches and applies; a failure keeps the cache; the cache starts before the first screen', async () => {
  const sw = pick('switch'); prefs.remove(sw.key); prefs.setDefaults({});
  const calls = []; const fetchFn = async (url) => { calls.push(url); return { ok: true, json: async () => ({ [enc(sw.key)]: !sw.default, junk: 1 }) }; };
  const r = await refreshServerDefaults({ catalog: CATALOG, fetchFn });
  assert.deepEqual(r, { ok: true, count: 1 }); assert.match(calls[0], /\/appDefaults\.json$/); assert.ok(!/auth=/.test(calls[0]), 'a plain public read: no token, no secret');
  assert.equal(prefs.get(sw.key, null), !sw.default); assert.deepEqual(prefs.get(DEFAULTS_CACHE), { [sw.key]: !sw.default });
  const bad = await refreshServerDefaults({ catalog: CATALOG, fetchFn: async () => { throw new Error('offline'); } });
  assert.equal(bad.ok, false); assert.equal(prefs.get(sw.key, null), !sw.default, 'still the cached default');
  prefs.setDefaults({}); assert.equal(prefs.get(sw.key, 'none'), 'none'); applyCachedDefaults(); assert.equal(prefs.get(sw.key, 'none'), !sw.default, 'the next start uses the cache');
  prefs.setDefaults({}); prefs.remove(DEFAULTS_CACHE);
  assert.ok(read('js/main.js').indexOf('applyCachedDefaults();') < read('js/main.js').indexOf('applyAppearance();'), 'cached defaults come before the look is applied');
});

// ------------------------------------------------ 4. rules
const rulesJson = JSON.parse(fs.readFileSync(path.join(here, '../rules/database.rules.json'), 'utf8'));
const R = createRulesEngine(rulesJson);
const NOW = 1_800_000_000_000, u1 = { uid: 'u1' }, u2 = { uid: 'u2' };
const as = (auth, data) => ({ auth, now: NOW, data });
const open = { users: { u1: { lockState: { app: true } } }, session: { u1: { app: NOW + 1000 } } };
test('rules: appDefaults is public to read and closed to every client write', () => {
  assert.equal(R.read('appDefaults', as(null, {})), true, 'guests and the login page can read it');
  assert.equal(R.read('appDefaults/ui_theme', as(u1, {})), true);
  for (const who of [null, u1, u2]) for (const v of ['dark', true]) assert.equal(R.write('appDefaults/ui_theme', v, as(who, {})), false, 'nobody writes it from the app');
});
test('rules: purgeEpoch is written only by its own account, with the app lock open, as a sane number', () => {
  const p = 'users/u1/meta/purgeEpoch';
  assert.equal(R.write(p, NOW, as(u1, {})), true, 'lock off');
  assert.equal(R.write(p, NOW, as(u1, open)), true, 'lock on and open');
  assert.equal(R.write(p, NOW, as(u1, { users: { u1: { lockState: { app: true } } } })), false, 'lock on, not unlocked');
  assert.equal(R.write(p, NOW, as(u2, {})), false, 'another account'); assert.equal(R.write(p, NOW, as(null, {})), false, 'signed out');
  assert.equal(R.write(p, 'soon', as(u1, {})), false, 'not a number'); assert.equal(R.write(p, -5, as(u1, {})), false); assert.equal(R.write(p, 1e15, as(u1, {})), false);
  assert.equal(R.write(p, NOW, as(u1, { users: { u1: { profile: { status: 'deleted' } } } })), false, 'a deleted account');
  assert.equal(R.write('users/u1/meta/other', 1, as(u1, {})), false, 'nothing else under meta');
});

// ------------------------------------------------ 5. page data and the purge signal (engine)
const { createCloudEngine } = await imp('js/engine/cloud-engine.js');
const { createMemoryDb } = await imp('js/engine/idb.js');
const noSleep = () => Promise.resolve();
test('purge signal: locking a folder tells a device that was closed to drop the links from its cache (the PWA total count)', async () => {
  const fake = createFakeRtdb(), dbA = createMemoryDb(), dbB = createMemoryDb();
  const A = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db: dbA, sleep: noSleep });
  const f = await A.createFolder({ name: 'Secret' }), g = await A.createFolder({ name: 'Plain' });
  await A.addLinks([{ url: 'https://a.com/1' }, { url: 'https://a.com/2' }], { fid: f.id }); await A.addLinks([{ url: 'https://b.com/x' }], { fid: g.id }); await A.flush();
  let B = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db: dbB, sleep: noSleep }); await sleepMs(30);
  assert.equal(B.counts().links, 3, 'device B has all three links cached');
  await dbB.put('meta', { key: 'repair256', value: 1 });            // B has already had the one-time clean-up: only the new signal can fix it now
  B.dispose();                                                    // B is "closed" (the PWA is not running) while A locks
  await A.lockFolders([f.id]); await A.flush(); await sleepMs(10);
  assert.ok(Number(fake.tree['users/u1/meta/purgeEpoch']) > 0, 'the move wrote the signal');
  assert.equal((await dbB.getAll('links')).length, 3, 'B still has the stale copy at rest');
  B = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db: dbB, sleep: noSleep }); await sleepMs(60);
  assert.equal(B.counts().links, 1, 'after opening, B counts only the link that is still in the library');
  assert.equal((await dbB.getAll('links')).length, 1, 'and its cache is clean');
  assert.equal(A.counts().links, 3, 'device A (vault open) still has them in memory');
});
test('purge signal: the writer does not reconcile for its own signal; one-time repair cleans an old stale cache once and marks itself done', async () => {
  const fake = createFakeRtdb(), dbB = createMemoryDb();
  const A = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db: createMemoryDb(), sleep: noSleep });
  const f = await A.createFolder({ name: 'S' });
  await A.addLinks([{ url: 'https://a.com/1' }], { fid: f.id }); await A.flush();
  let calls = 0; const orig = fake.adapter.shallowKeys; fake.adapter.shallowKeys = async (...a) => { calls++; return orig(...a); };
  await A.lockFolders([f.id]); await sleepMs(30); assert.equal(calls, 0, 'no key list for its own change');
  fake.adapter.shallowKeys = orig;
  // an old cache that still holds the locked folder's records (what v2.5.5 left behind), no signal yet
  await dbB.putMany('folders', [{ id: f.id, name: 'S', ts: 1, up: 1 }]); await dbB.putMany('links', [{ id: 'old1', url: 'https://a.com/1', fid: f.id, ts: 1, up: 1 }]);
  delete fake.tree['users/u1/meta/purgeEpoch'];
  const B = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db: dbB, sleep: noSleep }); await sleepMs(60);
  assert.equal(B.counts().links, 0); assert.equal((await dbB.getAll('links')).length, 0, 'cleaned');
  assert.ok((await dbB.getAll('meta')).some((m) => m.key === 'repair256'), 'marked done');
});

// ------------------------------------------------ 6. red unlock-all step, docs line, settings fade, README
test('turning folder lock off: a red popup replaces the "move every folder out" message, one code entry, no Worker change', () => {
  const src = read('js/features/vault/vault-flows.js');
  assert.match(src, /unlockEverything\(flow, code\)/); assert.match(src, /danger: true/); assert.match(src, /flow\.tone\('danger'\)/); assert.match(src, /Unlock all locked folders\?/);
  assert.equal((src.match(/stagePad\(flow/g) || []).filter(Boolean).length >= 1, true);
  const remove = src.slice(src.indexOf('export async function removeVaultFlow'), src.indexOf('const plural'));
  assert.equal((remove.match(/stagePad\(/g) || []).length, 1, 'the code is typed once');
  assert.match(read('js/features/lock/pin-flow.js'), /tone\(name = null\)/);
  assert.match(read('css/pages/lock.css'), /\.sheet\.is-tone-danger \.btn-danger \{ background: var\(--danger\)/);
});
test('docs timeline line runs through the centre of the number circles; the settings column has no fade', () => {
  const pub = read('css/pages/public.css');
  assert.match(pub, /\.pub-path-list::before \{[^}]*left: calc\(var\(--s2\) \+ 8px \+ 16px - 1px\)/);
  assert.match(pub, /\.pub-path-n \{[^}]*width: 32px/); assert.match(pub, /\.pub-path-list a \{[^}]*gap: var\(--s3\)/);
  assert.doesNotMatch(read('css/pages/settings.css'), /\.set-navwrap::after/);
});
test('README: first picture is the meta thumbnail (same file), the video is a play-button picture, captions are centred', () => {
  const md = read('README.md');
  assert.match(md, /<img src="assets\/social\/og-default\.jpg"/); assert.ok(!md.includes('showcase/hero.webp'));
  assert.match(md, /assets\/promo\/linkivo-intro-play\.jpg/); assert.ok(fs.existsSync(new URL('assets/promo/linkivo-intro-play.jpg', root)));
  const cells = md.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []; assert.equal(cells.length, 8);
  for (const c of cells) assert.match(c, /^<td[^>]*align="center" valign="top"/);
  assert.match(read('index.html'), /og-default\.jpg/, 'the site meta uses the same file');
});
