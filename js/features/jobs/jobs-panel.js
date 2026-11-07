/**
 * Linkivo — js/features/jobs/jobs-panel.js  (v2.5.3, completes v2.5.0 slice 9)
 * Purpose: the Background jobs panel. One list of everything running or waiting: the jobs of this device (import, fetching titles, checking links, locking a folder; each with
 *          Pause, Resume, Stop, Retry, Remove) and, for accounts, the jobs the Worker runs while the app is closed (title fetching by the cron, with Cancel). A local "Fetching titles"
 *          job can be handed to the Worker with "Keep going in the background": the rest of its links go to /jobs/enqueue (max 500 per job, 4 jobs at a time) and the local job ends.
 *          Locked links are never handed over (the Worker cannot read them, and they must not leave the vault).
 * API: openJobsPanel({ queue, engine }) -> sheet      jobsButton({ queue }) -> Element (header icon with a dot while something runs)      handOverToWorker({ queue, engine, job }) -> { moved, left }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { openSheet } from '../../ui/sheet.js';
import { getSession } from '../../core/session.js';
import { securePost } from '../../core/worker-client.js';
import { log } from '../../core/logger.js';

const NAMES = { import: 'Import', enrich: 'Fetching titles', check: 'Checking links', 'vault-move': 'Locked folders', backup: 'Backup' };
const STATUS = { queued: 'Waiting', running: 'Running', paused: 'Paused', done: 'Done', failed: 'Failed', stopped: 'Stopped' };
export const MAX_JOB_IDS = 500, MAX_ACTIVE_JOBS = 4;
const ACTIVE = new Set(['queued', 'running', 'paused']);
const label = (j) => j.title || NAMES[j.type] || 'Job';

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
  const btn = (text, fn, cls = '') => h('button', { type: 'button', class: ['btn', 'btn-sm', cls], on: { click: fn } }, text);
  const bar = (j) => { const p = percent(j); return h('div', { class: 'jobs-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': p == null ? null : String(p), 'aria-label': `${label(j)} progress` }, h('i', { style: { width: `${p == null ? 100 : p}%` }, class: p == null && j.status === 'running' ? 'is-busy' : '' })); };

  function localRow(j) {
    const acts = [];
    if (j.status === 'running' || j.status === 'queued') acts.push(btn('Pause', () => queue.pause(j.id)), btn('Stop', () => queue.stop(j.id)));
    if (j.status === 'paused') acts.push(btn('Resume', () => queue.resume(j.id), 'btn-primary'), btn('Stop', () => queue.stop(j.id)));
    if (j.status === 'failed' || j.status === 'stopped') acts.push(btn('Retry', () => queue.retry(j.id), 'btn-primary'), btn('Remove', () => queue.remove(j.id)));
    if (j.status === 'done') acts.push(btn('Remove', () => queue.remove(j.id)));
    if (j.type === 'enrich' && ACTIVE.has(j.status) && getSession().mode === 'account') acts.push(btn('Keep going in the background', async () => {
      try { const r = await handOverToWorker({ queue, engine, job: j }); toast(r.moved ? `${r.moved} links continue even when the app is closed.${r.left ? ` ${r.left} stay here.` : ''}` : 'Nothing left to hand over.'); refreshServer(); }
      catch (e) { toast(e && e.code === 'too_many_jobs' ? 'Four background jobs are already running. Try again later.' : e && e.code === 'locked' ? 'Unlock the app first.' : 'Background jobs are not available right now.', { type: 'error' }); }
    }));
    const pct = percent(j);
    return h('li', { class: ['jobs-row', `is-${j.status}`] },
      h('div', { class: 'jobs-head' }, h('strong', { text: label(j) }), h('span', { class: 'jobs-st', text: `${STATUS[j.status] || j.status}${pct != null && ACTIVE.has(j.status) ? ` ${pct}%` : ''}` })),
      ACTIVE.has(j.status) && bar(j),
      j.error && h('p', { class: 'jobs-err', role: 'alert', text: j.error }),
      acts.length ? h('div', { class: 'jobs-acts' }, acts) : null);
  }
  function serverRow(j) {
    const run = j.status === 'queued' || j.status === 'running', pct = percent({ done: j.done, total: j.total });
    return h('li', { class: ['jobs-row', `is-${j.status}`] },
      h('div', { class: 'jobs-head' }, h('strong', { text: 'Fetching titles (server)' }), h('span', { class: 'jobs-st', text: `${STATUS[j.status] || j.status}${pct != null && run ? ` ${pct}%` : ''}` })),
      run && bar({ done: j.done, total: j.total, status: j.status, title: 'Fetching titles' }),
      h('p', { class: 'jobs-sub', text: `${j.done || 0} of ${j.total || 0} links${j.failed ? `, ${j.failed} could not be read` : ''}. Runs even when the app is closed.` }),
      run ? h('div', { class: 'jobs-acts' }, btn('Cancel', async () => { try { await securePost('/jobs/cancel', { id: j.id }); toast('Cancelled.'); } catch { toast('Could not cancel.', { type: 'error' }); } refreshServer(); })) : null);
  }
  function draw() {
    if (!alive) return;
    const local = queue.list().sort((a, b) => b.updatedAt - a.updatedAt), has = local.length || server.length;
    body.replaceChildren(
      !has ? h('div', { class: 'jobs-empty' }, icon('check-circle', { size: 28 }), h('p', { text: 'Nothing is running.' }), h('p', { class: 'help', text: 'Imports, title fetching, link checks and folder locking show up here while they work.' })) : null,
      local.length ? h('section', null, h('h3', { class: 'jobs-h', text: 'On this device' }), h('ul', { class: 'jobs-list' }, local.map(localRow))) : null,
      server.length ? h('section', null, h('h3', { class: 'jobs-h', text: 'On the server' }), h('ul', { class: 'jobs-list' }, server.map(serverRow))) : null);
  }
  async function refreshServer() { server = await readServerJobs(engine); draw(); }
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
