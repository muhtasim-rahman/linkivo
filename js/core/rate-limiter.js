/**
 * Linkivo — js/core/rate-limiter.js  (v2.1.0)
 * Purpose: client-side token bucket so a bug or a huge import can not hammer the Worker (free plan: 100k requests/day).
 * API: createRateLimiter({ capacity, perMs, now }) -> { take() -> waitMs (0 = go ahead) }
 */
export function createRateLimiter({ capacity = 30, perMs = 60000, now = Date.now } = {}) {
  let tokens = capacity, last = now();
  return {
    take() {
      const t = now();
      tokens = Math.min(capacity, tokens + ((t - last) / perMs) * capacity);
      last = t;
      if (tokens >= 1) { tokens -= 1; return 0; }
      return Math.ceil(((1 - tokens) / capacity) * perMs);
    }
  };
}
