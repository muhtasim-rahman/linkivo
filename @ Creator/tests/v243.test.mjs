// Linkivo v2.4.3: Random filter panel (morph, range, favicons, no "null"), keywords as tags, Folder random sort and 100 at a time, pager, admin view, profile data, crop math,
// edit patch, profile page helpers, Worker photo routes, rules, settings and source contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom } from './helpers/dom-env.mjs';

setupDom('http://localhost/profile');
const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

test('range slider maths: the curve is reversible, the ends are exact, the histogram counts every point', async () => {
  const R = await import('../../js/features/random/random-range.js');
  assert.equal(R.valueAt(0), 1); assert.equal(R.valueAt(1), 1000);
  for (const v of [1, 7, 100, 250, 640, 1000]) assert.ok(Math.abs(R.valueAt(R.posOf(v)) - v) <= 1, `round trip ${v}`);
  assert.ok(R.posOf(100) > 0.25 && R.posOf(100) < 0.4, 'the low end has the finer steps');
  const hs = R.histogram([1, 100, 100, 500, 1000], 28); assert.equal(hs.reduce((a, b) => a + b, 0), 5); assert.equal(hs.length, 28);
});

test('range slider: keys and the commit callback', async () => {
  const { buildRange } = await import('../../js/features/random/random-range.js');
  const seen = []; const r = buildRange({ lo: 1, hi: 1000, pointsList: [50, 100], onInput: (a, b) => seen.push(['in', a, b]), onCommit: (a, b) => seen.push(['commit', a, b]) });
  document.body.appendChild(r.el);
  const [ta, tb] = r.el.querySelectorAll('.rg-thumb');
  ta.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); tb.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  tb.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
  assert.deepEqual(seen.at(-1), ['commit', 2, 990]); assert.equal(ta.getAttribute('aria-valuenow'), '2');
  r.set(10, 20); assert.equal(tb.getAttribute('aria-valuenow'), '20');
});

test('morph keeps existing elements (so transitions run), adds new ones with an enter class, removes gone ones', async () => {
  const { morph } = await import('../../js/features/random/random-filters.js');
  const mk = (k, cls, sig = 'a') => { const b = document.createElement('button'); b.dataset.k = k; b.dataset.sig = sig; b.className = cls; return b; };
  const box = document.createElement('div'); morph(box, [mk('a', 'c'), mk('b', 'c')]);
  const a1 = box.children[0]; assert.ok(a1.classList.contains('rf-enter'));
  morph(box, [mk('a', 'c is-on', 'b'), mk('c', 'c')]);
  assert.equal(box.children[0], a1, 'same element'); assert.equal(a1.className, 'c is-on'); assert.equal(box.children.length, 2); assert.equal(box.children[1].dataset.k, 'c');
});

test('Random panel: no "null" text under Sites and Tags, no All folders badge, Select all in the header, round favicons, keywords count as tags', async () => {
  const F = await import('../../js/features/random/random-filters.js');
  const links = [{ id: '1', host: 'a.com', tags: 'x', kw: 'css, web', fid: 'f' }, { id: '2', host: 'b.com', tags: '', kw: 'web', fid: 'f' }];
  assert.deepEqual(F.tagKeys(links[0]), ['x', 'css', 'web']);
  assert.deepEqual(F.rankCounts(links, F.tagKeys)[0], ['web', 2]);
  const folders = [{ id: 'f', name: 'One', lc: 2 }, { id: 'g', name: 'Two', lc: 0 }];
  const engine = { listLinks: () => links, listFolders: () => folders };
  const p = F.buildFilterPanel({ engine, filters: (await import('../../js/engine/picker.js')).emptyFilters(), onChange() {} });
  document.body.appendChild(p.el);
  assert.ok(!p.el.textContent.includes('null'), 'no stray null');
  assert.ok(!p.el.querySelector('.rf-fall'), 'no All folders badge'); assert.ok([...p.el.querySelectorAll('.rf-act')].some((b) => b.textContent === 'Select all'));
  assert.ok(p.el.querySelector('.rf-c .rf-fav'), 'a site chip starts with a favicon'); assert.ok(p.el.querySelector('.rf-range, .rg'), 'the range bar');
  assert.deepEqual([...p.el.querySelectorAll('.rf-sub')].map((n) => n.textContent), ['Show only', 'Point range']);
  [...p.el.querySelectorAll('.rf-act')].find((b) => b.textContent === 'Select all').click();
  assert.equal(p.el.querySelectorAll('.rf-f.is-on').length, 2);
  const picker = await import('../../js/engine/picker.js'); assert.equal(picker.isCandidate(links[1], { ...picker.emptyFilters(), tags: ['css'] }), false); assert.equal(picker.isCandidate(links[0], { ...picker.emptyFilters(), tags: ['css'] }), true);
});

test('Random page source: no Folders and filters title, the dice is a button, options have (i) buttons, the strip floats on wide screens', () => {
  const src = read('js/features/random/random-page.js');
  assert.ok(!src.includes("text: 'Folders and filters'")); assert.match(src, /class: 'rnd-die', disabled/); assert.match(src, /rnd-i/); assert.match(src, /is-float/);
  assert.match(read('css/pages/random.css'), /\.rnd-strip\.is-float \{ position: absolute/);
});

test('Microlink keywords: joined, lowercase, de-duplicated, cut at 200', async () => {
  const { keywordsOf, mapMicrolink } = await import('../../js/core/microlink.js');
  assert.equal(keywordsOf({ keywords: 'Web, CSS ,web', tags: ['Tips', 'css'] }), 'web, css, tips'); assert.equal(keywordsOf({}), undefined);
  assert.ok(keywordsOf({ keywords: Array.from({ length: 80 }, (_, i) => `word${i}`).join(',') }).length <= 200);
  assert.equal(mapMicrolink({ title: 'T', keywords: 'a,b' }, 'https://x.y/').kw, 'a, b');
});

test('Folder: Random sort is stable for one seed and different for another; pinned stay first', async () => {
  const { sortLinks, shuffleKey } = await import('../../js/features/library/folder-page.js');
  const list = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, ts: i, pn: i === 7 }));
  const a = sortLinks(list, 'random', 's1').map((l) => l.id), b = sortLinks(list, 'random', 's1').map((l) => l.id), c = sortLinks(list, 'random', 's2').map((l) => l.id);
  assert.deepEqual(a, b); assert.notDeepEqual(a, c); assert.equal(a[0], 'l7'); assert.equal(shuffleKey('x', 's'), shuffleKey('x', 's'));
});

test('pager: pages of 100, grows near the bottom or by the button, hides when everything is shown', async () => {
  const { nextLimit, createPager, PAGE_SIZE } = await import('../../js/ui/paged.js');
  assert.equal(PAGE_SIZE, 100); assert.equal(nextLimit(100, 250), 200); assert.equal(nextLimit(200, 250), 250); assert.equal(nextLimit(0, 0), 0);
  let grown = 0; const sc = document.createElement('div'); document.body.appendChild(sc);
  const p = createPager({ scroller: sc, onGrow: () => { grown++; } }); sc.appendChild(p.el);
  p.setTotal(250); assert.equal(p.el.hidden, false); assert.match(p.el.textContent, /Showing 100 of 250/);
  p.el.querySelector('button').click(); assert.equal(p.limit(), 200); assert.equal(grown, 1);
  p.el.querySelector('button').click(); assert.equal(p.limit(), 250); assert.equal(p.el.hidden, true);
  p.reset(); assert.equal(p.limit(), 100); p.destroy();
  for (const f of ['js/features/library/folder-page.js', 'js/features/library/recycle-bin-page.js', 'js/features/history/history-page.js']) assert.match(read(f), /createPager/, f);
});

test('Folder three-dot menu: Refresh and Folder settings moved in, Random first on phones; Import page has the settings icon', () => {
  const f = read('js/features/library/folder-page.js');
  assert.match(f, /label: 'Folder settings'/); assert.match(f, /const refreshItem = \{ label: 'Refresh'/); assert.match(f, /\[\.\.\.rnd, refreshItem/);
  assert.ok(!/refreshButton\(\(\) => refresh\(\)\)/.test(f.replace(/\/\/.*$/gm, ''))); assert.match(read('js/features/import/import-page.js'), /settingsShortcut\('data'/);
});

test('shell: the nav item of the current page scrolls to top; the admin switch redraws the page', () => {
  const s = read('js/features/shell/shell.js'); assert.match(s, /toTopOnActive/); assert.match(s, /scrollTo\(\{ top: 0/); assert.match(s, /router\.reevaluate\(\)/);
});

test('profile data: photo file name pattern, clean profile, banner ids', async () => {
  const P = await import('../../js/core/profile-data.js');
  assert.equal(P.photoFileName('Muhtasim Rahman', 'UID123', Date.UTC(2026, 10, 1, 9, 5, 7)), 'Muhtasim-Rahman_UID123_20261101-090507');
  assert.deepEqual(P.cleanProfile({ bio: '  hi  ', country: '', banner: 'zz', evil: 'x' }), { bio: 'hi', country: null });
  assert.equal(P.cleanProfile({ banner: 'b3' }).banner, 'b3'); assert.match(P.bannerUrl('b2'), /banner-2\.svg$/); assert.match(P.bannerUrl('nope'), /banner-1\.svg$/);
  for (const n of [1, 2, 3, 4]) assert.ok(fs.existsSync(new URL(`assets/art/banner-${n}.svg`, root)));
  const calls = []; const adapter = { get: async () => ({ bio: 'x' }), update: async (u) => calls.push(u) };
  const saved = await P.saveProfile(adapter, 'u1', { bio: 'new', country: '' }); assert.deepEqual(calls[0], { 'users/u1/profile/bio': 'new', 'users/u1/profile/country': null }); assert.equal(saved.bio, 'new');
  assert.equal((await P.loadProfile(adapter, 'u1')).bio, 'x');
});

test('crop maths: the window never shows outside the picture; the minimum scale fills it', async () => {
  const { cropMath, minScale } = await import('../../js/features/profile/image-crop.js');
  assert.equal(minScale(560, 280, 280), 1); assert.equal(minScale(100, 100, 280), 2.8);
  const m = cropMath({ w: 560, h: 280, view: 280, scale: 0.2, ox: 50, oy: -30 });
  assert.equal(m.scale, 1); assert.equal(m.ox, 0); assert.equal(m.oy, 0); assert.equal(m.sw, 280);
  const z = cropMath({ w: 560, h: 280, view: 280, scale: 2, ox: -9999, oy: 0 }); assert.equal(z.ox, 280 - 560 * 2); assert.equal(z.sx, (560 * 2 - 280) / 2);
});

test('edit profile: only changed fields are written', async () => {
  const { buildPatch } = await import('../../js/features/profile/profile-edit.js');
  assert.deepEqual(buildPatch({ name: 'A', bio: 'b', country: '', site: '', banner: 'b1' }, { name: 'A', bio: 'b', banner: 'b1' }), {});
  assert.deepEqual(buildPatch({ name: 'A ', bio: '', country: 'BD', site: '', banner: 'b2' }, { name: 'A', bio: 'old', banner: 'b1' }), { bio: '', country: 'BD', banner: 'b2' });
});

test('profile page helpers: top favourites by points, one card per recent link', async () => {
  const { topFavourites, distinctRecent } = await import('../../js/features/shell/pages/profile-page.js');
  const links = [{ id: 'a', fv: 1, pt: 120, ts: 1 }, { id: 'b', fv: 1, pt: 300, ts: 2 }, { id: 'c', pt: 999 }, { id: 'd', fv: 1, del: 1, pt: 500 }, { id: 'e', fv: 1, pt: 120, ts: 5 }];
  assert.deepEqual(topFavourites(links).map((l) => l.id), ['b', 'e', 'a']); assert.equal(topFavourites(links, 1).length, 1);
  assert.deepEqual(distinctRecent([{ lid: 'x' }, { lid: 'y' }, { lid: 'x' }, { lid: 'z' }], 2).map((e) => e.lid), ['x', 'y']);
  const src = read('js/features/shell/pages/profile-page.js'); assert.match(src, /openExport\(\{ engine \}\)/); assert.match(src, /pf2-arrow/); assert.match(src, /Share Linkivo/); assert.match(src, /copyUid/);
  assert.match(read('css/pages/profile.css'), /\.pf2-badge\.is-verified \{ background: #1f2933/);
});

test('Worker: photo routes need a signed-in account and answer 405 for a wrong method', async () => {
  const worker = (await import(new URL('@ Creator/worker/worker.js', root))).default;
  const call = (path, method, headers = {}) => worker.fetch(new Request(`https://w.test${path}`, { method, headers: { origin: 'https://linkivo.web.app', ...headers }, body: method === 'POST' ? '{}' : undefined }), {});
  assert.equal((await call('/img/upload', 'POST')).status, 401); assert.equal((await call('/img/delete', 'POST')).status, 401); assert.equal((await call('/img/upload', 'GET')).status, 405);
  const health = await (await call('/health', 'GET')).json(); assert.equal(health.version, '2.5.2');   // v2.5.0 Worker
  const src = fs.readFileSync(new URL('@ Creator/worker/worker.js', root), 'utf8'); assert.ok(!/IMGBB_KEY\s*[:=]\s*['"]/.test(src), 'the key is a secret, never in the file');
});

test('rules: the profile has the new private fields, admins may read, only the owner writes; the rules file matches the generator', async () => {
  const { buildRules } = await import(new URL('@ Creator/tools/gen-rules.mjs', root));
  const prof = buildRules().rules.users.$uid.profile;
  assert.match(prof['.read'], /admins/); for (const k of ['bio', 'country', 'banner', 'photo', 'photoDel', 'photoAt', 'site']) { assert.ok(prof[k], k); assert.match(prof[k]['.write'], /auth\.uid === \$uid/); }
  assert.equal(prof.status['.write'], false); assert.equal(prof.$other['.validate'], false);
  assert.equal(fs.readFileSync(new URL('@ Creator/rules/database.rules.json', root), 'utf8'), JSON.stringify(buildRules(), null, 2) + '\n');
});

test('settings: the profile thumbnails switch exists; version files agree', async () => {
  const { CATALOG } = await import('../../js/features/settings/catalog.js');
  const e = CATALOG.find((x) => x.id === 'profileThumbs'); assert.ok(e && e.key === 'profile.thumbs' && e.default === true);
  assert.match(read('app.json'), /"version": "2\.\d+\.\d+"/);   // v2.5.0: no pinned number
});
