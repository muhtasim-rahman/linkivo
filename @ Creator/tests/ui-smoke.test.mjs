// DOM smoke tests (jsdom). They run the real modules against a fake browser: they catch runtime errors, wiring mistakes and
// behavior of router, overlays, pages and the metadata tester. They do NOT replace opening the app in a real browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/library');
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const { createRouter } = await import('../../js/core/router.js');
const { resetLayers, pushLayer, layerCount } = await import('../../js/core/nav-stack.js');
const { setSession, getSession } = await import('../../js/core/session.js');
const { prefs } = await import('../../js/core/local-prefs.js');
const { applyAppearance } = await import('../../js/core/appearance.js');
const { toast } = await import('../../js/ui/toast.js');
const { openSheet } = await import('../../js/ui/sheet.js');
const { confirmDialog } = await import('../../js/ui/confirm.js');
const { openMenu } = await import('../../js/ui/popover.js');
const { icon } = await import('../../js/ui/icons.js');
const { ROUTES } = await import('../../js/features/shell/routes.js');

function pageRoutes(log) {
  const mk = (name) => async () => ({ mount: (c, ctx) => { const el = document.createElement('div'); el.className = 'page'; el.dataset.name = name; el.textContent = name + JSON.stringify(ctx.params); c.appendChild(el); log.push('mount:' + name); return () => log.push('unmount:' + name); } });
  return [
    { id: 'library', pattern: '/library', title: 'Library', parent: null, guard: 'auth', tab: 'library', load: mk('library') },
    { id: 'folder', pattern: '/folder/:fid', title: 'Folder', parent: '/library', guard: 'auth', tab: 'library', load: mk('folder') },
    { id: 'link', pattern: '/link/:lid', title: 'Link', parent: (p, e, s) => s.from || '/library', guard: 'auth', load: mk('link') },
    { id: 'random', pattern: '/random', title: 'Random', parent: '/library', guard: 'auth', tab: 'random', load: mk('random') },
    { id: 'login', pattern: '/login', title: 'Sign in', parent: null, guard: 'public', shell: false, load: mk('login') },
    { id: 'root', pattern: '/', parent: null, guard: 'open', redirect: (s) => (s.mode === 'none' ? '/login' : '/library'), load: mk('root') },
    { id: 'nf', pattern: '*', title: 'Not found', parent: '/library', guard: 'open', load: mk('nf') }
  ];
}

test('router: one page at a time, guards redirect, title updates', async () => {
  setSession({ mode: 'none', user: null, status: 'active', ready: true });
  const log = []; const container = $('#page-root');
  const router = createRouter({ routes: pageRoutes(log), container, getSession, onHint: () => {} });
  await router.start();
  assert.equal(location.pathname, '/login'); assert.equal($$('.page', container).length, 1); assert.equal($('.page', container).dataset.name, 'login');
  setSession({ mode: 'guest', status: 'active' });
  await router.reevaluate();
  assert.equal(location.pathname, '/library'); assert.deepEqual($$('.page', container).map((n) => n.dataset.name), ['library']);
  assert.ok(log.includes('unmount:login'));
  await router.navigate('/folder/abc');
  assert.equal($$('.page', container).length, 1); assert.match($('.page', container).textContent, /"fid":"abc"/);
  assert.equal(document.title, 'Folder - Linkivo');
  await router.navigate('/does/not/exist');
  assert.equal($('.page', container).dataset.name, 'nf');
  assert.deepEqual(log.filter((l) => l.startsWith('mount:')).length - log.filter((l) => l.startsWith('unmount:')).length, 1, 'exactly one page mounted');
  router.destroy();
});

test('router: Back follows overlay layers, then the parent chain, then the exit rule', async () => {
  setSession({ mode: 'guest', status: 'active' }); resetLayers();
  const log = []; const hints = []; const container = $('#page-root');
  const router = createRouter({ routes: pageRoutes(log), container, getSession, onHint: (m) => hints.push(m) });
  await router.start();                                    // lands on /library (guest)
  await router.navigate('/folder/f1');
  let closed = 0; pushLayer(() => { closed++; });
  history.back(); await waitFor(() => closed === 1); await tick(40);
  assert.equal(closed, 1, 'overlay closed first'); assert.equal(router.current().path, '/folder/f1', 'page did not change');
  history.back(); await waitFor(() => router.current().path === '/library');
  assert.equal(router.current().path, '/library', 'parent chain');
  await tick(40); history.back(); await waitFor(() => hints.length === 1);
  assert.equal(hints.length, 1, 'first back at the root only hints');
  assert.equal(router.current().path, '/library');
  await router.navigate('/link/9', { from: '/random' });
  await tick(40); history.back(); await waitFor(() => router.current().path === '/random');
  assert.equal(router.current().path, '/random', 'link goes back to where it was opened from');
  assert.equal(layerCount(), 0);
  router.destroy();
});

test('router: in-app links are intercepted, external and data-native links are not', async () => {
  setSession({ mode: 'guest', status: 'active' });
  const log = []; const container = $('#page-root');
  const router = createRouter({ routes: pageRoutes(log), container, getSession });
  await router.start();
  const a = document.createElement('a'); a.href = '/random'; container.appendChild(a);
  const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  a.dispatchEvent(ev); await waitFor(() => router.current().path === '/random');
  assert.equal(ev.defaultPrevented, true); assert.equal(router.current().path, '/random');
  const ext = document.createElement('a'); ext.href = 'https://example.org/x'; container.appendChild(ext);
  const ev2 = new w.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }); ext.dispatchEvent(ev2);
  assert.equal(ev2.defaultPrevented, false);
  router.destroy();
});

test('icons: every icon renders an svg with children; unknown names fall back', async () => {
  const { ICON_NAMES } = await import('../../js/ui/icons.js');
  for (const n of ICON_NAMES) { const el = icon(n); assert.equal(el.tagName.toLowerCase(), 'svg'); assert.ok(el.childNodes.length > 0, n); }
  assert.ok(icon('does-not-exist').childNodes.length > 0);
});

test('toast: never more than two, action works, auto-dismisses', async () => {
  const host = $('#toast-host');
  toast('one'); toast('two'); toast('three');
  assert.equal($$('.toast', host).length, 2); assert.equal($$('.toast-text', host).map((n) => n.textContent).join(), 'two,three');
  let undone = 0; toast('deleted', { action: { label: 'Undo', onClick: () => undone++ } });
  $$('.toast-action', host)[0].click(); assert.equal(undone, 1);
});

test('sheet: focus, Escape, scrim, back layer, inert background, confirm results', async () => {
  resetLayers();
  const closes = []; const api = openSheet({ title: 'Hello', body: 'Body text', actions: [{ label: 'OK', variant: 'primary' }], onClose: (r) => closes.push(r) });
  assert.ok($('.sheet')); assert.equal($('#app').inert, true); assert.equal(layerCount(), 1);
  await tick(5); assert.ok($('.sheet').contains(document.activeElement));
  document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick(200);
  assert.equal($('.sheet'), null); assert.equal($('#app').inert, false); assert.equal(closes.length, 1); assert.equal(layerCount(), 0);

  const p = confirmDialog({ title: 'Delete?', message: 'Sure?', confirmLabel: 'Delete', danger: true });
  await tick(5); $$('.sheet-foot button').find((b) => b.textContent === 'Delete').click();
  assert.equal(await p, true);
  const p2 = confirmDialog({ title: 'Delete?', message: 'Sure?' }); await tick(5);
  $$('.sheet-foot button').find((b) => b.textContent === 'Cancel').click();
  assert.equal(await p2, false);
  const p3 = confirmDialog({ title: 'Back?' }); await tick(5);
  const { closeTopLayer } = await import('../../js/core/nav-stack.js'); closeTopLayer();
  assert.equal(await p3, false, 'Back button cancels a confirm'); await tick(200);
});

test('popover menu: keyboard, selection, Escape', async () => {
  resetLayers();
  const anchor = document.createElement('button'); document.body.appendChild(anchor);
  let picked = ''; const m = openMenu(anchor, [{ label: 'One', onSelect: () => { picked = 'one'; } }, { separator: true }, { label: 'Two', danger: true, onSelect: () => { picked = 'two'; } }]);
  assert.equal($$('.pop-item').length, 2); assert.equal(document.activeElement.textContent, 'One');
  document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); assert.equal(document.activeElement.textContent, 'Two');
  document.activeElement.click(); assert.equal(picked, 'two'); assert.equal($('.pop'), null);
  openMenu(anchor, [{ label: 'X' }]); document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal($('.pop'), null); assert.equal(layerCount(), 0);
});

test('appearance: theme, accent, text size and reduced motion reach <html>', async () => {
  prefs.set('ui.theme', 'dark'); prefs.set('ui.accent', 'violet'); prefs.set('ui.fontSize', 'large'); prefs.set('ui.reduceMotion', 'reduce');
  applyAppearance();
  const d = document.documentElement.dataset;
  assert.equal(d.theme, 'dark'); assert.equal(d.accent, 'violet'); assert.equal(d.font, 'large'); assert.equal(d.motion, 'reduce');
  prefs.set('ui.accent', 'nope'); applyAppearance(); assert.equal(document.documentElement.dataset.accent, 'blue');
  prefs.remove('ui.theme'); prefs.remove('ui.accent'); prefs.remove('ui.fontSize'); prefs.remove('ui.reduceMotion'); applyAppearance();
});

test('shell: builds sidebar and bar, marks the active tab, slides the ring marker', async () => {
  const { mountShell } = await import('../../js/features/shell/shell.js');
  const handlers = {}; const router = { on: (t, fn) => { handlers[t] = fn; }, navigate() {}, back() {} };
  setSession({ mode: 'account', user: { uid: 'u1', email: 'tuzo.dev99@gmail.com', name: 'Turzo', emailVerified: true, providers: ['google.com'] }, status: 'active' });
  const shell = mountShell({ router }); shell.setSession(getSession());
  assert.equal($$('#sidebar .sb-nav .nav-item').length, 5); assert.equal($$('#bar .bar-item').length, 5);
  assert.equal($$('#sidebar .sb-nav .nav-item')[0].dataset.tab, 'import', 'sidebar order starts with Import links');
  assert.equal($$('#bar .bar-item')[2].dataset.tab, 'import', 'bar centre is Import');
  handlers.route({ route: { tab: 'random', shell: true } });
  assert.equal($('#bar [aria-current="page"]').dataset.tab, 'random'); assert.equal($('.bar-marker').style.getPropertyValue('--i'), '1'); assert.equal($('.bar-marker').dataset.hidden, 'false');
  handlers.route({ route: { tab: 'import', shell: true } }); assert.equal($('.bar-marker').dataset.hidden, 'true', 'filled Import button needs no ring');
  handlers.route({ route: { tab: 'x', shell: false } }); assert.equal($('#app').dataset.chrome, 'none');
  assert.equal($('.pf-mail').textContent, 'tu******99@gmail.com'); assert.equal($('.pf-name').textContent, 'Turzo');
  $('.theme-row').click(); await tick(5); assert.equal(prefs.get('ui.theme'), 'dark'); prefs.remove('ui.theme');
  $('.sb-toggle').click(); assert.equal($('#app').dataset.collapsed, 'true'); assert.equal(prefs.get('ui.sidebarCollapsed'), true);
  $('.sb-expandbtn').click(); assert.equal($('#app').dataset.collapsed, 'false');
});

test('route table: every route loads a real module with mount(), and every parent exists', async () => {
  const { compileRoutes, parentOf } = await import('../../js/core/router.js');
  const R = compileRoutes(ROUTES);
  for (const r of ROUTES) {
    const mod = await r.load(); assert.equal(typeof mod.mount, 'function', r.id);
    for (const env of [{ isWide: true }, { isWide: false }]) {
      const parent = parentOf(r, { x: 1 }, env, { from: null });
      if (parent) assert.notEqual(R.match(parent).route.id, 'not-found', `${r.id} parent ${parent}`);
    }
  }
});

let pagesRouter = null;
test('pages mount without errors: stub, menu, profile, reactivate, login (guest and account)', async () => {
  const container = $('#page-root');
  const { createRouter: mk } = await import('../../js/core/router.js');
  const router = mk({ routes: ROUTES, container, getSession }); pagesRouter = router;
  setSession({ mode: 'guest', user: null, status: 'active' });
  await router.start();
  for (const p of ['/library', '/random', '/import', '/search', '/folder/x', '/link/y', '/terms', '/nope', '/menu', '/profile']) {
    await router.navigate(p); await tick(5);
    assert.equal($$('.page', container).length, 1, p); assert.ok(container.textContent.length > 10, p);
  }
  assert.match(container.textContent, /Guest/, 'profile shows guest mode');
  await router.navigate('/library'); assert.match(container.textContent, /Library arrives in v2\.2\.0/);
  setSession({ mode: 'account', user: { uid: 'u1', email: 'abcdefgh@x.io', name: 'Abc', emailVerified: false, providers: ['password'] }, status: 'active' });
  await router.navigate('/profile'); assert.match(container.textContent, /ab\*{6}gh@x\.io/);
  setSession({ status: 'deleted' }); await router.reevaluate(); assert.equal(location.pathname, '/reactivate'); assert.match(container.textContent, /scheduled for deletion/);
  setSession({ mode: 'none', user: null, status: 'active' }); await router.reevaluate();
  assert.equal(location.pathname, '/login'); assert.ok($('.auth-panel')); assert.equal($('.auth-title').textContent, 'Welcome back');
});

test('login page: tabs, validation, guest notice enters guest mode', async () => {
  const container = $('#page-root');
  assert.ok($('.auth-panel'));
  $$('.auth-tabs button', container)[1].click(); assert.equal($('.auth-title').textContent, 'Create your account'); assert.equal($('button[type=submit]').textContent, 'Create account');
  $('form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await tick(5);
  assert.match($('.alert.is-error:not([hidden])').textContent, /email/i);
  const guestBtn = $$('.auth-guest button')[0]; guestBtn.click(); await tick(5);
  assert.match($('.sheet').textContent, /Nothing is stored online/);
  $$('.sheet-foot button').find((b) => b.textContent === 'Continue as guest').click(); await tick(200);
  assert.equal(getSession().mode, 'guest'); assert.equal(prefs.get('mode'), 'guest'); prefs.remove('mode');
  pagesRouter.destroy();
});

test('settings page: sections, controls write prefs, reset restores defaults', async () => {
  const container = $('#page-root');
  const { createRouter: mk } = await import('../../js/core/router.js');
  setSession({ mode: 'guest', user: null, status: 'active' });
  const router = mk({ routes: ROUTES, container, getSession }); await router.start();
  await router.navigate('/settings'); await tick(5);
  assert.equal($$('.set-nav .set-nav-item').length, 5, 'category list'); assert.equal($$('.set-sec').length, 5, 'one page, one section per category');
  assert.equal($('.page-head.is-stack .page-title').textContent, 'Settings'); assert.ok($('.page-head.is-stack .page-sub'), 'title and subtitle on separate lines');
  await router.navigate('/settings/appearance'); await tick(5);
  $$('[data-setting="theme"] button').find((b) => b.textContent === 'Dark').click(); assert.equal(prefs.get('ui.theme'), 'dark'); assert.equal(document.documentElement.dataset.theme, 'dark');
  $$('[data-setting="accent"] button')[2].click(); assert.equal(prefs.get('ui.accent'), 'violet');
  $('[data-setting="hideBar"] button').click(); assert.equal(prefs.get('ui.hideBar'), false);
  await router.navigate('/settings/advanced'); await tick(5);
  assert.equal($$('.set-sec').length, 5, 'still one page'); assert.ok($('.mt-tester') && $('textarea')); assert.ok($$('.row').length >= 4);
  const resetRow = $('.row.is-danger'); resetRow.click(); await tick(10);
  $$('.sheet-foot button').find((b) => b.textContent === 'Reset settings').click(); await tick(250);
  assert.equal(prefs.get('ui.theme'), null); assert.equal(prefs.get('ui.accent'), null);
  await router.navigate('/settings/app'); await tick(5); assert.match(container.textContent, /Version 2\.1\.3/);
  // v2.1.3: the developer is its own section (not inside the About card); two settings are gone; the browser-fallback switch is new
  assert.ok($('.dev-section') && !$('.about-card .dev-section'), 'developer section is separate'); assert.ok(!/Pull down to refresh|Block right-click/.test(container.textContent));
  await router.navigate('/settings/account'); await tick(5); assert.match(container.textContent, /Guest mode/);
  router.destroy();
});

test('worker client + metadata tester: batches of 6, results rendered with engine log', async () => {
  prefs.set('meta.browserFallback', false); // v2.1.3: this test counts Worker calls only; the device-side fallback has its own tests (v213.test.mjs)
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith('/health')) return new Response(JSON.stringify({ ok: true, version: 'test' }), { status: 200 });
    const { urls } = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true, results: urls.map((u, i) => ({ url: u, ok: i % 3 !== 2, title: 'Title of ' + u, desc: 'd', engine: i % 3 ? 'direct' : 'dub', ms: 12, frameable: i % 2 === 0, favicon: 'https://x.test/f.png', image: 'https://x.test/i.png', error: i % 3 === 2 ? 'blocked' : undefined, log: [{ engine: 'direct', ok: false, ms: 5, error: '403' }, { engine: 'dub', ok: true, ms: 7 }] })) }), { status: 200 });
  };
  const { fetchMeta, health } = await import('../../js/core/worker-client.js');
  const urls = Array.from({ length: 60 }, (_, i) => `https://site${i}.test/`);
  const map = await fetchMeta(urls);
  assert.equal(map.size, 60);
  const metaCalls = calls.filter((c) => c.body);
  assert.deepEqual(metaCalls.map((c) => c.body.urls.length), Array(10).fill(6), 'every Worker call gets at most 6 urls (own subrequest budget)');
  assert.equal((await health()).ok, true);

  const { renderTester, SAMPLE_URLS } = await import('../../js/features/settings/metadata-tester.js');
  assert.equal(SAMPLE_URLS.length, 25); assert.equal(new Set(SAMPLE_URLS).size, 25);
  const el = renderTester(); document.body.appendChild(el);
  el.querySelector('textarea').value = SAMPLE_URLS.join('\n');
  el.querySelectorAll('button')[0].click();
  const btns = [...el.querySelectorAll('button')]; btns.find((b) => b.textContent === 'Run test').click();
  await tick(60);
  assert.equal(el.querySelectorAll('.mt-card').length, 25); assert.match(el.querySelector('.help[aria-live]').textContent, /of 25 returned data/);
  assert.match(el.querySelector('.mt-log').textContent, /dub/);
  el.remove();
});
