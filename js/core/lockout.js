/**
 * Linkivo — js/core/lockout.js  (v2.5.0)
 * Purpose: the wait after wrong PINs, for a GUEST's PIN that is checked on the device. Accounts use the same steps on the Worker (worker.js lockoutMs): 5 wrong PINs 30 seconds,
 *          10: 5 minutes, 15: 1 hour, 20 or more: 6 hours; every wrong PIN from the fifth on waits again.
 * API: lockoutMs(failures) -> milliseconds    formatWait(seconds) -> "45 seconds" | "5 minutes" | "2 hours"
 */
export const lockoutMs = (n) => (n >= 20 ? 21600000 : n >= 15 ? 3600000 : n >= 10 ? 300000 : n >= 5 ? 30000 : 0);
export function formatWait(sec) {
  const s = Math.max(1, Math.ceil(sec));
  if (s < 90) return `${s} second${s === 1 ? '' : 's'}`;
  if (s < 5400) { const m = Math.ceil(s / 60); return `${m} minute${m === 1 ? '' : 's'}`; }
  const hh = Math.ceil(s / 3600); return `${hh} hour${hh === 1 ? '' : 's'}`;
}
