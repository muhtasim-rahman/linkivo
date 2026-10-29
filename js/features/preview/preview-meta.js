/**
 * Linkivo — js/features/preview/preview-meta.js  (v2.3.0)
 * Purpose: "fetch what the preview needs, once". A link that was never looked up (no `checkedAt` in its extra data) is sent to the metadata service
 *          (Worker first, then the device-side rescue, see worker-client.js). The answer is written back: title, description and keywords to the link
 *          (the fetched title wins unless the user edited it, D-079), image, site, author, language, frameable (nf = refuses) and the engine log to the
 *          extra data. Every answer writes `checkedAt`, so the next open is instant and never asks again. A network failure writes nothing, so it is retried.
 *          v2.3.2 (owner): opening a link that Microlink has never answered for (no `ml` in its extra data) asks Microlink by itself, once per link per visit,
 *          while its switch is on and lookups are left; a link that was already looked up only gets Microlink's answer added. What is running right now is
 *          published in `fetchStatus` (a small store) so the page can say "Data Fetching (Microlink)". Every attempt, also a failed or skipped one, is
 *          written into the link's log so the Details tab can show it.
 * API: ensureMeta(engine, linkId, { force?, fetch? }) -> Promise<{ ok, cached?, error? }>   (one request per link at a time)
 *      fetchStatus -> store { lid, engine } | null      wantsMicrolink(meta) -> boolean
 */
import { fetchMeta as workerFetch } from '../../core/worker-client.js';
import { microlinkMeta, canUseMicrolink, lastAttempt } from '../../core/microlink.js';
import { createStore } from '../../core/events.js';
import { metaPatch, metaExtras } from '../import/import-job.js';
import { packLog, parseLog } from './preview-model.js';
import { log } from '../../core/logger.js';

const inflight = new Map();

/** v2.3.1: Microlink first (this device's own daily allowance, switch in Settings), then the Worker chain. Microlink never throws; null means "use the next one". */
export const fetchStatus = createStore({ lid: null, engine: '' });
const tried = new Set();   // links Microlink was asked about during this visit of the app: a failed attempt is not repeated on every open
export const wantsMicrolink = (meta, lid) => canUseMicrolink() && !(meta && meta.ml) && !tried.has(lid);

const REASON = { off: 'switched off', limit: 'daily limit reached', busy: 'busy, try again', error: 'no answer', empty: 'nothing readable' };
async function defaultFetch(urls, lid, { mlOnly = false } = {}) {
  const url = urls[0];
  let skipped = null;
  if (canUseMicrolink()) {
    fetchStatus.set({ lid, engine: 'Microlink' });
    const ml = await microlinkMeta(url);
    if (ml && !ml.empty) return new Map([[url, ml]]);
    if (ml && ml.empty) { if (mlOnly) return new Map([[url, ml]]); skipped = ml.log; }
    else { const a = lastAttempt(); skipped = [{ engine: 'microlink', ok: false, ms: a.ms, error: REASON[a.reason] || 'no answer' }]; }
  } else { const a = lastAttempt(); skipped = [{ engine: 'microlink', ok: false, ms: 0, error: REASON[a.reason] || 'skipped' }]; }
  if (mlOnly) return new Map();                      // nothing to add and nothing to ask the other services about
  fetchStatus.set({ lid, engine: 'Worker' });
  const out = await workerFetch(urls);
  const r = out && out.get(url);
  if (r && skipped) r.log = [...skipped, ...(Array.isArray(r.log) ? r.log : [])];   // the skipped Microlink line comes first in the log
  return out;
}

export function ensureMeta(engine, lid, { force = false, fetch = defaultFetch } = {}) {
  if (inflight.has(lid)) return inflight.get(lid);
  const p = run(engine, lid, force, fetch).finally(() => { inflight.delete(lid); if (fetchStatus.get().lid === lid) fetchStatus.set({ lid: null, engine: '' }); });
  inflight.set(lid, p);
  return p;
}

async function run(engine, lid, force, fetch) {
  const link = engine.getLink(lid);
  if (!link) return { ok: false, error: 'This link is no longer here.' };
  const cur = await engine.getLinkMeta(lid);
  const looked = !!(cur && cur.checkedAt);
  if (!force && looked && !wantsMicrolink(cur, lid)) return { ok: true, cached: true };
  const mlOnly = !force && looked;                  // already looked up by the normal chain: only Microlink's extra answer is wanted
  if (mlOnly) tried.add(lid);
  let r;
  try { r = (await fetch([link.url], lid, { mlOnly })).get(link.url); } catch (e) { log.warn('preview', 'metadata fetch failed', { message: e && e.message }); return { ok: false, error: 'Could not load the page details. Check your connection and try again.' }; }
  if (!r) return mlOnly ? { ok: true, cached: true } : { ok: false, error: 'Could not load the page details. Try again.' };
  if (r.empty) {                                    // Microlink answered but had nothing: remember that, change nothing else
    try { await engine.patchLinkMeta(lid, { ml: Date.now(), log: packLog([...(parseLog(cur && cur.log)), ...(r.log || [])]).slice(0, 2990) || 'microlink\t0\t0\t' }); } catch { /* retried next visit */ }
    return { ok: true, cached: true };
  }
  try {
    const patch = metaPatch(link, r);
    if (patch) await engine.updateLinks([lid], patch);
    const extras = metaExtras(r) || {};
    extras.log = packLog(mlOnly ? [...parseLog(cur && cur.log), ...(r.log || [])] : r.log) || 'preview\t1\t0\t';
    if (r.engine === 'microlink') extras.ml = Date.now();   // never empty: an empty record would not be saved and the link would be asked again every time
    if (r.image) extras.image = r.image;
    await engine.patchLinkMeta(lid, extras);
  } catch (e) { log.warn('preview', 'metadata not saved', { message: e && e.message }); return { ok: false, error: 'The details were loaded but could not be saved.' }; }
  return { ok: true };
}
