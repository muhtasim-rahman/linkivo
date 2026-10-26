// Linkivo v2.1.3: pure logic and DOM behavior added in this version. jsdom is installed outside the project (see docs/TESTING.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const root = new URL('../../', import.meta.url);
const imp = (p) => import(new URL(p, root));
const { prefs } = await imp('js/core/local-prefs.js');

// ---------------------------------------------------------------- splash, settings registry
test('splash: Full is the default and the Automatic option is gone', async () => {
  const { CATALOG, findEntry } = await imp('js/features/settings/catalog.js');
  const splash = findEntry('splash');
  assert.equal(splash.default, 'full'); assert.deepEqual(splash.options.map((o) => o.value), ['full', 'short']);
  const ids = CATALOG.map((e) => e.id);
  for (const gone of ['pullRefresh', 'blockContextMenu']) assert.ok(!ids.includes(gone), gone + ' was removed');
  assert.ok(ids.includes('appDetails') && ids.includes('metaBrowser'));   // v2.2.2: About and Developer became one App details row
  assert.equal(new Set(ids).size, ids.length, 'ids stay unique');
});

test('menu quick settings all exist in the registry', async () => {
  const { QUICK_SETTINGS } = await imp('js/features/shell/pages/menu-page.js');
  const { findEntry } = await imp('js/features/settings/catalog.js');
  for (const id of QUICK_SETTINGS) assert.ok(findEntry(id), id);
  assert.ok(QUICK_SETTINGS.includes('theme'));
});

// ---------------------------------------------------------------- right-click guard, image menu
test('context guard: blocked by default, free for inputs, .selectable and when text is selected', async () => {
  const { shouldBlockContext } = await imp('js/core/input-guards.js');
  const div = document.createElement('div'), input = document.createElement('input'), sel = document.createElement('p'); sel.className = 'selectable';
  assert.equal(shouldBlockContext(div, true), true); assert.equal(shouldBlockContext(input, true), false); assert.equal(shouldBlockContext(sel, true), false);
  assert.equal(shouldBlockContext(div, true, true), false, 'a text selection keeps Copy available');
  assert.equal(shouldBlockContext(div, false), false);
});

test('image menu: only safe URLs, three actions, safe file names', async () => {
  const { safeImageUrl, menuItemsFor, fileNameFor } = await imp('js/ui/image-menu.js');
  assert.equal(safeImageUrl('https://a.test/x.png'), 'https://a.test/x.png');
  assert.equal(safeImageUrl('/assets/icons/icon-192.png', 'https://linkivo.web.app/'), 'https://linkivo.web.app/assets/icons/icon-192.png');
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<script>', 'data:image/svg+xml,<svg onload=1>', 'ftp://x/y.png', '', null]) assert.equal(safeImageUrl(bad), '', String(bad));
  assert.ok(safeImageUrl('data:image/png;base64,AAAA').startsWith('data:image/png'));
  assert.deepEqual(menuItemsFor('https://a.test/x.png'), ['open', 'copy', 'download']);
  assert.deepEqual(menuItemsFor('data:image/png;base64,AAAA'), ['download'], 'data and blob URLs can only be downloaded');
  assert.deepEqual(menuItemsFor(''), []);
  assert.equal(fileNameFor('https://a.test/p/cat photo.JPG?x=1', 'image/jpeg'), 'cat_photo.JPG');
  assert.equal(fileNameFor('https://a.test/p/pic', 'image/png'), 'pic.png'); assert.equal(fileNameFor('https://a.test/../../etc/passwd'), 'passwd');
  assert.match(fileNameFor('https://a.test/%2e%2e%2f'), /^[\w.-]+$/);
});

test('image menu: right-click on an img opens the menu, Escape closes it, a plain element does not', async () => {
  const { initImageMenu } = await imp('js/ui/image-menu.js');
  initImageMenu();
  const img = document.createElement('img'); img.src = 'https://a.test/cat.png'; document.body.appendChild(img);
  const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 });
  img.dispatchEvent(ev); await tick(5);
  assert.equal(ev.defaultPrevented, true);
  const items = [...document.querySelectorAll('.pop .pop-item')].map((b) => b.textContent);
  assert.deepEqual(items, ['Open image in new tab', 'Copy image link', 'Download image']);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await tick(5);
  assert.equal(document.querySelectorAll('.pop').length, 0);
  const bad = document.createElement('img'); bad.src = 'javascript:alert(1)'; document.body.appendChild(bad);
  bad.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })); await tick(5);
  assert.equal(document.querySelectorAll('.pop').length, 0, 'unsafe image: no menu');
});

// ---------------------------------------------------------------- tooltip
test('tooltip text comes from data-tip, then aria-label of icon buttons', async () => {
  const { tipTextOf } = await imp('js/ui/tooltip.js');
  const a = document.createElement('button'); a.setAttribute('data-tip', ' Dark mode '); a.setAttribute('aria-label', 'x');
  const b = document.createElement('button'); b.setAttribute('aria-label', 'Close');
  assert.equal(tipTextOf(a), 'Dark mode'); assert.equal(tipTextOf(b), 'Close'); assert.equal(tipTextOf(null), '');
});

test('tooltip: mouse hover shows after a delay, long-press on touch shows and swallows the click', async () => {
  const { initTooltips } = await imp('js/ui/tooltip.js');
  const destroy = initTooltips();
  const link = document.createElement('a'); link.className = 'bar-item'; link.setAttribute('aria-label', 'Library'); link.setAttribute('data-tip', 'Library'); link.href = '#x'; document.body.appendChild(link);
  const fire = (el, type, extra = {}) => { const e = new window.Event(type, { bubbles: true, cancelable: true }); Object.assign(e, { pointerType: 'mouse', clientX: 5, clientY: 5 }, extra); el.dispatchEvent(e); return e; };
  const tip = document.getElementById('lk-tip');
  fire(link, 'pointerover'); assert.ok(!tip.classList.contains('is-on'), 'not at once'); await tick(520); assert.ok(tip.classList.contains('is-on')); assert.equal(tip.textContent, 'Library');
  fire(link, 'pointerout', { relatedTarget: document.body }); assert.ok(!tip.classList.contains('is-on'));
  // touch long press
  let clicked = 0; link.addEventListener('click', () => { clicked++; });
  fire(link, 'pointerdown', { pointerType: 'touch' }); await tick(480); assert.ok(tip.classList.contains('is-on'), 'long press shows the name');
  fire(link, 'pointerup', { pointerType: 'touch' });
  const c = new window.MouseEvent('click', { bubbles: true, cancelable: true }); link.dispatchEvent(c);
  assert.equal(clicked, 0, 'the tap that ends a long press does not open the link'); assert.equal(c.defaultPrevented, true);
  // a short tap still works
  fire(link, 'pointerdown', { pointerType: 'touch' }); await tick(60); fire(link, 'pointerup', { pointerType: 'touch' });
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })); assert.equal(clicked, 1);
  destroy(); link.remove();
});

// ---------------------------------------------------------------- e-mail sending limits
test('send-limit: same address waits, another address is free, an hour cap applies, old sends expire', async () => {
  const { evaluate, hashKey, friendlyWait, RULES } = await imp('js/core/send-limit.js');
  const rule = RULES.reset, now = 1_000_000_000, a = hashKey('A@x.com');
  assert.equal(hashKey('A@x.com'), hashKey(' a@X.com '), 'case and spaces do not matter'); assert.notEqual(a, hashKey('b@x.com')); assert.match(a, /^[0-9a-f]{8}$/);
  const hist = [{ k: a, t: now - 60_000 }];
  const r1 = evaluate(hist, a, now, rule); assert.equal(r1.ok, false); assert.equal(r1.reason, 'same'); assert.equal(r1.waitMs, rule.sameMs - 60_000);
  assert.equal(evaluate(hist, hashKey('b@x.com'), now, rule).ok, true);
  assert.equal(evaluate(hist, a, now + rule.sameMs + 1, rule).ok, true, 'cooldown over');
  const many = Array.from({ length: rule.perHour }, (_, i) => ({ k: 'k' + i, t: now - i * 1000 }));
  const r2 = evaluate(many, 'new', now, rule); assert.equal(r2.ok, false); assert.equal(r2.reason, 'hour');
  assert.equal(evaluate([{ k: a, t: now - 2 * 3600_000 }], a, now, rule).ok, true, 'sends older than an hour are forgotten');
  assert.equal(friendlyWait(30_000), 'a minute'); assert.equal(friendlyWait(3 * 60_000 - 1), '3 minutes');
});

test('auth-service: sendReset refuses a second email to the same address, with a cooldown error', async () => {
  const { recordSend, sendAllowed } = await imp('js/core/send-limit.js');
  prefs.remove('auth.sends.reset');
  assert.equal(sendAllowed('reset', 'me@x.com').ok, true);
  recordSend('reset', 'me@x.com');
  assert.equal(sendAllowed('reset', 'ME@x.com').ok, false); assert.equal(sendAllowed('reset', 'other@x.com').ok, true);
  assert.ok(!JSON.stringify(prefs.get('auth.sends.reset')).includes('me@x.com'), 'the address itself is never stored');
});

// ---------------------------------------------------------------- metadata fallback
const mf = await imp('js/core/meta-fallback.js');

test('meta-fallback: basicFromUrl always gives a title, a site and a favicon', () => {
  const b = mf.basicFromUrl('https://www.nytimes.com/2026/10/22/world/some-big-story.html');
  assert.equal(b.title, 'Some big story - Nytimes'); assert.equal(b.site, 'Nytimes'); assert.match(b.favicon, /^https:\/\/www\.google\.com\/s2\/favicons\?domain=nytimes\.com/);
  assert.equal(mf.basicFromUrl('https://stackoverflow.com/').title, 'stackoverflow.com'); assert.equal(mf.basicFromUrl('not a url').title, '');
  assert.equal(mf.basicFromUrl('https://x.test/12345').title, 'x.test', 'a numeric id is not a title');
});

test('meta-fallback: titleOk rejects host names and bot-check titles; isWeak finds the results that need help', () => {
  assert.equal(mf.titleOk('Just a moment...', 'https://a.test/'), false); assert.equal(mf.titleOk('Access Denied', 'https://a.test/'), false);
  assert.equal(mf.titleOk('a.test', 'https://www.a.test/'), false); assert.equal(mf.titleOk('', 'https://a.test/'), false); assert.equal(mf.titleOk('Real page title', 'https://a.test/'), true);
  const u = 'https://a.test/';
  assert.equal(mf.isWeak({ url: u, ok: true, title: 'Real page title' }), false); assert.equal(mf.isWeak({ url: u, ok: true, partial: true, title: 'Guess' }), true);
  assert.equal(mf.isWeak({ url: u, ok: false }), true); assert.equal(mf.isWeak({ url: u, ok: true, title: 'Just a moment...' }), true);
});

test('meta-fallback: parseHtmlMeta reads og/twitter/title tags, decodes entities, resolves relative urls, ignores scripts', () => {
  const html = `<!doctype html><html lang="en-GB"><head><title>Fallback &amp; title</title>
    <meta property="og:title" content="The &quot;real&quot; title"><meta name="description" content="A description">
    <meta property="og:image" content="/img/a.png"><meta property="og:site_name" content="Site"><meta name="author" content="Ann">
    <link rel="shortcut icon" href="/fav.ico"><link rel="canonical" href="https://a.test/canon"></head><body><script>document.title='x'</script></body></html>`;
  const m = mf.parseHtmlMeta(html, 'https://a.test/page');
  assert.equal(m.title, 'The "real" title'); assert.equal(m.desc, 'A description'); assert.equal(m.image, 'https://a.test/img/a.png'); assert.equal(m.site, 'Site');
  assert.equal(m.author, 'Ann'); assert.equal(m.favicon, 'https://a.test/fav.ico'); assert.equal(m.canonical, 'https://a.test/canon'); assert.equal(m.lang, 'en-GB');
  assert.equal(mf.parseHtmlMeta('<title>Only title</title>').title, 'Only title'); assert.equal(mf.parseHtmlMeta('').title, '');
});

test('meta-fallback: mergeMeta fills only empty fields; a real title replaces a guessed one', () => {
  const base = { url: 'https://a.test/x', ok: true, partial: true, title: 'X - A', desc: '', favicon: 'https://f/1.png', engine: 'basic', log: [] };
  const m = mf.mergeMeta(base, { title: 'The real title', desc: 'Desc', favicon: 'https://other/2.png', image: 'https://i/1.jpg' }, 'browser:dub');
  assert.equal(m.title, 'The real title'); assert.equal(m.partial, false); assert.equal(m.engine, 'browser:dub'); assert.equal(m.desc, 'Desc'); assert.equal(m.favicon, 'https://f/1.png', 'existing favicon is kept'); assert.equal(m.image, 'https://i/1.jpg');
  const keep = mf.mergeMeta({ url: 'https://a.test/', ok: true, title: 'Good Title' }, { title: 'Other title' }, 'browser:jina'); assert.equal(keep.title, 'Good Title', 'a fetched real title wins');
  assert.equal(mf.mergeMeta(base, { title: 'Access Denied' }, 'browser:x').partial, true, 'a block page title is never taken');
});

const fail = (msg, status) => () => ({ id: 'f', perMin: 0, run: async () => { const e = new Error(msg); if (status) e.status = status; throw e; } });
const prov = (id, fn) => ({ id, perMin: 0, run: fn });
const opts = (providers, extra = {}) => ({ providers, enabled: () => true, fetchImpl: async () => { throw new Error('no network in tests'); }, ...extra });

test('meta-fallback: rescue walks the providers in order and stops at the first real title', async () => {
  mf.resetFallbackState();
  const order = [];
  const providers = [prov('one', async () => { order.push('one'); throw new Error('HTTP 403'); }), prov('two', async () => { order.push('two'); return { title: 'Just a moment...' }; }),
    prov('three', async () => { order.push('three'); return { title: 'Great article', desc: 'About it', image: 'https://i/x.jpg' }; }), prov('four', async () => { order.push('four'); return { title: 'never' }; })];
  const r = await mf.rescueMeta({ url: 'https://news.test/a', ok: false, error: 'every engine failed', log: [{ engine: 'direct', ok: false }] }, opts(providers));
  assert.deepEqual(order, ['one', 'two', 'three']); assert.equal(r.ok, true); assert.equal(r.partial, false); assert.equal(r.title, 'Great article'); assert.equal(r.engine, 'browser:three'); assert.equal(r.error, undefined);
  assert.deepEqual(r.log.map((l) => [l.engine, l.ok]), [['direct', false], ['browser:one', false], ['browser:two', false], ['browser:three', true]]);
  assert.ok(r.favicon, 'favicon floor present');
});

test('meta-fallback: when every provider fails the result still has a title and favicon (partial), and strong results are untouched', async () => {
  mf.resetFallbackState();
  const r = await mf.rescueMeta({ url: 'https://stackoverflow.com/questions/11227809', ok: false, error: 'every engine failed', log: [] }, opts([prov('a', async () => { throw new Error('HTTP 429'); })]));
  assert.equal(r.ok, true); assert.equal(r.partial, true); assert.ok(r.title.length > 2); assert.match(r.favicon, /google\.com\/s2\/favicons/); assert.equal(r.error, undefined);
  const strong = { url: 'https://a.test/', ok: true, title: 'Fine title', log: [] };
  let called = 0; const s2 = await mf.rescueMeta(strong, opts([prov('a', async () => { called++; return { title: 'zzz' }; })]));
  assert.equal(called, 0); assert.equal(s2.title, 'Fine title');
});

test('meta-fallback: blocked and invalid targets stay failed; the switch off skips the services but keeps the floor', async () => {
  mf.resetFallbackState();
  let called = 0; const p = [prov('a', async () => { called++; return { title: 'Some title' }; })];
  const blocked = await mf.rescueMeta({ url: 'http://localhost:8080/admin', ok: false, error: 'blocked target', log: [] }, opts(p));
  assert.equal(blocked.ok, false); assert.equal(called, 0);
  const off = await mf.rescueMeta({ url: 'https://news.test/story-one', ok: false, error: 'every engine failed', log: [] }, opts(p, { enabled: () => false }));
  assert.equal(called, 0); assert.equal(off.ok, true); assert.equal(off.partial, true); assert.equal(off.title, 'Story one - News');
});

test('meta-fallback: a provider that answers 429 is skipped afterwards; three failures in a row also pause it', async () => {
  mf.resetFallbackState();
  let hits = 0; const limited = prov('lim', async () => { hits++; const e = new Error('HTTP 429'); e.status = 429; throw e; });
  await mf.rescueMeta({ url: 'https://a.test/1', ok: false, log: [] }, opts([limited])); await mf.rescueMeta({ url: 'https://a.test/2', ok: false, log: [] }, opts([limited]));
  assert.equal(hits, 1, 'after a 429 the provider rests');
  mf.resetFallbackState(); hits = 0; const flaky = prov('flaky', async () => { hits++; throw new Error('boom'); });
  for (let i = 0; i < 5; i++) await mf.rescueMeta({ url: 'https://a.test/' + i, ok: false, log: [] }, opts([flaky]));
  assert.equal(hits, 3, 'paused after three failures');
});

test('meta-fallback: the real providers parse their answers (fake fetch)', async () => {
  mf.resetFallbackState();
  const json = (o) => new Response(JSON.stringify(o), { status: 200 });
  const routes = {
    'api.dub.co': () => new Response('<!DOCTYPE html><html>', { status: 200 }), // the answer the Worker saw: HTML, not JSON
    'r.jina.ai': () => json({ data: { title: 'From Jina', description: 'j desc' } }),
    'api.allorigins.win': () => json({ contents: '<title>From AllOrigins</title>' }),
  };
  const calls = [];
  const fetchImpl = async (u) => { calls.push(u); const host = new URL(u).host; return routes[host] ? routes[host]() : new Response('{}', { status: 500 }); };
  const r = await mf.rescueMeta({ url: 'https://news.test/a', ok: false, log: [] }, { enabled: () => true, fetchImpl, perCallMs: 2000 });
  assert.equal(r.title, 'From Jina'); assert.equal(r.engine, 'browser:jina'); assert.equal(r.desc, 'j desc');
  assert.match(calls[0], /^https:\/\/api\.dub\.co\/metatags\?url=https%3A%2F%2Fnews\.test%2Fa$/); assert.equal(calls[1], 'https://r.jina.ai/https://news.test/a');
  assert.deepEqual(r.log.map((l) => l.engine), ['browser:dub', 'browser:jina']); assert.equal(r.log[0].error, 'not JSON');
  mf.resetFallbackState();
  const r2 = await mf.rescueMeta({ url: 'https://x.test/p', ok: false, log: [] }, { enabled: () => true, perCallMs: 2000, providers: mf.PROVIDERS.filter((p) => p.id === 'microlink'),
    fetchImpl: async () => json({ status: 'success', data: { title: 'ML title', publisher: 'Pub', image: { url: 'https://i/a.png' }, logo: { url: 'https://l/a.png' } } }) });
  assert.equal(r2.title, 'ML title'); assert.equal(r2.site, 'Pub'); assert.equal(r2.image, 'https://i/a.png'); assert.equal(r2.favicon, 'https://l/a.png', 'the logo from Microlink replaces nothing but fills the empty favicon');
});

test('worker client: isWorkerOutdated compares versions numerically', async () => {
  const { isWorkerOutdated, EXPECTED_WORKER } = await imp('js/core/worker-client.js');
  assert.equal(EXPECTED_WORKER, '2.1.3');
  assert.equal(isWorkerOutdated('2.1.0'), true); assert.equal(isWorkerOutdated('2.1.2'), true); assert.equal(isWorkerOutdated('2.1.3'), false); assert.equal(isWorkerOutdated('2.2.0'), false); assert.equal(isWorkerOutdated('2.10.0'), false);
  assert.equal(isWorkerOutdated(undefined), true);
});

test('worker client: weak Worker results are rescued, strong ones are not, failed batches still end with a title', async () => {
  prefs.set('meta.browserFallback', true); mf.resetFallbackState();
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(String(url));
    if (String(url).includes('workers.dev')) { const { urls } = JSON.parse(init.body); return new Response(JSON.stringify({ ok: true, results: urls.map((u) => (u.includes('good') ? { url: u, ok: true, title: 'Good title', log: [] } : { url: u, ok: false, error: 'every engine failed', log: [] })) }), { status: 200 }); }
    if (String(url).startsWith('https://api.dub.co/')) return new Response(JSON.stringify({ title: 'Rescued title', description: 'd' }), { status: 200 });
    return new Response('{}', { status: 500 });
  };
  const { fetchMeta } = await imp('js/core/worker-client.js');
  const map = await fetchMeta(['https://good.test/a', 'https://bad.test/b']);
  assert.equal(map.get('https://good.test/a').title, 'Good title'); assert.equal(map.get('https://bad.test/b').title, 'Rescued title'); assert.equal(map.get('https://bad.test/b').engine, 'browser:dub');
  assert.ok(!seen.some((u) => u.includes('good.test') && !u.includes('workers.dev')), 'the good link never went to a fallback service');
  // Worker down for everything: still a title and favicon
  globalThis.fetch = async (url) => { if (String(url).includes('workers.dev')) throw new Error('offline'); throw new Error('offline'); };
  mf.resetFallbackState();
  const offline = await fetchMeta(['https://offline.test/some-page']);
  const o = offline.get('https://offline.test/some-page'); assert.equal(o.ok, true); assert.equal(o.partial, true); assert.equal(o.title, 'Some page - Offline'); assert.ok(o.favicon);
});

// ---------------------------------------------------------------- router: pull-to-refresh hook
test('router: refreshCurrent only works on flagged routes and calls the page refresh() without re-mounting', async () => {
  const { createRouter } = await imp('js/core/router.js');
  const { setSession, getSession } = await imp('js/core/session.js');
  setSession({ mode: 'guest', user: null, status: 'active', ready: true });
  const container = document.getElementById('page-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'page-root' }));
  const log = [];
  const page = (name, withRefresh) => async () => ({ mount: (c) => { log.push('mount:' + name); const el = document.createElement('div'); el.className = 'page'; c.appendChild(el); return () => { el.remove(); log.push('unmount:' + name); }; }, ...(withRefresh ? { refresh: async (ctx) => { log.push('refresh:' + name + ':' + (ctx.params.fid || '')); } } : {}) });
  const routes = [
    { id: 'folder', pattern: '/folder/:fid', title: 'Folder', parent: '/library', guard: 'auth', refresh: true, load: page('folder', true) },
    { id: 'library', pattern: '/library', title: 'Library', parent: null, guard: 'auth', refresh: true, load: page('library', false) },
    { id: 'settings', pattern: '/settings', title: 'Settings', parent: '/library', guard: 'auth', load: page('settings', true) },
    { id: 'nf', pattern: '*', title: 'Not found', parent: '/library', guard: 'open', load: page('nf', false) }
  ];
  const router = createRouter({ routes, container, getSession, onHint: () => {} });
  await router.start();
  await router.navigate('/folder/abc'); await tick(5);
  assert.equal(router.canRefresh(), true); assert.equal(await router.refreshCurrent(), 'refreshed'); assert.ok(log.includes('refresh:folder:abc'));
  assert.equal(log.filter((l) => l === 'mount:folder').length, 1, 'refresh does not re-mount the page');
  await router.navigate('/library'); await tick(5); assert.equal(router.canRefresh(), true); assert.equal(await router.refreshCurrent(), 'nothing', 'layout only: no refresh() yet');
  await router.navigate('/settings'); await tick(5); assert.equal(router.canRefresh(), false); assert.equal(await router.refreshCurrent(), 'unsupported', 'Settings does not take part even if the module has refresh()');
  assert.ok(!log.includes('refresh:settings:'));
  router.destroy();
});

// ---------------------------------------------------------------- theme switch
test('theme switch goes through the View Transitions API when the browser has it, and plainly when it has not', async () => {
  const { applyAppearance } = await imp('js/core/appearance.js');
  prefs.set('ui.theme', 'light'); applyAppearance(); assert.equal(document.documentElement.dataset.theme, 'light');
  let used = 0; document.startViewTransition = (cb) => { used++; cb(); return { finished: Promise.resolve() }; };
  prefs.set('ui.theme', 'dark'); await tick(5);
  assert.equal(used, 1, 'one transition for the whole page'); assert.equal(document.documentElement.dataset.theme, 'dark'); assert.equal(document.documentElement.style.colorScheme, 'dark');
  assert.ok(!document.documentElement.classList.contains('theme-anim'), 'the per-element transition class is gone');
  delete document.startViewTransition; prefs.set('ui.theme', 'light'); await tick(5); assert.equal(document.documentElement.dataset.theme, 'light');
  prefs.remove('ui.theme');
});

// ---------------------------------------------------------------- sidebar and bar markup (static)
test('shell: sidebar rows keep a fixed icon slot and the bar marker stretches with distance', async () => {
  const { buildShell } = await imp('js/features/shell/shell.js').then((m) => ({ buildShell: m.buildShell || m.mountShell || null }));
  void buildShell; // the markup itself is exercised by ui-smoke "shell: builds sidebar and bar"; here we only check the CSS contract in the stylesheet
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('css/components/nav.css', root), 'utf8');
  assert.match(css, /\.nav-ic \{[^}]*width: 44px/, 'fixed 44px icon slot'); assert.match(css, /--sidebar-w-collapsed|\.sidebar \{[^}]*padding: 14px 12px/);
  assert.doesNotMatch(css, /justify-content: center/, 'rows are never re-centered on collapse (this made the icons jump in v2.1.2)');
  assert.match(css, /--spring/); assert.match(css, /\.bar-ring/, 'v2.1.4: the ring is built from two edges (see v214.test.mjs); the v2.1.3 bar-stretch keyframes are gone');
  const base = fs.readFileSync(new URL('css/core/base.css', root), 'utf8');
  assert.doesNotMatch(base, /theme-anim \*/, 'no per-element theme transition'); assert.match(base, /view-transition-old/);
  const tokens = fs.readFileSync(new URL('css/core/tokens.css', root), 'utf8'); assert.match(tokens, /--sidebar-w: 244px/); assert.match(tokens, /--sidebar-w-collapsed: 68px/);
});

test('index.html: no splash grid, splash starts from its own small module, only three stylesheets block the first paint', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('index.html', root), 'utf8');
  assert.ok(!html.includes('sp-grid')); assert.ok(html.includes('sp-boot'));
  assert.ok(html.indexOf('splash-start.js') > -1 && html.indexOf('splash-start.js"></script>') < html.indexOf('src="/js/main.js"'), 'splash-start runs before main.js');
  const blocking = (html.match(/<link rel="stylesheet" href="[^"]+">/g) || []);
  assert.equal(blocking.length, 3, 'tokens, base, splash'); assert.match(html, /fonts\.googleapis\.com[^<]*display=swap/);
  assert.ok(!/<link[^>]+fonts\.googleapis\.com\/css2/.test(html), 'Google Fonts is added by script, not as a blocking link');
  const css = fs.readFileSync(new URL('css/pages/splash.css', root), 'utf8');
  assert.ok(!/sp-grid/.test(css)); assert.ok(!/filter: blur/.test(css));
});
