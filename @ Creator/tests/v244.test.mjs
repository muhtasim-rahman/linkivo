// Linkivo v2.4.4: mask, admin device flag, range graph, thumbnails, countries, profile fields and colours, edit popup rules, settings card, source contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom } from './helpers/dom-env.mjs';

setupDom('http://localhost/profile');
const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');

test('email mask: first 2, last 1, five stars', async () => {
  const { maskEmail } = await import('../../js/core/mask.js');
  assert.equal(maskEmail('mdturzo999@gmail.com'), 'md*****9@gmail.com'); assert.equal(maskEmail('abc@x.io'), 'a*****c@x.io');
});

test('range graph: smooth closed area, counts inside a range', async () => {
  const { areaPath, inRange, buildRange } = await import('../../js/features/random/random-range.js');
  const d = areaPath([1, 5, 2, 8]); assert.match(d, /^M0,40 L0,/); assert.match(d, /Z$/); assert.ok(d.includes('Q')); assert.equal(areaPath([]), '');
  assert.equal(inRange([1, 50, 100, 400, 1000], 50, 400), 3);
  const r = buildRange({ lo: 1, hi: 1000, pointsList: [10, 100, 100, 900] }); document.body.appendChild(r.el);
  assert.ok(r.el.querySelector('svg.rg-svg path.rg-area.is-lit')); assert.match(r.el.querySelector('.rg-note').textContent, /4 links/);
  r.set(50, 200); assert.match(r.el.querySelector('.rg-note').textContent, /2 of 4 links/);
  const tip = r.el.querySelector('.rg-tip'); assert.equal(tip.hidden, true);
});

test('countries: all of them with flags, Palestine yes, Israel never', async () => {
  const C = await import('../../js/core/countries.js');
  const list = C.countryList(); assert.ok(list.length > 240);
  assert.equal(list.find((c) => c.code === 'PS').name, 'Palestine'); assert.equal(list.some((c) => c.code === 'IL' || /israel/i.test(c.name)), false);
  assert.equal(C.flagOf('BD'), '\u{1F1E7}\u{1F1E9}'); assert.equal(C.findCountry('bangladesh').code, 'BD'); assert.equal(C.countryLabel('Palestine'), '\u{1F1F5}\u{1F1F8} Palestine');
  const { filterCountries, buildCountryPicker } = await import('../../js/features/profile/country-picker.js');
  assert.deepEqual(filterCountries(list, 'pales').map((c) => c.code), ['PS']); assert.ok(filterCountries(list, 'zzzz').length === 0);
  let got = ''; const p = buildCountryPicker({ value: '', onChange: (v) => { got = v; } }); document.body.appendChild(p.el);
  p.el.querySelector('.pe-country').click(); assert.equal(p.el.querySelector('.pe-country-panel').hidden, false);
  [...p.el.querySelectorAll('.pe-opt')].find((o) => o.dataset.name === 'Palestine').click(); assert.equal(got, 'Palestine'); assert.match(p.el.querySelector('.pe-country').textContent, /Palestine/); p.destroy();
});

test('profile: ten colours, six banners, new fields are cleaned, the admin badge colour is applied and removed', async () => {
  const P = await import('../../js/core/profile-data.js');
  assert.equal(P.PALETTE.length, 10); assert.equal(P.BANNERS.length, 6); for (const n of [1, 2, 3, 4, 5, 6]) assert.ok(fs.existsSync(new URL(`assets/art/banner-${n}.svg`, root)));
  assert.deepEqual(P.cleanProfile({ ring: '#ff0000', adminColor: 'red', birthday: '2008-03-05', city: ' Dhaka ' }), { ring: '#ff0000', birthday: '2008-03-05', city: 'Dhaka' });
  assert.deepEqual(P.cleanProfile({ birthday: 'yesterday', ring: '' }), { ring: null });
  const el = document.createElement('div'); P.applyProfileLook({ adminColor: '#8b5cf6' }, el); assert.match(el.style.getPropertyValue('--admin-chip-bg'), /8b5cf6/);
  P.applyProfileLook({}, el); assert.equal(el.style.getPropertyValue('--admin-chip-bg'), '');
});

test('edit profile: changes are detected; the sheet asks before discarding; the crop no longer opens a second popup', async () => {
  const E = await import('../../js/features/profile/profile-edit.js');
  assert.equal(E.hasChanges({ name: 'A', bio: '' }, { name: 'A' }, false), false); assert.equal(E.hasChanges({ name: 'A', city: 'X' }, { name: 'A' }, false), true); assert.equal(E.hasChanges({ name: 'A' }, { name: 'A' }, true), true);
  assert.deepEqual(E.buildPatch({ ring: '', adminColor: '#111111', headline: 'Dev' }, { ring: '#222222' }), { ring: '', adminColor: '#111111', headline: 'Dev' });
  const src = read('js/features/profile/profile-edit.js'), crop = read('js/features/profile/image-crop.js');
  assert.match(src, /beforeClose/); assert.match(src, /Discard your changes\?/); assert.match(src, /pickAndCrop\(f, cropHost\)/);
  assert.ok(!/openSheet/.test(crop), 'no nested popup in the crop');
  for (const k of ['headline', 'city', 'birthday', 'languages', 'interests', 'pronouns', 'ring', 'adminColor']) assert.match(src, new RegExp(k));
});

test('thumbnails: saved image, then saved screenshot, then the site icon; off switch; selection only in select mode', async () => {
  const T = await import('../../js/ui/thumb.js');
  assert.deepEqual(T.thumbSources({ image: 'https://a/i.jpg', shot: 'https://s/x.png' }), ['https://a/i.jpg', 'https://s/x.png']); assert.deepEqual(T.thumbSources({ image: 'javascript:x', shot: 'http://s' }), []); assert.deepEqual(T.thumbSources(null), []);
  const engine = { peekLinkMeta: async (id) => (id === 'a' ? { image: 'https://a/i.jpg' } : null) };
  const el = T.createThumb({ engine, id: 'a', host: 'x.com', favicon: 'https://f/x.ico' }); document.body.appendChild(el);
  assert.ok(el.querySelector('.pk-fav'), 'the site icon is underneath'); await new Promise((r) => setTimeout(r, 10)); assert.equal(el.querySelector('img.thb-img').getAttribute('src'), 'https://a/i.jpg');
  const none = T.createThumb({ engine, id: 'zz', host: 'x.com', favicon: '' }); await new Promise((r) => setTimeout(r, 10)); assert.equal(none.querySelector('img.thb-img'), null);
  const { prefs } = await import('../../js/core/local-prefs.js'); prefs.set('ui.thumbs', false); const off = T.createThumb({ engine, id: 'a', host: 'x.com', favicon: '' }); await new Promise((r) => setTimeout(r, 10)); assert.equal(off.querySelector('img.thb-img'), null); prefs.remove('ui.thumbs');
  const row = (await import('../../js/features/library/link-row.js')); assert.equal(row.ROW_HEIGHT, 68); assert.equal(row.CARD_MIN_WIDTH, 210);
  const r = row.createLinkRow({ id: 'a', url: 'https://x.com/', host: 'x.com', title: 'X', ts: 1 }, { card: true, engine }); assert.ok(r.querySelector('.lcover .thb.is-card'));
  const css = read('css/pages/library.css'); assert.match(css, /\.lrow:not\(\.is-selecting\):not\(\.is-selected\) \.lcheck \{ display: none; \}/);
  for (const f of ['js/features/history/history-page.js', 'js/features/search/search-page.js']) assert.match(read(f), /createThumb/, f);
  assert.match(read('js/features/library/recycle-bin-page.js'), /pickTile/); assert.ok(!/corner: true/.test(read('js/features/library/recycle-bin-page.js')), 'the Recycle Bin keeps its list');
});

test('menu settings card: one scrollable line of chips built from the sections, each opens its section', async () => {
  const { settingsCard } = await import('../../js/features/shell/settings-card.js'); const { SECTIONS } = await import('../../js/features/settings/catalog.js');
  const el = settingsCard(); const chips = [...el.querySelectorAll('.sc-chip')];
  assert.equal(chips.length, SECTIONS.length); assert.deepEqual(chips.map((c) => c.getAttribute('href')), SECTIONS.map((s) => `/settings/${s.id}`)); assert.ok(el.querySelector('.sc-chips.fade-x'));
  assert.match(read('css/pages/pages.css'), /--sc-blue: #3b82f6/); assert.match(read('css/pages/pages.css'), /html\[data-theme='dark'\] \.sc-card/);
});

test('profile page: explore heading, ring, share card is one button, switch icon in the header, wide layout, library icon hidden on phones', () => {
  const src = read('js/features/shell/pages/profile-page.js'), css = read('css/pages/profile.css');
  assert.match(src, /text: 'Explore'/); assert.match(src, /role: 'button', tabindex: '0', 'aria-label': 'Share Linkivo'/); assert.match(src, /switchSlot/); assert.match(src, /pf2-hl-big/);
  assert.match(css, /\.page\.pf2 \{ max-width: min\(1280px/); assert.match(css, /\.pf2-share-t \{ display: none; \}/); assert.match(css, /outline: 3px solid var\(--ring/);
  assert.match(read('js/features/library/library-page.js'), /is-wide-only/); assert.match(read('css/core/base.css'), /\.is-wide-only \{ display: none !important; \}/);
});

test('random page: continuous graph, swap transitions, strip', () => {
  const src = read('js/features/random/random-page.js'), css = read('css/pages/random.css');
  assert.match(src, /box\.replaceChildren = /); assert.match(src, /autoSig/); assert.match(css, /@keyframes rnd-swap/); assert.match(css, /\.rg-tip/);
});

test('admin: /admin-reset exists as an open route and the settings row explains it', () => {
  assert.match(read('js/features/shell/routes.js'), /pattern: '\/admin-reset'.*guard: 'open'/); assert.match(read('js/features/settings/custom-rows.js'), /admin-reset/);
});

test('rules and settings: new profile fields, the thumbnail switch, versions', async () => {
  const { buildRules } = await import(new URL('@ Creator/tools/gen-rules.mjs', root)); const prof = buildRules().rules.users.$uid.profile;
  for (const k of ['headline', 'city', 'birthday', 'languages', 'interests', 'pronouns', 'ring', 'adminColor']) assert.ok(prof[k] && /auth\.uid === \$uid/.test(prof[k]['.write']), k);
  assert.equal(fs.readFileSync(new URL('@ Creator/rules/database.rules.json', root), 'utf8'), JSON.stringify(buildRules(), null, 2) + '\n');
  const { CATALOG } = await import('../../js/features/settings/catalog.js'); const e = CATALOG.find((x) => x.id === 'uiThumbs'); assert.ok(e && e.key === 'ui.thumbs' && e.section === 'library' && e.default === true);
  assert.match(read('app.json'), /"version": "2\.4\.4"/); assert.match(read('sw.js'), /VERSION = '2\.4\.4'/); assert.match(read('js/core/app-info.js'), /version: '2\.4\.4'/);
});
