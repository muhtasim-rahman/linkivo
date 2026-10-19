/**
 * Linkivo — js/core/utils.js  (v2.1.0)
 * Purpose: small dependency-free helpers shared by every module.
 * API: newId() sleep(ms) debounce(fn, ms) throttle(fn, ms) clamp(n, lo, hi) once(fn) uniq(arr) isObject(v)
 */
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Time-sortable id, safe as a database key: 8 chars of time + 8 random chars. */
export function newId(now = Date.now()) {
  const t = now.toString(36).padStart(8, '0').slice(-8);
  const bytes = new Uint8Array(8);
  (globalThis.crypto || { getRandomValues: (a) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(bytes);
  let r = '';
  for (const b of bytes) r += B36[b % 36];
  return t + r;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const uniq = (arr) => [...new Set(arr)];

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  return d;
}

export function throttle(fn, ms) {
  let last = 0, timer = null, pending = null;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); return; }
    pending = args;
    if (!timer) timer = setTimeout(() => { timer = null; last = Date.now(); fn(...pending); }, ms - (now - last));
  };
}

export function once(fn) { let done = false, v; return (...a) => (done ? v : ((done = true), (v = fn(...a)))); }
