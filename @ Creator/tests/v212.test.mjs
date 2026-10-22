// Linkivo v2.1.2: pure logic added in this version (no DOM needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const root = new URL('../../', import.meta.url);

test('compareVersions orders x.y.z numerically', async () => {
  const { compareVersions } = await import(new URL('js/core/update.js', root));
  assert.equal(compareVersions('2.1.2', '2.1.0'), 1); assert.equal(compareVersions('2.1.0', '2.1.2'), -1);
  assert.equal(compareVersions('2.10.0', '2.9.9'), 1, 'numeric, not alphabetical'); assert.equal(compareVersions('2.1', '2.1.0'), 0);
  assert.equal(compareVersions('x', '2.1.0'), 0, 'unreadable input never triggers an update');
});

test('splash resolveMode: auto is full once, then short; settings and reduced motion win', async () => {
  const { resolveMode } = await import(new URL('js/features/splash/splash.js', root));
  assert.equal(resolveMode({ setting: 'auto', seen: false }), 'full'); assert.equal(resolveMode({ setting: 'auto', seen: true }), 'short');
  assert.equal(resolveMode({ setting: 'full', seen: true }), 'full'); assert.equal(resolveMode({ setting: 'short', seen: false }), 'short');
  assert.equal(resolveMode({ setting: 'full', seen: false, reduce: true }), 'still');
});

test('pageMeta: private pages are noindex, public pages indexable with canonical', async () => {
  const { pageMeta } = await import(new URL('js/core/page-meta.js', root));
  const pub = pageMeta({ title: 'Sign in', pattern: '/login', index: true, desc: 'd' });
  assert.equal(pub.robots, 'index,follow'); assert.equal(pub.canonical, 'https://linkivo.web.app/login'); assert.equal(pub.title, 'Sign in - Linkivo');
  const priv = pageMeta({ title: (p) => 'Folder ' + p.id, pattern: '/folder/:id' }, { id: 'x' });
  assert.equal(priv.robots, 'noindex,nofollow'); assert.equal(priv.canonical, ''); assert.equal(priv.title, 'Folder x - Linkivo');
});

test('shouldBlockContext: blocked everywhere except text fields and .selectable', async () => {
  const { shouldBlockContext } = await import(new URL('js/core/input-guards.js', root));
  const mk = (closest) => ({ closest: () => closest });
  assert.equal(shouldBlockContext(mk(null), true), true); assert.equal(shouldBlockContext(mk({}), true), false); assert.equal(shouldBlockContext(mk(null), false), false);
});

test('pullDistance is a damped, capped rubber band', async () => {
  const { pullDistance } = await import(new URL('js/ui/pull-refresh.js', root));
  assert.equal(pullDistance(-20), 0); assert.equal(pullDistance(100), 50); assert.equal(pullDistance(1000), 96);
});

test('settings scroll-spy picks the section at the top; the last one at the bottom', async () => {
  const { activeSection } = await import(new URL('js/features/settings/settings-page.js', root));
  const tops = [{ id: 'a', top: -400 }, { id: 'b', top: 60 }, { id: 'c', top: 700 }];
  assert.equal(activeSection(tops, false), 'b'); assert.equal(activeSection(tops, true), 'c'); assert.equal(activeSection([{ id: 'a', top: 300 }], false), 'a');
});
