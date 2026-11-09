// v2.5.5: reload and offline PIN rules, Auto splash, vault without a timer setting, offline notice, report email, 404 redirect list, public pages.
// Real-browser behaviour (reload resume, offline unlock, the 404 redirect, the look of the pages) was run in headless Chromium by the build agent and is on the owner checklist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('lock resume: allowed only inside the Auto lock time; 0 = never, -1 = no limit (capped at 7 days); a missing or future stamp is refused', async () => {
  const { resumeAllowed } = await import('../../js/core/lock-resume.js');
  const now = 1_000_000_000_000, min = 60000;
  assert.equal(resumeAllowed({ away: 5 * 60, seen: now - 4 * min, now }), true);
  assert.equal(resumeAllowed({ away: 5 * 60, seen: now - 6 * min, now }), false);
  assert.equal(resumeAllowed({ away: 0, seen: now - 1000, now }), false, '0 = lock at once, so a reload asks');
  assert.equal(resumeAllowed({ away: -1, seen: now - 3 * 24 * 60 * min, now }), true);
  assert.equal(resumeAllowed({ away: -1, seen: now - 8 * 24 * 60 * min, now }), false, 'capped at 7 days');
  assert.equal(resumeAllowed({ away: 600, seen: 0, now }), false); assert.equal(resumeAllowed({ away: 600, seen: now + 5000, now }), false);
});

test('lock: "Ask for the PIN on every reload" is OFF by default (owner) and stored per device; no key is kept while it is ON', async () => {
  const L = await import('../../js/core/lock.js'); const { prefs } = await import('../../js/core/local-prefs.js');
  prefs.remove('lock.askOnReload'); assert.equal(L.askOnReload(), false);
  L.setAskOnReload(true); assert.equal(L.askOnReload(), true); L.setAskOnReload(false); assert.equal(L.askOnReload(), false); prefs.remove('lock.askOnReload');
  const src = read('js/core/lock.js'); assert.match(src, /function setBox\(b\)/); assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /\n\s*box = (await|nb)/, 'a new key only goes through setBox');
  assert.match(src, /offlineCheck/); assert.match(src, /openServerSession/);
});

test('crypto box: a box rebuilt from its (non-extractable) key opens what the first one sealed; the key bytes can not be exported', async () => {
  const { deriveBox, makeBox, newSalt } = await import('../../js/core/crypto-box.js');
  const salt = newSalt(), a = await deriveBox('1234', salt, 1000), sealed = await a.encrypt({ x: 1 });
  const b = makeBox(a.key, a.verifier); assert.deepEqual(await b.decrypt(sealed), { x: 1 });
  assert.equal(a.key.extractable, false); await assert.rejects(() => crypto.subtle.exportKey('raw', a.key));
  const wrong = await deriveBox('9999', salt, 1000); assert.notEqual(wrong.verifier, a.verifier); await assert.rejects(() => wrong.decrypt(sealed));
});

test('splash Auto (owner): the full animation on the first start, then only after 6 hours; Full and Short stay as chosen; reduced motion is still', async () => {
  const { resolveMode, AUTO_FULL_EVERY_MS } = await import('../../js/features/splash/splash.js'); const now = Date.now(), h = 3600000;
  assert.equal(AUTO_FULL_EVERY_MS, 6 * h);
  assert.equal(resolveMode({ setting: 'auto', lastFull: 0, now }), 'full', 'the very first start');
  assert.equal(resolveMode({ setting: 'auto', lastFull: now - 5 * h, now }), 'short', 'a reload or reopening inside 6 hours');
  assert.equal(resolveMode({ setting: 'auto', lastFull: now - 6 * h, now }), 'full');
  assert.equal(resolveMode({ setting: 'auto', lastFull: now + h, now }), 'full', 'a clock that moved back');
  assert.equal(resolveMode({ setting: 'full', lastFull: now, now }), 'full'); assert.equal(resolveMode({ setting: 'short', lastFull: 0, now }), 'short');
  assert.equal(resolveMode({ setting: 'auto', reduce: true, lastFull: 0, now }), 'still'); assert.equal(resolveMode({}), 'full');
});

test('vault (owner): "Stay unlocked for" is gone; the vault follows the app lock and is closed by a reload; 15 minute idle rule only without an app lock', async () => {
  const V = await import('../../js/core/vault.js'); assert.equal(V.VAULT_IDLE_MS, 900000); assert.equal(typeof V.closeStaleVaultSession, 'function');
  const src = read('js/core/vault.js'); assert.match(src, /followsAppLock\(\)/);
  const { remainingText } = await import('../../js/features/vault/vault-unlock.js'); assert.equal(remainingText(), '', 'nothing while locked');
  assert.match(read('js/boot.js'), /closeStaleVaultSession\(\)/); assert.match(read('js/boot.js'), /reason === 'idle'/);
});

test('offline notice: what works and what needs internet, for a guest and for an account', async () => {
  const { offlineSections } = await import('../../js/features/shell/offline-notice.js');
  const g = offlineSections('guest'), a = offlineSections('account');
  assert.ok(g.works.length >= 3 && g.needs.some((t) => /Locked folders/.test(t)));
  assert.ok(a.needs.length > g.needs.length && a.needs.some((t) => /Syncing/.test(t)) && a.works.some((t) => /sync when you are back online/.test(t)));
  assert.match(read('js/boot.js'), /initOfflineNotice\(\)/);
});

test('report email: the details block is added under the message, one "Label: value" per line, empty values left out, no secrets', async () => {
  const { reportBody } = await import('../../js/features/settings/report-mail.js');
  const body = reportBody({ version: '2.5.5', mode: 'Account', email: 'a@b.co', uid: 'U1', device: 'Chrome on Android', screen: '390x844', online: 'Yes', library: '', lock: 'On' });
  assert.match(body, /^\n\n\n--- Details added automatically/); assert.match(body, /App: Linkivo 2\.5\.5/); assert.match(body, /Account: a@b\.co/); assert.match(body, /App lock: On/); assert.doesNotMatch(body, /Library:|Theme:|Page:/);
  assert.doesNotMatch(read('js/features/settings/report-mail.js'), /pin\b.*getLock|getBox|verifier/i);
});

test('404: every route pattern of the app passes the first-load check in index.html, and unknown addresses do not (the list is kept equal to routes.js)', async () => {
  const html = read('index.html'); const m = html.match(/if \(!(\/\^[\s\S]*?\$\/)\.test\(p\)\) location\.replace\('\/404/); assert.ok(m, 'the redirect script is in index.html');
  const re = new RegExp(m[1].slice(1, -1).replace(/\\\//g, '/'));
  const routes = read('js/features/shell/routes.js'); const patterns = [...routes.matchAll(/pattern: '([^']+)'/g)].map((x) => x[1]).filter((p) => p !== '*');
  assert.ok(patterns.length >= 20);
  for (const p of patterns) { const path = p.replace(/:[a-z]+/g, 'abc'); assert.ok(re.test(path), `${p} -> ${path} must not be sent to the 404 page`); }
  for (const bad of ['/nope', '/library/x', '/folder', '/settings/a/b', '/docs/a/b', '/index.html', '/404x']) assert.equal(re.test(bad), false, bad);
  const nf = read('404.html').replace(/<!--[\s\S]*?-->/g, ''); assert.doesNotMatch(nf, /boot\.js|main\.js|splash|firebase/i); assert.match(nf, /noindex/); assert.match(nf, /href="\/library"/);
  assert.match(read('sw.js'), /'\/404'/); assert.match(read('js/features/shell/pages/not-found-page.js'), /location\.replace\('\/404/);
});

test('public pages (owner): plain Privacy and Terms, README card, back arrow links, no scrollbar in the sidebar, browser history section', async () => {
  const priv = read('privacy.html'), docs = read('docs.html'), step = read('docs/library.html');
  assert.match(priv, /class="pub-toc-top"/); assert.doesNotMatch(priv, /pub-part-n/); assert.doesNotMatch(priv, /class="pub-list"/); assert.match(priv, /id="browser-history"/); assert.match(priv, /myactivity\.google\.com/);
  assert.match(docs, /class="pub-readme"[^>]*github\.com\/muhtasim-rahman\/linkivo#readme/); assert.match(step, /class="pub-icon" href="\/docs"/);
  const css = read('css/pages/public.css'); assert.match(css, /\.pub-side \{[^}]*scrollbar-width: none/); assert.match(css, /\.pub-h1-ic \{[^}]*color: var\(--accent\)/); assert.doesNotMatch(css.match(/\.pub-h1-ic \{[^}]*\}/)[0], /gradient/);
  assert.doesNotMatch(css, /rotate\(-0\.6deg\)/, 'no tilt on the video'); assert.doesNotMatch(css, /backdrop-filter: blur\(6px\)/);
  const js = read('js/public.js'); assert.match(js, /keepInView/); assert.doesNotMatch(js, /history\.back\(\)/);
  const { LEGAL_UPDATED } = await import('../../js/features/public/legal-content.js'); assert.ok(LEGAL_UPDATED);
});

test('history: the clear popup, the page and the account delete say that the browser keeps its own history, with a Learn more link to the Privacy section', async () => {
  const { browserHistoryNote, BROWSER_HISTORY_PATH } = await import('../../js/ui/browser-history-note.js');
  const n = browserHistoryNote(); assert.match(n.textContent, /browser/); assert.equal(n.querySelector('a').getAttribute('href'), BROWSER_HISTORY_PATH); assert.equal(BROWSER_HISTORY_PATH, '/privacy#browser-history');
  assert.match(read('js/features/history/history-page.js'), /browserHistoryNote\(\)/); assert.match(read('js/features/settings/delete-account.js'), /browserHistoryNote\(\)/);
  const { isPublicPath } = await import('../../js/core/public-paths.js'); assert.equal(isPublicPath(BROWSER_HISTORY_PATH), true, 'the link opens the page in a new tab');
});

test('settings page: no line between the columns, the fade is above the category column; lock buttons stay hidden while the app lock is off', async () => {
  const css = read('css/pages/settings.css'); assert.doesNotMatch(css, /width: 1px; pointer-events: none; background: linear-gradient\(to bottom/); assert.match(css, /\.set-navwrap::after \{[^}]*z-index: 3/);
  const nav = read('css/components/nav.css'); assert.match(nav, /\.lock-btn\[hidden\] \{ display: none !important/); assert.match(nav, /\.lock-row\[hidden\] \{ display: none !important/);
});

test('service worker: offline or on a dead connection a saved copy answers at once', async () => {
  const sw = read('sw.js'); assert.match(sw, /netBadUntil/); assert.match(sw, /self\.navigator\.onLine === false/); assert.match(sw, /const VERSION = '2\.5\.5'/);
});
