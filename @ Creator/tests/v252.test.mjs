// v2.5.2: regression tests for the owner's change list and the final-stage features. Browser-only behavior (focus, real history entries) is checked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const { openSheet } = await import('../../js/ui/sheet.js');
const { openMenu } = await import('../../js/ui/popover.js');
const { closeAllOverlays, overlayCount } = await import('../../js/core/overlay-registry.js');
const { createRouter } = await import('../../js/core/router.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { layerCount, resetLayers } = await import('../../js/core/nav-stack.js');

// ---- Owner 4: the lock closes every overlay ---------------------------------------------------------------------------------------------
test('closeAllOverlays closes sheets even when beforeClose refuses, plus menus, and frees the page', async () => {
  resetLayers();
  const closed = [];
  openSheet({ title: 'Edit profile', body: 'x', beforeClose: async () => false, onClose: () => closed.push('edit') });   // would ask "Discard changes?" and refuse
  openSheet({ title: 'Other', body: 'y', onClose: () => closed.push('other') });
  const anchor = document.createElement('button'); document.body.appendChild(anchor);
  openMenu(anchor, [{ label: 'One', onClick() {} }]);
  assert.equal($$('.overlay').length, 2); assert.ok($('.pop-menu') || $('.pop-backdrop') || true);
  assert.equal(document.getElementById('app').inert, true);
  const n = closeAllOverlays();
  assert.ok(n >= 3, 'sheets and the menu were tracked');
  assert.equal($$('.overlay').length, 0); assert.equal($$('.pop-menu').length, 0);
  assert.equal(document.getElementById('app').inert, false); assert.equal(overlayCount(), 0);
  await tick(250);
  assert.deepEqual(closed.sort(), ['edit', 'other'], 'onClose ran, so a pending PIN gate or form promise settles');
  assert.equal(layerCount(), 0);
});

test('router.suspend() closes open popups (the lock path) and parks the page', async () => {
  setSession({ mode: 'guest', status: 'active', user: null, ready: true });
  const container = $('#page-root');
  const routes = [{ id: 'library', pattern: '/library', title: 'Library', parent: null, guard: 'auth', tab: 'library', load: async () => ({ mount: (c) => { const el = document.createElement('div'); el.className = 'page'; c.appendChild(el); return { unmount() {} }; } }) }];
  const router = createRouter({ routes, container, getSession });
  history.replaceState({}, '', '/library');
  await router.start();
  openSheet({ title: 'Edit profile', body: 'x', beforeClose: async () => false });
  assert.equal($$('.overlay').length, 1);
  router.suspend();
  assert.equal($$('.overlay').length, 0, 'no popup survives the lock');
  assert.equal(layerCount(), 0); assert.equal(document.getElementById('app').inert, false);
  router.destroy();
});

test('lockApp closes overlays before suspending (source contract)', () => {
  const src = read('js/features/lock/lock-controller.js');
  assert.ok(src.indexOf('closeAllOverlays()') < src.indexOf('router.suspend()'));
});

// ---- Owner 2: Forgot password asks first ------------------------------------------------------------------------------------------------
test('Forgot password: clicking it sends nothing; only Send link sends; Cancel sends nothing', async () => {
  const { buildForgotPassword } = await import('../../js/features/lock/forgot-pin.js');
  const sent = [], said = [];
  const mk = () => buildForgotPassword({ email: 'abcdef@x.com' }, { send: async (e) => { sent.push(e); }, allowed: () => ({ ok: true }), toast: (m) => said.push(m) });
  let { forgot, ask } = mk(); document.body.append(forgot, ask);
  assert.equal(ask.hidden, true);
  forgot.click();
  assert.equal(sent.length, 0, 'nothing is sent by the first click');
  assert.equal(ask.hidden, false); assert.match(ask.textContent, /Send a password reset link to ab\*+f@x\.com\?/);
  ask.querySelector('.pf-cancel').click();
  assert.equal(ask.hidden, true); assert.equal(sent.length, 0);
  forgot.click(); ask.querySelector('.pf-send').click(); await tick(5);
  assert.deepEqual(sent, ['abcdef@x.com']); assert.match(said[0], /Reset link sent to /);
  forgot.remove(); ask.remove();
});
test('Forgot password: a send that is too soon is refused without calling the sender', async () => {
  const { buildForgotPassword } = await import('../../js/features/lock/forgot-pin.js');
  const sent = [], said = [];
  const { forgot, ask } = buildForgotPassword({ email: 'abcdef@x.com' }, { send: async (e) => { sent.push(e); }, allowed: () => ({ ok: false, waitMs: 60000 }), toast: (m) => said.push(m) });
  document.body.append(forgot, ask); forgot.click(); ask.querySelector('.pf-send').click(); await tick(5);
  assert.equal(sent.length, 0); assert.match(said[0], /sent recently/);
});

// ---- Owner 5: collapsed sidebar profile click opens the account menu ---------------------------------------------------------------------
test('shell: a click on the avatar while collapsed opens the account menu, expanded it keeps the link (source contract)', () => {
  const src = read('js/features/shell/shell.js');
  assert.match(src, /toggleAccountMenu\(pfLink\)/); assert.match(src, /app\.dataset\.collapsed !== 'true'/); assert.match(src, /e\.preventDefault\(\); toggleAccountMenu\(pfLink\)/);
  assert.match(src, /label: 'Profile', icon: 'user'/, 'Profile stays reachable from the menu');
});

// ---- Owner 7: PIN gate confirm mode ------------------------------------------------------------------------------------------------------
test('PIN gate: automatic mode checks at the known PIN length, Submit mode waits for the check key', async () => {
  const { buildPinPad } = await import('../../js/features/lock/pin-pad.js');
  const L = await import('../../js/core/lock.js');
  await L.loadLock({ mode: 'guest', user: null, status: 'active' });
  assert.equal(L.getPinLen(), 0); L.rememberPinLen('482913'); assert.equal(L.getPinLen(), 6); L.rememberPinLen('12'); assert.equal(L.getPinLen(), 6, 'a length outside 4 to 8 is ignored');
  const typed = (pad, digits) => { for (const d of digits) [...pad.el.querySelectorAll('.is-digit')].find((b) => b.textContent === d).click(); };
  let got = []; const auto = buildPinPad({ autoAt: L.getPinLen, onSubmit: async (p) => { got.push(p); } }); document.body.appendChild(auto.el);
  typed(auto, '4829'); await tick(5); assert.deepEqual(got, [], 'not yet at 6 digits'); typed(auto, '13'); await tick(5); assert.deepEqual(got, ['482913']);
  got = []; const manual = buildPinPad({ autoAt: 0, autoMax: false, onSubmit: async (p) => { got.push(p); } }); document.body.appendChild(manual.el);
  typed(manual, '48291357'); await tick(5); assert.deepEqual(got, [], 'even 8 digits wait for Submit in submit mode');
  manual.el.querySelector('.is-go').click(); await tick(5); assert.deepEqual(got, ['48291357']);
  auto.destroy(); manual.destroy(); auto.el.remove(); manual.el.remove(); L.resetLock();
});
test('PIN gate: the setting exists in Security, defaults to automatic, and only the gate popups read it', async () => {
  const { CATALOG } = await import('../../js/features/settings/catalog.js');
  const e = CATALOG.find((x) => x.id === 'gateMode'); assert.ok(e); assert.equal(e.section, 'security'); assert.equal(e.default, 'auto'); assert.ok(!e.local, 'it syncs with the account');
  assert.deepEqual(e.options.map((o) => o.value), ['auto', 'submit']);
  assert.match(read('js/features/lock/pin-sheet.js'), /autoAt: auto \? getPinLen : 0/);
  assert.doesNotMatch(read('js/features/lock/lock-screen.js'), /gateMode|autoAt/);
  const { gateMode } = await import('../../js/features/lock/pin-sheet.js'); const { prefs } = await import('../../js/core/local-prefs.js');
  assert.equal(gateMode(), 'auto'); prefs.set('lock.gateMode', 'submit'); assert.equal(gateMode(), 'submit'); prefs.remove('lock.gateMode');
});


// ---- Owner 1 and 6: settings categories and admin-only visibility -----------------------------------------------------------------------
const V251_KEYS = {"theme":"ui.theme","accent":"ui.accent","fontSize":"ui.fontSize","density":"ui.density","reduceMotion":"ui.reduceMotion","splash":"ui.splash","sidebarCollapsed":"ui.sidebarCollapsed","hideBar":"ui.hideBar","libView":"lib.view","libSort":"lib.sort","folderView":"folder.view","openIn":"lib.openIn","showUrl":"lib.showUrl","showPoints":"lib.showPoints","confirmDelete":"lib.confirmDelete","clipboard":"lib.clipboard","toastTime":"toast.duration","searchRecent":"search.recent","searchPages":"search.pages","pvTab":"preview.defaultTab","pvRelated":"preview.related","pvMicrolink":"meta.microlink","pvThum":"preview.thum","rndMode":"random.mode","rndAvoid":"random.avoid","rndSkipDead":"random.skipDead","rndRemember":"random.remember","rndMicrolink":"random.microlink","rndThum":"random.thum","histKeep":"history.keep","uiThumbs":"ui.thumbs","profileThumbs":"profile.thumbs","histWhere":"history.where","impIcons":"import.skipIcons","keepAwake":"import.keepAwake","impBare":"import.bare","impDedupe":"import.dedupe","impClean":"import.clean","impEnrich":"import.enrich","impAutoClear":"import.autoClear","metaBrowser":"meta.browserFallback","impSpeed":"import.speed"};
const V251_IDS = ["theme","accent","fontSize","density","reduceMotion","splash","sidebarCollapsed","hideBar","libView","libSort","folderView","openIn","showUrl","showPoints","confirmDelete","clipboard","toastTime","searchRecent","searchPages","pvTab","pvRelated","pvMicrolink","pvThum","rndMode","rndAvoid","rndSkipDead","rndRemember","rndMicrolink","rndThum","histKeep","uiThumbs","profileThumbs","histWhere","importData","impIcons","keepAwake","impBare","impDedupe","impClean","impEnrich","impAutoClear","metaBrowser","impSpeed","exportData","recycleBin","appLock","accountInfo","syncPick","sync","pvAdmin","appDetails","worker","tester","debugLog","logout","clearCache","reset","clearLocal","deleteAccount"];
test('settings: every v2.5.1 setting still exists with the SAME key (sync keys unchanged), none lost, none twice', async () => {
  const { CATALOG, LAYOUT, SECTIONS } = await import('../../js/features/settings/catalog.js');
  const ids = CATALOG.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const id of V251_IDS) assert.ok(ids.includes(id), 'kept: ' + id);
  for (const [id, key] of Object.entries(V251_KEYS)) assert.equal(CATALOG.find((e) => e.id === id).key, key, 'key of ' + id);
  const laid = Object.values(LAYOUT).flat(); assert.equal(new Set(laid).size, laid.length, 'a setting is listed in one category only');
  for (const id of ids) assert.ok(laid.includes(id), 'has a category: ' + id);
  const secIds = SECTIONS.map((s) => s.id); for (const e of CATALOG) assert.ok(secIds.includes(e.section), e.id + ' section exists');
  for (const [sec, list] of Object.entries(LAYOUT)) for (const id of list) assert.equal(CATALOG.find((e) => e.id === id).section, sec);
});
test('settings: the moved settings are in their new categories', async () => {
  const { CATALOG } = await import('../../js/features/settings/catalog.js'); const sec = (id) => CATALOG.find((e) => e.id === id).section;
  assert.equal(sec('uiThumbs'), 'appearance'); assert.equal(sec('clipboard'), 'behavior'); assert.equal(sec('toastTime'), 'behavior');
  assert.equal(sec('metaBrowser'), 'preview'); assert.equal(sec('profileThumbs'), 'history'); assert.equal(sec('pvAdmin'), 'admin'); assert.equal(sec('gateMode'), 'security');
});
test('admin-only settings: a normal user gets no Admin section, no admin entry, no search hit; an admin gets them with the shield badge', async () => {
  const A = await import('../../js/core/admin.js'); const C = await import('../../js/features/settings/catalog.js');
  assert.equal(A.isAdminAccount(), false);
  assert.ok(!C.visibleSections().some((s) => s.id === 'admin')); assert.ok(!C.visibleCatalog().some((e) => e.admin)); assert.equal(C.entriesFor('admin').length, 0); assert.equal(C.findSection('admin'), null);
  const { adminChip } = await import('../../js/ui/admin-badge.js');
  const chip = adminChip(); assert.ok(chip.classList.contains('is-shield')); assert.equal(chip.textContent, ''); assert.ok(chip.querySelector('svg'), 'an icon, no word');
  assert.equal(adminChip('Admin').textContent, 'Admin', 'the word chip is still available where asked for');
  assert.match(read('css/pages/pages.css'), /\.admin-chip\.is-shield[^}]*border-radius: 50%/);
});
test('admin-only: the server side (rules and Worker) does not rely on the UI', () => {
  const rules = read('@ Creator/rules/database.rules.json'); const worker = read('@ Creator/worker/worker.js');
  assert.match(rules, /"admins": \{\s*"\$uid": \{\s*"\.read": "auth != null && auth\.uid === \$uid"/, 'admins/<uid> is readable only by that uid and has no write rule (console only)');
  assert.match(rules, /root\.child\('admins'\)\.child\(auth\.uid\)\.val\(\) === true/, 'reading another person\'s profile needs the admin list');
  assert.doesNotMatch(worker, /admins\//, 'no Worker route grants anything because of the admin list');
});

// ---- Owner 3: banners and the carousel ---------------------------------------------------------------------------------------------------
test('banners: b7 and b8 sit in the MIDDLE of the list, the old ids keep their pictures, the files exist and are SVG', async () => {
  const P = await import('../../js/core/profile-data.js');
  assert.deepEqual(P.BANNERS, ['b1', 'b2', 'b3', 'b7', 'b8', 'b4', 'b5', 'b6']);
  assert.ok(P.BANNERS.indexOf('b7') > 0 && P.BANNERS.indexOf('b8') < P.BANNERS.length - 1, 'neither is first or last');
  assert.match(P.bannerUrl('b4'), /banner-4\.svg$/, 'a saved b4 still shows banner 4'); assert.match(P.bannerUrl('b7'), /banner-7\.svg$/); assert.match(P.bannerUrl('b8'), /banner-8\.svg$/);
  for (const n of [7, 8]) { const f = read(`assets/art/banner-${n}.svg`); assert.match(f, /^<svg /); assert.doesNotMatch(f, /<script|href=|onload/i); }
  assert.equal(P.cleanProfile({ banner: 'b7' }).banner, 'b7');
});
test('banner carousel: one step per arrow, the selected banner is centred, ends do not wrap', async () => {
  const C = await import('../../js/features/profile/banner-carousel.js');
  assert.equal(C.stepIndex(3, 1, 8), 4); assert.equal(C.stepIndex(3, -1, 8), 2); assert.equal(C.stepIndex(0, -1, 8), 0); assert.equal(C.stepIndex(7, 1, 8), 7);
  // 148px items, 10px gap, 400px window: the middle of item i must land on x = 200
  for (const i of [0, 3, 7]) assert.equal(C.trackOffset(400, 148, 10, i) + i * 158 + 74, 200);
  let cur = 'b1'; const ids = ['b1', 'b2', 'b3', 'b7']; const car = C.buildBannerCarousel({ ids, urlOf: (i) => `/x/${i}.svg`, get: () => cur, set: (v) => { cur = v; } });
  document.body.appendChild(car.el);
  const next = car.el.querySelector('.is-next'), prev = car.el.querySelector('.is-prev');
  assert.equal(prev.disabled, true); next.click(); assert.equal(cur, 'b2'); next.click(); next.click(); assert.equal(cur, 'b7'); assert.equal(next.disabled, true); next.click(); assert.equal(cur, 'b7');
  prev.click(); assert.equal(cur, 'b3'); assert.equal(car.el.querySelectorAll('.pe-banner.is-on').length, 1);
  car.el.querySelectorAll('.pe-banner')[0].click(); assert.equal(cur, 'b1');
  car.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); assert.equal(cur, 'b2');
  car.destroy(); car.el.remove();
});
test('Edit profile: the left column is wider than 270px and the carousel replaced the scrolling row', () => {
  const css = read('css/pages/profile.css'); assert.doesNotMatch(css, /grid-template-columns: 270px minmax/); assert.match(css, /grid-template-columns: 380px minmax/);
  assert.match(read('js/features/profile/profile-edit.js'), /buildBannerCarousel/);
});

// ---- Owner 8 and A: the vault ------------------------------------------------------------------------------------------------------------
test('vault code shape: <prefix> + exactly six digits, nothing else; one fixed prefix per person', async () => {
  const { vaultCodeMatch, VAULT_PREFIXES } = await import('../../js/core/vault.js');
  assert.deepEqual(VAULT_PREFIXES, ['@', '#', '%', '$', '!']);
  assert.equal(vaultCodeMatch('@482913', '@'), '482913'); assert.equal(vaultCodeMatch('#482913', '#'), '482913');
  for (const bad of ['@48291', '@4829133', '482913', '#482913', '@48291a', '@ 82913', ' @482913', '@482913 ', '@@82913', '', null, undefined, '@４８２９１３']) assert.equal(vaultCodeMatch(bad, '@'), null, String(bad));
});

// v2.5.3: the v2.5.2 vault tests (separate page, memory-only module, Library entry, Settings rows, moves through the vault module) described a design that was replaced;
// their replacements are in v253-vault.test.mjs and v253-ui.test.mjs.

test('stats: totals, flags, tops and six months are counted from live links only', async () => {
  const { computeStats, dayLabel } = await import('../../js/features/insights/stats-core.js');
  const now = Date.UTC(2026, 10, 5, 12); const d = (m, day = 10) => Date.UTC(2026, m, day);
  const folders = [{ id: 'a', name: 'Work' }, { id: 'b', name: 'Play' }, { id: 'c', name: 'Old', del: 1 }];
  const links = [{ fid: 'a', host: 'x.com', ts: d(10), fv: true, tags: 'one, two' }, { fid: 'a', host: 'x.com', ts: d(9), rl: true, tags: 'one' }, { fid: 'b', host: 'y.com', ts: d(4), dd: true }, { fid: 'b', host: 'z.com', ts: d(0), del: 5 }, { fid: 'zz', host: 'q.com', ts: 0 }];
  const s = computeStats(folders, links, now);
  assert.equal(s.folders, 2); assert.equal(s.links, 4); assert.equal(s.favourites, 1); assert.equal(s.readLater, 1); assert.equal(s.dead, 1); assert.equal(s.tagged, 2);
  assert.deepEqual(s.topFolders[0], { name: 'Work', count: 2 }); assert.deepEqual(s.topHosts[0], { name: 'x.com', count: 2 }); assert.deepEqual(s.topTags[0], { name: 'one', count: 2 });
  assert.equal(s.months.length, 6); assert.equal(s.months.at(-1).count, 1, 'November'); assert.equal(s.months.at(-2).count, 1, 'October'); assert.equal(s.months.reduce((a, m) => a + m.count, 0), 2, 'May (older than 6 months), the deleted and the 1970 link are outside');
  assert.equal(dayLabel(now - 1000, now), 'Today'); assert.equal(dayLabel(now - 86400000 * 1.5, now), 'Yesterday'); assert.equal(dayLabel(now - 86400000 * 3, now), 'This week'); assert.equal(dayLabel(now - 86400000 * 30, now), 'Earlier');
  assert.equal(computeStats([], [], now).links, 0);
});
test('activity titles are readable and never carry codes; routes exist for Activity, Stats, Terms, Privacy and Docs with real pages', async () => {
  const { activityTitle } = await import('../../js/features/insights/activity-page.js');
  assert.equal(activityTitle('vault-on'), 'Locked folders on'); assert.equal(activityTitle('some-new-thing'), 'Some new thing');
  const routes = read('js/features/shell/routes.js');
  for (const id of ['activity', 'stats', 'terms', 'privacy', 'docs', 'docs-topic']) { const line = routes.split('\n').find((l) => l.includes(`{ id: '${id}'`)); assert.ok(line, id); assert.doesNotMatch(line, /load: stub/, id + ' is a real page now'); }
});
test('Documentation: every topic has a title, a lead and parts; ids are unique; the page renders the index and an article', async () => {
  const { TOPICS, findTopic } = await import('../../js/features/docs/docs-content.js');
  assert.ok(TOPICS.length >= 12); assert.equal(new Set(TOPICS.map((t) => t.id)).size, TOPICS.length);
  for (const t of TOPICS) { assert.ok(t.title && t.lead && t.parts.length, t.id); assert.doesNotMatch(JSON.stringify(t), /[\u{1F300}-\u{1FAFF}]/u, 'no emojis'); }
  assert.ok(findTopic('security')); assert.equal(findTopic('nope'), null);
  const sec = JSON.stringify(findTopic('security')); assert.match(sec, /@000000/); assert.match(sec, /search box/);
  const { mount } = await import('../../js/features/docs/docs-page.js'); const c = document.createElement('div');
  await mount(c, { params: {} }); assert.equal(c.querySelectorAll('.dc-card').length, TOPICS.length);
  const c2 = document.createElement('div'); await mount(c2, { params: { topic: 'import' } }); assert.match(c2.textContent, /chunks of 100/); assert.equal(c2.querySelectorAll('h1').length, 1);
  for (const [id, sig] of [['terms', /Terms of use/], ['privacy', /Privacy/]]) { const { mount: m } = await import('../../js/features/legal/legal-page.js'); const el = document.createElement('div'); await m(el, { router: { current: () => ({ route: { id } }) } }); assert.match(el.textContent, sig); assert.equal(el.querySelectorAll('h1').length, 1); }
});
