/**
 * Linkivo — js/core/import-log.js  (v2.2.2)
 * Purpose: "Recent imports" that follow the account. Until v2.2.1 the list was only the local job queue, so a second device saw nothing and
 *          a cleared browser lost it. Now every import, restore and title fetch that reaches a final state (done, stopped, failed) writes one
 *          small record to users/<uid>/importLog/<jobId> (schema IMPORT_LOG, newest 50 kept). The page shows the local jobs (they have Details,
 *          Undo and Retry) plus the records that other devices wrote. Guests have no account: they see their local jobs only.
 *          Each row can be removed on its own and the whole list can be cleared (the owner asked for both).
 *   Only a job that CHANGES to a final state is written, never one that merely sits finished in the queue, so a record you removed on one
 *   device is not brought back by another device on its next start.
 * API: createImportLog({ adapter?, uid?, queue }) -> { list(), subscribe(fn), remove(id), clearAll(), dispose() }
 *      logRecord(job) -> IMPORT_LOG record | null      mergeRows(jobs, remote) -> rows (newest first)      KEEP
 */
import { IMPORT_LOG, sanitizePatch } from '../engine/schema.js';
import { createEmitter } from './events.js';
import { log } from './logger.js';

export const KEEP = 50;
const FINAL = ['done', 'stopped', 'failed'];
const TYPES = ['import', 'enrich'];

/** Pure: the compact record that is stored for a finished job. Returns null for other job types or jobs that are not finished. */
export function logRecord(job) {
  if (!job || !TYPES.includes(job.type) || !FINAL.includes(job.status)) return null;
  const s = job.stats || {};
  const { set } = sanitizePatch(IMPORT_LOG, {
    ty: job.type, title: job.title || '', st: job.status, total: job.total || 0, done: job.done || 0, failed: job.failed || 0,
    saved: s.saved, skipped: s.skipped, invalid: s.invalid, fid: job.params?.fid, imp: job.params?.imp
  });
  // ts is managed outside the sanitizer (it never accepts a caller's ts), so the job's own start time is added here
  return set.ty && Number.isFinite(job.createdAt) && job.createdAt > 0 ? { ...set, ts: job.createdAt } : null;
}

/** Pure: one list for the page. A local job wins over the record with the same id (it knows more and can open Details). */
export function mergeRows(jobs, remote) {
  const rows = new Map();
  for (const [id, r] of Object.entries(remote || {})) {
    if (!r || typeof r !== 'object') continue;
    rows.set(id, { id, type: r.ty, title: r.title || '', status: r.st || 'done', total: r.total || 0, done: r.done || 0, failed: r.failed || 0, fid: r.fid || null, createdAt: r.ts || 0, local: false });
  }
  for (const j of jobs) {
    if (!TYPES.includes(j.type)) continue;
    rows.set(j.id, { id: j.id, type: j.type, title: j.title || '', status: j.status, total: j.total || 0, done: j.done || 0, failed: j.failed || 0, fid: j.params?.fid || null, createdAt: j.createdAt || 0, local: true });
  }
  return [...rows.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function createImportLog({ adapter = null, uid = null, queue }) {
  const bus = createEmitter();
  const base = uid ? `users/${uid}/importLog` : null;
  const cloud = !!(adapter && base);
  let remote = {};
  const offs = [];
  const seen = new Set();
  const emit = () => bus.emit('change');

  if (cloud) offs.push(adapter.watchValue(base, (v) => { remote = v && typeof v === 'object' ? { ...v } : {}; emit(); }));

  async function trim() {
    const ids = Object.keys(remote);
    if (ids.length <= KEEP) return;
    const old = ids.sort((a, b) => (remote[b].ts || 0) - (remote[a].ts || 0)).slice(KEEP);
    const updates = {}; for (const id of old) { updates[`${base}/${id}`] = null; delete remote[id]; }
    await adapter.update(updates);
  }

  async function save(job) {
    const key = `${job.id}:${job.status}:${job.done}`;
    if (seen.has(key)) return; seen.add(key);
    const rec = logRecord(job); if (!rec) return;
    if (!cloud) return;
    remote[job.id] = rec; emit();
    try { await adapter.update({ [`${base}/${job.id}`]: rec }); await trim(); } catch (e) { log.warn('import-log', 'record not saved', e); }
  }
  offs.push(queue.subscribe((j) => { if (TYPES.includes(j.type) && FINAL.includes(j.status)) save(j); }));
  offs.push(queue.onRemoved(() => emit()));

  return {
    list: () => mergeRows(queue.list(), remote),
    subscribe: (fn) => bus.on('change', fn),
    /** Removes one row from this device and from the account. A job that is still running is left alone. */
    async remove(id) {
      const j = queue.get(id);
      if (j && !FINAL.includes(j.status)) return false;
      if (j) await queue.remove(id);
      if (cloud && remote[id]) { delete remote[id]; emit(); try { await adapter.update({ [`${base}/${id}`]: null }); } catch (e) { log.warn('import-log', 'record not removed', e); } }
      emit(); return true;
    },
    /** Clears every finished row (jobs that are still running stay). */
    async clearAll() {
      const updates = {};
      for (const j of queue.list()) if (TYPES.includes(j.type) && FINAL.includes(j.status)) await queue.remove(j.id);
      if (cloud) { for (const id of Object.keys(remote)) updates[`${base}/${id}`] = null; remote = {}; }
      emit();
      if (cloud && Object.keys(updates).length) { try { await adapter.update(updates); } catch (e) { log.warn('import-log', 'records not cleared', e); } }
    },
    dispose() { for (const off of offs) { try { off?.(); } catch { /* ignore */ } } offs.length = 0; }
  };
}
