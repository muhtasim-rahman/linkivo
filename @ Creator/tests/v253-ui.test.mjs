// v2.5.3: Security popups, locked-folder entry points, Testing section, thumbnails, refresh. Browser-only behavior (real history entries, focus, animation) is checked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];

test('the old locked-folder page, entry and settings rows are gone; the routes /vault and /vault/:fid no longer exist', async () => {
  for (const f of ['js/features/vault/vault-page.js', 'js/features/vault/vault-entry.js', 'js/features/vault/vault-settings.js', 'js/features/lock/lock-settings.js']) assert.ok(!fs.existsSync(new URL('../../' + f, import.meta.url)), f);
  const routes = read('js/features/shell/routes.js'); assert.doesNotMatch(routes, /pattern: '\/vault/);
  assert.doesNotMatch(read('js/features/library/library-page.js'), /mountVaultEntry|vault-entry/);
});

test('vault.js: no data of the vault is written to the device (v2.5.5: the old keep-time preference is only deleted); code shape and the example', async () => {
  const src = read('js/core/vault.js');
  assert.doesNotMatch(src, /indexedDB|openDbSafe|localStorage|sessionStorage/); assert.equal((src.match(/\bprefs\.(get|set|remove)/g) || []).length, 1, 'prefs is used once: it removes the old keep-time setting');
  const V = await import('../../js/core/vault.js'); const F = await import('../../js/features/vault/vault-flows.js');
  assert.equal(V.vaultCodeMatch('@123456', '@'), '123456'); assert.equal(V.vaultCodeMatch('@12345', '@'), null); assert.equal(V.vaultCodeMatch('#123456', '@'), null); assert.equal(V.vaultCodeMatch('@12345a', '@'), null);
  assert.equal(F.codeExample('@'), '@000000'); assert.equal(F.codeExample('#'), '#000000');
  assert.equal(V.KEEP_OPTIONS, undefined, 'v2.5.5: the "Stay unlocked for" setting was removed'); assert.equal(V.keepSetting, undefined);
});

test('vault (v2.5.5): no keep-time setting; 15 minutes of idle time only matters where the app lock is off', async () => {
  const V = await import('../../js/core/vault.js'); assert.equal(V.VAULT_IDLE_MS, 15 * 60 * 1000);
  const src = read('js/core/vault.js'); assert.match(src, /followsAppLock\(\)/); assert.match(src, /closeVault\(\{ reason: 'idle' \}\)/); assert.doesNotMatch(src, /keepSetting|KEEP_OPTIONS|expiryTimer/);
  assert.doesNotMatch(read('js/features/lock/security-popups.js'), /row\('Stay unlocked for'/);
});

test('security popups: the 30 second gate asks the PIN once, then not again for 30 seconds, then again; nothing is asked without the lock', async () => {
  const L = await import('../../js/core/lock.js'); const P = await import('../../js/features/lock/security-popups.js');
  assert.equal(P.SECURITY_GATE_MS, 30000);
  const src = read('js/features/lock/security-popups.js');
  assert.match(src, /securityVerifiedRecently\(SECURITY_GATE_MS\)/); assert.match(src, /askPin\(\{ title: 'Enter your PIN'/); assert.match(src, /markSecurityVerified\(\); return true/);
  const G = await import('../../js/core/security-gate.js');
  G.resetSecurityGate(); assert.equal(G.securityVerifiedRecently(30000), false, 'never verified: ask');
  G.markSecurityVerified(); assert.equal(G.securityVerifiedRecently(30000), true, 'just verified: no question for 30 seconds');
  const real = Date.now; Date.now = () => real() + 31000; assert.equal(G.securityVerifiedRecently(30000), false, 'after 30 seconds: ask again'); Date.now = real;
  G.resetSecurityGate(); assert.equal(G.securityVerifiedRecently(30000), false, 'a lock resets it');
  assert.match(read('js/features/lock/lock-controller.js'), /resetSecurityGate\(\);/);
  assert.equal(L.getLock().enabled, false); assert.equal(await P.securityGate('x'), true, 'lock off: no question');
});

test('security popups: ONE card with two rows that say nothing about their state; each opens a popup after the gate; every setting is inside a popup', async () => {
  const P = await import('../../js/features/lock/security-popups.js'); const { h } = await import('../../js/core/dom.js');
  const rows = P.securityRows({ row: (l, d, e) => h('div', { class: 'row' }, l, d, e) });
  const btns = [...rows.querySelectorAll('button.row')]; assert.equal(btns.length, 2);
  assert.deepEqual(btns.map((b) => b.querySelector('.row-label').textContent), ['App lock', 'Folder Lock (Vault)']);
  for (const b of btns) assert.doesNotMatch(b.querySelector('.row-desc').textContent, /\b(on|off|enabled|disabled)\b/i, 'no state before the PIN');
  const src = read('js/features/lock/security-popups.js');
  for (const label of ['Change PIN', 'Auto lock', 'Lock now', 'Stay unlocked for', 'Unlock only through the search box', 'Code symbol', 'Change code', 'Forgot the code?']) assert.ok(src.includes(label), label);
  assert.match(src, /requireSensitive\('security'\)/);
  const cat = await import('../../js/features/settings/catalog.js'); const sec = cat.CATALOG.filter((e) => e.section === 'security').map((e) => e.id);
  assert.deepEqual(sec, ['appLock', 'gateMode'], 'the card first, then the common settings');
  assert.ok(cat.findEntry('appLock').keywords.includes('vault') && cat.findEntry('appLock').keywords.includes('folder lock'), 'the settings search finds the card');
});

test('Testing: the section is admin only (title "Testing"), points display is admin only, a normal user gets none of it', async () => {
  const C = await import('../../js/features/settings/catalog.js'); const A = await import('../../js/core/admin.js');
  const sec = C.SECTIONS.find((s) => s.id === 'advanced'); assert.equal(sec.label, 'Testing'); assert.equal(sec.admin, true);
  assert.equal(A.isAdminAccount(), false);
  assert.ok(!C.visibleSections().some((s) => s.id === 'advanced')); assert.equal(C.entriesFor('advanced').length, 0);
  assert.ok(!C.visibleCatalog().some((e) => ['worker', 'tester', 'debugLog', 'showPoints'].includes(e.id)));
  await A.loadAdmin({ get: async () => true }, 'uA');
  assert.ok(C.visibleSections().some((s) => s.id === 'advanced')); assert.deepEqual(C.entriesFor('advanced').map((e) => e.id), ['worker', 'tester', 'debugLog']); assert.ok(C.visibleCatalog().some((e) => e.id === 'showPoints'));
  A.clearAdmin();
  assert.match(read('js/features/preview/preview-tabs.js'), /isAdminView\(\) \? \[/); assert.match(read('js/features/library/folder-page.js'), /pref\(LIB\.showPoints\) && isAdminView\(\)/);
});

test('admin badge: small and in the accent colour (no solid disc)', () => {
  const css = read('css/pages/pages.css'); const m = css.match(/\.admin-chip\.is-shield \{([^}]*)\}/)[1];
  assert.match(m, /width: 16px/); assert.match(m, /var\(--accent-soft\)/); assert.match(m, /var\(--accent-text\)/); assert.doesNotMatch(m, /var\(--accent\)\s*;/);
});

test('settings: the wide category column has no edge fade (the phone bar keeps it)', () => {
  const css = read('css/pages/settings.css'); assert.match(css, /@container set \(min-width: 760px\)[\s\S]*\.set-nav, \.set-nav\.fade-x \{[^}]*mask-image: none/);
});

test('thumbnails: page image, then screenshot, then a free screenshot of the page; the favicon stays underneath; a row built before it is attached still loads', async () => {
  const T = await import('../../js/ui/thumb.js');
  const list = T.thumbSources({ image: 'https://a/i.jpg', shot: 'https://s/x.png' }, 'https://site.test/page');
  assert.equal(list.length, 3); assert.equal(list[0], 'https://a/i.jpg'); assert.equal(list[1], 'https://s/x.png'); assert.match(list[2], /^https:\/\/s\.wordpress\.com\/mshots\/v1\/https%3A%2F%2Fsite\.test%2Fpage\?w=320$/);
  assert.deepEqual(T.thumbSources(null, 'https://site.test/'), [T.shotFallback('https://site.test/')]); assert.deepEqual(T.thumbSources(null, ''), []); assert.equal(T.shotFallback('javascript:alert(1)'), '');
  const el = T.createThumb({ engine: { peekLinkMeta: async () => ({ image: 'https://a/i.jpg' }) }, id: 'L1', host: 'site.test', url: 'https://site.test/', favicon: 'https://f/x.ico' });
  assert.ok(el.querySelector('.thb-img') === null, 'not on the page yet: nothing requested in the same tick');
  document.body.append(el); await new Promise((r) => setTimeout(r, 120));
  assert.ok(el.querySelector('img.thb-img'), 'once the row is on the page the picture is requested');
  el.remove();
  for (const f of ['js/features/library/link-row.js', 'js/features/history/history-page.js', 'js/features/search/search-page.js']) assert.match(read(f), /createThumb\(\{[^}]*url:/, f + ' passes the address');
});

test('refresh: one handler for the gesture, the header icon and the menus; the router rebuilds the page after the page refresh()', async () => {
  const R = await import('../../js/core/refresh.js'); let n = 0; R.setRefreshHandler(async () => { n++; });
  await R.refreshApp(); assert.equal(n, 1);
  const btn = (await import('../../js/ui/refresh-button.js')).refreshButton(); btn.click(); await tick(5); assert.equal(n, 2, 'the header icon calls the same refresh');
  assert.match(read('js/boot.js'), /setRefreshHandler/); assert.match(read('js/boot.js'), /onRefresh: \(\) => refreshApp\(\)/);
  for (const f of ['js/features/history/history-page.js', 'js/features/insights/stats-page.js', 'js/features/insights/activity-page.js', 'js/features/library/library-page.js']) assert.match(read(f), /refreshButton\(\)/, f);
});

test('locked records: lists, links and menus show a lock mark; folder menu offers Lock folder / Remove lock instead of the old vault page', () => {
  assert.match(read('js/features/library/library-page.js'), /f\.lk && h\('span', \{ class: 'fcard-lock'/); assert.match(read('js/features/library/link-row.js'), /l\.lk && h\('span'/);
  const fa = read('js/features/library/folder-actions.js'); assert.match(fa, /'Lock folder'/); assert.match(fa, /'Remove lock'/); assert.doesNotMatch(fa, /moveIntoVault|Move to locked folders/);
  assert.match(fa, /closeAfter: !gate\.wasOpen/, 'a lock done only to lock a folder closes the vault again');
});

test('search box: Enter with a complete code unlocks (symbol + six digits), anything else is an ordinary search; the box is emptied; the unlock animation is on this page', () => {
  const s = read('js/features/search/search-page.js');
  assert.match(s, /e\.key !== 'Enter'/); assert.match(s, /vaultCodeMatch\(input\.value, getLock\(\)\.vaultPrefix\)/); assert.match(s, /playUnlockBurst\(nf\.ic, \{ inline: true \}\)/); assert.match(s, /input\.value = ''/);   // v2.5.4: the animation plays INSIDE the "Nothing found" placeholder
  assert.match(s, /out\.replaceChildren\(nf\.el\)/, 'a code shows the same placeholder as any search without results');
  assert.doesNotMatch(s, /openVault\(/, 'the page does not call the vault directly: only the shared flow does');
  assert.match(read('js/features/vault/vault-unlock.js'), /catch \{ return false; \}/, 'a wrong code is silent');
  assert.match(read('css/components/unlock-burst.css'), /prefers-reduced-motion/);
});

test('unlock card (v2.5.4): only while the locked folders are unlocked (a Lock card); never while locked, for guests or without a code', async () => {
  const L = await import('../../js/core/lock.js'); const { unlockCard } = await import('../../js/features/vault/unlock-card.js');
  const card = unlockCard(); document.body.append(card);
  assert.equal(card.hidden, true, 'no code: nothing at all');
  assert.match(read('js/features/vault/unlock-card.js'), /!vaultOn\(\) \|\| !v\.open \|\| v\.quiet/); assert.doesNotMatch(read('js/features/vault/unlock-card.js'), /unlockFlow/);
  assert.match(read('js/features/shell/pages/menu-page.js'), /unlockCard\(\)/); assert.match(read('js/features/settings/settings-page.js'), /installCard\(\), unlockCard\(\)/);
  card.remove(); void L;
});

test('lock and logout empty the vault memory; the app lock resets the 30 second gate', () => {
  assert.match(read('js/features/lock/lock-controller.js'), /closeVaultLocal\(\)/); assert.match(read('js/core/app-data.js'), /closeVaultLocal\(\);/);
});

test('jobs panel: percent, hand-over to the Worker (500 per job, 4 jobs, locked and deleted links never go, the local job ends only when everything moved)', async () => {
  const J = await import('../../js/features/jobs/jobs-panel.js');
  assert.equal(J.percent({ done: 5, total: 20 }), 25); assert.equal(J.percent({ done: 0, total: 0 }), null); assert.equal(J.percent({ done: 50, total: 20 }), 100);
  const W = await import('../../js/core/worker-client.js'); const calls = [];
  W.setTokenProvider(async () => 'tok');
  const realFetch = globalThis.fetch; globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ ok: true, id: 'j' + calls.length, total: 1 }), text: async () => '{"ok":true}' }; };
  try {
    const ids = Array.from({ length: 1200 }, (_, i) => 'L' + String(i).padStart(10, '0'));
    const links = new Map(ids.map((id, i) => [id, { id, del: i === 20 ? 1 : 0, lk: i === 21 }]));
    const engine = { getLink: (id) => links.get(id) }; const stopped = [], removed = [];
    const queue = { stop: (id) => stopped.push(id), remove: async (id) => { removed.push(id); } };
    const r = await J.handOverToWorker({ queue, engine, job: { id: 'J1', cursor: 10, params: { ids } } });
    assert.equal(r.moved, 1188, 'deleted and locked links are not handed over'); assert.equal(r.left, 0);
    const posts = calls.filter((c) => /\/jobs\/enqueue$/.test(c.url)); assert.equal(posts.length, 3, '1188 links = three jobs of at most 500');
    assert.ok(posts.every((c) => c.body.ids.length <= 500)); assert.deepEqual(stopped, ['J1']); assert.deepEqual(removed, ['J1']);
    // more than 4 x 500: the rest stays on this device and the local job continues
    calls.length = 0; stopped.length = 0; const big = Array.from({ length: 2600 }, (_, i) => 'B' + String(i).padStart(10, '0')); big.forEach((id) => links.set(id, { id, del: 0 }));
    const r2 = await J.handOverToWorker({ queue, engine, job: { id: 'J2', cursor: 0, params: { ids: big } } });
    assert.equal(calls.filter((c) => /enqueue/.test(c.url)).length, 4); assert.equal(r2.moved, 2000); assert.equal(r2.left, 600); assert.deepEqual(stopped, [], 'the local job keeps running for the rest');
  } finally { globalThis.fetch = realFetch; }
  assert.match(read('js/features/library/library-page.js'), /jobsButton\(\{ queue: getQueue\(\), engine \}\)/); assert.match(read('js/features/shell/pages/menu-page.js'), /jobsButton\(/); assert.match(read('js/boot.js'), /jobs-panel\.js/);
});

test('backup reminder: due only with links, after the chosen time since the last backup (or since the library first had links), not while snoozed; off never asks', async () => {
  const R = await import('../../js/features/export/backup-reminder.js'); const D = 86400000, now = 100 * D;
  assert.equal(R.reminderDue({ now, last: now - 31 * D, days: 30, links: 5 }), true);
  assert.equal(R.reminderDue({ now, last: now - 29 * D, days: 30, links: 5 }), false);
  assert.equal(R.reminderDue({ now, last: now - 99 * D, days: 30, links: 0 }), false, 'an empty library has nothing to back up');
  assert.equal(R.reminderDue({ now, last: now - 99 * D, days: 0, links: 9 }), false, 'off');
  assert.equal(R.reminderDue({ now, last: now - 99 * D, days: 7, links: 9, snoozeUntil: now + D }), false, 'snoozed');
  assert.equal(R.reminderDue({ now, last: 0, created: 0, days: 7, links: 9 }), false, 'never seen: the clock starts first');
  assert.equal(R.reminderDue({ now, last: 0, created: now - 8 * D, days: 7, links: 9 }), true, 'never backed up: counted from the first links');
  const { prefs } = await import('../../js/core/local-prefs.js');
  prefs.remove('backup.remind'); assert.equal(R.remindDays(), 30); prefs.set('backup.remind', 'off'); assert.equal(R.remindDays(), 0); prefs.set('backup.remind', '7'); assert.equal(R.remindDays(), 7); prefs.set('backup.remind', '9'); assert.equal(R.remindDays(), 30); prefs.remove('backup.remind');
  R.markBackupDone(5); assert.equal(prefs.get('backup.last'), 5); prefs.remove('backup.last');
  const C = await import('../../js/features/settings/catalog.js'); const e = C.findEntry('backupRemind'); assert.equal(e.default, '30'); assert.deepEqual(e.options.map((o) => o.value), ['off', '7', '14', '30']);
  assert.match(read('js/boot.js'), /initBackupReminder\(\{ engine: getEngine \}\)/);
  const x = read('js/features/export/export-sheet.js'); assert.match(x, /markBackupDone\(\)/); assert.match(x, /passphraseProblem\(pass1\.value\)/); assert.match(x, /onClose: wipeSecret/);
});

test('restore: an encrypted backup asks for the passphrase (once), a wrong one can be retried, Cancel stops quietly', async () => {
  const { encryptBackup } = await import('../../js/features/export/backup-crypto.js'); const { buildBackup } = await import('../../js/features/export/native-format.js'); const { readBackupAny } = await import('../../js/features/import/backup-open.js');
  const text = JSON.stringify(await encryptBackup(JSON.stringify(buildBackup({ folders: [{ id: 'f', name: 'A' }], links: [{ id: 'l', fid: 'f', url: 'https://a.com/', ts: 1 }], now: 1 })), 'my passphrase', { iterations: 100000 }));
  const p = readBackupAny(text); await tick(30);
  const input = document.querySelector('input[type=password]'); assert.ok(input, 'the passphrase popup is open');
  input.value = 'wrong one'; [...document.querySelectorAll('button')].find((b) => b.textContent === 'Open backup').click(); await new Promise((r) => setTimeout(r, 400));
  assert.match(document.querySelector('.help.is-error').textContent, /Wrong passphrase/);
  input.value = 'my passphrase'; [...document.querySelectorAll('button')].find((b) => b.textContent === 'Open backup').click();
  const r = await p; assert.ok(r.ok); assert.equal(r.backup.links.length, 1);
  const p2 = readBackupAny(text); await tick(30); [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Cancel').pop().click(); const r2 = await p2; assert.equal(r2.cancelled, true);
  const plain = await readBackupAny(JSON.stringify(buildBackup({ folders: [{ id: 'f', name: 'A' }], links: [], now: 1 }))); assert.ok(plain.ok);
});

test('SEO: the home page has its own title, description and canonical (it no longer redirects to the sign-in page); sign in is noindex; every public page is unique', async () => {
  const { ROUTES } = await import('../../js/features/shell/routes.js'); const { pageMeta, SITE } = await import('../../js/core/page-meta.js'); const { resolveGuard } = await import('../../js/core/router.js');
  const root = ROUTES.find((r) => r.id === 'root'), login = ROUTES.find((r) => r.id === 'login');
  assert.ok(!root.redirect, 'the home page opens for a signed-out visitor'); assert.equal(resolveGuard(root, { mode: 'none' }), null); assert.equal(resolveGuard(root, { mode: 'account', status: 'active' }), '/library');
  const home = pageMeta(root); assert.equal(home.title, 'Linkivo: save, organise and rediscover your links'); assert.equal(home.canonical, 'https://linkivo.web.app/'); assert.equal(home.robots, 'index,follow'); assert.match(home.image, /og-default\.jpg$/);
  const lg = pageMeta(login); assert.equal(lg.title, 'Sign in - Linkivo'); assert.equal(lg.robots, 'noindex,follow'); assert.equal(lg.canonical, '');
  assert.notEqual(home.title, lg.title); assert.notEqual(home.description, lg.description);
  const pub = ROUTES.filter((r) => r.index === true && !r.pattern.includes(':')).map((r) => pageMeta(r));
  assert.deepEqual(pub.map((m) => m.canonical).sort(), ['https://linkivo.web.app/', 'https://linkivo.web.app/docs', 'https://linkivo.web.app/privacy', 'https://linkivo.web.app/terms']);
  assert.equal(new Set(pub.map((m) => m.title)).size, pub.length, 'unique titles'); assert.equal(new Set(pub.map((m) => m.description)).size, pub.length, 'unique descriptions');
  for (const r of ROUTES.filter((x) => x.guard === 'auth')) assert.equal(pageMeta(r).robots, 'noindex,nofollow', r.id + ' is private');
  void SITE;
});

test('SEO: static pages match the browser meta; sizes, images, structured data, sitemap, robots, hosting', async () => {
  const { publicPages } = await import('../../js/core/seo-pages.js'); const { TOPICS } = await import('../../js/features/docs/docs-content.js'); const { pageMeta, applyPageMeta } = await import('../../js/core/page-meta.js'); const { topicMeta } = await import('../../js/core/seo-pages.js');
  const pages = publicPages(TOPICS); assert.equal(pages.length, 5 + TOPICS.length);
  const titles = new Set(), descs = new Set();
  for (const p of pages) {
    assert.ok(p.title.length >= 15 && p.title.length <= 70, `${p.path} title length ${p.title.length}`); assert.ok(p.description.length >= 50 && p.description.length <= 200, `${p.path} description length ${p.description.length}`);
    titles.add(p.title); descs.add(p.description); assert.ok(fs.existsSync(new URL('../..' + p.image, import.meta.url)), p.image + ' exists');
    assert.ok(fs.existsSync(new URL('../../' + p.file, import.meta.url)), p.file + ' is generated'); const html = read(p.file);
    assert.ok(html.includes(`<title>${p.title}</title>`), p.file + ' title'); assert.equal((html.match(/<title>/g) || []).length, 1); assert.equal((html.match(/rel="canonical"/g) || []).length, p.canonical ? 1 : 0);
    const standalone = /^\/(docs|privacy|terms)/.test(p.path);   // v2.5.4: these are their own pages with the text in the page (no noscript copy needed)
    assert.ok(standalone ? html.includes('class="pub"') : html.includes('<noscript>'), p.file + ' has crawler text'); assert.ok(/<h1>/.test(html), p.file + ' has an h1'); assert.equal((html.match(/<h1>/g) || []).length, 1);
    for (const j of p.jsonLd) JSON.parse(JSON.stringify(j));
  }
  assert.equal(titles.size, pages.length); assert.equal(descs.size, pages.length);
  const home = read('index.html'); assert.match(home, /<link rel="canonical" href="https:\/\/linkivo\.web\.app\/">/); assert.match(home, /"@type":"WebApplication"/); assert.doesNotMatch(home, /Sign in - Linkivo/);
  assert.match(read('login.html'), /content="noindex,follow"/);
  const t = TOPICS[2]; const m = pageMeta(topicMeta(t)); assert.equal(m.title, pages.find((p) => p.path === `/docs/${t.id}`).title); assert.equal(m.description, pages.find((p) => p.path === `/docs/${t.id}`).description);
  const sm = read('sitemap.xml'); for (const p of pages.filter((x) => x.canonical)) assert.ok(sm.includes(`<loc>${p.canonical}</loc>`)); assert.ok(!sm.includes('/login'));
  const robots = read('robots.txt'); assert.match(robots, /Sitemap: https:\/\/linkivo\.web\.app\/sitemap\.xml/); for (const d of ['/library', '/folder/', '/link/', '/settings', '/profile', '/menu', '/admin-reset']) assert.ok(robots.includes(`Disallow: ${d}`), d);
  const fb = JSON.parse(read('firebase.json')).hosting; assert.equal(fb.cleanUrls, true); assert.equal(fb.trailingSlash, false);
  const doc = document.implementation.createHTMLDocument('x'); applyPageMeta(pageMeta(topicMeta(t)), doc); assert.equal(doc.title, m.title); assert.equal(doc.querySelector('meta[property="og:image"]').content, m.image); assert.equal(doc.querySelector('link[rel=canonical]').href, `https://linkivo.web.app/docs/${t.id}`);
  const mf = JSON.parse(read('manifest.webmanifest')); assert.ok(mf.description && mf.screenshots.length >= 2); for (const s of mf.screenshots) assert.ok(fs.existsSync(new URL('../..' + s.src, import.meta.url)));
});
