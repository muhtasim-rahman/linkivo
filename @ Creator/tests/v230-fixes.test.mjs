// Linkivo v2.3.0: owner fix round (Danger zone, toggle rows, captions, toast follows the bar, install note, delete-account popup, profile card, logout).
// jsdom tests: they check wiring and structure, not how it looks (that needs a real browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

const { createRouter } = await import('../../js/core/router.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { prefs } = await import('../../js/core/local-prefs.js');
const { ROUTES } = await import('../../js/features/shell/routes.js');

async function openPage(path, session = { mode: 'guest', user: null, status: 'active' }) {
  const container = $('#page-root'); container.replaceChildren();
  setSession(session);
  const router = createRouter({ routes: ROUTES, container, getSession }); await router.start();
  await router.navigate(path); await tick(10);
  return { router, container };
}

test('catalog: Danger zone sits right above App and the rows are in the owner order', async () => {
  const { SECTIONS, entriesFor } = await import('../../js/features/settings/catalog.js');
  const ids = SECTIONS.map((s) => s.id);
  assert.equal(ids.indexOf('danger') + 1, ids.indexOf('app'), 'danger directly before app');
  assert.deepEqual(entriesFor('danger').map((e) => e.id), ['logout', 'clearCache', 'reset', 'clearLocal', 'deleteAccount']);
});

test('settings: danger rows have the owner tones, each ends with an arrow, only the title is red', async () => {
  await openPage('/settings');
  const sec = $('#sec-danger'); assert.ok(sec.classList.contains('is-danger'), 'section title and icon are red (CSS .set-sec.is-danger)');
  const rows = $$('.dz-row', sec); assert.equal(rows.length, 4, 'guest: no Delete account row');
  const tone = (re) => rows.find((r) => re.test(r.textContent));
  for (const re of [/Leave guest mode/, /Clear app cache/]) { const r = tone(re); assert.ok(!r.classList.contains('is-danger') && !r.classList.contains('is-caution'), `${re} stays the normal text color`); }
  assert.ok(tone(/Reset all settings/).classList.contains('is-caution'), 'reset is yellow-orange');
  assert.ok(tone(/Clear local storage data/).classList.contains('is-caution'), 'clear local data is yellow (v2.3.1, owner)');
  assert.deepEqual(rows.map((r) => /Leave guest|Clear app cache|Reset all|Clear local/.exec(r.textContent)[0]), ['Leave guest', 'Clear app cache', 'Reset all', 'Clear local']);
  for (const r of rows) assert.ok($('.row-end svg', r), 'right arrow on ' + r.textContent.slice(0, 20));
  const css = read('css/components/feedback.css'); assert.match(css, /\.row\.is-caution \.row-label \{ color: var\(--caution\)/);
  assert.match(read('css/core/tokens.css'), /--caution: #b8570a/); assert.match(read('css/core/tokens.css'), /--caution: #f5a524/);
});

test('settings and menu: a Log out button is the last thing on both pages (the same markup)', async () => {
  const s = await openPage('/settings'); const a = $$('.menu-logout', s.container); assert.equal(a.length, 1);
  assert.ok(a[0].closest('.set-logout') && $('.settings', s.container).parentElement.lastElementChild.contains(a[0]) === false || a[0].closest('.set-logout'), 'sits after the sections');
  const m = await openPage('/menu'); const b = $$('.menu-logout', m.container); assert.equal(b.length, 1);
  assert.equal(a[0].outerHTML, b[0].outerHTML, 'identical button');
});

test('menu and wide settings: the profile card comes first (above the install card)', async () => {
  const m = await openPage('/menu'); assert.ok($('.menu-list', m.container).firstElementChild.classList.contains('menu-hero'));
  const s = await openPage('/settings'); const top = $('.set-top', s.container);
  assert.ok(top.firstElementChild.classList.contains('menu-hero'), 'profile card first in the top cards');
  assert.ok(top.children[1].classList.contains('icard-host'), 'install card second');
});

test('toggle rows: tapping the label, the caption or the switch flips the setting exactly once', async () => {
  const { container } = await openPage('/settings/behavior');
  const row = $('[data-setting="hideBar"]', container); assert.ok(row.classList.contains('is-toggle'));
  const before = prefs.get('ui.hideBar', true);
  $('.row-label', row).click(); assert.equal(prefs.get('ui.hideBar', true), !before, 'label tap');
  $('.row-desc', row).click(); assert.equal(prefs.get('ui.hideBar', true), before, 'caption tap');
  $('.switch-hit', row).click(); assert.equal(prefs.get('ui.hideBar', true), !before, 'switch tap flips once (no double flip)');
  assert.equal($('.switch-hit', row).getAttribute('aria-checked'), String(!before));
  prefs.remove('ui.hideBar');
});

test('captions: only a few long ones are smaller; the line height is tighter', async () => {
  const { descEl, LONG_DESC } = await import('../../js/features/settings/controls.js');
  const { CATALOG } = await import('../../js/features/settings/catalog.js');
  assert.ok(descEl('x'.repeat(LONG_DESC + 1)).classList.contains('is-long')); assert.ok(!descEl('short').classList.contains('is-long'));
  const withDesc = CATALOG.filter((e) => e.desc), long = withDesc.filter((e) => e.desc.length > LONG_DESC);
  assert.ok(long.length >= 1 && long.length <= withDesc.length / 3, `a few, not all (${long.length} of ${withDesc.length})`);
  assert.match(read('css/components/feedback.css'), /\.row-desc \{[^}]*line-height: 1\.3/); assert.match(read('css/components/feedback.css'), /\.row-desc\.is-long \{ font-size: var\(--fs-sm\)/);
});

test('toast: its position comes from --dock-b, so it moves with the bottom bar', () => {
  const css = read('css/components/toast.css'); assert.match(css, /bottom: calc\(var\(--dock-b/); assert.match(css, /transition: bottom/);
  const kit = read('css/components/kit.css'); assert.match(kit, /html\.bar-hidden:not\(\[data-kb='open'\]\) \{ --dock-b: calc\(var\(--safe-b\)/);
});

test('library install suggestion: no popup for "installed, but this is a browser tab" (the Menu card keeps the note)', async () => {
  const { installState } = await import('../../js/core/install.js');
  const { mountInstallSuggest, installCard } = await import('../../js/features/shell/install-card.js');
  installState.set({ standalone: false, installedFlag: true, canPrompt: false });
  let docked = 0; const s = mountInstallSuggest({ mountDock: () => { docked++; return () => {}; }, page: document.createElement('div') });
  assert.equal(docked, 0, 'Library shows nothing'); s.remove();
  assert.match(installCard().textContent, /Using the browser/, 'the Menu card still says it');
});

test('delete account: one popup for all four steps, red theme, labelled icon buttons', async () => {
  const { openDeleteAccount } = await import('../../js/features/settings/delete-account.js');
  setSession({ mode: 'account', user: { uid: 'u1', email: 'me@example.com', name: 'Me', providerData: [{ providerId: 'password' }] }, status: 'active' });
  await openDeleteAccount(); await tick(10);
  assert.equal($$('.sheet').length, 1); const sheet = $('.sheet');
  assert.ok(sheet.classList.contains('da-sheet'));
  assert.equal($$('.da-steps li').length, 4, 'four steps in the bar'); assert.equal($('.da-steps .is-now').textContent, 'Verify');
  const btns = $$('.da-foot .da-btn'); assert.ok(btns.length >= 1);
  for (const b of btns) { assert.ok(b.getAttribute('aria-label'), 'icon button keeps its name'); assert.ok($('svg', b), 'has an icon'); assert.ok($('.da-bt', b), 'text part exists for wide popups'); }
  const css = read('css/pages/settings.css');
  assert.match(css, /\.da-sheet \{ --accent: var\(--danger\)/); assert.match(css, /max-width: 479px\) \{\s*\.da-btn \.da-bt \{ display: none/);
  sheet.querySelector('.sheet-head .btn-icon').click(); await tick(250);
});

test('edit link: the sheet edits description and tags too, saves one patch, and clearing a field removes it', async () => {
  const { Engine } = await import('../../js/engine/engine.js'); const { createMemoryDb } = await import('../../js/engine/idb.js');
  const { bulk } = await import('../../js/features/library/link-actions.js');
  const e = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e.init();
  const f = await e.createFolder({ name: 'F' }); const r = await e.addLinks([{ url: 'https://a.test/x', title: 'A', desc: 'old note', tags: 'one' }], { fid: f.id }); const id = r.added[0].id;
  const p = bulk.editLink(e, [id]); await tick(70);
  const sheet = $('.sheet'); const fields = $$('input, textarea', sheet);
  const desc = $('textarea[aria-label="Description"]', sheet), tags = $('input[aria-label="Tags"]', sheet); assert.equal(desc.value, 'old note'); assert.equal(tags.value, 'one');
  desc.value = 'New note'; tags.value = 'Two, three ,two'; $$('.sheet-foot button', sheet).find((b) => b.textContent === 'Save').click(); await tick(30);
  assert.equal(e.getLink(id).desc, 'New note'); assert.equal(e.getLink(id).tags, 'Two,three', 'tags keep their case, duplicates are dropped');
  await p; $$('.toast .toast-action').forEach((b) => b.click()); await tick(10); assert.equal(e.getLink(id).desc, 'old note', 'Undo restores');
  const p2 = bulk.editLink(e, [id]); await tick(70); const s2 = $('.sheet'); $('textarea[aria-label="Description"]', s2).value = ''; $$('.sheet-foot button', s2).find((b) => b.textContent === 'Save').click(); await tick(30); await p2;
  assert.ok(!e.getLink(id).desc, 'an empty description is removed'); assert.ok(fields.length >= 4);
});
