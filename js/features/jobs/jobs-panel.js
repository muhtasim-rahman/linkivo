/**
 * Linkivo — js/features/jobs/jobs-panel.js  (v2.5.3, completes v2.5.0 slice 9)
 * Purpose: the Background jobs panel. One list of everything running or waiting: the jobs of this device (import, fetching titles, checking links, locking a folder; each with
 *          Pause, Resume, Stop, Retry, Remove) and, for accounts, the jobs the Worker runs while the app is closed (title fetching by the cron, with Cancel). A local "Fetching titles"
 *          job can be handed to the Worker with "Keep going in the background": the rest of its links go to /jobs/enqueue (max 500 per job, 4 jobs at a time) and the local job ends.
 *          Locked links are never handed over (the Worker cannot read them, and they must not leave the vault).
 * v2.5.4 (owner): compact rows with start and update times, a Details switch per job, finished jobs are removed 24 hours after they ended, a failed job offers Retry (a failed server job is queued again from where it
 *          stopped, or run on this device when the server is not reachable), and the stray text "null" is gone (replaceChildren(null) writes the word "null"; every list is now filtered).
 * API: openJobsPanel({ queue, engine }) -> sheet      jobsButton({ queue }) -> Element (header icon with a dot while something runs)      handOverToWorker({ queue, engine, job }) -> { moved, left }
 *      pruneOldJobs(queue, now) -> Promise<number> (removes finished jobs older than 24 hours)      isStale(job, now) -> boolean      jobStamp(job) -> string
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { openSheet } from '../../ui/sheet.js';
import { getSession } from '../../core/session.js';
import { securePost } from '../../core/worker-client.js';
import { log } from '../../core/logger.js';
import { dateTime, relativeTime, plural } from '../../core/format.js';

const NAMES = { import: 'Import', enrich: 'Fetching titles', check: 'Checking links', 'vault-move': 'Locked folders', backup: 'Backup' };
const STATUS = { queued: 'Waiting', running: 'Running', paused: 'Paused', done: 'Done', failed: 'Failed', stopped: 'Stopped' };
export const MAX_JOB_IDS = 500, MAX_ACTIVE_JOBS = 4;
const ACTIVE = new Set(['queued', 'running', 'paused']);
const label = (j) => j.title || NAMES[j.type] || 'Job';
const ICON = { import: 'import', enrich: 'refresh', check: 'check-circle', 'vault-move': 'lock', backup: 'download' };
export const KEEP_FINISHED_MS = 24 * 3600000;   // v2.5.4 (owner): a finished job stays in the list for 24 hours, then it is removed
const FINAL = new Set(['done', 'failed', 'stopped']);

/** Pure: a finished job whose last change is more than 24 hours old. */
export const isStale = (j, now = Date.now()) => !!j && FINAL.has(j.status) && now - (j.updatedAt || j.up || j.createdAt || 0) > KEEP_FINISHED_MS;
/** Pure: "Started 3:04 PM, updated 2 minutes ago" for one job (empty parts are left out). */
export const jobStamp = (j, now = Date.now()) => {
  const a = j.createdAt, b = j.updatedAt || j.up;
  const parts = [a ? `Started ${dateTime(a)}` : '', b && (!a || b - a > 1000) ? `${FINAL.has(j.status) ? 'ended' : 'updated'} ${relativeTime(b, now)}` : ''].filter(Boolean);
  return parts.join(', ');
};
/** Removes finished local jobs older than 24 hours. Returns how many were removed. */
export async function pruneOldJobs(queue, now = Date.now()) {
  let n = 0;
  for (const j of queue.list()) if (isStale(j, now)) { await queue.remove(j.id).catch(() => {}); n++; }
  return n;
}

/** Pure: how many percent, 0 to 100, or null when the total is not known. */
export const percent = (j) => (j && j.total ? Math.max(0, Math.min(100, Math.round(((j.done || 0) / j.total) * 100))) : null);

/** Hands the REST of a local title-fetch job to the Worker cron. Returns how many links went and how many stay local. */
export async function handOverToWorker({ queue, engine, job }) {
  const all = (job.params && job.params.ids) || [], rest = all.slice(job.cursor || 0);
  const ids = rest.filter((id) => { const l = engine.getLink(id); return l && !l.del && !l.lk; });
  if (!ids.length) return { moved: 0, left: 0 };
  let moved = 0;
  for (let i = 0; i < ids.length && i / MAX_JOB_IDS < MAX_ACTIVE_JOBS; i += MAX_JOB_IDS) {
    const part = ids.slice(i, i + MAX_JOB_IDS);
    await securePost('/jobs/enqueue', { type: 'enrich', ids: part });
    moved += part.length;
  }
  if (moved >= ids.length) { queue.stop(job.id); await queue.remove(job.id).catch(() => {}); }
  return { moved, left: ids.length - moved };
}

async function readServerJobs(engine) {
  if (getSession().mode !== 'account' || !engine || !engine.adapter || !engine.uid) return [];
  try { const o = (await engine.adapter.get(`jobs/${engine.uid}`)) || {}; return Object.entries(o).filter(([, j]) => j && typeof j === 'object').map(([id, j]) => ({ id, ...j })).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); }
  catch (e) { log.debug?.('jobs', 'server jobs not readable', e); return []; }
}

export const activeCount = (queue) => queue.list().filter((j) => ACTIVE.has(j.status)).length;

export function openJobsPanel({ queue, engine }) {
  const body = h('div', { class: 'jobs-panel' });
  let server = [], alive = true;
  const open = new Set();   // ids of the rows whose Details are shown (kept across redraws)
  const btn = (text, fn, cls = '') => h('button', { type: 'button', class: ['btn', 'btn-sm', cls], on: { click: fn } }, text);
  const bar = (j) => { const p = percent(j); return h('div', { class: 'jobs-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': p == null ? null : String(p), 'aria-label': `${label(j)} progress` }, h('i', { style: { width: `${p == null ? 100 : p}%` }, class: p == null && j.status === 'running' ? 'is-busy' : '' })); };
  const fail = (e) => (e && e.code === 'too_many_jobs' ? 'Four background jobs are already running. Try again later.' : e && e.code === 'locked' ? 'Unlock the app first.' : 'Background jobs are not available right now.');

  /** The Details block: only facts that exist, one short line each. */
  const details = (rows) => h('dl', { class: 'jobs-dl' }, rows.filter(([, v]) => v !== '' && v != null).map(([k, v]) => h('div', null, h('dt', { text: k }), h('dd', { text: String(v) }))));
  const more = (id, build) => {
    const on = open.has(id);
    const t = h('button', { type: 'button', class: 'jobs-more', 'aria-expanded': String(on), on: { click: () => { if (open.has(id)) open.delete(id); else open.add(id); draw(); } } }, on ? 'Hide details' : 'Details');
    return [t, on ? build() : null];
  };
  const rowOf = (j, ic, title, st, sub, kids) => h('li', { class: ['jobs-row', `is-${j.status}`] },
    h('div', { class: 'jobs-head' }, h('span', { class: 'jobs-ic', 'aria-hidden': 'true' }, icon(ic, { size: 18 })), h('strong', { class: 'jobs-t', text: title }), h('span', { class: 'jobs-st', text: st })),
    ...kids, sub ? h('p', { class: 'jobs-sub', text: sub }) : null);

  function localRow(j) {
    const acts = [];
    if (j.status === 'running' || j.status === 'queued') acts.push(btn('Pause', () => queue.pause(j.id)), btn('Stop', () => queue.stop(j.id)));
    if (j.status === 'paused') acts.push(btn('Resume', () => queue.resume(j.id), 'btn-primary'), btn('Stop', () => queue.stop(j.id)));
    if (j.status === 'failed' || j.status === 'stopped') acts.push(btn('Retry', () => queue.retry(j.id), 'btn-primary'), btn('Remove', () => queue.remove(j.id)));
    if (j.status === 'done') acts.push(btn('Remove', () => queue.remove(j.id)));
    if (j.type === 'enrich' && ACTIVE.has(j.status) && getSession().mode === 'account') acts.push(btn('Keep going in the background', async () => {
      try { const r = await handOverToWorker({ queue, engine, job: j }); toast(r.moved ? `${r.moved} links continue even when the app is closed.${r.left ? ` ${r.left} stay here.` : ''}` : 'Nothing left to hand over.'); refreshServer(); }
      catch (e) { toast(fail(e), { type: 'error' }); }
    }));
    const pct = percent(j);
    const [tog, det] = more(j.id, () => details([['Type', NAMES[j.type] || j.type], ['Status', STATUS[j.status] || j.status], ['Started', j.createdAt ? dateTime(j.createdAt) : ''], ['Last change', j.updatedAt ? dateTime(j.updatedAt) : ''],
      ['Progress', j.total ? `${j.done || 0} of ${j.total}` : ''], ['Could not be done', j.failed ? String(j.failed) : ''], ['Reason', j.error || ''], ['Where', 'On this device']]));
    return rowOf(j, ICON[j.type] || 'clock', label(j), `${STATUS[j.status] || j.status}${pct != null && ACTIVE.has(j.status) ? ` ${pct}%` : ''}`, jobStamp(j),
      [ACTIVE.has(j.status) ? bar(j) : null, j.error ? h('p', { class: 'jobs-err', role: 'alert', text: j.status === 'failed' ? `${j.error} Retry continues from where it stopped.` : j.error }) : null,
        h('div', { class: 'jobs-acts' }, acts, tog), det]);
  }

  /** A failed server job: queue the links that were not done as a new server job; when the server says no, run them on this device instead. */
  async function retryServer(j) {
    const ids = String(j.ids || '').split(',').filter(Boolean).slice(Number(j.cursor) || 0);
    if (!ids.length) { toast('Nothing left to retry.'); return; }
    try { await securePost('/jobs/enqueue', { type: 'enrich', ids: ids.slice(0, MAX_JOB_IDS) }); await securePost('/jobs/cancel', { id: j.id }).catch(() => {}); toast('Queued again on the server.'); }
    catch (e) {
      try { await queue.enqueue({ type: 'enrich', title: 'Fetching titles', params: { ids }, chip: true }); await securePost('/jobs/cancel', { id: j.id }).catch(() => {}); toast('The server could not take it, so it runs on this device.'); }
      catch { toast(fail(e), { type: 'error' }); }
    }
    refreshServer();
  }
  function serverRow(j) {
    const run = j.status === 'queued' || j.status === 'running', pct = percent({ done: j.done, total: j.total }), at = j.up || j.createdAt;
    const st = j.status === 'done' ? 'Done' : j.status === 'failed' ? 'Failed' : `${STATUS[j.status] || j.status}${pct != null && run ? ` ${pct}%` : ''}`;
    const acts = [];
    if (run) acts.push(btn('Cancel', async () => { try { await securePost('/jobs/cancel', { id: j.id }); toast('Cancelled.'); } catch { toast('Could not cancel.', { type: 'error' }); } refreshServer(); }));
    if (j.status === 'failed') acts.push(btn('Retry', () => retryServer(j), 'btn-primary'), btn('Remove', async () => { try { await securePost('/jobs/cancel', { id: j.id }); } catch { /* shown again next time */ } refreshServer(); }));
    const [tog, det] = more(`s:${j.id}`, () => details([['Type', 'Fetching titles'], ['Status', STATUS[j.status] || j.status], ['Started', j.createdAt ? dateTime(j.createdAt) : ''], ['Last change', at ? dateTime(at) : ''],
      ['Progress', j.total ? `${j.done || 0} of ${j.total}` : ''], ['Could not be read', j.failed ? String(j.failed) : ''], ['Where', 'On the server (continues when the app is closed)']]));
    return rowOf({ ...j, updatedAt: at }, 'refresh', 'Fetching titles (server)', st, `${j.done || 0} of ${plural(j.total || 0, 'link')}${j.failed ? `, ${j.failed} could not be read` : ''}. ${jobStamp({ ...j, updatedAt: at })}`,
      [run ? bar({ done: j.done, total: j.total, status: j.status, title: 'Fetching titles' }) : null, h('div', { class: 'jobs-acts' }, acts, tog), det]);
  }
  function draw() {
    if (!alive) return;
    const now = Date.now();
    const local = queue.list().filter((j) => !isStale(j, now)).sort((a, b) => b.updatedAt - a.updatedAt), srv = server.filter((j) => !isStale({ ...j, updatedAt: j.up || j.createdAt }, now)), has = local.length || srv.length;
    // (v2.5.4: replaceChildren(null) writes the text "null", so every part that may be missing is filtered out first)
    body.replaceChildren(...[
      !has ? h('div', { class: 'jobs-empty' }, icon('check-circle', { size: 28 }), h('p', { text: 'Nothing is running.' }), h('p', { class: 'help', text: 'Imports, title fetching, link checks and folder locking show up here while they work. Finished jobs disappear after 24 hours.' })) : null,
      local.length ? h('section', null, h('h3', { class: 'jobs-h', text: 'On this device' }), h('ul', { class: 'jobs-list' }, local.map(localRow))) : null,
      srv.length ? h('section', null, h('h3', { class: 'jobs-h', text: 'On the server' }), h('ul', { class: 'jobs-list' }, srv.map(serverRow))) : null
    ].filter(Boolean));
  }
  async function refreshServer() { server = await readServerJobs(engine); draw(); }
  pruneOldJobs(queue).catch(() => {});
  const offs = [queue.subscribe(draw), queue.onRemoved(draw)];
  const poll = setInterval(() => { if (server.some((j) => j.status === 'queued' || j.status === 'running')) refreshServer(); }, 8000);
  const sheet = openSheet({ title: 'Background jobs', body, actions: [], onClose: () => { alive = false; clearInterval(poll); offs.forEach((f) => f && f()); } });
  draw(); refreshServer();
  return sheet;
}

/** The small header icon: a dot while at least one job is active; opens the panel. */
export function jobsButton({ queue, engine }) {
  if (!queue) return h('span', { hidden: true });   // data not ready (the page shows its own empty state)
  const dot = h('span', { class: 'jobs-dot', 'aria-hidden': 'true', hidden: true });
  const b = h('button', { type: 'button', class: 'btn-icon jobs-btn', 'aria-label': 'Background jobs', 'data-tip': 'Background jobs', on: { click: () => openJobsPanel({ queue, engine }) } }, icon('clock', { size: 20 }), dot);
  const sync = () => { const n = activeCount(queue); dot.hidden = n === 0; b.setAttribute('aria-label', n ? `Background jobs, ${n} running` : 'Background jobs'); };
  sync(); let seen = false;
  const off = queue.subscribe(() => { if (b.isConnected) { seen = true; sync(); } else if (seen) off(); else sync(); });
  return b;
}
