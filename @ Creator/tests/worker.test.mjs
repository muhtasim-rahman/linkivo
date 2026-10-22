import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadWorker } from './helpers/load-worker.mjs';

const { handler, T } = await loadWorker();
const html = (head, body = '<p>x</p>') => `<!doctype html><html lang="en-GB"><head>${head}</head><body>${body}</body></html>`;
const htmlRes = (text, headers = {}) => new Response(text, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const ctxWith = (fetchImpl, max = 45) => ({ fetch: fetchImpl, budget: T.createBudget(max) });
const GOOD = html('<title>Hello &amp; welcome</title><meta name="description" content="A page"><meta property="og:image" content="/img/a.png">');

test('normalizeTarget accepts web URLs and rejects the rest', () => {
  assert.equal(T.normalizeTarget('example.com/a#x').href, 'https://example.com/a');
  assert.equal(T.normalizeTarget('http://example.com').protocol, 'http:');
  for (const bad of ['javascript:alert(1)', 'ftp://x.com', 'file:///etc/passwd', 'mailto:a@b.c', 'https://user:pw@example.com', 'not a url', '', null, 5, 'https://' + 'a'.repeat(2100)]) assert.equal(T.normalizeTarget(bad), null, String(bad));
});

test('SSRF guard blocks private, loopback, metadata, odd encodings and odd ports', () => {
  const blocked = ['http://localhost/', 'http://LOCALHOST:8080', 'http://foo.localhost', 'http://127.0.0.1', 'http://127.1.2.3', 'http://10.0.0.5', 'http://172.16.0.1', 'http://172.31.255.255', 'http://192.168.1.1',
    'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1', 'http://0.0.0.0', 'http://[::1]/', 'http://[fd12:3456::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:10.1.2.3]/',
    'http://2130706433/', 'http://0x7f.0.0.1/', 'http://017700000001/', 'http://printer.local/', 'http://metadata.google.internal/', 'http://intranet/', 'http://224.0.0.1', 'https://example.com:22/', 'https://example.com:6379/'];
  for (const u of blocked) assert.equal(T.isBlockedUrl(T.normalizeTarget(u)), true, u);
  for (const u of ['https://example.com/', 'http://93.184.216.34/', 'https://sub.example.co.uk:8443/x', 'http://172.15.0.1', 'http://172.32.0.1', 'http://[2606:4700::1111]/']) assert.equal(T.isBlockedUrl(T.normalizeTarget(u)), false, u);
});

test('parseHead: title, entities, description, relative URLs, favicon choice, video, type', () => {
  const p = T.parseHead(html(`
    <meta charset="utf-8"><title> Tom &amp; Jerry&#39;s &quot;Page&quot; </title>
    <meta name="description" content="Line one
      and two &amp; more"><meta name='keywords' content='a, b'><meta name="author" content="Ann">
    <meta property="og:site_name" content="Site"><meta property="og:type" content="video.other">
    <meta property="og:image" content="/img/cover.jpg"><meta property="og:video:secure_url" content="https://cdn.example.com/v.mp4">
    <link rel="canonical" href="/canon"><link rel="icon" sizes="16x16" href="/f16.png"><link rel="icon" sizes="48x48" href="/f48.png"><link rel="apple-touch-icon" href="/touch.png">`), 'https://www.example.com/dir/page?x=1');
  assert.equal(p.title, 'Tom & Jerry\'s "Page"'); assert.equal(p.desc, 'Line one and two & more'); assert.equal(p.kw, 'a, b'); assert.equal(p.author, 'Ann');
  assert.equal(p.site, 'Site'); assert.equal(p.type, 'video'); assert.equal(p.image, 'https://www.example.com/img/cover.jpg'); assert.equal(p.video, 'https://cdn.example.com/v.mp4');
  assert.equal(p.canonical, 'https://www.example.com/canon'); assert.equal(p.favicon, 'https://www.example.com/f48.png'); assert.equal(p.lang, 'en-gb');
});

test('parseHead: og:title fallback, favicon.ico default, javascript and data URLs dropped, tag soup tolerated', () => {
  const p = T.parseHead(html('<META PROPERTY="OG:TITLE" CONTENT="Only OG"><meta property="og:image" content="javascript:alert(1)"><meta name=description content=unquoted><link rel=icon href="data:image/png;base64,AAAA"><title>'), 'https://a.test/x');
  assert.equal(p.title, 'Only OG'); assert.equal(p.image, ''); assert.equal(p.desc, 'unquoted'); assert.equal(p.favicon, 'https://a.test/favicon.ico');
  assert.equal(T.decodeEntities('&#x41;&#66;&hellip;&unknown;'), 'AB...&unknown;');
});

test('computeFrameable reads X-Frame-Options and CSP frame-ancestors', () => {
  const H = (o) => new Headers(o);
  assert.equal(T.computeFrameable(H({})), true);
  assert.equal(T.computeFrameable(H({ 'x-frame-options': 'DENY' })), false);
  assert.equal(T.computeFrameable(H({ 'x-frame-options': 'SAMEORIGIN' })), false);
  assert.equal(T.computeFrameable(H({ 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" })), false);
  assert.equal(T.computeFrameable(H({ 'content-security-policy': "frame-ancestors 'self' https://a.com" })), false);
  assert.equal(T.computeFrameable(H({ 'content-security-policy': 'frame-ancestors *' })), true);
  assert.equal(T.computeFrameable(H({ 'content-security-policy': 'frame-ancestors https://linkivo.web.app' })), true);
  assert.equal(T.computeFrameable(H({ 'content-security-policy': "script-src 'self'" })), true);
});

test('readHead stops at </head> and at the byte cap without reading the whole body', async () => {
  let pulled = 0;
  const big = new ReadableStream({ pull(c) { pulled++; c.enqueue(new TextEncoder().encode(pulled === 1 ? '<html><head><title>T</title></head><body>' : 'x'.repeat(50000))); if (pulled > 200) c.close(); } });
  const out = await T.readHead(new Response(big, { headers: { 'content-type': 'text/html' } }));
  assert.match(out, /<\/head>/); assert.ok(pulled <= 3, `pulled ${pulled} chunks`);
  let n = 0;
  const endless = new ReadableStream({ pull(c) { n++; c.enqueue(new TextEncoder().encode('y'.repeat(60000))); } });
  const o2 = await T.readHead(new Response(endless), 150000);
  assert.ok(o2.length >= 150000 && o2.length < 300000); assert.ok(n < 10);
  const latin = new Response(new Uint8Array([60, 116, 105, 116, 108, 101, 62, 0xe9, 60, 47, 116, 105, 116, 108, 101, 62, 60, 47, 104, 101, 97, 100, 62]), { headers: { 'content-type': 'text/html; charset=iso-8859-1' } });
  assert.match(await T.readHead(latin), /<title>\u00e9<\/title>/);
});

test('chain: direct fetch succeeds, result fields, frameable, favicon fallback, screenshot on request', async () => {
  T.resetCaches();
  const calls = [];
  const ctx = ctxWith(async (url, init) => { calls.push(url); assert.equal(init.redirect, 'manual'); assert.match(init.headers['User-Agent'], /Mozilla/); return htmlRes(GOOD, { 'x-frame-options': 'DENY' }); });
  const r = await T.metaForUrl('https://example.com/post', ctx, { shot: true });
  assert.equal(r.ok, true); assert.equal(r.title, 'Hello & welcome'); assert.equal(r.engine, 'direct'); assert.equal(r.frameable, false);
  assert.equal(r.image, 'https://example.com/img/a.png'); assert.match(r.favicon, /favicon\.ico$/); assert.match(r.shot, /^https:\/\/s\.wordpress\.com\/mshots\/v1\/https%3A%2F%2Fexample\.com%2Fpost/);
  assert.deepEqual(r.log.map((l) => [l.engine, l.ok]), [['direct', true]]); assert.equal(calls.length, 1);
  const again = await T.metaForUrl('https://example.com/post', ctxWith(async () => { throw new Error('should be cached'); }), {});
  assert.equal(again.cached, true); assert.equal(again.title, 'Hello & welcome');
});

test('rescue: a 403 on the direct fetch is retried as a link-preview crawler; every attempt is logged', async () => {
  T.resetCaches();
  const uas = [];
  const ctx = ctxWith(async (url, init) => {
    uas.push(init.headers['User-Agent']);
    return /facebookexternalhit/.test(init.headers['User-Agent']) ? htmlRes(GOOD) : new Response('no', { status: 403 });
  });
  const r = await T.metaForUrl('https://blocked.test/page', ctx);
  assert.equal(r.ok, true); assert.equal(r.engine, 'crawler'); assert.equal(r.title, 'Hello & welcome');
  assert.deepEqual(r.log.map((l) => [l.engine, l.ok]), [['direct', false], ['crawler', true]]); assert.match(r.log[0].error, /HTTP 403/);
  assert.equal(uas.length, 2);
});

test('rescue: after the crawler, Jina answers; at most 2 rescue engines per URL, so Wayback and Microlink stay unused', async () => {
  T.resetCaches();
  const hosts = [];
  const ctx = ctxWith(async (url) => {
    hosts.push(new URL(url).hostname);
    if (url.startsWith('https://r.jina.ai/')) return new Response(JSON.stringify({ code: 200, data: { title: 'From Jina', description: 'Reader description', url: 'https://hard.test/' } }), { status: 200 });
    return new Response('no', { status: 403 });
  });
  const r = await T.metaForUrl('https://hard.test/', ctx);
  assert.equal(r.engine, 'jina'); assert.equal(r.title, 'From Jina'); assert.equal(r.frameable, null);
  assert.deepEqual(r.log.map((l) => l.engine), ['direct', 'crawler', 'jina']); assert.ok(!hosts.includes('web.archive.org') && !hosts.includes('api.microlink.io'));
  T.resetCaches();
  const all = await T.metaForUrl('https://hard2.test/', ctxWith(async () => new Response('no', { status: 403 })), { rescueAttempts: 4 });
  assert.deepEqual(all.log.map((l) => l.engine), ['direct', 'crawler', 'jina', 'wayback', 'microlink']); assert.equal(all.ok, false);
});

test('rescue: Wayback reads the archived head and keeps the original address; DNS and 404 failures are not rescued', async () => {
  T.resetCaches();
  const r = await T.metaForUrl('https://old.test/page', ctxWith(async (url) => {
    if (url === 'https://web.archive.org/web/2id_/https://old.test/page') return new Response(null, { status: 302, headers: { location: 'https://web.archive.org/web/20240101000000id_/https://old.test/page' } });
    if (url.startsWith('https://web.archive.org/web/20240101')) return htmlRes(html('<title>Archived title</title><link rel="icon" href="/f.ico">'));
    return new Response('no', { status: 403 });
  }), { rescueAttempts: 3 });
  assert.equal(r.engine, 'wayback'); assert.equal(r.title, 'Archived title'); assert.equal(r.archived, true); assert.equal(r.finalUrl, 'https://old.test/page'); assert.equal(r.favicon, 'https://old.test/f.ico');
  T.resetCaches();
  for (const [status, text] of [[404, /HTTP 404/], [530, /site not found/]]) {
    let n = 0;
    const g = await T.metaForUrl(`https://gone${status}.test/`, ctxWith(async () => { n++; return new Response('x', { status }); }));
    assert.equal(n, 1, `status ${status} costs one request only`); assert.match(g.log[0].error, text); assert.equal(g.ok, false);
  }
});

test('DIRECT_SKIP sites go straight to the rescue engines; the log shows only those', async () => {
  T.resetCaches();
  const seen = [];
  const r = await T.metaForUrl('https://www.linkedin.com/company/x', ctxWith(async (url) => { seen.push(new URL(url).hostname); throw new Error('down'); }));
  assert.equal(r.ok, false); assert.equal(r.error, 'every engine failed'); assert.deepEqual(r.log.map((l) => l.engine), ['crawler', 'jina']);
});

test('two passes: every URL gets its first attempt before any URL gets a rescue attempt', async () => {
  T.resetCaches();
  const order = [];
  const ctx = ctxWith(async (url, init) => { order.push(/facebookexternalhit/.test(init.headers['User-Agent']) ? 'rescue' : 'first'); return new Response('no', { status: 403 }); }, 12);
  const states = [];
  for (const u of Array.from({ length: 8 }, (_, i) => `https://fair${i}.test/`)) states.push(await T.primaryPhase(u, ctx));
  for (const st of states.filter((x) => T.worthRescue(x))) await T.rescuePhase(st, ctx);
  assert.deepEqual(order.slice(0, 8), Array(8).fill('first'));
  assert.equal(order.length, 12, 'the budget of 12 was used and not exceeded');
});

test('metadata richness: JSON-LD, first paragraph, derived keywords, dates, feeds, theme color, large icon', () => {
  const p = T.parseHead(html(`<title>Page</title><meta name="theme-color" content="#112233"><meta property="og:locale" content="en_GB">
    <link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="apple-touch-icon" href="/touch.png">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme News","logo":"https://x.test/logo.png"},{"@type":"NewsArticle","headline":"Big discovery in deep sea biology","description":"Researchers found a new species of glowing fish near hydrothermal vents.","image":["https://x.test/a.jpg"],"keywords":["ocean","fish"],"datePublished":"2026-10-01T10:00:00Z","author":{"@type":"Person","name":"Ann Writer"}}]}</script>`,
    '<h1>Fallback heading</h1><p>short</p><p>This paragraph is long enough to be used as a description when nothing else exists on the page at all.</p>'), 'https://x.test/post', '');
  assert.equal(p.title, 'Page'); assert.match(p.desc, /new species of glowing fish/); assert.equal(p.image, 'https://x.test/a.jpg'); assert.equal(p.kw, 'ocean, fish'); assert.equal(p.kwAuto, false);
  assert.equal(p.author, 'Ann Writer'); assert.equal(p.site, 'Acme News'); assert.equal(p.published, '2026-10-01T10:00:00Z'); assert.equal(p.themeColor, '#112233'); assert.equal(p.locale, 'en_GB');
  assert.deepEqual(p.feeds, ['https://x.test/feed.xml']); assert.equal(p.iconLarge, 'https://x.test/touch.png');
  const body = '<main><h1>Wiki style heading</h1><p class="x">Hyperlinks connect documents across the web and let readers move between pages with a single click or tap.</p></main>';
  const q = T.parseHead(html('<meta charset="utf-8">'), 'https://w.test/a', body);
  assert.equal(q.title, 'Wiki style heading'); assert.match(q.desc, /^Hyperlinks connect documents/); assert.equal(q.kwAuto, true); assert.match(q.kw, /hyperlinks/);
  assert.equal(T.autoKeywords('The quick brown fox and the lazy dog and the quick fox'), 'quick, brown, lazy');
});

test('readPage returns the head and a bounded piece of the body; fresh bypasses the cache', async () => {
  const text = '<html><head><title>T</title></head><body>' + '<p>x</p>'.repeat(20000);
  const r = await T.readPage(new Response(text, { headers: { 'content-type': 'text/html' } }), 160000, 5000);
  assert.match(r.head, /<\/head>$/); assert.ok(r.body.length >= 5000 && r.body.length <= 200000);
  T.resetCaches();
  let n = 0; const f = async () => { n++; return htmlRes(GOOD); };
  await T.metaForUrl('https://cache.test/', ctxWith(f)); await T.metaForUrl('https://cache.test/', ctxWith(f)); assert.equal(n, 1);
  const again = await T.metaForUrl('https://cache.test/', ctxWith(f), { fresh: true }); assert.equal(n, 2); assert.ok(!again.cached);
});

test('chain: site handlers (oEmbed) answer first for YouTube and fall back to direct when they fail', async () => {
  T.resetCaches();
  const r = await T.metaForUrl('https://youtu.be/jNQXAC9IVRw', ctxWith(async (url) => { assert.match(url, /youtube\.com\/oembed/); return new Response(JSON.stringify({ title: 'Me at the zoo', author_name: 'jawed', thumbnail_url: 'https://i.ytimg.com/vi/x/hq.jpg' }), { status: 200, headers: { 'content-type': 'application/json' } }); }));
  assert.equal(r.engine, 'oembed:youtube'); assert.equal(r.title, 'Me at the zoo'); assert.equal(r.type, 'video'); assert.equal(r.video, 'https://www.youtube.com/embed/jNQXAC9IVRw'); assert.equal(r.frameable, false);
  assert.equal(T.youtubeId(new URL('https://www.youtube.com/watch?v=abc123XYZ_-&t=3')), 'abc123XYZ_-'); assert.equal(T.youtubeId(new URL('https://www.youtube.com/shorts/SHORT12345')), 'SHORT12345');
  T.resetCaches();
  const hosts = [];
  const r2 = await T.metaForUrl('https://vimeo.com/76979871', ctxWith(async (url) => { hosts.push(new URL(url).hostname); return url.includes('vimeo.com/api') ? new Response('{}', { status: 404 }) : htmlRes(GOOD); }));
  assert.deepEqual(hosts, ['vimeo.com', 'vimeo.com']); assert.deepEqual(r2.log.map((l) => [l.engine, l.ok]), [['oembed:vimeo', false], ['direct', true]]);
});

test('redirects are followed manually and every hop goes through the SSRF guard', async () => {
  T.resetCaches();
  const hops = [];
  const ok = await T.metaForUrl('https://short.test/a', ctxWith(async (url) => { hops.push(url); return url === 'https://short.test/a' ? new Response(null, { status: 301, headers: { location: '/b' } }) : url === 'https://short.test/b' ? new Response(null, { status: 302, headers: { location: 'https://final.test/c' } }) : htmlRes(GOOD); }));
  assert.equal(ok.ok, true); assert.equal(ok.finalUrl, 'https://final.test/c'); assert.equal(hops.length, 3);
  T.resetCaches();
  const fetched = [];
  const evil = await T.metaForUrl('https://trap.test/', ctxWith(async (url) => { fetched.push(url); return url.startsWith('https://trap.test') ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }) : new Response('x', { status: 500 }); }));
  assert.ok(!fetched.some((u) => u.includes('169.254')), 'never requested the metadata address'); assert.match(evil.log[0].error, /blocked target/);
  T.resetCaches();
  const loop = await T.metaForUrl('https://loop.test/', ctxWith(async (url) => new Response(null, { status: 302, headers: { location: url + 'x' } })));
  assert.match(loop.log[0].error, /too many redirects/);
});

test('non-HTML targets: images, PDFs and files are described, not parsed', async () => {
  T.resetCaches();
  const img = await T.metaForUrl('https://cdn.test/pics/cat.png', ctxWith(async () => new Response(new Uint8Array(10), { headers: { 'content-type': 'image/png' } })));
  assert.equal(img.type, 'image'); assert.equal(img.title, 'cat.png'); assert.equal(img.image, 'https://cdn.test/pics/cat.png');
  const pdf = await T.metaForUrl('https://cdn.test/doc.pdf', ctxWith(async () => new Response(new Uint8Array(10), { headers: { 'content-type': 'application/pdf' } })));
  assert.equal(pdf.type, 'pdf'); assert.equal(pdf.title, 'doc.pdf');
});

test('invalid and blocked inputs never reach the network', async () => {
  const ctx = ctxWith(async () => { throw new Error('network touched'); });
  for (const [input, error] of [['javascript:alert(1)', 'invalid URL'], ['http://localhost:8080/admin', 'blocked target'], ['http://169.254.169.254/x', 'blocked target'], ['https://example.com:22', 'blocked target']]) {
    const r = await T.metaForUrl(input, ctx); assert.equal(r.ok, false); assert.equal(r.error, error);
  }
});

test('subrequest budget: engines stop before the free-plan cap and say so in the log', async () => {
  T.resetCaches();
  let calls = 0;
  const ctx = ctxWith(async () => { calls++; throw new Error('fail'); }, 2);
  const r = await T.metaForUrl('https://budget.test/', ctx);
  assert.equal(calls, 2); assert.equal(r.ok, false); assert.ok(r.log.some((l) => /budget/.test(l.error || '')));
  assert.equal(ctx.budget.used, 2);
});

async function makeToken({ aud = 'linkivo', iss = 'https://securetoken.google.com/linkivo', exp, iat, sub = 'user123', kid = 'k1', key }) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sec = Math.floor(Date.now() / 1000);
  const data = b({ alg: 'RS256', kid, typ: 'JWT' }) + '.' + b({ aud, iss, sub, iat: iat ?? sec - 10, exp: exp ?? sec + 3600, auth_time: sec - 20, email: 'a@b.c' });
  const sig = crypto.sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
  return `${data}.${sig}`;
}

test('Firebase ID token verification: valid, expired, wrong audience, forged signature, unknown key', async () => {
  T.resetCaches();
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  let keyFetches = 0;
  const ctx = ctxWith(async () => { keyFetches++; return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'public, max-age=3600' } }); });
  const ok = await T.verifyIdToken(await makeToken({ key: privateKey }), ctx);
  assert.equal(ok.uid, 'user123'); assert.equal(ok.email, 'a@b.c');
  await T.verifyIdToken(await makeToken({ key: privateKey }), ctx); assert.equal(keyFetches, 1, 'keys are cached');
  const sec = Math.floor(Date.now() / 1000);
  await assert.rejects(T.verifyIdToken(await makeToken({ key: privateKey, exp: sec - 5, iat: sec - 4000 }), ctx), /expired/);
  await assert.rejects(T.verifyIdToken(await makeToken({ key: privateKey, aud: 'other-project' }), ctx), /audience/);
  await assert.rejects(T.verifyIdToken(await makeToken({ key: privateKey, iss: 'https://evil.example' }), ctx), /audience/);
  await assert.rejects(T.verifyIdToken(await makeToken({ key: other.privateKey }), ctx), /signature/);
  await assert.rejects(T.verifyIdToken(await makeToken({ key: privateKey, kid: 'nope' }), ctx), /unknown key/);
  await assert.rejects(T.verifyIdToken('a.b', ctx), /malformed/); await assert.rejects(T.verifyIdToken('', ctx), /malformed/);
  const none = Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1' })).toString('base64url') + '.' + Buffer.from('{}').toString('base64url') + '.';
  await assert.rejects(T.verifyIdToken(none, ctx), /malformed|unsupported/);
});

test('token bucket: allows bursts up to capacity, refills over time, reports retryAfter', () => {
  const cfg = { capacity: 10, perMs: 10000 };
  assert.equal(T.takeTokens('t1', 10, cfg, 0).ok, true);
  const no = T.takeTokens('t1', 1, cfg, 0); assert.equal(no.ok, false); assert.ok(no.retryAfter >= 1);
  assert.equal(T.takeTokens('t1', 5, cfg, 5000).ok, true);
  assert.equal(T.takeTokens('t2', 11, cfg, 0).ok, false);
});

const req = (path, { method = 'GET', origin = 'https://linkivo.web.app', body, headers = {} } = {}) => new Request('https://worker.test' + path, { method, headers: { ...(origin ? { origin } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const call = (r, fetchImpl = async () => htmlRes(GOOD)) => T.route(r, {}, { fetch: fetchImpl });

test('routes: health, CORS allow-list, preflight, unknown path and method', async () => {
  T.resetCaches();
  const h = await call(req('/health')); assert.equal(h.status, 200); const hb = await h.json(); assert.equal(hb.ok, true); assert.equal(hb.version, '2.1.1');
  assert.equal(h.headers.get('access-control-allow-origin'), 'https://linkivo.web.app'); assert.equal(h.headers.get('cache-control'), 'no-store');
  assert.equal((await call(req('/health', { origin: 'http://localhost:5000' }))).headers.get('access-control-allow-origin'), 'http://localhost:5000');
  const evil = await call(req('/health', { origin: 'https://evil.example' })); assert.equal(evil.status, 403); assert.equal(evil.headers.get('access-control-allow-origin'), null);
  assert.equal((await call(req('/health', { origin: null }))).status, 200);
  const pre = await call(req('/meta', { method: 'OPTIONS' })); assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
  assert.equal((await call(req('/meta', { method: 'OPTIONS', origin: 'https://evil.example' }))).status, 403);
  assert.equal((await call(req('/nope'))).status, 404); assert.equal((await call(req('/meta'))).status, 405);
});

test('POST /meta: validation, guest batch cap, results, and 429 with Retry-After', async () => {
  T.resetCaches();
  const post = (body, headers) => call(req('/meta', { method: 'POST', body, headers: { 'cf-connecting-ip': '1.2.3.4', ...headers } }));
  assert.equal((await post({})).status, 400); assert.equal((await post({ urls: [] })).status, 400); assert.equal((await post({ urls: [5] })).status, 400); assert.equal((await post({ urls: 'x' })).status, 400);
  const bad = await call(new Request('https://worker.test/meta', { method: 'POST', headers: { origin: 'https://linkivo.web.app' }, body: '{nope' })); assert.equal(bad.status, 400);
  const huge = await call(new Request('https://worker.test/meta', { method: 'POST', headers: { origin: 'https://linkivo.web.app', 'content-length': '999999' }, body: '{}' })); assert.equal(huge.status, 413);
  const tooMany = await post({ urls: Array.from({ length: 11 }, (_, i) => `https://g${i}.test/`) }); assert.equal(tooMany.status, 413); assert.equal((await tooMany.json()).max, 10);
  const okRes = await post({ urls: ['https://a.test/', 'localhost', 'javascript:void(0)'] });
  assert.equal(okRes.status, 200); const body = await okRes.json();
  assert.equal(body.results.length, 3); assert.equal(body.results[0].ok, true); assert.equal(body.results[1].error, 'blocked target'); assert.equal(body.results[2].error, 'invalid URL'); assert.ok(body.budget.used <= body.budget.max);
  let limited = null;
  for (let i = 0; i < 12 && !limited; i++) { const r = await post({ urls: Array.from({ length: 10 }, (_, k) => `https://r${i}-${k}.test/`) }); if (r.status === 429) limited = r; }
  assert.ok(limited, 'guest limit hit'); assert.ok(Number(limited.headers.get('retry-after')) >= 1); assert.equal((await limited.json()).error, 'rate_limited');
});

test('POST /meta with an account token allows 25 URLs; a bad token is refused', async () => {
  T.resetCaches();
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
  const fetchImpl = async (url) => (String(url).includes('googleapis.com') ? new Response(JSON.stringify({ keys: [jwk] })) : htmlRes(GOOD));
  const token = await makeToken({ key: privateKey });
  const urls = Array.from({ length: 25 }, (_, i) => `https://acct${i}.test/`);
  const ok = await call(req('/meta', { method: 'POST', body: { urls }, headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': '9.9.9.9' } }), fetchImpl);
  assert.equal(ok.status, 200); const b = await ok.json(); assert.equal(b.results.filter((r) => r.ok).length, 25); assert.ok(b.budget.used <= 26, `used ${b.budget.used}`);
  assert.equal((await call(req('/meta', { method: 'POST', body: { urls: ['https://a.test'] }, headers: { authorization: 'Bearer abc.def.ghi' } }), fetchImpl)).status, 401);
  assert.equal((await call(req('/meta', { method: 'POST', body: { urls: ['https://a.test'] }, headers: { authorization: 'Basic xyz' } }), fetchImpl)).status, 401);
  assert.equal(typeof handler.fetch, 'function'); assert.equal(handler.scheduled, undefined);
});

test('25 URLs that all need rescue stay inside the shared subrequest budget', async () => {
  T.resetCaches();
  let n = 0;
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
  const fetchImpl = async (url) => { if (String(url).includes('googleapis.com')) return new Response(JSON.stringify({ keys: [jwk] })); n++; return new Response('no', { status: 500 }); };
  const token = await makeToken({ key: privateKey });
  const res = await call(req('/meta', { method: 'POST', body: { urls: Array.from({ length: 25 }, (_, i) => `https://worst${i}.test/`) }, headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': '8.8.4.4' } }), fetchImpl);
  const b = await res.json();
  assert.equal(res.status, 200); assert.ok(n <= 36, `made ${n} subrequests`); assert.ok(b.budget.used <= 36);
  assert.ok(b.results.every((r) => r.ok === false)); assert.ok(b.results.some((r) => r.log.some((l) => /budget/.test(l.error || ''))), 'later URLs report the budget');
});
