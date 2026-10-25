/**
 * Linkivo — js/features/import/import-job.js  (v2.2.0)
 * Purpose: the import ENGINE: persisted, resumable jobs on the job queue (ARCHITECTURE section 6, steps 5 and 6).
 *   'import' job: params { items, updates?, fid, imp, dedupe, perItemFolder?, folderIds?, enrich?, speed? }. Items are written in chunks of 100,
 *                 several chunks in parallel (gentle 2 / normal 4 / fast 6). Every item has its own id from the start, so a job that is resumed
 *                 after a reload (or after Pause) never creates a link twice. Pause and Stop act between chunks.
 *   'enrich' job: params { ids }. Fetches title, description and keywords through the Worker in groups and writes them with one update per
 *                 group. The fetched title replaces the imported one unless the user edited it (tEdit).
 *   Extra fields the handler sets on the job (they are saved with it): stats {saved, skipped, invalid}, live [recent hosts], startedAt, result.
 * API: registerImportJobs({ queue, engine, fetchMeta }) -> void      startImport({ queue, engine, items, fid, options, updates, folderIds }) -> Promise<job>
 *      undoImport(engine, imp) -> Promise<number>      metaPatch(link, result) -> patch|null      metaExtras(result) -> linkMeta fields|null      groupsOf(items, size)     SPEEDS
 */
import { chunk, runParallel } from '../../engine/chunker.js';
import { newId } from '../../core/utils.js';
import { cleanTracking } from '../../core/url-tools.js';
import { logActivity } from '../../core/activity.js';
import { log } from '../../core/logger.js';

export const SPEEDS = { gentle: 2, normal: 4, fast: 6 };
const CHUNK = 100;
export const groupsOf = (items, size) => chunk(items, size);

/** Pure: which fields a metadata result may change. Imported or fetched titles are replaced unless the user typed their own. */
export function metaPatch(link, r) {
  if (!r || !link) return null;
  const patch = {};
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (title && !link.tEdit && (!r.partial || !link.title)) patch.title = title.slice(0, 300);
  if (r.desc && !link.desc) patch.desc = String(r.desc).slice(0, 300);
  if (r.kw && !link.kw) patch.kw = String(Array.isArray(r.kw) ? r.kw.join(', ') : r.kw).slice(0, 200);
  for (const k of Object.keys(patch)) if (patch[k] === link[k]) delete patch[k];
  return Object.keys(patch).length ? patch : null;
}

/** v2.2.1 pure: the extra page data of a metadata result, named like the linkMeta fields (schema.js). Empty values are left out. The title, description
 *  and keywords still go to the link itself (metaPatch); this is everything else the Worker found in the same pass. */
export function metaExtras(r) {
  if (!r || typeof r !== 'object') return null;
  const o = { image: r.image, video: r.video, long: r.desc, site: r.site, author: r.author, lang: r.lang, pub: r.published, canon: r.canonical, icon: r.favicon, type: r.type, theme: r.themeColor || r.theme, frameable: r.frameable === true ? true : undefined };
  for (const k of Object.keys(o)) if (o[k] == null || o[k] === '' || o[k] === false) delete o[k];
  return Object.keys(o).length ? o : null;
}

export async function startImport({ queue, engine, items, fid, options = {}, updates = [], folderIds = [], title = 'Importing links' }) {
  const imp = newId(engine.now());
  const clean = options.cleanTracking === true;
  const t = engine.now();
  const prepared = items.map((i) => ({ ...i, id: i.id || newId(t), url: clean ? cleanTracking(i.url) : i.url, tags: i.tags || options.tags || undefined }));
  const job = await queue.enqueue({
    type: 'import', title, chip: true,
    params: { items: prepared, updates, fid, imp, dedupe: options.dedupe !== false, perItemFolder: !!options.perItemFolder, folderIds: [...new Set([fid, ...folderIds])], enrich: options.enrich !== false, speed: options.speed || 'normal', kind: options.kind || 'links' }
  });
  return job;
}

/** Removes finished import and enrich jobs older than `days` so the list of recent imports stays short. */
export async function pruneJobs(queue, now = Date.now(), days = 7) {
  for (const j of queue.list()) if ((j.type === 'import' || j.type === 'enrich') && ['done', 'stopped', 'failed'].includes(j.status) && now - (j.updatedAt || 0) > days * 86400000) await queue.remove(j.id);
}

export async function undoImport(engine, imp) {
  const ids = engine.linksOfImport(imp).map((l) => l.id);
  if (ids.length) { await engine.deleteLinks(ids); await logActivity(engine, 'delete', `Undo import: ${ids.length} links`); }
  return ids.length;
}

export function registerImportJobs({ queue, engine, fetchMeta }) {
  queue.register('import', async (job, ctx) => {
    const p = job.params;
    const chunks = chunk(p.items, CHUNK);
    const total = p.items.length + p.updates.length;
    job.startedAt = job.startedAt || engine.now();
    job.stats = job.stats || { saved: 0, skipped: 0, invalid: 0, byChunk: {} };
    job.live = job.live || [];
    const finished = new Set();
    let prefix = job.cursor || 0;                       // number of chunks, from the start, that are certainly saved
    for (let i = 0; i < prefix; i++) finished.add(i);
    const todo = []; for (let i = prefix; i < chunks.length; i++) todo.push(i);
    const sizeDone = () => { let n = 0; for (const i of finished) n += chunks[i].length; return n; };

    const res = await runParallel(todo, async (idx) => {
      const r = await engine.addLinks(chunks[idx], { fid: p.fid, imp: p.imp, dedupe: p.dedupe, keepIds: true, perItemFolder: p.perItemFolder, recount: false, chained: false });
      if (!job.stats.byChunk[idx]) job.stats.byChunk[idx] = [r.added.length + r.existing, r.skipped, r.invalid];
      finished.add(idx);
      while (finished.has(prefix)) prefix++;
      const sums = Object.values(job.stats.byChunk);
      job.stats.saved = sums.reduce((n, s) => n + s[0], 0); job.stats.skipped = sums.reduce((n, s) => n + s[1], 0); job.stats.invalid = sums.reduce((n, s) => n + s[2], 0);
      job.live = chunks[idx].slice(-8).map((x) => x.url);
      ctx.progress({ done: sizeDone(), total, cursor: prefix });
    }, { concurrency: SPEEDS[p.speed] || 4, min: 1, max: 6, shouldStop: () => !!ctx.shouldStop(), retries: 2 });

    if (res.failed.length) { job.failed = res.failed.length; throw new Error(`${res.failed.length} group(s) of links could not be saved. Press Retry.`); }
    if (res.stopped) return;                              // paused or stopped: the queue records the status, the cursor stays

    // native restore with "update existing": copy the backup's fields onto the links that were already there
    if (p.updates.length && !job.updatesDone) {
      for (const group of chunk(p.updates, CHUNK)) {
        const byId = new Map(group.map((u) => [u.id, u.patch]));
        await engine.updateLinks([...byId.keys()], (l) => byId.get(l.id) || {});
      }
      job.updatesDone = true; job.stats.saved += p.updates.length;
      ctx.progress({ done: total, total });
    }
    await engine.recount(p.folderIds);
    job.live = [];
    ctx.progress({ done: total, total, cursor: chunks.length });
    job.result = { saved: job.stats.saved, skipped: job.stats.skipped, invalid: job.stats.invalid, imp: p.imp, fid: p.fid };
    await logActivity(engine, 'import', `${job.stats.saved} links saved, ${job.stats.skipped} duplicates skipped`);
    job.params = { ...p, items: [], updates: [] };       // the finished job keeps only what Undo and the summary need, not thousands of links

    if (p.enrich && p.kind !== 'native') {
      const ids = engine.linksOfImport(p.imp).map((l) => l.id);
      if (ids.length) await queue.enqueue({ type: 'enrich', title: 'Fetching titles', params: { ids }, chip: true });
    }
  });

  queue.register('enrich', async (job, ctx) => {
    const ids = job.params.ids;
    const GROUP = 36;                                    // 6 URLs per Worker call, three calls at a time (worker-client)
    let at = job.cursor || 0;
    job.startedAt = job.startedAt || engine.now();
    ctx.progress({ done: at, total: ids.length });
    while (at < ids.length) {
      if (ctx.shouldStop()) return;
      const group = ids.slice(at, at + GROUP).map((id) => engine.getLink(id)).filter((l) => l && !l.del);
      if (group.length) {
        try {
          const results = await fetchMeta(group.map((l) => l.url));
          const patches = new Map();
          for (const l of group) { const patch = metaPatch(l, results.get(l.url)); if (patch) patches.set(l.id, patch); }
          if (patches.size) await engine.updateLinks([...patches.keys()], (l) => patches.get(l.id) || {});
          // v2.2.1: everything else the page offered (image, site, author, language, ...) is kept in the separate linkMeta tree
          const extras = []; for (const l of group) { const x = metaExtras(results.get(l.url)); if (x) extras.push([l.id, x]); }
          if (extras.length) await engine.saveLinkMeta(extras).catch((e) => log.warn('enrich', 'extra page data not saved', e));
        } catch (e) { log.warn('enrich', 'a group of links could not be enriched', e); job.failed = (job.failed || 0) + group.length; }
      }
      at += GROUP;
      ctx.progress({ done: Math.min(at, ids.length), total: ids.length, cursor: at });
    }
  });
}
