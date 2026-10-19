import test from 'node:test';
import assert from 'node:assert/strict';
import { chunk, runParallel } from '../../js/engine/chunker.js';
import { createJobQueue } from '../../js/engine/job-queue.js';
import { createMemoryDb } from '../../js/engine/idb.js';

const noSleep = () => Promise.resolve();

test('chunk splits into groups of 100', () => {
  const parts = chunk(Array.from({ length: 250 }, (_, i) => i));
  assert.deepEqual(parts.map((p) => p.length), [100, 100, 50]);
  assert.deepEqual(chunk([]), []);
});

test('runParallel respects the concurrency cap and finishes everything', async () => {
  let running = 0, peak = 0;
  const res = await runParallel(Array.from({ length: 40 }, (_, i) => i), async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 2)); running--; }, { concurrency: 4, adaptive: false, sleep: noSleep });
  assert.equal(res.ok, 40); assert.equal(res.failed.length, 0); assert.ok(peak <= 4 && peak >= 2);
});

test('runParallel adapts between 2 and 6', async () => {
  let running = 0, peak = 0;
  const res = await runParallel(Array.from({ length: 80 }, (_, i) => i), async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 1)); running--; }, { concurrency: 4, growEvery: 3, sleep: noSleep });
  assert.ok(peak <= 6 && peak > 4, `peak was ${peak}`);
  assert.ok(res.limit <= 6);
});

test('runParallel retries, isolates failures and backs the limit off', async () => {
  const tries = new Map();
  const res = await runParallel([0, 1, 2, 3], async (i) => {
    tries.set(i, (tries.get(i) || 0) + 1);
    if (i === 1 && tries.get(i) < 3) throw new Error('flaky');
    if (i === 2) throw new Error('always');
  }, { retries: 2, sleep: noSleep });
  assert.equal(res.ok, 3);
  assert.deepEqual(res.failed.map((f) => f.index), [2]);
  assert.equal(tries.get(1), 3);
  assert.equal(res.status[1], 'ok'); assert.equal(res.status[2], 'failed');
});

test('runParallel: fatal errors skip retries; stop leaves later items unstarted', async () => {
  let n = 0;
  const fatal = await runParallel([1], async () => { n++; const e = new Error('no'); e.fatal = true; throw e; }, { retries: 5, sleep: noSleep });
  assert.equal(n, 1); assert.equal(fatal.failed.length, 1);
  let started = 0;
  const res = await runParallel(Array.from({ length: 20 }, (_, i) => i), async () => { started++; }, { concurrency: 2, adaptive: false, shouldStop: () => started >= 6, sleep: noSleep });
  assert.equal(res.stopped, true);
  assert.ok(Array.from(res.status).some((s) => s === undefined));
});

test('job queue: runs, reports progress, persists, resumes from cursor after a restart', async () => {
  const db = createMemoryDb();
  let q = createJobQueue({ db });
  const seen = [];
  q.register('count', async (job, ctx) => { for (let i = job.cursor || 0; i < 5; i++) { if (ctx.shouldStop()) return; ctx.progress({ done: i + 1, total: 5, cursor: i + 1 }); seen.push(i); await new Promise((r) => setTimeout(r, 2)); } });
  const j = await q.enqueue({ type: 'count', title: 'test' });
  await q.whenIdle();
  assert.equal(q.get(j.id).status, 'done'); assert.equal(q.get(j.id).done, 5);

  // pause midway, then "reload" (new queue instance on the same database) and resume
  const q2 = createJobQueue({ db });
  let counted = [];
  q2.register('slow', async (job, ctx) => { for (let i = job.cursor || 0; i < 6; i++) { if (ctx.shouldStop()) return; counted.push(i); ctx.progress({ cursor: i + 1, done: i + 1, total: 6 }); await new Promise((r) => setTimeout(r, 5)); } });
  const s = await q2.enqueue({ type: 'slow' });
  await new Promise((r) => setTimeout(r, 12));
  q2.pause(s.id);
  await q2.whenIdle();
  assert.equal(q2.get(s.id).status, 'paused');
  const cursorAtPause = q2.get(s.id).cursor;
  assert.ok(cursorAtPause > 0 && cursorAtPause < 6);

  const q3 = createJobQueue({ db });
  const resumedFrom = [];
  q3.register('slow', async (job, ctx) => { resumedFrom.push(job.cursor); for (let i = job.cursor || 0; i < 6; i++) ctx.progress({ cursor: i + 1, done: i + 1, total: 6 }); });
  await q3.start();
  assert.equal(q3.get(s.id).status, 'paused'); // paused jobs stay paused across reloads
  q3.resume(s.id);
  await q3.whenIdle();
  assert.deepEqual(resumedFrom, [cursorAtPause]);
  assert.equal(q3.get(s.id).status, 'done');
});

test('job queue: an interrupted (running) job restarts after reload; failure and stop are recorded', async () => {
  const db = createMemoryDb();
  await db.put('jobs', { id: 'x1', type: 'work', params: {}, status: 'running', cursor: 3, total: 10, done: 3, failed: 0, createdAt: 1, updatedAt: 1 });
  const q = createJobQueue({ db });
  let startCursor = null;
  q.register('work', async (job) => { startCursor = job.cursor; });
  await q.start(); await q.whenIdle();
  assert.equal(startCursor, 3); assert.equal(q.get('x1').status, 'done');

  q.register('boom', async () => { throw new Error('bad things'); });
  const f = await q.enqueue({ type: 'boom' }); await q.whenIdle();
  assert.equal(q.get(f.id).status, 'failed'); assert.match(q.get(f.id).error, /bad things/);

  q.register('loop', async (job, ctx) => { while (!ctx.shouldStop()) await new Promise((r) => setTimeout(r, 2)); });
  const l = await q.enqueue({ type: 'loop' });
  await new Promise((r) => setTimeout(r, 10)); q.stop(l.id); await q.whenIdle();
  assert.equal(q.get(l.id).status, 'stopped');
  await q.remove(l.id); assert.equal(q.get(l.id), null);
});
