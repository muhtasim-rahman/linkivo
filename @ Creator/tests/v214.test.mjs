// Linkivo v2.1.4 (fix release): regression tests for the four owner reports against v2.1.3.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const root = new URL('../../', import.meta.url);
const imp = (p) => import(new URL(p, root));
const { prefs } = await imp('js/core/local-prefs.js');
const html = fs.readFileSync(new URL('index.html', root), 'utf8');

// ------------------------------------------------ 1. splash theme: the first paint must use the stored theme
// The inline head script runs before any module. It must give <html> exactly the attributes appearance.js would give.
const inline = (() => { const m = /Look settings BEFORE the first paint[\s\S]*?<script>([\s\S]*?)<\/script>/.exec(html); assert.ok(m, 'inline appearance script exists'); return m[1]; })();
function runInline({ stored = {}, systemDark = false, blocked = false } = {}) {
  const attrs = {}, style = {}, metas = [{ content: '#eef2f8', media: '(prefers-color-scheme: light)' }, { content: '#060d1a', media: '(prefers-color-scheme: dark)' }].map((m) => ({ ...m, setAttribute(k, val) { this[k] = val; }, removeAttribute(k) { delete this[k]; } }));
  const doc = { documentElement: { dataset: attrs, style }, querySelectorAll: () => metas };
  const ls = { getItem: (k) => { if (blocked) throw new Error('blocked'); const key = k.replace(/^lk:/, ''); return key in stored ? JSON.stringify(stored[key]) : null; } };
  new Function('document', 'localStorage', 'matchMedia', 'window', 'Array', inline)(doc, ls, () => ({ matches: systemDark }), { matchMedia: () => ({ matches: systemDark }) }, Array);
  return { attrs, style, metas };
}

test('splash theme (owner report): a light-mode user on a dark phone gets the LIGHT theme on <html> before any module runs', () => {
  const r = runInline({ stored: { 'ui.theme': 'light' }, systemDark: true });
  assert.equal(r.attrs.theme, 'light'); assert.equal(r.style.colorScheme, 'light');
  assert.equal(r.metas[0].content, '#eef2f8'); assert.equal(r.metas[1].content, '#eef2f8', 'status bar color follows the chosen theme'); assert.equal(r.metas[0].media, undefined);
  assert.equal(runInline({ stored: { 'ui.theme': 'dark' }, systemDark: false }).attrs.theme, 'dark');
});

test('splash theme: system mode follows the device, defaults and blocked storage are safe, accent is validated', () => {
  assert.equal(runInline({ stored: { 'ui.theme': 'system' }, systemDark: true }).attrs.theme, 'dark'); assert.equal(runInline({ systemDark: false }).attrs.theme, 'light');
  const sys = runInline({ systemDark: true }); assert.equal(sys.metas[0].media, '(prefers-color-scheme: light)', 'system mode keeps the media-based theme-color pair');
  const blocked = runInline({ blocked: true, systemDark: true }); assert.equal(blocked.attrs.theme, 'dark'); assert.equal(blocked.attrs.accent, 'blue'); assert.equal(blocked.attrs.font, 'medium'); assert.equal(blocked.attrs.density, 'compact');
  assert.equal(runInline({ stored: { 'ui.accent': 'violet' } }).attrs.accent, 'violet'); assert.equal(runInline({ stored: { 'ui.accent': 'nope' } }).attrs.accent, 'blue');
});

test('splash theme: the inline script and appearance.js produce the same attributes for every stored combination', async () => {
  const { applyAppearance } = await imp('js/core/appearance.js');
  const combos = [{}, { 'ui.theme': 'light' }, { 'ui.theme': 'dark', 'ui.accent': 'rose' }, { 'ui.theme': 'system', 'ui.fontSize': 'large', 'ui.density': 'comfortable' }, { 'ui.accent': 'amber', 'ui.reduceMotion': 'reduce' }];
  for (const stored of combos) {
    for (const k of ['ui.theme', 'ui.accent', 'ui.fontSize', 'ui.density', 'ui.reduceMotion']) prefs.remove(k);
    for (const [k, v] of Object.entries(stored)) prefs.set(k, v);
    delete document.documentElement.dataset.theme; applyAppearance();
    const real = { ...document.documentElement.dataset };
    const early = runInline({ stored, systemDark: false }).attrs;
    for (const k of ['theme', 'accent', 'font', 'density', 'motion']) assert.equal(early[k], real[k], `${k} for ${JSON.stringify(stored)}`);
  }
  for (const k of ['ui.theme', 'ui.accent', 'ui.fontSize', 'ui.density', 'ui.reduceMotion']) prefs.remove(k);
});

test('the inline script sits before every stylesheet, so no CSS is evaluated without a theme', () => {
  assert.ok(html.indexOf('Look settings BEFORE the first paint') < html.indexOf('href="/css/core/tokens.css"'));
});

// ------------------------------------------------ 2. pull to refresh
const { initPullRefresh, pullDistance, indicatorY, THRESHOLD, REST } = await imp('js/ui/pull-refresh.js');
const touch = (el, type, y, x = 100) => { const e = new window.Event(type, { bubbles: true }); e.touches = type === 'touchend' ? [] : [{ clientY: y, clientX: x }]; el.dispatchEvent(e); };
const chipY = (chip) => parseFloat(/translate3d\(0,\s*(-?[\d.]+)px/.exec(chip.style.transform)[1]);

// v2.2.1 (owner request): the PAGE stays still; only the round indicator slides down from above the screen.
test('pull to refresh: only the indicator moves, the ring fills, and nothing happens below the threshold', async () => {
  const scroller = document.createElement('div'); document.body.appendChild(scroller);
  let runs = 0; const destroy = initPullRefresh({ scroller, enabled: () => true, onRefresh: async () => { runs++; } });
  const chip = [...document.querySelectorAll('.ptr')].pop(); const y0 = chipY(chip);
  touch(scroller, 'touchstart', 100); touch(scroller, 'touchmove', 140);
  assert.equal(scroller.style.transform, '', 'the page itself never moves'); assert.ok(chipY(chip) > y0, 'the indicator came down with the finger');
  assert.ok(parseFloat(chip.style.getPropertyValue('--p')) > 0 && !chip.classList.contains('is-ready')); assert.ok(chip.classList.contains('is-on')); // v2.2.2: the indicator is a bare ring now (no icon to turn)
  touch(scroller, 'touchend', 140); await tick(5);
  assert.equal(runs, 0, 'short pull: no refresh'); assert.ok(chip.classList.contains('is-leaving') && !chip.classList.contains('is-loading'));
  destroy();
});

test('pull to refresh: after release the icon spins WHERE IT RESTS, and slides away when done', async () => {
  const scroller = document.createElement('div'); document.body.appendChild(scroller);
  let finish; const gate = new Promise((r) => { finish = r; }); let runs = 0;
  const destroy = initPullRefresh({ scroller, enabled: () => true, onRefresh: async () => { runs++; await gate; } });
  const chip = [...document.querySelectorAll('.ptr')].pop();
  touch(scroller, 'touchstart', 50); touch(scroller, 'touchmove', 400);
  assert.ok(chip.classList.contains('is-ready'), 'ring complete past the threshold');
  touch(scroller, 'touchend', 400); await tick(5);
  assert.equal(runs, 1); assert.ok(chip.classList.contains('is-loading'), 'icon spins'); assert.ok(!chip.classList.contains('is-leaving'));
  assert.equal(chipY(chip), REST - 30, 'it settles at its resting spot'); assert.equal(scroller.style.transform, '', 'the page never moved');
  const rest = chipY(chip); touch(scroller, 'touchstart', 50); touch(scroller, 'touchmove', 300); assert.equal(chipY(chip), rest, 'a second pull while busy is ignored');
  finish(); await tick(10);
  assert.ok(!chip.classList.contains('is-loading') && chip.classList.contains('is-leaving'), 'done: it leaves');
  destroy();
});

test('pull to refresh: ignored when the page is not enabled, scrolled, or inside a sheet or input; a failing refresh still resets', async () => {
  const scroller = document.createElement('div'); document.body.appendChild(scroller);
  let on = false, runs = 0; const destroy = initPullRefresh({ scroller, enabled: () => on, onRefresh: async () => { runs++; throw new Error('boom'); } });
  const chip = [...document.querySelectorAll('.ptr')].pop();
  touch(scroller, 'touchstart', 50); touch(scroller, 'touchmove', 400); assert.ok(!chip.classList.contains('is-on'), 'disabled page');
  on = true; scroller.scrollTop = 30; touch(scroller, 'touchstart', 50); touch(scroller, 'touchmove', 400); assert.ok(!chip.classList.contains('is-on'), 'not at the top'); scroller.scrollTop = 0;
  const input = document.createElement('input'); scroller.appendChild(input);
  const e = new window.Event('touchstart', { bubbles: true }); e.touches = [{ clientY: 50, clientX: 100 }]; input.dispatchEvent(e); touch(scroller, 'touchmove', 400); assert.ok(!chip.classList.contains('is-on'), 'inside an input');
  touch(scroller, 'touchstart', 50); touch(scroller, 'touchmove', 400); touch(scroller, 'touchend', 400);
  await tick(10);
  assert.equal(runs, 1); assert.ok(!chip.classList.contains('is-loading'), 'reset after a failed refresh');
  destroy();
});

test('pull curve: threshold is reachable with a normal swipe, never passes MAX; the indicator is hidden at 0 and below the status bar at the threshold', () => {
  assert.ok(pullDistance(130) >= THRESHOLD, 'about 130px of finger travel reaches the threshold'); assert.ok(pullDistance(40) < THRESHOLD); assert.ok(REST < THRESHOLD + 10);
  assert.ok(indicatorY(0) < -40, 'fully above the screen'); assert.ok(indicatorY(THRESHOLD) > 0 && indicatorY(THRESHOLD) < 40); assert.equal(indicatorY(0, 20), indicatorY(0) + 20, 'follows the safe-area inset');
});

// ------------------------------------------------ 3. bottom bar ring and Import button
test('bar ring (owner report): moving to a tab sends BOTH edges to that tab; the leading edge is faster; it never extends past the target', async () => {
  const { mountShell } = await imp('js/features/shell/shell.js');
  const { setSession, getSession } = await imp('js/core/session.js');
  const handlers = {}; const router = { on: (t, fn) => { handlers[t] = fn; }, navigate() {}, back() {} };
  setSession({ mode: 'guest', user: null, status: 'active' });
  const shell = mountShell({ router }); shell.setSession(getSession());
  const m = () => document.querySelector('.bar-marker'), v = (k) => m().style.getPropertyValue(k);
  handlers.route({ route: { tab: 'library', shell: true } }); assert.equal(v('--l'), '0'); assert.equal(v('--r'), '0'); assert.ok(m().classList.contains('is-ready'));
  handlers.route({ route: { tab: 'search', shell: true } }); // library (0) to search (3): the long move that overlapped Menu in v2.1.3
  assert.equal(v('--l'), '3'); assert.equal(v('--r'), '3', 'no edge goes beyond column 3, so Menu (4) is never covered');
  assert.equal(parseInt(v('--tr')), 230, 'moving right: the right edge leads'); assert.equal(parseInt(v('--tl')), 380); assert.equal(v('--dr'), '0ms'); assert.equal(v('--dl'), '45ms');
  handlers.route({ route: { tab: 'random', shell: true } }); // moving left: the left edge leads
  assert.equal(v('--l'), '1'); assert.equal(v('--r'), '1'); assert.equal(parseInt(v('--tl')), 230); assert.equal(parseInt(v('--tr')), 380); assert.equal(v('--dl'), '0ms'); assert.equal(v('--dr'), '45ms');
  // Import hides the ring; coming back it is placed at once (no slide in from a stale spot) and then fades in
  handlers.route({ route: { tab: 'import', shell: true } }); assert.equal(m().dataset.hidden, 'true');
  handlers.route({ route: { tab: 'menu', shell: true } }); assert.equal(m().dataset.hidden, 'false'); assert.equal(v('--l'), '4'); assert.equal(v('--r'), '4');
});

test('bar and sidebar CSS contracts: Import has an active look, ring is edge based, the collapsed logo has room', () => {
  const nav = fs.readFileSync(new URL('css/components/nav.css', root), 'utf8');
  assert.match(nav, /\.bar-import\[aria-current='page'\] span \{[^}]*box-shadow/, 'active Import button differs from the inactive one');
  assert.match(nav, /\.bar-ring \{[^}]*left: calc\(var\(--l, 0\) \* 20%/); assert.doesNotMatch(nav, /bar-stretch|cubic-bezier\(0\.34, 1\.45/, 'no centre-growing ring and no overshoot spring on the ring');
  assert.match(nav, /\.sb-toggle \{[^}]*position: absolute/, 'the hidden toggle must not take row space (it squeezed the logo out when collapsed)');
  assert.match(nav, /\.sb-brand \{[^}]*width: 100%/);
});

test('collapsed sidebar: the logo slot has a full 44px (toggle out of the flow, brand fills the row)', async () => {
  const { mountShell } = await imp('js/features/shell/shell.js');
  const slot = document.querySelector('.sb-brand .sb-slot'); assert.ok(slot, 'logo slot exists in the brand link');
  assert.ok(slot.querySelector('.logo-mark'), 'logo mark is inside the slot'); void mountShell;
  const head = document.querySelector('.sb-head'); const kids = [...head.children].map((c) => c.className.split(' ')[0]);
  assert.deepEqual(kids, ['sb-expandbtn', 'sb-brand', 'btn'], 'expand button, brand, toggle (toggle is positioned absolutely by CSS)');
});
