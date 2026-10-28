// Linkivo v2.3.0: dead-link checker, client side. Job with a fake checker, worker-client batching, result sheet, row flag and folder filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, tick, waitFor } from './helpers/dom-env.mjs';

const { w } = setupDom('http://localhost/library');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const { Engine } = await import('../../js/engine/engine.js');
const { createMemoryDb } = await import('../../js/engine/idb.js');
const { createJobQueue } = await import('../../js/engine/job-queue.js');
const { registerCheckJob, classify, statsOf, startCheck, GROUP } = await import('../../js/features/check/check-job.js');
const { runCheck } = await import('../../js/features/check/check-sheet.js');
const { createLinkRow } = await import('../../js/features/library/link-row.js');

async function setup(check) {
  const engine = new Engine({ kind: 'guest', db: createMemoryDb(), sleep: () => Promise.resolve() }); await engine.init();
  const queue = createJobQueue({ db: engine.db, now: () => engine.now() }); registerCheckJob({ queue, engine, check }); await queue.start();
  return { engine, queue };
}
const seed = async (engine, n) => { const f = await engine.createFolder({ name: 'F' }); const r = await engine.addLinks(Array.from({ length: n }, (_, i) => ({ url: `https://s${i}.test/p`, title: 'L' + i })), { fid: f.id }); return r.added.map((x) => x.id); };

test('classify: dead flags, ok clears the flag, unsure and invalid never change a link', () => {
  assert.deepEqual(classify({ id: 'a' }, { state: 'dead' }), { dd: true }); assert.equal(classify({ id: 'a', dd: true }, { state: 'dead' }), null);
  assert.deepEqual(classify({ id: 'a', dd: true }, { state: 'ok' }), { dd: null }); assert.equal(classify({ id: 'a' }, { state: 'ok' }), null);
  assert.equal(classify({ id: 'a', dd: true }, { state: 'unsure' }), null, 'a good link is never flagged (and a flag is never cleared) by a bad moment'); assert.equal(classify({ id: 'a' }, { state: 'invalid' }), null);
});

test('check job: groups of 30, flags the dead, clears recovered links, counts unsure, reports progress', async () => {
  const calls = [];
  const check = async (urls) => { calls.push(urls.length); return new Map(urls.map((u) => { const n = Number(/s(\d+)\./.exec(u)[1]); return [u, { url: u, state: n % 10 === 0 ? 'dead' : n % 10 === 1 ? 'unsure' : 'ok' }]; })); };
  const { engine, queue } = await setup(check); const ids = await seed(engine, 70);
  await engine.updateLinks([ids[5]], { dd: true });   // flagged earlier, answers fine now
  const job = await startCheck({ queue, engine, ids }); await queue.whenIdle();
  assert.deepEqual(calls, [GROUP, GROUP, 10]); const j = queue.get(job.id); assert.equal(j.status, 'done'); assert.equal(j.done, 70);
  const s = statsOf(j); assert.equal(s.dead, 7); assert.equal(s.unsure, 7); assert.equal(s.ok, 56);
  assert.equal(engine.getLink(ids[0]).dd, true); assert.equal(engine.getLink(ids[10]).dd, true); assert.ok(!engine.getLink(ids[5]).dd, 'recovered link lost its flag'); assert.ok(!engine.getLink(ids[1]).dd);
  assert.equal(s.deadIds.length, 7);
});

test('check job: an old Worker stops the job with a clear message and changes nothing', async () => {
  const check = async () => { const e = new Error('The Cloudflare Worker is out of date.'); e.code = 'old-worker'; throw e; };
  const { engine, queue } = await setup(check); const ids = await seed(engine, 5);
  const job = await startCheck({ queue, engine, ids }); await queue.whenIdle();
  assert.equal(queue.get(job.id).status, 'failed'); assert.match(queue.get(job.id).error, /out of date/); assert.ok(ids.every((id) => !engine.getLink(id).dd));
});

test('check job: a failing group leaves its links unsure (never dead) and the job still finishes', async () => {
  const { engine, queue } = await setup(async () => { throw new Error('boom'); }); const ids = await seed(engine, 4);
  const job = await startCheck({ queue, engine, ids }); await queue.whenIdle();
  assert.equal(queue.get(job.id).status, 'done'); assert.equal(statsOf(queue.get(job.id)).unsure, 4); assert.ok(ids.every((id) => !engine.getLink(id).dd));
});

test('worker-client checkLinks: batches of ten, merges answers, an out-of-date Worker is reported, a busy one stays unsure', async () => {
  const wc = await import('../../js/core/worker-client.js');
  const origFetch = globalThis.fetch; let sizes = [];
  globalThis.fetch = async (url, init) => { const body = JSON.parse(init.body); sizes.push(body.urls.length); return new Response(JSON.stringify({ ok: true, results: body.urls.map((u) => ({ url: u, state: 'ok', status: 200 })) }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const urls = Array.from({ length: 25 }, (_, i) => `https://c${i}.test/`); const m = await wc.checkLinks(urls);
  assert.deepEqual(sizes.sort((a, b) => b - a), [10, 10, 5]); assert.equal(m.size, 25); assert.equal(m.get(urls[3]).state, 'ok');
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  await assert.rejects(wc.checkLinks(['https://z.test/']), (e) => e.code === 'old-worker');
  globalThis.fetch = origFetch;
});

test('result sheet: live progress, summary, dead list, delete with Undo and keep; row shows the dead flag; folder has a Dead links filter', async () => {
  const check = async (urls) => new Map(urls.map((u) => [u, { url: u, state: /s[01]\./.test(u) ? 'dead' : 'ok' }]));
  const { engine, queue } = await setup(check); const ids = await seed(engine, 6);
  await runCheck({ engine, queue, router: null, ids }); await waitFor(() => $('.chk-stats'));
  await queue.whenIdle(); await tick(20);
  assert.equal($$('.chk-stat b').map((b) => b.textContent).join(','), '4,2,0'); assert.equal($$('.chk-item').length, 2);
  assert.ok($('.lflag.is-dead') === null, 'rows are not on screen here'); const row = createLinkRow(engine.getLink(ids[0]));
  assert.ok(row.querySelector('.lflag.is-dead'), 'row shows the dead flag');
  const keep = $$('.chk-foot button').find((b) => b.textContent === 'Keep them'); keep.click(); await tick(20);
  assert.ok(ids.every((id) => !engine.getLink(id).dd), 'Keep them clears the flags'); assert.equal($$('.chk-item').length, 0);
  $$('.sheet-head .btn-icon')[0].click(); await tick(250);
  const src = (await import('node:fs')).readFileSync(new URL('../../js/features/library/folder-page.js', import.meta.url), 'utf8'); assert.match(src, /dd: 'Dead links'/);
});
