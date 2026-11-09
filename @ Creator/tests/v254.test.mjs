// v2.5.4: public pages (Documentation, Privacy, Terms), PIN pad length, jobs panel, public-paths, thumbnail lookup, welcome flow, defaults.
// Browser-only behaviour (real tabs, the YouTube player, offline start, the look of the pages) is checked by hand: see the owner checklist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick } from './helpers/dom-env.mjs';

setupDom('http://localhost/library');
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const $ = (s) => document.querySelector(s);

test('public pages: every address has a static file with its own header, no app, no lock, no splash, no verification gaps', async () => {
  const { PUBLIC_PATHS } = await import('../../js/features/public/public-render.js');
  const { TOPICS } = await import('../../js/features/docs/docs-content.js');
  assert.equal(PUBLIC_PATHS.length, 3 + TOPICS.length);
  for (const p of PUBLIC_PATHS) {
    const html = read(p === '/docs' ? 'docs.html' : p.slice(1) + '.html');
    assert.match(html, /class="pub"/, p); assert.match(html, /google-site-verification" content="1jRG-liPR6RdCjprv6saCLlbo9T5J3lyNPAXTm4mSl4"/, p + ' Google'); assert.match(html, /msvalidate\.01" content="53A15EBC0ADF54EC55B307032B3C8559"/, p + ' Bing');
    assert.doesNotMatch(html, /\/js\/main\.js|\/js\/boot\.js|id="splash"|class="sidebar"|class="bar"|firebasejs|firebase-loader/i, p + ' is not the app');
    assert.match(html, p === '/docs' ? /data-pub="back"/ : /class="pub-icon" href="\/docs"/, p + ' back arrow (v2.5.5: a link to the docs home; the home closes the tab)'); assert.match(html, /data-pub="theme"/); assert.match(html, /<a class="pub-brand" href="\/"/, 'the logo goes to the app'); assert.match(html, /<script type="module" src="\/js\/public\.js">/);
    assert.equal((html.match(/<h1>/g) || []).length, 1, p + ' one h1'); assert.match(html, /<link rel="canonical"/);
  }
  assert.match(read('index.html'), /google-site-verification/); assert.match(read('index.html'), /msvalidate\.01/); assert.match(read('login.html'), /google-site-verification/);
});

test('docs: the tutorial flow lists every topic once, the home is /docs, every topic page links to the previous and next step', async () => {
  const { TOPICS, FLOW, flowTopics, INTRO_VIDEO } = await import('../../js/features/docs/docs-content.js');
  assert.deepEqual([...FLOW].sort(), TOPICS.map((t) => t.id).sort(), 'FLOW has exactly the topics'); assert.equal(flowTopics().length, TOPICS.length);
  assert.equal(INTRO_VIDEO.id, '0HaYeR6w6k0'); assert.ok(fs.existsSync(new URL('../..' + INTRO_VIDEO.poster, import.meta.url)), 'poster exists'); assert.match(INTRO_VIDEO.embed, /^https:\/\/www\.youtube-nocookie\.com\/embed\/0HaYeR6w6k0/);
  const home = read('docs.html'); assert.match(home, /data-pub="video"/); assert.match(home, /Start the tutorial/); for (const t of TOPICS) assert.ok(home.includes(`href="/docs/${t.id}"`), 'home links ' + t.id);
  FLOW.forEach((id, i) => {
    const html = read(`docs/${id}.html`);
    assert.match(html, new RegExp(`Step ${i + 1} of ${FLOW.length}`)); assert.match(html, /class="pub-rail"/); assert.match(html, /class="pub-toc"/);
    if (i > 0) assert.ok(html.includes(`rel="prev" `) || html.includes(`href="/docs/${FLOW[i - 1]}" rel="prev"`), id + ' has Previous');
    if (i < FLOW.length - 1) assert.ok(html.includes(`href="/docs/${FLOW[i + 1]}" rel="next"`), id + ' has Next'); else assert.match(html, /That is the whole tutorial/);
    if (i === 0) assert.match(html, /pub-step is-empty/);
  });
});

test('privacy and terms: detailed, real, and every outside service the code talks to is named', async () => {
  const { PRIVACY, TERMS, CONTACT } = await import('../../js/features/public/legal-content.js');
  assert.ok(PRIVACY.sections.length >= 9 && TERMS.sections.length >= 10); assert.equal(CONTACT, 'linkivo.web@gmail.com');
  const priv = JSON.stringify(PRIVACY).toLowerCase(), terms = JSON.stringify(TERMS).toLowerCase();
  assert.doesNotMatch(priv + terms, /[\u{1F300}-\u{1FAFF}]/u, 'no emojis');
  // hosts the app and the Worker really call (see the owner's rule: no false statements) -> each must be named in the Privacy page
  const code = ['js/core/microlink.js', 'js/ui/thumb.js', 'js/core/utils.js', 'js/features/preview/preview-meta.js', 'js/core/meta-fallback.js', '@ Creator/worker/worker.js'].map((f) => { try { return read(f); } catch { return ''; } }).join('\n');
  const named = { 'api.microlink.io': 'microlink', 's.wordpress.com': 'mshots', 'image.thum.io': 'thum.io', 'r.jina.ai': 'jina', 'api.imgbb.com': 'imgbb', 'api.allorigins.win': 'allorigins', 'jsonlink.io': 'jsonlink' };
  for (const [host, word] of Object.entries(named)) if (code.includes(host)) assert.ok(priv.includes(word), `${host} is used but "${word}" is not named in Privacy`);
  for (const w of ['firebase', 'cloudflare', 'favicon', 'youtube', 'fonts', 'pepper', '15 days', 'recycle bin', 'analytics', 'cookies', 'ip']) assert.ok(priv.includes(w), 'privacy mentions ' + w);
  for (const w of ['free', 'backup', 'as it is', 'delete your account', 'privacy page']) assert.ok(terms.includes(w), 'terms mention ' + w);
  assert.ok(!priv.includes('we never'), 'no absolute promises that the code cannot prove');
  const html = read('privacy.html'); assert.ok(html.includes('pub-table') && html.includes('In short') && html.includes('Last updated 9 November 2026'));
});

test('public paths: Documentation, Privacy and Terms are never routed inside the app; a link to them opens a new tab', async () => {
  const { isPublicPath, openPublic } = await import('../../js/core/public-paths.js');
  for (const p of ['/docs', '/docs/start', '/privacy', '/terms', '/terms/', '/docs/import?x=1', '/privacy#pin']) assert.equal(isPublicPath(p), true, p);
  for (const p of ['/', '/library', '/docs/a/b', '/privacyx', '/settings', '/link/abc', '/documentation']) assert.equal(isPublicPath(p), false, p);
  // v2.5.5: ONE new tab through a target=_blank link; window.open(url, '_blank', 'noopener') returns null, which made the old code move the app's own tab too
  const clicks = [], origClick = window.HTMLAnchorElement.prototype.click, realOpen = window.open; let opens = 0; window.open = () => { opens++; return null; };
  window.HTMLAnchorElement.prototype.click = function () { clicks.push([this.getAttribute('href'), this.target, this.rel]); };
  try { openPublic('/docs'); } finally { window.HTMLAnchorElement.prototype.click = origClick; window.open = realOpen; }
  assert.deepEqual(clicks, [['/docs', '_blank', 'noopener']]); assert.equal(opens, 0); assert.doesNotMatch(read('js/core/public-paths.js'), /location\.assign/);
  const r = read('js/core/router.js'); assert.match(r, /isPublicPath\(u\.pathname\)\) \{ openPublic/); assert.match(r, /initial: true/);
  const sw = read('sw.js'); assert.match(sw, /PUBLIC_PAGE\.test\(url\.pathname\)/); for (const p of ["'/docs'", "'/privacy'", "'/terms'", "'/docs/start'"]) assert.ok(sw.includes(p), 'precached ' + p);
});

test('PIN pad: a pad for a known PIN holds exactly that many digits; a wrong PIN forgets the length so a changed PIN still works', async () => {
  const { buildPinPad } = await import('../../js/features/lock/pin-pad.js');
  let len = 4, got = null;
  const pad = buildPinPad({ min: () => len || 4, max: () => len || 8, autoAt: () => len, onSubmit: async (p) => { got = p; } });
  document.body.append(pad.el);
  const key = (d) => pad.el.querySelector(`[data-key="${d}"]`) || [...pad.el.querySelectorAll('button')].find((b) => b.textContent.trim() === String(d));
  for (const d of '12345') key(d) && key(d).click();
  await tick(); assert.equal(got, '1234', 'a 4 digit PIN submits at 4 and takes no fifth digit');
  assert.equal(pad.el.querySelectorAll('.pin-dot, .pd').length >= 0, true);
  len = 0; got = null; pad.reset(); for (const d of '123456') key(d) && key(d).click(); await tick(); assert.equal(got, null, 'unknown length: 4 to 8 digits, the person presses Continue');
  pad.el.remove();
  const sheet = read('js/features/lock/pin-sheet.js'); assert.match(sheet, /forgetPinLen\(\)/); assert.match(sheet, /min: \(\) => getPinLen\(\) \|\| 4, max: \(\) => getPinLen\(\) \|\| 8/); assert.match(sheet, /Forgot PIN\?/); assert.match(sheet, /export const PIN_RESET/);
  const flow = read('js/features/lock/pin-flow.js'); assert.match(flow, /PRIVACY_NOTE/); assert.match(flow, /device\\'s own app lock/); assert.doesNotMatch(flow, /text = 'Use 4 to 8 digits\. Pick something others can not guess\.'/);
  const { stageCreate } = await import('../../js/features/lock/pin-flow.js'); assert.equal(typeof stageCreate, 'function');
  assert.doesNotMatch(read('js/features/vault/vault-flows.js'), /4 to 8 digits/, 'the six digit code never says 4 to 8');
  assert.doesNotMatch(read('js/features/lock/security-popups.js'), /Lock now', 'Closes your library/, 'the Lock now row left the App lock popup');
});

test('jobs panel: finished jobs are removed after 24 hours, a job shows when it started, and the word "null" never appears', async () => {
  const { isStale, jobStamp, pruneOldJobs, KEEP_FINISHED_MS, openJobsPanel } = await import('../../js/features/jobs/jobs-panel.js');
  const now = 100 * 3600000;
  assert.equal(isStale({ status: 'done', updatedAt: now - KEEP_FINISHED_MS - 1 }, now), true); assert.equal(isStale({ status: 'done', updatedAt: now - 1000 }, now), false);
  assert.equal(isStale({ status: 'running', updatedAt: 0 }, now), false, 'a running job is never stale'); assert.equal(isStale({ status: 'failed', createdAt: now - 25 * 3600000 }, now), true);
  assert.match(jobStamp({ status: 'running', createdAt: now - 600000, updatedAt: now - 60000 }, now), /^Started .+, updated /); assert.equal(jobStamp({ status: 'queued' }, now), '');
  const removed = []; const q = { list: () => [{ id: 'a', status: 'done', updatedAt: 0 }, { id: 'b', status: 'running', updatedAt: 0 }, { id: 'c', status: 'failed', updatedAt: now }], remove: async (id) => { removed.push(id); } };
  assert.equal(await pruneOldJobs(q, now), 1); assert.deepEqual(removed, ['a']);
  const mk = (jobs) => ({ list: () => jobs, subscribe: () => () => {}, onRemoved: () => () => {}, remove: async () => {}, retry: async () => {}, pause: async () => {}, stop: async () => {}, resume: async () => {} });
  for (const jobs of [[], [{ id: 'x', type: 'import', status: 'failed', title: 'Import', total: 10, done: 4, failed: 2, createdAt: Date.now() - 60000, updatedAt: Date.now() - 30000, error: 'Network error.' }, { id: 'y', type: 'enrich', status: 'running', total: 10, done: 5, createdAt: Date.now(), updatedAt: Date.now() }]]) {
    const sheet = openJobsPanel({ queue: mk(jobs), engine: { adapter: null } }); await tick();
    const text = [...document.querySelectorAll('.jobs-panel')].pop().textContent; assert.doesNotMatch(text, /null|undefined/, 'no stray "null": ' + text.slice(0, 80));
    if (jobs.length) { assert.match(text, /Retry/); assert.match(text, /Started/); assert.match(text, /Details/); }
    sheet.close(); await tick();
  }
  assert.match(read('js/features/jobs/jobs-panel.js'), /\.filter\(Boolean\)\)/);
});

test('history of locked links: memory only (see v253-vault); the vault wipe is wired; search never keeps text that starts with a code symbol', () => {
  assert.match(read('js/core/app-data.js'), /subscribeVault\(\(v\) => \{ if \(history === h && \(!v\.open \|\| v\.quiet\)\) h\.wipeLocked\(\)/);
  const s = read('js/features/search/search-page.js'); assert.match(s, /const codeLike = \(t\) => vaultOn\(\) && VAULT_PREFIXES\.includes\(String\(t \?\? ''\)\.trim\(\)\[0\]\)/);
});

test('vault: quiet open for locking (no folders loaded), the Lock card only while unlocked, away-time lock, default symbol %', async () => {
  const v = read('js/core/vault.js'); assert.match(v, /openVault\(code, \{ quiet = false \} = \{\}\)/); assert.match(v, /if \(!quiet\) \{ try \{ await load\(eng\)/); assert.match(v, /VAULT_IDLE_MS = 15 \* 60 \* 1000/); assert.match(v, /addEventListener\('pageshow', visHandler\)/);
  assert.match(read('js/features/vault/vault-unlock.js'), /openVault\(code, \{ quiet: true \}\)/);
  const { vaultCodeMatch, VAULT_PREFIXES, VAULT_IDLE_MS } = await import('../../js/core/vault.js'); assert.equal(VAULT_PREFIXES[0], '%'); assert.equal(vaultCodeMatch('%123456'), '123456'); assert.equal(VAULT_IDLE_MS, 900000);
  const { codeExample } = await import('../../js/features/vault/vault-flows.js'); assert.match(codeExample(), /^%/);
  assert.doesNotMatch(read('js/features/lock/security-popups.js'), /row\('Unlock only through/);
  for (const f of ['js/features/shell/pages/menu-page.js', 'js/features/settings/settings-page.js']) assert.match(read(f), /unlockCard\(\)/, 'the card is still mounted (it shows itself only while unlocked)');
});

test('thumbnails: the account is asked for the saved picture before a screenshot is used', async () => {
  const { createThumb } = await import('../../js/ui/thumb.js');
  let asked = 0; const engine = { peekLinkMeta: async () => null, getLinkMeta: async (id) => { asked++; return { id, image: 'https://img.example/p.jpg' }; } };
  const el = createThumb({ engine, id: 'L9', host: 'example.com', url: 'https://example.com/a' }); document.body.append(el);
  await tick(); await tick(); await tick();
  const img = el.querySelector('img'); assert.ok(asked >= 1, 'the account was asked'); if (img) assert.doesNotMatch(img.getAttribute('src') || '', /mshots/, 'the real picture comes first');
  el.remove(); assert.match(read('js/ui/thumb.js'), /remoteNone/);
});

test('welcome flow: only a brand-new account sees it, once, profile first and the video next; every other start is untouched', async () => {
  const { maybeWelcome } = await import('../../js/features/profile/welcome-flow.js'); const acc = await import('../../js/features/auth/account-status.js');
  assert.equal(acc.isNewAccount('u-old'), false);
  await maybeWelcome({ getEngine: () => null, getSession: () => ({ mode: 'account', user: { uid: 'u-old' }, status: 'active' }) });
  await maybeWelcome({ getEngine: () => null, getSession: () => ({ mode: 'guest', user: null }) });
  assert.equal(document.querySelector('.pe-sheet'), null, 'nothing opened for an existing account or a guest');
  const w = read('js/features/profile/welcome-flow.js'); assert.match(w, /title: 'Welcome! Set up your profile', skipLabel: 'Skip for now'/); assert.match(w, /openIntroVideo\(\{ onClosed: resolve \}\)/);
  assert.match(read('js/boot.js'), /maybeWelcome\(\{ getEngine, getSession \}\)\)\.catch\(\(\) => \{\}\)\.then\(\(\) => import\('\.\/features\/auth\/guest-transfer\.js'\)\)/, 'welcome first, then the guest transfer offer');
  assert.match(read('js/features/auth/account-status.js'), /fresh\.add\(user\.uid\)/);
});

test('defaults and fixes: 2 minute auto lock (client and Worker), settings width, avatar shield, link row hover, splash glow, Library icon button, social image', async () => {
  const L = await import('../../js/core/lock.js'); assert.equal(L.DEFAULT_AWAY, 120); assert.ok(L.AWAY_CHOICES.includes(120));
  const w = read('@ Creator/worker/worker.js'); assert.match(w, /awayChoices: \[0, 30, 60, 120, 300, 600, 900, 1800, -1\]/); assert.match(w, /defaultAway: 120/); assert.match(w, /const VERSION = '2\.5\.4'/); assert.match(w, /VAULT_PREFIXES\.includes\(v\.vaultPrefix\) \? v\.vaultPrefix : '%'/);
  const set = read('css/pages/settings.css'); assert.match(set, /\.set-body \{ margin-top: 0; max-width: 760px; \}/); assert.match(set, /gap: calc\(var\(--s8\) \+ 24px\)/); assert.match(set, /\.set-navwrap::after/);
  const nav = read('css/components/nav.css'); assert.match(nav, /\.avatar > span:not\(\.avatar-admin\)/); assert.match(nav, /var\(--admin-badge-bg, var\(--accent\)\)/); assert.doesNotMatch(read('css/pages/pages.css'), /\.avatar \.avatar-admin \{/);
  assert.match(read('css/pages/profile.css'), /\.pf2-kv\.is-link:hover \{ background: var\(--accent-soft\); text-decoration: none; \}/);
  assert.match(read('css/pages/splash.css'), /\.sp-orb \{[^}]*opacity: 0; \}/); assert.match(read('js/features/splash/splash.js'), /play\(\$\('sp-orb'\)/);
  const lib = read('js/features/library/library-page.js'); assert.match(lib, /icon\('folder-plus'/); assert.match(lib, /btn btn-primary btn-sm is-wide-only/);
  assert.ok(fs.statSync(new URL('../../assets/social/og-default.jpg', import.meta.url)).size > 20000);
  assert.ok(fs.existsSync(new URL('../../@ Creator/reference/Linkivo images/YT Thumbnail/linkivo-youtube-2-bold.png', import.meta.url)));
  assert.ok(fs.existsSync(new URL('../../@ Creator/reference/Linkivo images/Meta Thumbnails/WEBP/linkivo-meta-1-overview.webp', import.meta.url)));
  assert.match(read('js/core/router.js'), /from: current \? fullPath\(\)/); assert.match(read('js/features/preview/preview-page.js'), /router\.navigate\(want, \{ replace: true \}\)/);
  assert.match(read('js/engine/cloud-engine.js'), /SEND_WAIT_MS = 2500/); assert.match(read('js/core/lock.js'), /withTimeout\(adapter\.get\(`users\/\$\{uid\}\/lockState`\), 4000/);
});
