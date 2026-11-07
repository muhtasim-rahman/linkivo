// v2.5.1: single Auto lock setting (`away`), re-delete block after a reactivation, PIN pad keyboard rules, one-popup PIN flows, guest to account transfer pipeline, router scroll memory,
// clipboard suggestion rules. Real browser behavior (history entries, focus, scroll) was checked in headless Chromium by hand; this file keeps the logic from regressing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick } from './helpers/dom-env.mjs';
import { loadWorker } from './helpers/load-worker.mjs';
import { createFakeFirebase } from './helpers/fake-firebase.mjs';

setupDom('http://localhost/');
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const L = await import('../../js/core/lock.js');
const { buildPinPad } = await import('../../js/features/lock/pin-pad.js');
const { prefs } = await import('../../js/core/local-prefs.js');

// ---- Auto lock: one setting ---------------------------------------------------------------------------------------------------------
test('auto lock: the choices, the default of 1 minute, and what a guest stores', async () => {
  assert.deepEqual(L.AWAY_CHOICES, [0, 30, 60, 300, 600, 900, 1800, -1]); assert.equal(L.DEFAULT_AWAY, 60);
  await L.loadLock({ mode: 'guest', user: null, status: 'active' }); assert.equal(L.getLock().away, 60);
  await L.enableLock('4821'); assert.equal(prefs.get('guest.lock').away, 60);
  await L.setAway(-1); assert.equal(L.getLock().away, -1); await L.setAway(0); assert.equal(prefs.get('guest.lock').away, 0);
  await assert.rejects(L.setAway(45), { code: 'bad_request' });
  L.eraseGuestLock(); L.resetLock();
});
test('the settings list has ONE auto lock row and no separate "lock when I leave" switch', () => {
  const src = read('js/features/lock/security-popups.js');   // v2.5.3: the rows moved into the App lock popup
  assert.match(src, /'Auto lock'/); assert.doesNotMatch(src, /Lock when I leave/); assert.doesNotMatch(src, /lock\.onHide/);
  const labels = ['Right after closing the app', '30 seconds after closing', '1 minute after closing', '5 minutes after closing', '10 minutes after closing', '15 minutes after closing', '30 minutes after closing', 'Never'];
  for (const l of labels) assert.ok(src.includes(l), l);
});

// ---- Worker -----------------------------------------------------------------------------------------------------------------------------
const { handler, T } = await loadWorker();
function setup() { T.resetCaches(); T.resetSa(); return createFakeFirebase(); }
async function post(fb, path, body = {}, authAgeSec = 10) {
  const res = await T.route(new Request('https://worker.test' + path, { method: 'POST', headers: { origin: 'https://linkivo.web.app', 'content-type': 'application/json', authorization: 'Bearer ' + fb.token('u1', { authAgeSec }) }, body: JSON.stringify(body) }), fb.env, { fetch: fb.fetch });
  return { status: res.status, body: JSON.parse(await res.text()) };
}
test('Worker: the away choices are validated and the session outlives the away time', async () => {
  const fb = setup(); await post(fb, '/pin/set', { pin: '4821', enable: true });
  assert.equal((await post(fb, '/lock/config', { away: 45 })).status, 400);
  for (const v of [0, 30, 60, 300, 600, 900, 1800, -1]) assert.equal((await post(fb, '/lock/config', { away: v })).status, 200, String(v));
  assert.equal(fb.get('users/u1/lockState/away'), -1);
  await post(fb, '/lock/config', { away: 60 });
  await new Promise((r) => setTimeout(r, 1));
  const v = await post(fb, '/pin/verify', { pin: '4821' }); assert.ok(v.status === 200);
  const exp = fb.get('session/u1/app') - Date.now(); assert.ok(exp > 14.5 * 60000 && exp <= 15 * 60000 + 2000, `1 minute away: at least 15 minutes, got ${exp}`);
  const fb2 = setup(); await post(fb2, '/pin/set', { pin: '4821', enable: true });   // (a fresh Worker: the per-user rate limit counted the calls above)
  assert.equal((await post(fb2, '/lock/config', { away: 1800 })).status, 200); const v2 = await post(fb2, '/pin/verify', { pin: '4821' }); assert.equal(v2.status, 200, JSON.stringify(v2.body));
  const exp2 = fb2.get('session/u1/app') - Date.now(); assert.ok(exp2 > 34.5 * 60000 && exp2 <= 35 * 60000 + 2000, `30 minutes away: 35 minutes, got ${exp2}`);
});
test('Worker: a reactivated account cannot be deleted again until the block is over (0 days while testing)', async () => {
  const fb = setup(); const SEC = T.SEC; const keep = SEC.redeleteBlockMs;
  try {
    assert.equal(keep, 0, 'testing value shipped in v2.5.1');
    SEC.redeleteBlockMs = 7 * 86400000;
    assert.equal((await post(fb, '/account/delete', {})).status, 200);
    assert.equal((await post(fb, '/account/reactivate', {})).status, 200);
    const sum = await post(fb, '/account/summary', {}); assert.ok(sum.body.blockedUntil > Date.now() + 6.9 * 86400000);
    const again = await post(fb, '/account/delete', {}); assert.equal(again.status, 409); assert.equal(again.body.error, 'delete_blocked'); assert.ok(again.body.until > Date.now());
    SEC.redeleteBlockMs = 0;
    assert.equal((await post(fb, '/account/summary', {})).body.blockedUntil, 0);
    assert.equal((await post(fb, '/account/delete', {})).status, 200, 'with 0 days the owner can test deleting again at once');
  } finally { SEC.redeleteBlockMs = keep; }
});

// ---- PIN pad ----------------------------------------------------------------------------------------------------------------------------
test('PIN pad: the keyboard works anywhere on the page, only the newest pad listens, text fields are left alone, mouse never focuses keys', async () => {
  const a = [], b = [];
  const p1 = buildPinPad({ onSubmit: async (p) => { a.push(p); } }), p2 = buildPinPad({ onSubmit: async (p) => { b.push(p); } });
  document.body.append(p1.el, p2.el);
  const key = (k, target = document.body) => target.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  for (const k of '1357') key(k); key('Enter'); await tick(5);
  assert.deepEqual(b, ['1357']); assert.deepEqual(a, [], 'the older pad (the lock screen under a popup) stays quiet');
  const input = document.createElement('input'); document.body.append(input);
  for (const k of '2468') key(k, input); key('Enter', input); await tick(5);
  assert.deepEqual(b, ['1357'], 'typing in a text field is not a PIN');
  const k5 = [...p2.el.querySelectorAll('.pin-key.is-digit')].find((x) => x.textContent === '5');
  assert.equal(k5.getAttribute('tabindex'), '-1'); const md = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }); k5.dispatchEvent(md); assert.equal(md.defaultPrevented, true, 'a mouse press does not move focus to the key');
  const sp = new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }); k5.dispatchEvent(sp); assert.equal(sp.defaultPrevented, true, 'Space on a key must not click it a second time');
  p2.destroy(); for (const k of '2468') key(k); key('Enter'); await tick(5);
  assert.deepEqual(a, ['2468'], 'when the newest pad is gone the older one answers again');
  p1.destroy(); p1.el.remove(); p2.el.remove(); input.remove();
});

// ---- one-popup PIN flows ----------------------------------------------------------------------------------------------------------------
test('pin-flow: create PIN refuses weak PINs and different repeats, then returns the PIN; the popup stays one popup', async () => {
  const { openPinFlow, stageCreate } = await import('../../js/features/lock/pin-flow.js');
  const flow = await openPinFlow({ title: 'Test' });
  const type = async (s) => { for (const ch of s) document.dispatchEvent(new window.KeyboardEvent('keydown', { key: ch, bubbles: true })); document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick(8); };
  const p = stageCreate(flow); await tick(5);
  await type('1234'); assert.match(document.querySelector('.pin-msg').textContent, /harder to guess/);
  await type('2580'); assert.match(document.querySelector('.pin-text').textContent, /same PIN again/);
  await type('2581'); assert.match(document.querySelector('.pin-msg').textContent, /different/);
  await type('2580'); await type('2580');
  assert.equal(await p, '2580'); assert.equal(document.querySelectorAll('.sheet').length, 1, 'still one popup');
  await flow.finish(); assert.equal(document.querySelectorAll('.sheet').length, 0);
});
test('pin-flow: closing the popup ends a waiting step with null', async () => {
  const { openPinFlow, stagePad } = await import('../../js/features/lock/pin-flow.js');
  const flow = await openPinFlow({ title: 'Test' }); const p = stagePad(flow, { text: 'x' }); await tick(5);
  await flow.finish(); assert.equal(await p, null);
});
test('forgot PIN: no element is passed as a sheet action (the old blank-button bug) and the reset link asks first', () => {
  const src = read('js/features/lock/forgot-pin.js');
  assert.doesNotMatch(src, /actions: \[go\]/); assert.match(src, /Send a password reset link to/); assert.match(src, /stageForm/);
  for (const f of ['js/features/lock/lock-actions.js', 'js/features/lock/forgot-pin.js', 'js/features/auth/guest-transfer.js']) assert.doesNotMatch(read(f), /openSheet\(\{[^}]*actions: \[[a-z]+\]/, f);
});
test('the app is restarted only after the PIN popup is gone', () => {
  const src = read('js/features/lock/lock-actions.js');
  for (const fn of ['enableLockFlow', 'disableLockFlow', 'changePinFlow']) { const body = src.slice(src.indexOf('export async function ' + fn)); const end = body.indexOf('\n}\n'); const b = body.slice(0, end); assert.ok(b.indexOf('flow.finish()') < b.lastIndexOf('reinitApp()'), fn); }
});

// ---- guest to account --------------------------------------------------------------------------------------------------------------------
test('guest transfer: guest folders and links are restored into the account through the normal job; links already there are skipped; nothing is read from deleted items', async () => {
  const { Engine } = await import('../../js/engine/engine.js'); const { createMemoryDb } = await import('../../js/engine/idb.js');
  const { collect } = await import('../../js/features/export/export-engine.js'); const { buildBackup } = await import('../../js/features/export/native-format.js');
  const { runRestore } = await import('../../js/features/import/import-backup.js'); const { createJobQueue } = await import('../../js/engine/job-queue.js'); const { registerImportJobs } = await import('../../js/features/import/import-job.js');
  const noSleep = () => Promise.resolve();
  const guest = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: noSleep }); await guest.init();
  const f1 = await guest.createFolder({ name: 'News', color: '#2563eb', icon: 'folder', order: 0 }), f2 = await guest.createFolder({ name: 'Tools', color: '#16a34a', icon: 'folder', order: 1 });
  await guest.addLinks([{ url: 'https://a.com/1', title: 'A', tags: 'x' }, { url: 'https://a.com/2', title: 'B' }], { fid: f1.id }); await guest.addLinks([{ url: 'https://c.com/3', title: 'C' }], { fid: f2.id });
  const c = collect(guest, { type: 'all' }); assert.equal(c.links.length, 3);
  const acct = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: noSleep }); await acct.init();
  const mine = await acct.createFolder({ name: 'news', color: '#000000', icon: 'folder', order: 0 }); await acct.addLinks([{ url: 'https://a.com/1', title: 'Already mine' }], { fid: mine.id });
  const q = createJobQueue({ db: acct.db, now: () => acct.now() }); registerImportJobs({ queue: q, engine: acct, fetchMeta: async () => new Map() });
  const backup = buildBackup({ folders: c.folders, links: c.links, source: 'guest', now: Date.now() });
  const job = await runRestore({ engine: acct, queue: q, backup, state: { folderMode: 'merge', duplicates: 'skip' } }); await q.whenIdle();
  assert.ok(job && q.get(job.id).status === 'done');
  assert.equal(acct.listFolders().length, 2, 'News merged into the existing folder (same name), Tools is new');
  assert.equal(acct.listLinks().length, 3, 'a.com/1 was already saved: not added twice');
  assert.equal(acct.listLinks().find((l) => l.url === 'https://a.com/2').fid, mine.id);
});
test('guest transfer: wiring (asked after sign-in, erased only after the job is done)', () => {
  const src = read('js/features/auth/guest-transfer.js'); assert.match(src, /status === 'done'/); assert.ok(src.indexOf("status === 'done'") < src.indexOf('eraseGuest().then'));
  assert.match(read('js/boot.js'), /guest-transfer\.js/);
});

// ---- router, clipboard, lock icons, profile ------------------------------------------------------------------------------------------------
test('router remembers where a page was left and puts it back on Back; unlock returns to the page and its scroll', () => {
  const src = read('js/core/router.js');
  assert.match(src, /scrollMemo\.set\(current\.path \+ current\.search, container\.scrollTop\)/); assert.match(src, /if \(pop\) restoreScroll\(scrollMemo\.get/);
  assert.match(src, /parked = \{ path: current \? fullPath\(\)/); assert.match(read('js/boot.js'), /reevaluate\(\{ keepScroll: true \}\)/);
});
test('clipboard suggestion: never while logged out, deleted or locked; hides itself on log out', () => {
  const src = read('js/features/import/clipboard-suggest.js'); assert.match(src, /signedIn/); assert.match(src, /dataset\.locked/); assert.match(src, /subscribeSession/); assert.match(src, /\/reactivate/);
});
test('profile page has no Security or Delete account buttons; lock icons sit on Library, Random and Menu (phones) and in the sidebar (PC)', () => {
  const pf = read('js/features/shell/pages/profile-page.js'); assert.doesNotMatch(pf, /pf2-acct-b|accountLinks/); assert.doesNotMatch(pf, /openDeleteAccount/);
  for (const f of ['js/features/library/library-page.js', 'js/features/random/random-page.js', 'js/features/shell/pages/menu-page.js']) assert.match(read(f), /lockButton\(\)/, f);
  assert.match(read('js/features/shell/shell.js'), /lock-row/); assert.match(read('css/components/nav.css'), /\.lock-btn\.is-phone \{ display: none; \}/);
});
test('edit profile compares with the draft as it was opened (no confirmation when nothing changed)', async () => {
  const E = await import('../../js/features/profile/profile-edit.js');
  const profile = {}, draft = { name: 'Turzo', banner: 'b1' };
  assert.equal(E.hasChanges(draft, profile, false), true, 'against an empty profile the defaults look like changes (the old bug)');
  assert.equal(E.hasChanges(draft, { ...profile, ...draft }, false), false); assert.equal(E.hasChanges({ ...draft, name: 'T' }, { ...profile, ...draft }, false), true);
  assert.match(read('js/features/profile/profile-edit.js'), /hasChanges\(draft, base, photoChanged\(\)\)/);
});
test('delete account: one request at a time, no late error, and the blocked step', () => {
  const src = read('js/features/settings/delete-account.js'); assert.match(src, /if \(working \|\| finished\) return;/); assert.match(src, /stepBlocked/); assert.match(src, /delete_blocked/);
  assert.ok(src.indexOf('finished = true') < src.indexOf('stepDone(r && r.deleteAt)'));
});
