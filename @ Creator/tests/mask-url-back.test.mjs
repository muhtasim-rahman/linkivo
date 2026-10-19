import test from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail } from '../../js/core/mask.js';
import { dedupeKey, hostOf, cleanTracking, parseUrl } from '../../js/core/url-tools.js';
import { resolveBack } from '../../js/core/back-logic.js';
import { compileRoutes, resolveGuard, parentOf } from '../../js/core/router.js';
import { newId } from '../../js/core/utils.js';
import { relativeTime, formatBytes } from '../../js/core/format.js';

test('maskEmail keeps first 2 and last 2 of long names, less of short ones', () => {
  assert.equal(maskEmail('tuzo.dev99@gmail.com'), 'tu******99@gmail.com');
  assert.equal(maskEmail('abcdef@x.io'), 'ab******ef@x.io');
  assert.equal(maskEmail('abcde@x.io'), 'a******e@x.io');
  assert.equal(maskEmail('abc@x.io'), 'a******c@x.io');
  assert.equal(maskEmail('ab@x.io'), 'a******@x.io');
  assert.equal(maskEmail('a@x.io'), 'a******@x.io');
  assert.equal(maskEmail('not-an-email'), '');
  assert.equal(maskEmail(null), '');
});

test('dedupeKey: same page, different spelling', () => {
  const k = dedupeKey('https://www.Example.com/a/?utm_source=x&b=2&a=1#frag');
  assert.equal(k, dedupeKey('http://example.com/a?a=1&b=2'));
  assert.equal(dedupeKey('example.com/page'), dedupeKey('https://example.com/page/'));
  assert.notEqual(dedupeKey('https://example.com/a'), dedupeKey('https://example.com/b'));
  assert.equal(dedupeKey('https://example.com:8080/x'), 'example.com:8080/x');
  assert.equal(dedupeKey('mailto:a@b.c'), null);
  assert.equal(dedupeKey('not a url'), null);
});

test('hostOf, parseUrl, cleanTracking', () => {
  assert.equal(hostOf('https://www.youtube.com/watch?v=1'), 'youtube.com');
  assert.equal(parseUrl('javascript:alert(1)'), null);
  assert.equal(parseUrl('ftp://x.com/a'), null);
  assert.equal(cleanTracking('https://a.com/p?id=1&utm_campaign=z&fbclid=q'), 'https://a.com/p?id=1');
});

test('resolveBack order: layer, parent, root hint, exit', () => {
  assert.deepEqual(resolveBack({ layerCount: 2, parent: '/library' }), { type: 'close-layer' });
  assert.deepEqual(resolveBack({ layerCount: 0, parent: '/library' }), { type: 'navigate', to: '/library' });
  assert.deepEqual(resolveBack({ parent: null, now: 10000, lastRootBackAt: 0 }), { type: 'root-first' });
  assert.deepEqual(resolveBack({ parent: null, now: 11000, lastRootBackAt: 10000 }), { type: 'exit' });
  assert.deepEqual(resolveBack({ parent: null, now: 13000, lastRootBackAt: 10000 }), { type: 'root-first' });
});

const table = [
  { id: 'library', pattern: '/library', parent: null, guard: 'auth' },
  { id: 'folder', pattern: '/folder/:fid', parent: '/library', guard: 'auth' },
  { id: 'link', pattern: '/link/:lid', parent: (p, e, s) => s.from || '/library', guard: 'auth' },
  { id: 'settings', pattern: '/settings', parent: '/library', guard: 'auth' },
  { id: 'settings-section', pattern: '/settings/:section', parent: (p, env) => (env.isWide ? '/library' : '/settings'), guard: 'auth' },
  { id: 'login', pattern: '/login', parent: null, guard: 'public' },
  { id: 'reactivate', pattern: '/reactivate', parent: null, guard: 'auth' },
  { id: 'terms', pattern: '/terms', parent: '/library', guard: 'open' },
  { id: 'nf', pattern: '*', parent: '/library', guard: 'open' }
];
const R = compileRoutes(table);

test('route matching with params, decoding and fallback', () => {
  assert.equal(R.match('/library').route.id, 'library');
  assert.deepEqual(R.match('/folder/ab%20c').params, { fid: 'ab c' });
  assert.equal(R.match('/settings/security').route.id, 'settings-section');
  assert.equal(R.match('/nope/deep/path').route.id, 'nf');
  assert.equal(R.match('/folder').route.id, 'nf');
});

test('parent chain examples from ARCHITECTURE section 7', () => {
  const m = (p) => R.match(p);
  assert.equal(parentOf(m('/folder/x').route, {}), '/library');
  assert.equal(parentOf(m('/link/1').route, {}, {}, { from: '/random' }), '/random');
  assert.equal(parentOf(m('/link/1').route, {}, {}, {}), '/library');
  assert.equal(parentOf(m('/settings/appearance').route, {}, { isWide: false }), '/settings');
  assert.equal(parentOf(m('/settings/appearance').route, {}, { isWide: true }), '/library');
  assert.equal(parentOf(m('/library').route, {}), null);
});

test('route guards: signed out, guest, account, deleted account', () => {
  const none = { mode: 'none', status: 'active' }, guest = { mode: 'guest', status: 'active' }, del = { mode: 'account', status: 'deleted' };
  const g = (id, s) => resolveGuard(table.find((r) => r.id === id), s);
  assert.equal(g('library', none), '/login');
  assert.equal(g('login', none), null);
  assert.equal(g('login', guest), '/library');
  assert.equal(g('library', guest), null);
  assert.equal(g('terms', none), null);
  assert.equal(g('library', del), '/reactivate');
  assert.equal(g('reactivate', del), null);
  assert.equal(g('reactivate', guest), '/library');
  assert.equal(g('reactivate', none), '/login');
});

test('newId is sortable by time and has no forbidden key characters', () => {
  const a = newId(1000), b = newId(2000);
  assert.ok(a < b);
  assert.match(a, /^[0-9a-z]{16}$/);
});

test('format helpers', () => {
  const now = 1_000_000_000_000;
  assert.equal(relativeTime(now - 10_000, now), 'just now');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5 min ago');
  assert.equal(relativeTime(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(formatBytes(1536), '1.5 KB');
});
