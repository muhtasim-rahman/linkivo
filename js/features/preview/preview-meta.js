/**
 * Linkivo — js/features/preview/preview-meta.js  (v2.3.0)
 * Purpose: "fetch what the preview needs, once". A link that was never looked up (no `checkedAt` in its extra data) is sent to the metadata service
 *          (Worker first, then the device-side rescue, see worker-client.js). The answer is written back: title, description and keywords to the link
 *          (the fetched title wins unless the user edited it, D-079), image, site, author, language, frameable (nf = refuses) and the engine log to the
 *          extra data. Every answer writes `checkedAt`, so the next open is instant and never asks again. A network failure writes nothing, so it is retried.
 * API: ensureMeta(engine, linkId, { force?, fetch? }) -> Promise<{ ok, cached?, error? }>   (one request per link at a time)
 */
import { fetchMeta as defaultFetch } from '../../core/worker-client.js';
import { metaPatch, metaExtras } from '../import/import-job.js';
import { packLog } from './preview-model.js';
import { log } from '../../core/logger.js';

const inflight = new Map();

export function ensureMeta(engine, lid, { force = false, fetch = defaultFetch } = {}) {
  if (inflight.has(lid)) return inflight.get(lid);
  const p = run(engine, lid, force, fetch).finally(() => inflight.delete(lid));
  inflight.set(lid, p);
  return p;
}

async function run(engine, lid, force, fetch) {
  const link = engine.getLink(lid);
  if (!link) return { ok: false, error: 'This link is no longer here.' };
  const cur = await engine.getLinkMeta(lid);
  if (!force && cur && cur.checkedAt) return { ok: true, cached: true };
  let r;
  try { r = (await fetch([link.url])).get(link.url); } catch (e) { log.warn('preview', 'metadata fetch failed', { message: e && e.message }); return { ok: false, error: 'Could not load the page details. Check your connection and try again.' }; }
  if (!r) return { ok: false, error: 'Could not load the page details. Try again.' };
  try {
    const patch = metaPatch(link, r);
    if (patch) await engine.updateLinks([lid], patch);
    const extras = metaExtras(r) || {};
    extras.log = packLog(r.log) || 'preview\t1\t0\t';   // never empty: an empty record would not be saved and the link would be asked again every time
    if (r.image) extras.image = r.image;
    await engine.patchLinkMeta(lid, extras);
  } catch (e) { log.warn('preview', 'metadata not saved', { message: e && e.message }); return { ok: false, error: 'The details were loaded but could not be saved.' }; }
  return { ok: true };
}
