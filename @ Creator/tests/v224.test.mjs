// Linkivo v2.2.4: quick-fix round. Request email text, Danger zone order, install note, device sign-out tracking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from './helpers/dom-env.mjs';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';
setupDom('http://localhost/library');
const imp = (p) => import('../../' + p);

test('delete account: the request email carries the account facts, an id and the typed phrase; nothing secret', async () => {
  const { buildRequest, PHRASE, REQUEST_TO } = await imp('js/features/settings/delete-account.js');
  const f = { uid: 'U123', email: 'me@example.com', name: 'Me', verified: true, providers: ['password', 'google.com'], created: 1700000000000, lastLogin: 1700000100000 };
  const r = buildRequest(f, { folders: 3, links: 40 }, 'AB12CD34', 1700000200000);
  assert.match(r.subject, /me@example\.com/); assert.match(r.subject, /AB12CD34/);
  for (const t of ['U123', 'me@example.com', '3 folders, 40 links', 'password, google.com', PHRASE, 'Request id: AB12CD34']) assert.ok(r.body.includes(t), t);
  assert.ok(!/password:/i.test(r.body)); assert.equal(REQUEST_TO, 'linkivo.web@gmail.com');
});

test('danger zone order (v2.3.0 owner): log out, clear app cache, reset, local data, delete account; Advanced keeps no important setting', async () => {
  const { entriesFor } = await imp('js/features/settings/catalog.js');
  assert.deepEqual(entriesFor('danger').map((e) => e.id), ['logout', 'clearCache', 'reset', 'clearLocal', 'deleteAccount']);
  assert.ok(!entriesFor('account').some((e) => /logout/i.test(e.id)));
});

test('install: the browser note shows on a device that has the app, and can be hidden for 7 days', async () => {
  const { installState, shouldShowInstalledNote, dismissNote } = await imp('js/core/install.js');
  installState.set({ standalone: false, installedFlag: true }); assert.equal(shouldShowInstalledNote(), true);
  dismissNote(); assert.equal(shouldShowInstalledNote(), false);
  installState.set({ standalone: true, installedFlag: true }); assert.equal(shouldShowInstalledNote(), false, 'never inside the app');
});

test('devices: a sign-out asked from another device remembers which device asked', async () => {
  const { createDeviceService } = await imp('js/core/devices.js'); const db = createFakeRtdb().adapter; const m = new Map();
  const store = { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const svc = createDeviceService({ adapter: db, uid: 'u1', store, ua }); await svc.signOutDevice('other');
  assert.ok(await db.get('users/u1/devices/other/rv')); assert.match(await db.get('users/u1/devices/other/by'), /Chrome on Windows/);
});

test('router: pages are pushed as history entries (native Back)', async () => {
  const fs = await import('node:fs'); const src = fs.readFileSync(new URL('../../js/core/router.js', import.meta.url), 'utf8');
  assert.match(src, /history\.pushState\(hist/); assert.ok(!/lk: 'top'\s*,\s*from: null/.test(src.split('function onPop')[1].split('function onClick')[0]));
});
