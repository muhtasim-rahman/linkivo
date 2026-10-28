/**
 * Linkivo — js/core/worker-client.js  (v2.1.3, v2.2.2)
 * Purpose: the only code that talks to the Cloudflare Worker. Adds the Firebase ID token for account users (guests send none and
 *          get stricter server limits), applies timeouts, splits big lists into small batches (6) and retries with backoff.
 *          v2.1.3: results that are weak (Worker failed, or only a title guessed from the URL) are rescued on this device by
 *          core/meta-fallback.js, so every link ends with at least a title and a favicon. The Worker is still asked first.
 * v2.2.2: whoami() -> { ip (hidden end), city, region, cc, tz } | null   (Worker route /whoami, used for the device list; null when the Worker is older or offline)
 * API: setTokenProvider(fn)   health() -> { ok, version, ms }   fetchMeta(urls, { onBatch }) -> Map<url, result>   META_BATCH
 *      EXPECTED_WORKER  isWorkerOutdated(version) -> boolean   (the app knows which Worker version it was built for)
 *   A meta result: { url, ok, title, desc, kw, lang, author, site, canonical, favicon, image, video, type, frameable,
 *                    engine, log:[{engine, ok, ms, error?}], ms, error? }
 */
import { WORKER_URL } from './config.js';
import { createRateLimiter } from './rate-limiter.js';
import { chunk, runParallel } from '../engine/chunker.js';
import { sleep } from './utils.js';
import { log } from './logger.js';
import { rescueMeta, isWeak } from './meta-fallback.js';

// 6 per call (v2.1.2): every Worker call has its own budget of 50 subrequests; 25 URLs in one call starved each other and many came back empty.
export const META_BATCH = 6;
/** The Worker version this app build expects. A lower number means the owner has not pasted the newest worker.js yet. */
export const EXPECTED_WORKER = '2.3.0';   // v2.3.0: /check (dead-link checker) arrived in Worker 2.3.0
const vnum = (v) => String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
export function isWorkerOutdated(version) { const a = vnum(version), b = vnum(EXPECTED_WORKER); for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0); } return false; }
let tokenProvider = async () => null;
const limiter = createRateLimiter({ capacity: 40, perMs: 60000 });
/** v2.2.2: where this device appears to be (approximate, from the Worker). Never throws: no answer is just null. */
export async function whoami() { try { const { data } = await call('/whoami', { method: 'GET', timeout: 5000 }); return data && data.ok ? data : null; } catch { return null; } }
export const setTokenProvider = (fn) => { tokenProvider = fn || (async () => null); };

async function call(path, { method = 'POST', body, timeout = 15000 } = {}) {
  const wait = limiter.take();
  if (wait > 0) await sleep(Math.min(wait, 8000));
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  try { const token = await tokenProvider(); if (token) headers.Authorization = `Bearer ${token}`; } catch { /* guests and signed-out calls have no token */ }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const t0 = performance.now();
  try {
    const res = await fetch(WORKER_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) { const err = new Error((data && data.error) || `HTTP ${res.status}`); err.status = res.status; err.retryAfter = Number(res.headers.get('Retry-After')) || 0; throw err; }
    return { data, ms };
  } catch (e) {
    if (e.name === 'AbortError') { const t = new Error('timeout'); t.status = 0; throw t; }
    throw e;
  } finally { clearTimeout(timer); }
}

export async function health() {
  try { const { data, ms } = await call('/health', { method: 'GET', timeout: 8000 }); return { ok: true, version: data.version, ms, data }; }
  catch (e) { return { ok: false, error: e.message, status: e.status }; }
}

/** Rescues the weak results of one batch on this device, two links at a time (the free services have per-minute limits). */
async function rescueBatch(results) {
  const weak = results.filter(isWeak);
  if (!weak.length) return results;
  const byUrl = new Map(results.map((r) => [r.url, r]));
  await runParallel(weak, async (r) => { byUrl.set(r.url, await rescueMeta(r)); }, { concurrency: 2, min: 1, max: 2, retries: 0 });
  return results.map((r) => byUrl.get(r.url) || r);
}

export async function fetchMeta(urls, { onBatch } = {}) {
  const out = new Map();
  const unique = [...new Set(urls)];
  const batches = chunk(unique, META_BATCH);
  await runParallel(batches, async (batch) => {
    try {
      const { data } = await call('/meta', { body: { urls: batch } });
      for (const r of data.results || []) out.set(r.url, r);
      for (const u of batch) if (!out.has(u)) out.set(u, { url: u, ok: false, error: 'no result', log: [] });
      for (const r of await rescueBatch(batch.map((u) => out.get(u)))) out.set(r.url, r);
    } catch (e) {
      if (e.status === 429 && e.retryAfter) await sleep(Math.min(e.retryAfter, 10) * 1000);
      if (e.status && e.status < 500 && e.status !== 429) { for (const u of batch) out.set(u, { url: u, ok: false, error: e.message, log: [] }); log.warn('worker', 'meta rejected', { status: e.status }); for (const r of await rescueBatch(batch.map((u) => out.get(u)))) out.set(r.url, r); onBatch?.(batch.map((u) => out.get(u))); return; }
      throw e; // transient: runParallel retries with backoff
    }
    onBatch?.(batch.map((u) => out.get(u)));
  }, { concurrency: 3, min: 1, max: 4, retries: 2, backoffMs: 800 }).then((res) => {
    // the Worker could not be reached at all for these batches: the device-side chain and the basic floor still give them a title and favicon
    return Promise.all(res.failed.map(async (f) => { for (const u of f.item) out.set(u, await rescueMeta({ url: u, ok: false, error: f.error?.message || 'failed', log: [] })); }));
  });
  return out;
}

/** v2.3.0: the dead-link checker. Ten links per Worker call, three calls at a time. Resolves to Map url -> { state: ok|dead|unsure|invalid, status, ms, finalUrl?, note? }.
 *  A call that fails after retries leaves its links "unsure" (never "dead"): a busy service must not mark good links. An old Worker without /check throws code 'old-worker'. */
export const CHECK_BATCH = 10;
export async function checkLinks(urls) {
  const out = new Map(), unique = [...new Set(urls)];
  const res = await runParallel(chunk(unique, CHECK_BATCH), async (batch) => {
    try { const { data } = await call('/check', { body: { urls: batch } }); for (const r of data.results || []) out.set(r.url, r); }
    catch (e) {
      if (e.status === 404 || e.status === 405) { const old = new Error('The Cloudflare Worker is out of date. Paste Worker 2.3.0 to check links (Settings, Advanced).'); old.code = 'old-worker'; throw old; }
      if (e.status === 429 && e.retryAfter) await sleep(Math.min(e.retryAfter, 10) * 1000);
      throw e;
    }
  }, { concurrency: 3, min: 1, max: 3, retries: 2, backoffMs: 800 });
  for (const f of res.failed) { if (f.error && f.error.code === 'old-worker') throw f.error; for (const u of f.item) out.set(u, { url: u, state: 'unsure', status: 0, ms: 0, note: 'the check service is busy' }); }
  for (const u of unique) if (!out.has(u)) out.set(u, { url: u, state: 'unsure', status: 0, ms: 0, note: 'no answer' });
  return out;
}
