// Linkivo v2.3.0: Worker /check (dead-link checker). Routes run against a mocked fetch; real-network behaviour is an owner test (docs/TESTING.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './helpers/load-worker.mjs';

const { T } = await loadWorker();
const req = (body, { path = '/check', method = 'POST', headers = {} } = {}) => new Request('https://worker.test' + path, { method, headers: { origin: 'https://linkivo.web.app', 'content-type': 'application/json', ...headers }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const res = (status, headers = {}) => new Response(null, { status, headers });
const call = (r, fetchImpl) => T.route(r, {}, { fetch: fetchImpl });

test('statusState: 2xx and 3xx alive, 404 410 530 dead, the rest unsure', () => {
  for (const s of [200, 204, 301, 399]) assert.equal(T.statusState(s), 'ok');
  for (const s of [404, 410, 530]) assert.equal(T.statusState(s), 'dead');
  for (const s of [401, 403, 429, 500, 502, 503]) assert.equal(T.statusState(s), 'unsure');
});

test('/check: ok, dead, unsure and invalid in one call; HEAD first, GET only when HEAD is not enough', async () => {
  T.resetCaches(); const seen = [];
  const f = async (url, init) => {
    seen.push(`${init.method} ${url}`); const u = new URL(url);
    if (u.hostname === 'alive.test') return res(200);
    if (u.hostname === 'headless.test') return res(init.method === 'HEAD' ? 405 : 200);   // dislikes HEAD
    if (u.hostname === 'gone.test') return res(404);
    if (u.hostname === 'robot.test') return res(403);
    throw new Error('unexpected ' + url);
  };
  const r = await call(req({ urls: ['https://alive.test/a', 'https://headless.test/b', 'https://gone.test/c', 'https://robot.test/d', 'ftp://x.test/e'] }), f);
  assert.equal(r.status, 200); const body = await r.json(); assert.equal(body.ok, true); assert.equal(body.version, '2.3.0');
  const by = Object.fromEntries(body.results.map((x) => [x.url.split('/')[2] || x.url, x]));
  assert.equal(by['alive.test'].state, 'ok'); assert.equal(by['headless.test'].state, 'ok'); assert.equal(by['gone.test'].state, 'dead'); assert.equal(by['gone.test'].status, 404);
  assert.equal(by['robot.test'].state, 'unsure'); assert.equal(body.results.find((x) => x.url.startsWith('ftp')).state, 'invalid');
  assert.deepEqual(seen.filter((s) => s.includes('alive.test')), ['HEAD https://alive.test/a'], 'a healthy link costs one request');
  assert.ok(seen.includes('GET https://headless.test/b'));
});

test('/check: follows a redirect and reports the final address; a redirect into a private address is refused', async () => {
  T.resetCaches();
  const f = async (url) => { const u = new URL(url); if (u.hostname === 'old.test') return res(301, { location: 'https://new.test/page' }); if (u.hostname === 'new.test') return res(200); if (u.hostname === 'evil.test') return res(302, { location: 'http://169.254.169.254/latest' }); throw new Error('network'); };
  const r = await (await call(req({ urls: ['https://old.test/x', 'https://evil.test/y'] }), f)).json();
  const a = r.results.find((x) => x.url.includes('old.test')), b = r.results.find((x) => x.url.includes('evil.test'));
  assert.equal(a.state, 'ok'); assert.equal(a.finalUrl, 'https://new.test/page'); assert.equal(b.state, 'invalid', 'the SSRF guard stops the hop'); assert.ok(!r.results.some((x) => x.state === 'ok' && x.url.includes('evil')));
});

test('/check: a domain that does not exist is dead (DNS says NXDOMAIN); a plain network error stays unsure', async () => {
  T.resetCaches();
  const f = async (url) => { const u = new URL(url); if (u.hostname === 'cloudflare-dns.com') return new Response(JSON.stringify({ Status: u.searchParams.get('name') === 'nodomain.test' ? 3 : 0 }), { status: 200, headers: { 'content-type': 'application/dns-json' } }); throw new Error('Network connection lost'); };
  const r = await (await call(req({ urls: ['https://nodomain.test/', 'https://flaky.test/'] }), f)).json();
  assert.equal(r.results.find((x) => x.url.includes('nodomain')).state, 'dead'); assert.equal(r.results.find((x) => x.url.includes('flaky')).state, 'unsure');
});

test('/check: input limits, bad bodies, wrong method, CORS and the rate limiter', async () => {
  T.resetCaches();
  assert.equal((await call(req({ urls: [] }), async () => res(200))).status, 400);
  assert.equal((await call(req({ urls: Array.from({ length: 11 }, (_, i) => `https://a${i}.test`) }), async () => res(200))).status, 413);
  assert.equal((await call(req({ nope: 1 }), async () => res(200))).status, 400);
  assert.equal((await call(req(null, { method: 'GET' }), async () => res(200))).status, 405);
  assert.equal((await call(req({ urls: ['https://a.test'] }, { headers: { origin: 'https://evil.example' } }), async () => res(200))).status, 403);
  assert.equal((await call(req({ urls: ['https://a.test'] }, { headers: { authorization: 'Bearer' } }), async () => res(200))).status, 401);
  T.resetCaches(); let limited = 0;
  for (let i = 0; i < 40; i++) { const r = await call(req({ urls: Array.from({ length: 10 }, (_, k) => `https://r${k}.test`) }, { headers: { 'cf-connecting-ip': '9.9.9.9' } }), async () => res(200)); if (r.status === 429) limited++; }
  assert.ok(limited > 0, 'a flood of checks is rate limited');
});
