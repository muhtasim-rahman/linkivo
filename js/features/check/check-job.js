/**
 * Linkivo — js/features/check/check-job.js  (v2.3.0)
 * Purpose: the dead-link checker as a persisted, resumable job (type "check"). Links go to the Worker /check route in groups of 30 (three calls of ten at a
 *          time). A link that answers is marked healthy (`dd` cleared); a link that is really gone (404, 410, the domain no longer exists) gets the flag
 *          `dd`; "unsure" answers (a site that blocks robots, a timeout, a busy server) change NOTHING, so a good link is never flagged by a bad moment.
 *          The job keeps its numbers in job.stats so the result sheet can show them after a reload.
 * API: registerCheckJob({ queue, engine, check }) -> void      startCheck({ queue, engine, ids, title? }) -> Promise<job>      statsOf(job) -> { ok, dead, unsure, invalid, deadIds }
 *      classify(link, result) -> patch|null (pure, tested)      GROUP
 */
import { log } from '../../core/logger.js';

export const GROUP = 30;
const MAX_DEAD_LISTED = 500;

/** Pure: what one answer changes on the link. dead -> dd true, ok -> dd cleared (only when it was set), anything else -> no change. */
export function classify(link, r) {
  if (!link || !r) return null;
  if (r.state === 'dead') return link.dd ? null : { dd: true };
  if (r.state === 'ok') return link.dd ? { dd: null } : null;
  return null;
}
export const statsOf = (job) => ({ ok: 0, dead: 0, unsure: 0, invalid: 0, deadIds: [], ...(job && job.stats) });

export function registerCheckJob({ queue, engine, check }) {
  queue.register('check', async (job, ctx) => {
    const ids = job.params.ids;
    let at = job.cursor || 0;
    job.startedAt = job.startedAt || engine.now();
    job.stats = { ok: 0, dead: 0, unsure: 0, invalid: 0, deadIds: [], ...(job.stats || {}) };
    ctx.progress({ done: at, total: ids.length });
    while (at < ids.length) {
      if (ctx.shouldStop()) return;
      const group = ids.slice(at, at + GROUP).map((id) => engine.getLink(id)).filter((l) => l && !l.del);
      if (group.length) {
        let results;
        try { results = await check(group.map((l) => l.url)); }
        catch (e) { if (e && e.code === 'old-worker') throw e; log.warn('check', 'a group of links could not be checked', e); job.failed = (job.failed || 0) + group.length; job.stats.unsure += group.length; results = null; }
        if (results) {
          const patches = new Map();
          for (const l of group) {
            const r = results.get(l.url) || { state: 'unsure' };
            job.stats[r.state in job.stats ? r.state : 'unsure']++;
            if (r.state === 'dead' && job.stats.deadIds.length < MAX_DEAD_LISTED) job.stats.deadIds.push(l.id);
            const p = classify(l, r); if (p) patches.set(l.id, p);
          }
          if (patches.size) await engine.updateLinks([...patches.keys()], (l) => patches.get(l.id) || {});
        }
      }
      at += GROUP;
      ctx.progress({ done: Math.min(at, ids.length), total: ids.length, cursor: at });
    }
  });
}

export function startCheck({ queue, engine, ids, title }) {
  const live = [...new Set(ids)].filter((id) => { const l = engine.getLink(id); return l && !l.del; });
  return queue.enqueue({ type: 'check', title: title || (live.length === 1 ? 'Checking link' : 'Checking links'), params: { ids: live }, chip: true });
}
