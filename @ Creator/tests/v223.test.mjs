// Linkivo v2.2.3: tests for the owner-feedback round. Pure logic first, then small jsdom checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick } from './helpers/dom-env.mjs';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';
import { createEmitter } from '../../js/core/events.js';

const { w } = setupDom('http://localhost/library');
const imp = (p) => import('../../' + p);

function fakeQueue(jobs = []) {
  const map = new Map(jobs.map((j) => [j.id, j])); const bus = createEmitter();
  return { list: () => [...map.values()], get: (id) => map.get(id) || null, async remove(id) { map.delete(id); bus.emit('removed', id); }, subscribe: (fn) => bus.on('job', fn), onRemoved: (fn) => bus.on('removed', fn),
    push(j) { map.set(j.id, j); bus.emit('job', j); } };
}

test('import log: a row removed on another device also leaves this device (sync fix)', async () => {
  const { goneJobs, createImportLog } = await imp('js/core/import-log.js');
  const done = { id: 'a', type: 'import', status: 'done', createdAt: 5 };
  assert.deepEqual(goneJobs([done], {}, new Set(['a'])).map((j) => j.id), ['a'], 'was in the account, now gone');
  assert.deepEqual(goneJobs([done], {}, new Set()), [], 'never reached the account: kept');
  assert.deepEqual(goneJobs([done], { a: { ty: 'import' } }, new Set(['a'])), [], 'still there: kept');
  assert.deepEqual(goneJobs([{ ...done, status: 'running' }], {}, new Set(['a'])), [], 'a running job is never removed');
  // two devices sharing one account database
  const db = createFakeRtdb().adapter; const qa = fakeQueue(); const qb = fakeQueue();
  const A = createImportLog({ adapter: db, uid: 'u9', queue: qa }); createImportLog({ adapter: db, uid: 'u9', queue: qb });
  qa.push({ id: 'j1', type: 'import', status: 'done', title: 't', total: 1, done: 1, createdAt: 10 }); await tick(30);
  assert.ok(await db.get('users/u9/importLog/j1'));
  await db.update({ 'users/u9/importLog/j1': null }); await db.update({ 'users/u9/importLog': {} }); await tick(30);   // device B removes it (the flat fake database needs the parent snapshot to be announced, a real database does that itself)
  assert.equal(A.list().length, 0, 'device A drops its local copy');
  assert.equal(qa.list().length, 0);
  A.dispose();
});

test('import log: auto delete removes only finished rows older than 7 days, and only when on', async () => {
  const { expiredRows, createImportLog } = await imp('js/core/import-log.js'); const DAY = 86400000, now = 100 * DAY;
  const rows = [{ id: 'old', status: 'done', createdAt: now - 8 * DAY }, { id: 'new', status: 'done', createdAt: now - 2 * DAY }, { id: 'run', status: 'running', createdAt: now - 20 * DAY }];
  assert.deepEqual(expiredRows(rows, 7, now).map((r) => r.id), ['old']); assert.deepEqual(expiredRows(rows, 0, now), [], 'off by default');
  const q = fakeQueue([{ id: 'x', type: 'import', status: 'done', createdAt: Date.now() - 9 * DAY }, { id: 'y', type: 'import', status: 'done', createdAt: Date.now() }]);
  let days = 0; const log = createImportLog({ queue: q, autoDays: () => days });
  assert.equal(await log.purgeOld(), 0); days = 7; assert.equal(await log.purgeOld(), 1); assert.deepEqual(q.list().map((j) => j.id), ['y']);
  const { CATALOG } = await imp('js/features/settings/catalog.js'); const e = CATALOG.find((c) => c.id === 'impAutoClear'); assert.equal(e.default, false); assert.equal(e.key, 'import.autoClear');
});

test('devices: state names, signed-out devices carry a time and stay in the list', async () => {
  const { deviceState } = await imp('js/features/settings/devices-sheet.js');
  assert.equal(deviceState({ current: true, rv: 1 }), 'current'); assert.equal(deviceState({ rv: 5 }), 'leaving'); assert.equal(deviceState({ rv: 5, out: 9 }), 'out'); assert.equal(deviceState({}), 'active');
  const { DEVICE } = await imp('js/engine/schema.js'); assert.ok(DEVICE && JSON.stringify(DEVICE).includes('out'));
});

test('clear local data: only the app and sign-in databases are touched; prefs, caches and databases are cleared', async () => {
  const { isAppDatabase, clearLocalData } = await imp('js/core/clear-local.js');
  assert.ok(isAppDatabase('linkivo-abc') && isAppDatabase('firebaseLocalStorageDb') && !isAppDatabase('someone-elses-db'));
  const { prefs } = await imp('js/core/local-prefs.js'); prefs.set('ui.theme', 'dark'); prefs.set('mode', 'guest');
  const out = await clearLocalData({ reload: false });
  assert.ok(out.prefs >= 2); assert.equal(prefs.get('mode', null), null);
});

test('install status: Installed only inside the app; a tab on a device with the app says so quietly', async () => {
  const { installState, installStatus } = await imp('js/core/install.js');
  installState.set({ standalone: false, installedFlag: true, canPrompt: false }); assert.equal(installStatus().kind, 'installed'); assert.notEqual(installStatus().title, 'Installed on this device');
  installState.set({ standalone: true, installedFlag: true }); assert.equal(installStatus().kind, 'running');
  installState.set({ standalone: false, installedFlag: false, canPrompt: true }); assert.equal(installStatus().kind, 'available');
});

test('popover: pressing the same anchor again closes its menu; touch screens get a transparent backdrop that only closes', async () => {
  const { openMenu } = await imp('js/ui/popover.js');
  const anchor = document.createElement('button'); document.body.appendChild(anchor); let acted = 0;
  const items = [{ label: 'One', onSelect: () => { acted++; } }];
  const m1 = openMenu(anchor, items); assert.ok(document.querySelector('.pop'));
  const m2 = openMenu(anchor, items); assert.equal(m2.isOpen(), false); assert.equal(document.querySelector('.pop'), null, 'second press closed it, no second menu');
  assert.equal(m1.isOpen(), false);
  // backdrop mode (what a phone gets)
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} }); globalThis.matchMedia = w.matchMedia;
  const m3 = openMenu(anchor, items); const bd = document.querySelector('.pop-backdrop'); assert.ok(bd, 'backdrop present');
  const under = document.createElement('button'); let hit = 0; under.addEventListener('click', () => hit++); document.body.appendChild(under);
  bd.click(); assert.equal(m3.isOpen(), false); assert.equal(document.querySelector('.pop-backdrop'), null); assert.equal(hit, 0, 'nothing below was pressed');
});

test('CSS: select mode shows every check box; the export popup has folder chips', async () => {
  const fs = await import('node:fs'); const css = fs.readFileSync(new URL('../../css/pages/library.css', import.meta.url), 'utf8');
  assert.match(css, /\.lrow\.is-selecting \.lcheck \{ opacity: 1; \}/);
  const src = fs.readFileSync(new URL('../../js/features/export/export-sheet.js', import.meta.url), 'utf8'); assert.match(src, /picked = new Set\(allFolders\.map/, 'all folders start selected');
});

test('login page: guest button on the right, install card slots, tabs slide', async () => {
  const { mount } = await imp('js/features/auth/login-page.js'); const c = document.createElement('div'); document.body.appendChild(c); await mount(c, { router: {} });
  const acts = c.querySelector('.auth-actions'); assert.ok(acts && acts.children[0].matches('button[type=submit]') && acts.children[1].classList.contains('auth-guestbtn'));
  assert.ok(c.querySelector('.auth-install.is-phone') && c.querySelector('.art-mid .auth-install.is-wide'));
  c.querySelectorAll('.auth-tabs button')[1].click(); assert.ok(c.querySelector('.auth-body').classList.contains('slide-right')); assert.equal(c.querySelector('.auth-tabs').dataset.tab, 'register');
  c.querySelectorAll('.auth-tabs button')[0].click(); assert.ok(c.querySelector('.auth-body').classList.contains('slide-left'));
});
