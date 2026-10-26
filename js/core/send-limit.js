/**
 * Linkivo — js/core/send-limit.js  (v2.1.3)
 * Purpose: keeps e-mail sending buttons (password reset, verification) from being pressed over and over (owner report: the Settings
 *          reset row was so easy to reach that it could send many emails, which then land in spam). Two rules per kind:
 *            - the same address can not get another email for a few minutes
 *            - one device sends at most N per hour
 *          Firebase has its own server-side limit; this is the friendly client-side layer in front of it. Only time stamps and a short hash of
 *          the address are stored (never the address itself), through local-prefs.
 * API: evaluate(history, key, now, rule) -> { ok } | { ok:false, waitMs, reason }   (pure, tested)
 *      sendAllowed(kind, key) -> same     recordSend(kind, key) -> void     friendlyWait(ms) -> '3 minutes'     RULES
 */
import { prefs } from './local-prefs.js';

export const RULES = Object.freeze({
  reset: { sameMs: 5 * 60 * 1000, perHour: 5 },
  verify: { sameMs: 2 * 60 * 1000, perHour: 6 },
  emailchange: { sameMs: 2 * 60 * 1000, perHour: 4 }   // v2.2.2: the link that confirms a new account email
});
const HOUR = 3600 * 1000;

/** Short non-reversible tag for an address (FNV-1a, 32 bit): enough to tell addresses apart, not to read them back. */
export function hashKey(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text).trim().toLowerCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** Pure: may another email go out? `history` = [{ k, t }] of earlier sends. */
export function evaluate(history, key, now, rule) {
  const recent = (history || []).filter((e) => e && now - e.t < HOUR);
  const same = recent.filter((e) => e.k === key).map((e) => e.t);
  if (same.length) { const left = Math.max(...same) + rule.sameMs - now; if (left > 0) return { ok: false, waitMs: left, reason: 'same' }; }
  if (recent.length >= rule.perHour) { const left = Math.min(...recent.map((e) => e.t)) + HOUR - now; return { ok: false, waitMs: Math.max(left, 1000), reason: 'hour' }; }
  return { ok: true };
}

const read = (kind) => { const v = prefs.get('auth.sends.' + kind, []); return Array.isArray(v) ? v : []; };
export const sendAllowed = (kind, key) => evaluate(read(kind), hashKey(key), Date.now(), RULES[kind]);
export function recordSend(kind, key) {
  const now = Date.now();
  prefs.set('auth.sends.' + kind, [...read(kind).filter((e) => e && now - e.t < HOUR), { k: hashKey(key), t: now }]);
}

export function friendlyWait(ms) {
  const m = Math.ceil(ms / 60000);
  return m <= 1 ? 'a minute' : `${m} minutes`;
}
