/**
 * Linkivo — js/core/device-info.js  (v2.2.2)
 * Purpose: pure helpers for the "Logged-in devices" list: a readable description of a browser from its user-agent text, the record that is stored
 *          for a device, and the rule that decides whether another device asked this one to sign out. No DOM, no network: unit-tested.
 *          The user-agent string is only parsed on the device itself; the database keeps the short result (browser, system, kind), never the raw text.
 * API: parseUserAgent(ua) -> { br, os, kind }      deviceName({ br, os, kind }) -> string      newDeviceId() -> string
 *      buildDeviceRecord({ ua, via, where, ts, seen }) -> record (schema DEVICE)      signOutRequested(rv, loginAt) -> boolean      locationText(rec) -> string
 */
const rand = () => (typeof crypto !== 'undefined' && crypto.getRandomValues ? [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 18));
export const newDeviceId = () => 'd' + rand();

export function parseUserAgent(ua = '') {
  const u = String(ua);
  let br = 'Browser';
  if (/Edg(e|A|iOS)?\//.test(u)) br = 'Edge';
  else if (/OPR\/|Opera/.test(u)) br = 'Opera';
  else if (/SamsungBrowser\//.test(u)) br = 'Samsung Internet';
  else if (/Firefox\/|FxiOS\//.test(u)) br = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(u)) br = 'Chrome';
  else if (/Safari\//.test(u)) br = 'Safari';
  let os = 'Unknown system';
  if (/Windows NT 10|Windows NT 11/.test(u)) os = 'Windows';
  else if (/Windows/.test(u)) os = 'Windows';
  else if (/Android/.test(u)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(u)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(u)) os = 'macOS';
  else if (/CrOS/.test(u)) os = 'ChromeOS';
  else if (/Linux|X11/.test(u)) os = 'Linux';
  const kind = /iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u)) ? 'tablet' : /Mobile|iPhone|iPod|Android/.test(u) ? 'phone' : 'computer';
  return { br, os, kind };
}
export const deviceName = ({ br, os, kind }) => `${br} on ${os}${kind === 'phone' ? ' (phone)' : kind === 'tablet' ? ' (tablet)' : ''}`.slice(0, 60);

/** `where` is the Worker's /whoami answer (may be null: old Worker, offline). Every field is cut to the length the database rules allow. */
export function buildDeviceRecord({ ua, via = 'web', where = null, ts, seen }) {
  const d = parseUserAgent(ua), w = where || {};
  const rec = { name: deviceName(d), br: d.br, os: d.os, kind: d.kind, via: via === 'pwa' ? 'pwa' : 'web', ts, seen };
  for (const [k, max] of [['ip', 40], ['city', 60], ['reg', 60], ['cc', 2], ['tz', 60]]) {
    const v = k === 'reg' ? w.region : w[k];
    if (typeof v === 'string' && v.trim()) rec[k] = v.trim().slice(0, max);
  }
  return rec;
}

/** Another device wrote `rv` (a time) on this device's record. It counts only when it is NEWER than the last time the user signed in here on purpose,
 *  so signing in again on a device that was signed out remotely is never undone by the old request. */
export const signOutRequested = (rv, loginAt = 0) => typeof rv === 'number' && rv > 0 && rv > (loginAt || 0);

export function locationText(rec) {
  const parts = [rec.city, rec.reg && rec.reg !== rec.city ? rec.reg : '', rec.cc].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Location not available';
}
