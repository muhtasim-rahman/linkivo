/**
 * Linkivo — js/engine/job-queue.js  (v2.1.0)
 * Purpose: persisted, resumable background jobs (import writes, bulk deletes, vault moves, sync, enrichment).
 *          Jobs live in the "jobs" store of the scope database, so they survive a reload; an interrupted job restarts from
 *          its saved cursor. Pause and stop are cooperative: the handler checks ctx.shouldStop() between chunks.
 * Job: { id, type, title, params, chip, status, cursor, total, done, failed, error, createdAt, updatedAt }
 *      status: queued | running | paused | stopped | failed | done
 * Handler: async (job, ctx) => void     ctx = { progress({done,total,failed,cursor}), shouldStop() -> null|'pause'|'stop' }
 * API: createJobQueue({ db, now, concurrency }) -> { register, enqueue, start, pause, resume, stop, retry, remove,
 *        get, list, subscribe, isBusy, whenIdle }
 */
import { createEmitter } from '../core/events.js';
import { newId } from '../core/utils.js';
import { log } from '../core/logger.js';

const STORE = 'jobs';
const FINAL = new Set(['done', 'failed', 'stopped']);

export function createJobQueue({ db, now = Date.now, concurrency = 1 }) {
  const handlers = new Map();
  const jobs = new Map();
  const wants = new Map(); // id -> 'pause' | 'stop'
  const bus = createEmitter();
  let active = 0;
  let idleWaiters = [];

  const snapshot = (j) => ({ ...j });
  const emit = (j) => bus.emit('job', snapshot(j));
  async function save(j) { j.updatedAt = now(); try { await db.put(STORE, j); } catch (e) { log.warn('jobs', 'could not save job', e); } emit(j); }

  function checkIdle() {
    if (active === 0 && ![...jobs.values()].some((j) => j.status === 'queued' && handlers.has(j.type))) {
      const w = idleWaiters; idleWaiters = []; w.forEach((r) => r());
    }
  }

  async function run(job) {
    active++;
    job.status = 'running'; job.error = null;
    wants.delete(job.id);
    await save(job);
    let lastSave = 0;
    const ctx = {
      shouldStop: () => wants.get(job.id) || null,
      progress(p = {}) {
        if (p.done != null) job.done = p.done;
        if (p.total != null) job.total = p.total;
        if (p.failed != null) job.failed = p.failed;
        if ('cursor' in p) job.cursor = p.cursor;
        job.updatedAt = now();
        emit(job);
        if (job.updatedAt - lastSave > 250) { lastSave = job.updatedAt; db.put(STORE, job).catch(() => {}); }
      }
    };
    try {
      await handlers.get(job.type)(job, ctx);
      const want = wants.get(job.id);
      job.status = want === 'pause' ? 'paused' : want === 'stop' ? 'stopped' : 'done';
    } catch (e) {
      job.status = wants.get(job.id) === 'stop' ? 'stopped' : 'failed';
      job.error = String(e && e.message ? e.message : e).slice(0, 200);
      log.error('jobs', `job ${job.type} failed`, e);
    }
    wants.delete(job.id);
    await save(job);
    active--;
    kick();
    checkIdle();
  }

  function kick() {
    while (active < concurrency) {
      const next = [...jobs.values()].filter((j) => j.status === 'queued' && handlers.has(j.type)).sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!next) break;
      run(next);
    }
  }

  const api = {
    register(type, handler) { handlers.set(type, handler); kick(); },
    async enqueue({ type, title = '', params = {}, chip = false }) {
      const t = now();
      const job = { id: newId(t), type, title, params, chip, status: 'queued', cursor: null, total: 0, done: 0, failed: 0, error: null, createdAt: t, updatedAt: t };
      jobs.set(job.id, job);
      await save(job);
      kick();
      return snapshot(job);
    },
    /** Boot: load saved jobs; a job that was running when the page closed goes back to the queue and resumes from its cursor. */
    async start() {
      for (const j of await db.getAll(STORE)) { if (j.status === 'running') j.status = 'queued'; jobs.set(j.id, j); }
      kick();
    },
    pause(id) { const j = jobs.get(id); if (!j) return; if (j.status === 'running') wants.set(id, 'pause'); else if (j.status === 'queued') { j.status = 'paused'; save(j); } },
    resume(id) { const j = jobs.get(id); if (j && j.status === 'paused') { j.status = 'queued'; save(j).then(kick); } },
    stop(id) { const j = jobs.get(id); if (!j) return; if (j.status === 'running') wants.set(id, 'stop'); else if (j.status === 'queued' || j.status === 'paused') { j.status = 'stopped'; save(j); } },
    retry(id) { const j = jobs.get(id); if (j && (j.status === 'failed' || j.status === 'stopped')) { j.status = 'queued'; j.error = null; save(j).then(kick); } },
    async remove(id) { const j = jobs.get(id); if (j && FINAL.has(j.status)) { jobs.delete(id); await db.deleteMany(STORE, [id]); bus.emit('removed', id); } },
    get: (id) => (jobs.has(id) ? snapshot(jobs.get(id)) : null),
    list: () => [...jobs.values()].map(snapshot),
    subscribe: (fn) => bus.on('job', fn),
    onRemoved: (fn) => bus.on('removed', fn),
    isBusy: () => active > 0 || [...jobs.values()].some((j) => j.status === 'queued' || j.status === 'running'),
    whenIdle() { return new Promise((r) => { if (!api.isBusy()) r(); else { idleWaiters.push(r); } }); }
  };
  return api;
}
