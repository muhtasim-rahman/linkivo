/**
 * Linkivo — js/core/worker-client.js  (v2.1.1)
 * Purpose: the only code that talks to the Cloudflare Worker. Adds the Firebase ID token for account users (guests send none and
 *          get stricter server limits), applies timeouts, splits big lists into batches of 25 and retries with backoff.
 * API: setTokenProvider(fn)   health() -> { ok, version, ms }   fetchMeta(urls, { onBatch }) -> Map<url, result>   META_BATCH
 *   A meta result: { url, ok, title, desc, kw, lang, author, site, canonical, favicon, image, video, type, frameable,
 *                    engine, log:[{engine, ok, ms, error?}], ms, error? }
 */
import { WORKER_URL } from './config.js';
import { createRateLimiter } from './rate-limiter.js';
import { chunk, runParallel } from '../engine/chunker.js';
import { sleep } from './utils.js';
import { log } from './logger.js';

export const META_BATCH = 25;
let tokenProvider = async () => null;
const limiter = createRateLimiter({ capacity: 40, perMs: 60000 });
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

export async function fetchMeta(urls, { onBatch, fresh = false } = {}) {
  const out = new Map();
  const unique = [...new Set(urls)];
  const batches = chunk(unique, META_BATCH);
  await runParallel(batches, async (batch) => {
    try {
      const { data } = await call('/meta', { body: fresh ? { urls: batch, fresh: true } : { urls: batch } });
      for (const r of data.results || []) out.set(r.url, r);
      for (const u of batch) if (!out.has(u)) out.set(u, { url: u, ok: false, error: 'no result', log: [] });
    } catch (e) {
      if (e.status === 429 && e.retryAfter) await sleep(Math.min(e.retryAfter, 10) * 1000);
      if (e.status && e.status < 500 && e.status !== 429) { for (const u of batch) out.set(u, { url: u, ok: false, error: e.message, log: [] }); log.warn('worker', 'meta rejected', { status: e.status }); return; }
      throw e; // transient: runParallel retries with backoff
    }
    onBatch?.(batch.map((u) => out.get(u)));
  }, { concurrency: 2, min: 1, max: 3, retries: 2, backoffMs: 800 }).then((res) => {
    for (const f of res.failed) for (const u of f.item) out.set(u, { url: u, ok: false, error: f.error?.message || 'failed', log: [] });
  });
  return out;
}
