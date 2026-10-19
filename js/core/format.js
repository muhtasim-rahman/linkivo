/**
 * Linkivo — js/core/format.js  (v2.1.0)
 * Purpose: human-readable formatting (relative time, sizes, counts). Pure functions, easy to test.
 * API: relativeTime(ts, now?) formatBytes(n) plural(n, one, many?) compact(n) dateTime(ts)
 */
export function relativeTime(ts, now = Date.now()) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); if (d < 7) return `${d} d ago`;
  const date = new Date(ts);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en', sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const compact = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
export const dateTime = (ts) => (ts ? new Date(ts).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : '');
