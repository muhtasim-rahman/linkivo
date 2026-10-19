// Boot sequence smoke test (jsdom, guest mode so no network is needed): boot -> first page -> data layer -> session changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/');
const $ = (s) => document.querySelector(s);

const { prefs } = await import('../../js/core/local-prefs.js');
prefs.set('mode', 'guest');
const { boot } = await import('../../js/boot.js');
const { getEngine, getQueue } = await import('../../js/core/app-data.js');
const { getSession } = await import('../../js/core/session.js');
const { leaveGuest, enterGuest } = await import('../../js/features/auth/auth-service.js');

test('boot as guest: first page mounted, chrome visible, data layer running, boot marker set', async () => {
  await boot();
  assert.equal(document.documentElement.dataset.boot, 'ok');
  assert.equal(location.pathname, '/library');
  assert.equal($('#app').dataset.chrome, ''); assert.equal(document.querySelectorAll('#sidebar .nav-item').length, 5);
  assert.match($('#page-root').textContent, /Library/);
  const e = getEngine(); assert.ok(e && e.ready); assert.ok(getQueue());
  const f = await e.createFolder({ name: 'Boot test' }); assert.equal(e.listFolders().length, 1); assert.ok(f.id);
  assert.equal($('.pf-name').textContent, 'Guest');
});

test('leaving guest mode tears the data layer down and routes to /login; entering again returns', async () => {
  leaveGuest();
  await waitFor(() => location.pathname === '/login');
  assert.equal(location.pathname, '/login'); assert.equal($('#app').dataset.chrome, 'none'); assert.equal(getEngine(), null);
  assert.ok($('.auth-panel'));
  enterGuest();
  await waitFor(() => location.pathname === '/library' && getEngine());
  assert.equal(location.pathname, '/library'); assert.ok(getEngine());
  assert.equal(getEngine().listFolders().length, 0, 'memory fallback database starts empty (IndexedDB is not available in jsdom)');
  assert.equal(getSession().mode, 'guest');
});

test('deleted account status routes to /reactivate; session none shows login', async () => {
  const { setSession } = await import('../../js/core/session.js');
  setSession({ mode: 'account', user: { uid: 'u9', email: 'someone@x.io', name: 'Some', emailVerified: true, providers: ['google.com'] }, status: 'deleted' });
  await waitFor(() => location.pathname === '/reactivate');
  assert.equal(location.pathname, '/reactivate'); assert.equal(getEngine(), null);
  setSession({ mode: 'none', user: null, status: 'active' });
  await waitFor(() => location.pathname === '/login');
  assert.equal(location.pathname, '/login');
  await tick(20);
});
