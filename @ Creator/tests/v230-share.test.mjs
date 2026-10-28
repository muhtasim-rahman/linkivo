// Linkivo v2.3.0: Web Share Target. Pure model, manifest entry, and the page (signed in, signed out, several links).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/share');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = await import('../../js/features/share/share-model.js');
const { Engine } = await import('../../js/engine/engine.js');
const { createMemoryDb } = await import('../../js/engine/idb.js');
const { installDataForTests } = await import('../../js/core/app-data.js');
const { createRouter } = await import('../../js/core/router.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { ROUTES } = await import('../../js/features/shell/routes.js');
const { prefs } = await import('../../js/core/local-prefs.js');

test('manifest: share_target is a GET to /share with title, text and url', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.deepEqual(m.share_target, { action: '/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } });
});

test('sharedLinks: the address may be in url, text or title; duplicates collapse; a real title is kept, a copy of the text is not', () => {
  assert.deepEqual(S.sharedLinks({ url: 'https://a.test/x', title: 'Nice page' }), { items: [{ url: 'https://a.test/x' }], title: 'Nice page' });
  const t = S.sharedLinks({ title: 'Nice page', text: 'Look at this https://b.test/y now' }); assert.equal(t.items[0].url, 'https://b.test/y'); assert.equal(t.title, 'Nice page');
  assert.equal(S.sharedLinks({ text: 'https://c.test/z', title: 'https://c.test/z' }).title, '', 'a title that is just the address is dropped');
  const many = S.sharedLinks({ text: 'https://a.test/1 https://a.test/1 https://b.test/2' }); assert.equal(many.items.length, 2); assert.equal(many.title, '', 'no title for several links');
  assert.deepEqual(S.sharedLinks({ text: 'no link here' }).items, []); assert.deepEqual(S.sharedLinks({}).items, []);
  assert.equal(S.sharedLinks({ text: Array.from({ length: 40 }, (_, i) => `https://s${i}.test/`).join(' ') }).items.length, S.MAX_SHARED);
});

test('pending shares expire after 30 minutes', () => {
  const p = S.pendingFromQuery({ url: 'https://a.test' }, 1000); assert.equal(S.isFresh(p, 1000 + 60000), true); assert.equal(S.isFresh(p, 1000 + S.PENDING_TTL + 1), false);
  assert.equal(S.pendingFromQuery({}), null); assert.equal(S.isFresh(null), false);
});

async function open(path, session) {
  const e = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await e.init(); installDataForTests(e, null);
  const f = await e.createFolder({ name: 'Inbox' });
  setSession(session); const container = $('#page-root'); container.replaceChildren();
  const router = createRouter({ routes: ROUTES, container, getSession }); await router.start(); await router.navigate(path); await tick(40);
  return { e, f, router, container };
}

test('Share page: saves the shared link to the preselected folder with the typed title, then opens the folder', async () => {
  prefs.remove(S.PENDING_KEY || 'share.pending'); prefs.remove('share.lastFolder');
  const { e, f, router, container } = await open('/share?title=Nice%20page&url=https%3A%2F%2Fa.test%2Fx', { mode: 'guest', user: null, status: 'active' });
  assert.match(container.textContent, /a\.test/); assert.equal($('.sh input[type=text]').value, 'Nice page'); assert.match($('.sh-folder').textContent, /Inbox/);
  $('.sh-save').click(); await waitFor(() => e.listLinks({ fid: f.id }).length === 1);
  await waitFor(() => prefs.get('share.lastFolder') === f.id); const l = e.listLinks({ fid: f.id })[0]; assert.equal(l.url, 'https://a.test/x'); assert.equal(l.title, 'Nice page'); assert.equal(prefs.get('share.lastFolder'), f.id);
  await tick(30); assert.match(location.pathname, /^\/folder\//); router.destroy();
});

test('Share page: several links are listed with check boxes and only the ticked ones are saved; the same link twice is not saved twice', async () => {
  const { e, f, router, container } = await open('/share?text=' + encodeURIComponent('https://a.test/1 https://b.test/2 https://c.test/3'), { mode: 'guest', user: null, status: 'active' });
  assert.equal($$('.sh-pick input').length, 3); $$('.sh-pick input')[1].click(); await tick(5); assert.match($('.sh-save').textContent, /Save 2 links/);
  $('.sh-save').click(); await waitFor(() => e.listLinks({ fid: f.id }).length === 2); assert.deepEqual(e.listLinks({ fid: f.id }).map((l) => l.host).sort(), ['a.test', 'c.test']); router.destroy();
  const again = await open('/share?url=' + encodeURIComponent('https://a.test/1'), { mode: 'guest', user: null, status: 'active' });
  await again.e.addLinks([{ url: 'https://a.test/1' }], { fid: again.f.id }); $('.sh-save').click(); await tick(60); assert.equal(again.e.listLinks({ fid: again.f.id }).length, 1, 'dedupe'); again.router.destroy();
});

test('Share page: signed out parks the share and opens login; nothing found shows a calm message', async () => {
  prefs.remove('share.pending');
  const out = await open('/share?url=' + encodeURIComponent('https://park.test/p'), { mode: 'none', user: null, status: 'none' });
  assert.equal(location.pathname, '/login'); assert.equal(prefs.get('share.pending').url, 'https://park.test/p'); out.router.destroy(); prefs.remove('share.pending');
  const none = await open('/share?text=hello', { mode: 'guest', user: null, status: 'active' }); assert.match(none.container.textContent, /No link found/); none.router.destroy();
});
