// v2.1.1 behaviors: start animation modes, pull-to-refresh math, input guard, update check, SEO meta, popover toggle, theme fade, asset files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupDom, tick } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/library');
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '../..');
const $ = (s) => document.querySelector(s);

test('start animation: auto = full once then short, forced modes, reduced motion wins', async () => {
  const { pickMode } = await import('../../js/features/splash/splash.js');
  assert.equal(pickMode('auto', false, false), 'full'); assert.equal(pickMode('auto', true, false), 'short');
  assert.equal(pickMode('full', true, false), 'full'); assert.equal(pickMode('short', false, false), 'short');
  assert.equal(pickMode('full', false, true), 'still'); assert.equal(pickMode(undefined, false, false), 'full');
});

test('pull to refresh: progress is clamped, indicator appears only when pulling from the top', async () => {
  const { pullProgress, THRESHOLD, initPullRefresh } = await import('../../js/ui/pull-refresh.js');
  assert.equal(pullProgress(0), 0); assert.equal(pullProgress(THRESHOLD / 2), 0.5); assert.equal(pullProgress(500), 1); assert.equal(pullProgress(-20), 0);
  const rootEl = document.createElement('div'); document.body.appendChild(rootEl);
  let reloads = 0;
  const off = initPullRefresh({ root: rootEl, onRefresh: () => { reloads++; } });
  const touch = (type, y) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = type === 'touchend' ? [] : [{ clientY: y }]; rootEl.dispatchEvent(e); };
  touch('touchstart', 100); touch('touchmove', 140); assert.equal($('.ptr').style.opacity, '1'); touch('touchend');
  assert.equal(reloads, 0, 'a short pull does not reload');
  touch('touchstart', 100); touch('touchmove', 300); touch('touchend'); await tick(320); assert.equal(reloads, 1, 'a long pull reloads');
  off(); assert.equal($('.ptr'), null);
});

test('input guard: right-click and long-press menus are blocked except in fields, unless the setting allows them', async () => {
  const { initInputGuard, isGuardTarget } = await import('../../js/core/input-guard.js');
  const { prefs } = await import('../../js/core/local-prefs.js');
  initInputGuard();
  const input = document.createElement('input'), div = document.createElement('div'); document.body.append(input, div);
  const fire = (el) => { const e = new w.Event('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
  assert.equal(fire(div), true); assert.equal(fire(input), false); assert.equal(isGuardTarget(input), false); assert.equal(isGuardTarget(div), true);
  prefs.set('ui.contextMenu', true); assert.equal(fire(div), false); prefs.remove('ui.contextMenu');
});

test('version check: semver compare and remote /app.json comparison', async () => {
  const { compareVersions, checkRemoteVersion } = await import('../../js/core/update.js');
  assert.equal(compareVersions('2.1.1', '2.1.0'), 1); assert.equal(compareVersions('2.1.0', '2.1.0'), 0); assert.equal(compareVersions('2.0.9', '2.1.0'), -1); assert.equal(compareVersions('2.10.0', '2.9.0'), 1);
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push([url, init.cache]); return new Response(JSON.stringify({ version: '2.2.0' }), { status: 200 }); };
  const r = await checkRemoteVersion(); assert.deepEqual([r.latest, r.newer], ['2.2.0', true]); assert.match(seen[0][0], /^\/app\.json\?v=/); assert.equal(seen[0][1], 'no-store');
  globalThis.fetch = async () => new Response(JSON.stringify({ version: '2.1.1' }), { status: 200 }); assert.equal((await checkRemoteVersion()).newer, false);
});

test('SEO: every route sets title, description, robots, canonical and Open Graph; private pages are noindex', async () => {
  const { applyPageMeta } = await import('../../js/core/router.js');
  const { ROUTES } = await import('../../js/features/shell/routes.js');
  for (const name of ['description', 'robots']) { const m = document.createElement('meta'); m.name = name; document.head.appendChild(m); }
  const login = ROUTES.find((r) => r.id === 'login'), lib = ROUTES.find((r) => r.id === 'library');
  applyPageMeta(document, login, '/login');
  assert.equal(document.title, 'Sign in - Linkivo'); assert.match($('meta[name=description]').content, /Sign in to Linkivo/); assert.equal($('meta[name=robots]').content, 'index, follow');
  assert.equal($('link[rel=canonical]').href, 'https://linkivo.web.app/login'); assert.equal($('meta[property="og:title"]').content, 'Sign in - Linkivo');
  applyPageMeta(document, lib, '/library');
  assert.equal($('meta[name=robots]').content, 'noindex, nofollow'); assert.equal($('link[rel=canonical]').href, 'https://linkivo.web.app/');
  for (const id of ['terms', 'privacy', 'docs']) assert.ok(ROUTES.find((r) => r.id === id).description.length > 30, id);
  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'), robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  for (const p of ['/login', '/docs', '/privacy', '/terms']) assert.ok(sitemap.includes('https://linkivo.web.app' + p), p);
  assert.match(robots, /Sitemap: https:\/\/linkivo\.web\.app\/sitemap\.xml/); assert.match(robots, /Disallow: \/library/);
});

test('popover: opening the same anchor again closes the menu (toggle), a press on the anchor does not reopen it', async () => {
  const { openMenu } = await import('../../js/ui/popover.js');
  const { resetLayers } = await import('../../js/core/nav-stack.js'); resetLayers();
  const a = document.createElement('button'); document.body.appendChild(a);
  assert.ok(openMenu(a, [{ label: 'One' }])); assert.equal(document.querySelectorAll('.pop').length, 1);
  a.dispatchEvent(new w.Event('pointerdown', { bubbles: true })); assert.equal(document.querySelectorAll('.pop').length, 1, 'pointerdown on the anchor keeps it open');
  assert.equal(openMenu(a, [{ label: 'One' }]), null); assert.equal(document.querySelectorAll('.pop').length, 0, 'second click closes');
  openMenu(a, [{ label: 'One' }]); document.body.dispatchEvent(new w.Event('pointerdown', { bubbles: true })); assert.equal(document.querySelectorAll('.pop').length, 0, 'outside press closes');
});

test('theme change adds the fade class briefly; accent changes the brand colors (CSS variables exist for every accent)', async () => {
  const { applyAppearance, ACCENTS } = await import('../../js/core/appearance.js');
  const { prefs } = await import('../../js/core/local-prefs.js');
  prefs.set('ui.theme', 'light'); applyAppearance(); prefs.set('ui.theme', 'dark'); applyAppearance();
  assert.equal(document.documentElement.classList.contains('theme-fade'), true); await tick(420); assert.equal(document.documentElement.classList.contains('theme-fade'), false);
  const css = fs.readFileSync(path.join(root, 'css/core/tokens.css'), 'utf8');
  for (const name of Object.keys(ACCENTS)) assert.match(css, new RegExp(`data-accent='${name}'\\]\\s*\\{ --brand-a`));
  prefs.remove('ui.theme');
});

test('assets exist: logo mask, google mark, chain pattern, empty-state art, every manifest icon, favicon with white background', () => {
  for (const f of ['assets/brand/logo-mask.svg', 'assets/brand/google-g.svg', 'assets/art/chain-pattern.svg', 'robots.txt', 'sitemap.xml']) assert.ok(fs.existsSync(path.join(root, f)), f);
  for (const v of ['library', 'random', 'import', 'search', 'menu', 'profile', 'settings', 'lost', 'error']) assert.ok(fs.existsSync(path.join(root, `assets/art/empty-${v}.svg`)), v);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  for (const i of manifest.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any') && manifest.icons.some((i) => i.purpose === 'maskable'));
  assert.equal(manifest.start_url, '/?source=pwa'); assert.match(fs.readFileSync(path.join(root, 'assets/icons/favicon.svg'), 'utf8'), /<rect[^>]+fill="#ffffff"/);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const needle of ['rel="canonical"', 'application/ld+json', 'og:title', 'twitter:card', '<noscript>', 'name="description"']) assert.ok(index.includes(needle), needle);
});
