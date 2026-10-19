/**
 * Linkivo — js/engine/chunker.js  (v2.1.0)
 * Purpose: the two primitives every bulk operation uses (RULES section 4): split into chunks of 100 and run chunks in
 *          parallel with an adaptive limit (default 4, between 2 and 6) and exponential backoff on errors.
 * API: chunk(items, size=100) -> items[][]
 *      runParallel(items, worker(item, index), opts) -> Promise<{ ok, failed:[{index,item,error}], stopped, status[], limit }>
 *   opts: concurrency=4 min=2 max=6 adaptive=true growEvery=6 retries=2 backoffMs=300 maxBackoffMs=5000
 *         shouldStop() -> boolean (checked before each task starts; running tasks finish)  onProgress({done,total,failed,limit})
 *         sleep(ms) (injectable for tests)   error.fatal=true skips retries.
 *   status[i] is 'ok' | 'failed' | undefined (never started, because of stop).
 */
export function chunk(items, size = 100) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function runParallel(items, worker, opts = {}) {
  const o = { concurrency: 4, min: 2, max: 6, adaptive: true, growEvery: 6, retries: 2, backoffMs: 300, maxBackoffMs: 5000, sleep: realSleep, ...opts };
  let limit = Math.min(o.max, Math.max(o.min, o.concurrency));
  let active = 0, next = 0, ok = 0, streak = 0, stopped = false;
  const failed = [];
  const status = new Array(items.length);

  return new Promise((resolve) => {
    const finishIfDone = () => {
      if (active === 0 && (stopped || next >= items.length)) resolve({ ok, failed, stopped, status, limit });
    };
    const attempt = async (i) => {
      for (let t = 0; ; t++) {
        try { return await worker(items[i], i); }
        catch (e) {
          if (t >= o.retries || (e && e.fatal)) throw e;
          streak = 0;
          if (o.adaptive) limit = Math.max(o.min, limit - 1);
          await o.sleep(Math.min(o.maxBackoffMs, o.backoffMs * 2 ** t) * (0.75 + Math.random() * 0.5));
        }
      }
    };
    const pump = () => {
      if (!stopped && o.shouldStop && o.shouldStop()) stopped = true;
      while (!stopped && active < limit && next < items.length) {
        const i = next++;
        active++;
        attempt(i).then(() => { status[i] = 'ok'; ok++; streak++; if (o.adaptive && streak >= o.growEvery && limit < o.max) { limit++; streak = 0; } },
          (error) => { status[i] = 'failed'; failed.push({ index: i, item: items[i], error }); streak = 0; })
          .finally(() => { active--; if (o.onProgress) { try { o.onProgress({ done: ok + failed.length, total: items.length, failed: failed.length, limit }); } catch { /* ignore */ } } pump(); });
      }
      finishIfDone();
    };
    pump();
  });
}
