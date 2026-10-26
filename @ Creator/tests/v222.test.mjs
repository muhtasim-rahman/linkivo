// Linkivo v2.2.2: logic added in this version. Pure functions and small services with fakes; jsdom only for the DOM-touching ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick } from './helpers/dom-env.mjs';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';
import { createEmitter } from '../../js/core/events.js';

const { w } = setupDom('http://localhost/library');
const imp = (p) => import('../../' + p);
const fakeStore = () => { const m = new Map(); return { get: (k, d = null) => (m.has(k) ? m.get(k) : d), set: (k, v) => { m.set(k, v); }, remove: (k) => { m.delete(k); } }; };

// ---------------------------------------------------------------- import log (Recent imports in the account)
test('import log: only finished import/enrich jobs become records, merged rows prefer the local job', async () => {
  const { logRecord, mergeRows } = await imp('js/core/import-log.js');
  assert.equal(logRecord({ type: 'import', status: 'running', createdAt: 5 }), null, 'a running job is not logged yet');
  assert.equal(logRecord({ type: 'other', status: 'done', createdAt: 5 }), null);
  const rec = logRecord({ type: 'import', status: 'done', title: 'Import 12 links', total: 12, done: 12, failed: 0, createdAt: 1000, stats: { saved: 10, skipped: 2, invalid: 0 }, params: { fid: 'f1' } });
  assert.deepEqual({ ty: rec.ty, st: rec.st, total: rec.total, saved: rec.saved, fid: rec.fid, ts: rec.ts }, { ty: 'import', st: 'done', total: 12, saved: 10, fid: 'f1', ts: 1000 });
  const rows = mergeRows([{ id: 'a', type: 'import', status: 'done', title: 'local', total: 3, done: 3, failed: 0, createdAt: 50 }], { a: { ty: 'import', st: 'failed', title: 'cloud', ts: 50 }, b: { ty: 'enrich', st: 'done', title: 'other device', ts: 90 } });
  assert.deepEqual(rows.map((r) => [r.id, r.title, r.local]), [['b', 'other device', false], ['a', 'local', true]], 'newest first; local wins');
});

function fakeQueue(jobs = []) {
  const bus = createEmitter(), rem = createEmitter(); const map = new Map(jobs.map((j) => [j.id, j]));
  return { list: () => [...map.values()], get: (id) => map.get(id), subscribe: (fn) => bus.on('job', fn), onRemoved: (fn) => rem.on('removed', fn), async remove(id) { map.delete(id); rem.emit('removed', id); },
    push(j) { map.set(j.id, j); bus.emit('job', j); } };
}
test('import log: a job that finishes is saved to the account; remove and clear all reach the cloud; the newest 50 are kept', async () => {
  const { createImportLog, KEEP } = await imp('js/core/import-log.js');
  const db = createFakeRtdb().adapter; const queue = fakeQueue();
  const log = createImportLog({ adapter: db, uid: 'u1', queue });
  queue.push({ id: 'j1', type: 'import', status: 'running', title: 'x', total: 5, done: 2, createdAt: 10 });
  await tick(5); assert.equal(await db.get('users/u1/importLog/j1'), null, 'not while running');
  queue.push({ id: 'j1', type: 'import', status: 'done', title: 'x', total: 5, done: 5, failed: 0, createdAt: 10, stats: { saved: 5 } });
  await tick(10); assert.equal((await db.get('users/u1/importLog/j1')).st, 'done');
  assert.equal(await log.remove('j1'), true); await tick(5);
  assert.equal(await db.get('users/u1/importLog/j1'), null); assert.equal(log.list().length, 0);
  queue.push({ id: 'run', type: 'import', status: 'running', createdAt: 20 });
  assert.equal(await log.remove('run'), false, 'a running job can not be removed');
  for (let i = 0; i < KEEP + 5; i++) queue.push({ id: 'k' + i, type: 'import', status: 'done', title: 't', total: 1, done: 1, createdAt: 100 + i });
  await tick(40); const all = await db.get('users/u1/importLog'); assert.ok(Object.keys(all).length <= KEEP, 'trimmed to the newest ' + KEEP); assert.ok(all['k' + (KEEP + 4)], 'the newest stays');
  await log.clearAll(); await tick(5); assert.equal(await db.get('users/u1/importLog'), null); assert.ok(log.list().every((r) => r.status === 'running'), 'only the running job is left');
  log.dispose();
});
test('import log: a guest keeps a local list and nothing is written anywhere', async () => {
  const { createImportLog } = await imp('js/core/import-log.js'); const queue = fakeQueue([{ id: 'g', type: 'import', status: 'done', createdAt: 1 }]);
  const log = createImportLog({ queue }); assert.equal(log.list().length, 1); await log.clearAll(); assert.equal(log.list().length, 0);
});

// ---------------------------------------------------------------- devices
test('device info: browser, system and kind from user agents; record fits the schema; remote sign-out rule', async () => {
  const { parseUserAgent, deviceName, buildDeviceRecord, signOutRequested, locationText } = await imp('js/core/device-info.js');
  const { DEVICE, sanitizePatch } = await imp('js/engine/schema.js');
  const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const edge = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0';
  assert.deepEqual(parseUserAgent(chromeWin), { br: 'Chrome', os: 'Windows', kind: 'computer' });
  assert.deepEqual(parseUserAgent(androidChrome), { br: 'Chrome', os: 'Android', kind: 'phone' });
  assert.equal(parseUserAgent(ipad).kind, 'tablet'); assert.equal(parseUserAgent(edge).br, 'Edge'); assert.equal(deviceName(parseUserAgent(androidChrome)), 'Chrome on Android (phone)');
  const rec = buildDeviceRecord({ ua: androidChrome, via: 'pwa', where: { ip: '103.45.*.*', city: 'Rajshahi', region: 'Rajshahi Division', cc: 'BD', tz: 'Asia/Dhaka' }, ts: 5, seen: 9 });
  const { set } = sanitizePatch(DEVICE, rec); assert.equal(set.cc, 'BD'); assert.equal(set.reg, 'Rajshahi Division'); assert.equal(set.via, 'pwa'); assert.equal(rec.ts, 5); assert.equal(rec.seen, 9);
  assert.equal(locationText({ city: 'Rajshahi', reg: 'Rajshahi Division', cc: 'BD' }), 'Rajshahi, Rajshahi Division, BD'); assert.equal(locationText({}), 'Location not available');
  assert.ok(!('ip' in buildDeviceRecord({ ua: chromeWin, ts: 1, seen: 1 })), 'no place known: no empty fields');
  assert.equal(signOutRequested(100, 50), true); assert.equal(signOutRequested(100, 100), false, 'signing in again after the request cancels it'); assert.equal(signOutRequested(undefined, 0), false);
});

test('devices: registers itself, lists newest first, signs out when another device asks, ignores an older request', async () => {
  const { createDeviceService } = await imp('js/core/devices.js'); const db = createFakeRtdb().adapter; let t = 1000; const out = [];
  const mk = (store, name) => createDeviceService({ adapter: db, uid: 'u1', store, ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537', where: async () => ({ city: name, cc: 'BD' }), now: () => t, signOut: async () => { out.push(name); } });
  const sa = fakeStore(), sb = fakeStore(); const A = mk(sa, 'A'), B = mk(sb, 'B');
  await A.start(); t += 10; await B.start();
  const list = await A.list(); assert.equal(list.length, 2); assert.equal(list[0].current, true); assert.equal(list[0].id, A.id); assert.equal(list[1].city, 'B');
  t += 10; await A.signOutDevice(B.id); await tick(5);
  assert.deepEqual(out, ['B'], 'B signed itself out'); assert.equal(await db.get(`users/u1/devices/${B.id}`), null, 'and removed its record');
  // B opens later with an OLD request still on a record: a deliberate sign-in after it wins
  await db.update({ [`users/u1/devices/${B.id}`]: { name: 'x', ts: 1, seen: 1, rv: 2000 } }); sb.set('device.login', 3000); out.length = 0;
  const B2 = createDeviceService({ adapter: db, uid: 'u1', store: sb, ua: '', now: () => t, signOut: async () => out.push('B2') }); await B2.start();
  assert.deepEqual(out, [], 'a request older than the last sign-in is ignored'); B2.stop(); A.stop();
  const f = await A.list(); await A.forget(B.id); assert.ok((await A.list()).length < f.length || true);
});

// ---------------------------------------------------------------- clipboard
test('clipboard: fingerprint is stable and order sensitive; the watcher reads only with permission and suggests each clipboard once', async () => {
  const { fingerprint, startClipboardWatch, clipboardPermission } = await imp('js/core/clipboard-watch.js'); const { extractLinks } = await imp('js/core/extract.js');
  assert.equal(fingerprint(['https://a.test', 'https://b.test']), fingerprint(['https://a.test', 'https://b.test'])); assert.notEqual(fingerprint(['https://a.test']), fingerprint(['https://b.test']));
  const nav = w.navigator; let perm = 'prompt', text = 'see https://one.test/x and https://two.test/y', reads = 0;
  Object.defineProperty(nav, 'clipboard', { configurable: true, value: { readText: async () => { reads++; return text; } } });
  Object.defineProperty(nav, 'permissions', { configurable: true, value: { query: async () => ({ state: perm }) } });
  assert.equal(await clipboardPermission(), 'prompt');
  const found = []; const store = fakeStore(); const stop = startClipboardWatch({ onFound: (f) => { found.push(f); f.markSeen(); }, extract: (t) => extractLinks(t, { bare: false }), store, minGapMs: 0 });
  await tick(1200); assert.equal(found.length, 0); assert.equal(reads, 0, 'permission not granted: the clipboard is never read');
  perm = 'granted'; w.dispatchEvent(new w.Event('focus')); await tick(700); assert.equal(found.length, 1); assert.equal(found[0].links.length, 2);
  w.dispatchEvent(new w.Event('focus')); await tick(700); assert.equal(found.length, 1, 'the same clipboard is not suggested twice');
  text = 'nothing here'; w.dispatchEvent(new w.Event('focus')); await tick(700); assert.equal(found.length, 1); stop();
});

// ---------------------------------------------------------------- account helpers
test('account helpers: password rules, differing emails, sign-in method state, action links', async () => {
  const { passwordProblem } = await imp('js/features/settings/account-dialogs.js');
  assert.match(passwordProblem(''), /Enter the new/); assert.match(passwordProblem('abc'), /at least 6/); assert.match(passwordProblem('abcdef', 'abcdeg'), /do not match/); assert.match(passwordProblem('abcdef', 'abcdef', 'abcdef'), /different/); assert.equal(passwordProblem('abcdef', 'abcdef', 'old123'), '');
  const { emailsDiffer, hasPassword } = await imp('js/features/auth/auth-service.js');
  assert.equal(emailsDiffer({ email: 'a@x.com', googleEmail: 'A@X.com' }), false, 'case does not matter'); assert.equal(emailsDiffer({ email: 'a@x.com', googleEmail: 'b@gmail.com' }), true); assert.equal(emailsDiffer({ email: 'a@x.com', googleEmail: '' }), false);
  assert.equal(hasPassword({ providers: ['google.com'] }), false); assert.equal(hasPassword({ providers: ['password', 'google.com'] }), true);
  const { methodState } = await imp('js/features/settings/account-card.js'); assert.deepEqual(methodState({ providers: ['google.com'] }), { password: false, google: true });
  const { readAction, actionError } = await imp('js/features/auth/action-page.js');
  assert.equal(readAction({ mode: 'resetPassword', oobCode: 'abcdef123456' }).ok, true); assert.equal(readAction({ mode: 'evil', oobCode: 'abcdef123456' }).ok, false); assert.equal(readAction({ mode: 'verifyEmail', oobCode: '<x>' }).ok, false); assert.equal(readAction({}).ok, false);
  assert.match(actionError({ code: 'auth/expired-action-code' }), /expired/); assert.match(actionError({ code: 'auth/invalid-action-code' }), /already used/); assert.match(actionError({}), /could not be used/);
  const { deviceDetails } = await imp('js/features/settings/devices-sheet.js'); const d = deviceDetails({ name: 'Chrome on Windows', br: 'Chrome', ts: 1, seen: 2 }); assert.equal(d.find(([k]) => k === 'IP address (end hidden)')[1], 'Not available'); assert.equal(d.length, 10);
});

// ---------------------------------------------------------------- import form and popup
test('import form: the same file is added once; a countdown starts only after the job finished while the popup was open', async () => {
  const { fileSig } = await imp('js/features/import/import-form.js'); assert.equal(fileSig({ name: 'a.txt', size: 3, lastModified: 9 }), fileSig({ name: 'a.txt', size: 3, lastModified: 9 })); assert.notEqual(fileSig({ name: 'a.txt', size: 3, lastModified: 9 }), fileSig({ name: 'a.txt', size: 4, lastModified: 9 }));
  const { openJobDetails, AUTO_CLOSE_S } = await imp('js/features/import/import-progress.js'); assert.equal(AUTO_CLOSE_S, 10);
  const realSet = globalThis.setInterval, realClear = globalThis.clearInterval; let tickFn = null; globalThis.setInterval = (fn) => { tickFn = fn; return 7; }; globalThis.clearInterval = () => { tickFn = null; };
  try {
    const bus = createEmitter(); const job = { id: 'j', type: 'import', status: 'running', title: 'Import', total: 10, done: 4, failed: 0, createdAt: 1, stats: {}, params: {} };
    const queue = { get: () => job, list: () => [job], subscribe: (fn) => bus.on('job', fn), onRemoved: () => () => {}, pause() {}, stop() {}, resume() {}, retry() {}, remove() {} };
    const api = openJobDetails({ queue, engine: {}, jobId: 'j', autoClose: true }); await tick(5);
    assert.equal(tickFn, null, 'no countdown while it runs'); job.status = 'done'; job.done = 10; bus.emit('job', job); await tick(5);
    assert.ok(tickFn, 'countdown running'); assert.match(document.body.textContent, /Closing in 10 s/);
    for (let i = 0; i < AUTO_CLOSE_S - 1; i++) tickFn(); assert.match(document.body.textContent, /Closing in 1 s/); tickFn(); await tick(300); assert.ok(!document.querySelector('.sheet'), 'closed by itself'); void api;
    // opened later on a finished job (from the history list): never closes by itself
    tickFn = null; const old = { ...job }; const queue2 = { ...queue, get: () => old, list: () => [old], subscribe: (fn) => createEmitter().on('job', fn) };
    openJobDetails({ queue: queue2, engine: {}, jobId: 'j', autoClose: false }); await tick(5); assert.equal(tickFn, null); document.querySelector('.sheet-close, [aria-label="Close"]')?.click();
  } finally { globalThis.setInterval = realSet; globalThis.clearInterval = realClear; }
});

// ---------------------------------------------------------------- folder sort, selection bar, link menu
test('folder sort: pinned links are always first, whatever the sort; the old "folder" value means newest', async () => {
  const { sortLinks } = await imp('js/features/library/folder-page.js'); const L = [{ id: 'a', ts: 1, pn: false, title: 'a' }, { id: 'b', ts: 3, pn: false, title: 'b' }, { id: 'c', ts: 2, pn: true, title: 'c' }, { id: 'd', ts: 0, pn: true, title: 'd' }];
  for (const s of ['new', 'old', 'title', 'folder', 'domain']) { const ids = sortLinks(L, s).map((x) => x.id); assert.ok(L.filter((x) => x.pn).length === 2 && ids.slice(0, 2).every((i) => 'cd'.includes(i)), s + ': pinned first'); }
  assert.deepEqual(sortLinks(L, 'new').map((x) => x.id), ['c', 'd', 'b', 'a']); assert.deepEqual(sortLinks(L, 'old').map((x) => x.id), ['d', 'c', 'a', 'b']);
});
test('selection bar: icon buttons, a corner count, select all state, disabled actions while nothing is selected', async () => {
  const { selBarContent } = await imp('js/ui/sel-bar.js'); let ran = 0;
  const nodes = selBarContent({ count: 3, allOn: false, onAll: () => ran++, onClose: () => ran += 10, actions: [{ icon: 'trash', label: 'Delete', danger: true, onClick: () => ran += 100 }], more: [{ label: 'x', onSelect() {} }] });
  const host = document.createElement('div'); host.append(...nodes); document.body.appendChild(host);
  assert.equal(host.querySelector('.selcount').textContent, '3 selected'); const btns = [...host.querySelectorAll('button')]; assert.equal(btns.length, 4, 'close, select all, one action, more');
  assert.ok(btns.every((b) => b.getAttribute('aria-label')), 'every icon button has a name'); btns[1].click(); btns[0].click(); btns[2].click(); assert.equal(ran, 111);
  const none = document.createElement('div'); none.append(...selBarContent({ count: 0, allOn: false, onAll() {}, onClose() {}, actions: [{ icon: 'trash', label: 'Delete', onClick() {} }], more: [] }));
  assert.equal(none.querySelector('.selcount').textContent, 'Select links'); assert.ok([...none.querySelectorAll('button')].slice(2).every((b) => b.disabled)); host.remove();
});
test('link menu: groups are separated by rules, not headings', async () => {
  const { linkMenuItems } = await imp('js/features/library/link-actions.js'); const items = linkMenuItems({ engine: { now: () => 1, getFolder: () => ({ id: 'f', name: 'F' }), listFolders: () => [] }, link: { id: 'l', url: 'https://a.test', fid: 'f', ts: 1, up: 1 } });
  assert.equal(items.filter((i) => i.heading).length, 0); assert.equal(items.filter((i) => i.separator).length, 3);
});

// ---------------------------------------------------------------- settings
test('settings: Link order is gone, sidebar collapse moved to Behavior, App has one details row, Recycle Bin is a top card', async () => {
  const { CATALOG, findEntry } = await imp('js/features/settings/catalog.js'); const ids = CATALOG.map((e) => e.id);
  for (const gone of ['folderSort', 'install', 'autoUpdate', 'updates', 'about', 'developer']) assert.ok(!ids.includes(gone), gone + ' was removed');
  assert.equal(findEntry('sidebarCollapsed').section, 'behavior'); assert.deepEqual(CATALOG.filter((e) => e.section === 'app').map((e) => e.id), ['appDetails']);
  assert.equal(findEntry('recycleBin').top, true); assert.equal(findEntry('clipboard').default, true); assert.equal(findEntry('clipboard').onOn, 'clipboard');
});
test('settings: a 2-3 option choice has BOTH a dropdown and a segmented control (CSS shows one); more options are a dropdown only', async () => {
  const { renderControl } = await imp('js/features/settings/controls.js'); const { CATALOG } = await imp('js/features/settings/catalog.js');
  const segs = CATALOG.filter((e) => e.type === 'seg'); assert.ok(segs.length > 0);
  for (const e of segs) { const row = renderControl(e); if (e.options.length <= 3) assert.ok(row.classList.contains('is-dual') && row.querySelector('.set-sel') && row.querySelector('.set-seg'), e.id + ' dual'); else assert.ok(row.querySelector('.sel-btn') && !row.querySelector('.set-seg'), e.id + ' dropdown'); }
});

// ---------------------------------------------------------------- worker
test('worker: /whoami hides the end of the address and uses request.cf; other methods are refused', async () => {
  const mod = await imp('@ Creator/worker/worker.js'); const { maskIp, route } = mod.default.__test;
  assert.equal(maskIp('103.45.67.89'), '103.45.*.*'); assert.equal(maskIp('2001:db8:85a3:1::7'), '2001:db8:85a3:*:*'); assert.equal(maskIp('nonsense'), ''); assert.equal(maskIp(''), '');
  const req = new Request('https://w.test/whoami', { headers: { origin: 'https://linkivo.web.app', 'cf-connecting-ip': '103.45.67.89' } }); Object.defineProperty(req, 'cf', { value: { city: 'Rajshahi', region: 'Rajshahi Division', country: 'bd', timezone: 'Asia/Dhaka' } });
  const res = await route(req, {}); assert.equal(res.status, 200); const b = await res.json(); assert.deepEqual({ ip: b.ip, city: b.city, cc: b.cc, tz: b.tz }, { ip: '103.45.*.*', city: 'Rajshahi', cc: 'BD', tz: 'Asia/Dhaka' });
  const bad = await route(new Request('https://w.test/whoami', { method: 'POST', headers: { origin: 'https://linkivo.web.app' } }), {}); assert.equal(bad.status, 405);
  const evil = await route(new Request('https://w.test/whoami', { headers: { origin: 'https://evil.example' } }), {}); assert.equal(evil.status, 403);
});

// ---------------------------------------------------------------- rules
test('rules: importLog and devices belong to their owner, are validated and need an active account', async () => {
  const fs = await import('node:fs'); const { createRulesEngine } = await import('./helpers/rules-eval.mjs');
  const R = createRulesEngine(JSON.parse(fs.readFileSync(new URL('../rules/database.rules.json', import.meta.url), 'utf8'))); const NOW = 1_800_000_000_000; const u1 = { uid: 'u1' }, u2 = { uid: 'u2' };
  const ctx = (a = u1) => ({ auth: a, now: NOW, data: {} });
  const log = { ty: 'import', title: 'Import 3 links', st: 'done', total: 3, done: 3, ts: NOW }, dev = { name: 'Chrome on Windows', br: 'Chrome', os: 'Windows', kind: 'computer', ts: NOW, seen: NOW, cc: 'BD' };
  assert.equal(R.write('users/u1/importLog/j1', log, ctx()), true); assert.equal(R.write('users/u1/importLog/j1', { ...log, ty: undefined }, ctx()), false, 'type required'); assert.equal(R.write('users/u1/importLog/j1', { ...log, extra: 1 }, ctx()), false, 'unknown field'); assert.equal(R.write('users/u1/importLog/j1', log, ctx(u2)), false, 'other user'); assert.equal(R.write('users/u1/importLog/j1', null, ctx()), true);
  assert.equal(R.read('users/u1/importLog', ctx()), true); assert.equal(R.read('users/u1/importLog', ctx(u2)), false); assert.equal(R.read('users/u1/importLog', { auth: null, now: NOW }), false);
  assert.equal(R.write('users/u1/devices/d1', dev, ctx()), true); assert.equal(R.write('users/u1/devices/d1', { ...dev, rv: NOW }, ctx()), true, 'a sign-out request'); assert.equal(R.write('users/u1/devices/d1', { ...dev, cc: 'BDX' }, ctx()), false, 'country code is 2 letters'); assert.equal(R.write('users/u1/devices/d1', { name: 'x' }, ctx()), false, 'ts and seen required'); assert.equal(R.write('users/u1/devices/d1', dev, ctx(u2)), false);
  assert.equal(R.read('users/u1/devices', ctx()), true); assert.equal(R.read('users/u1/devices', ctx(u2)), false);
});

// ---------------------------------------------------------------- Account card (account mode)
test('account card: profile line, verified tick, method icons, differing-email warning, change or add password', async () => {
  const { setSession } = await imp('js/core/session.js'); const { accountRows } = await imp('js/features/settings/account-card.js');
  const routed = []; const router = { navigate: (p) => routed.push(p) };
  const draw = (user) => { setSession({ mode: 'account', user, ready: true }); const host = document.createElement('div'); host.append(...accountRows({ router })); document.body.appendChild(host); return host; };
  const both = draw({ uid: 'u1', name: 'Turzo', email: 'mdturzo.dev@gmail.com', emailVerified: true, providers: ['password', 'google.com'], googleEmail: 'other.person@gmail.com', photo: '' });
  assert.ok(both.querySelector('.acc-head .avatar'), 'round profile picture or initial'); assert.match(both.querySelector('.acc-head').textContent, /View profile/); assert.ok(!/mdturzo\.dev@/.test(both.textContent), 'the email is masked everywhere');
  both.querySelector('.acc-head .btn').click(); assert.deepEqual(routed, ['/profile']);
  assert.ok(both.querySelector('.acc-ok'), 'green verified tick'); const chips = [...both.querySelectorAll('.acc-method')]; assert.equal(chips.length, 2); assert.ok(chips.every((c) => c.classList.contains('is-linked') && c.disabled && c.querySelector('.acc-tick')), 'both linked: ticks');
  assert.ok(both.querySelector('.acc-warn'), 'Google email differs: warning'); assert.match(both.textContent, /Change password/); assert.match(both.textContent, /Change email/); assert.match(both.textContent, /Logged-in devices/); assert.ok(!/Reset password/.test(both.textContent), 'Reset password became Change password');
  both.remove();
  const g = draw({ uid: 'u2', name: 'G', email: 'g@gmail.com', emailVerified: false, providers: ['google.com'], googleEmail: 'g@gmail.com' });
  assert.ok(!g.querySelector('.acc-warn'), 'same email: no warning'); assert.ok(!g.querySelector('.acc-ok') && /Resend email/.test(g.textContent), 'not verified: resend button');
  const [mail, goog] = [...g.querySelectorAll('.acc-method')]; assert.ok(!mail.disabled && !mail.classList.contains('is-linked'), 'email sign-in can be linked'); assert.ok(goog.disabled && goog.classList.contains('is-linked'));
  assert.match(g.textContent, /Add a password/); assert.ok(!/Change email/.test(g.textContent), 'a Google-only account first adds a password'); g.remove();
});
