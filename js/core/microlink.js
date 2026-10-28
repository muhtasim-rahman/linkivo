/**
 * Linkivo — js/core/microlink.js  (v2.3.1)
 * Purpose: Microlink as the FIRST metadata source (owner request). Its free endpoint is limited per caller address, so each user's own browser asks it
 *          (never the Worker: one shared Worker address would give all users one shared limit). It reads the widest range of pages and also returns video,
 *          audio and the page logo. When the daily allowance is used up, the switch is off, or a call fails, the normal chain (Worker, then device
 *          services) takes over. Every answer is stored once per link (linkMeta), so the same link never costs a second call.
 *          The day's count is kept on this device (UTC day) and corrected from the `x-rate-limit-*` response headers when the browser may read them.
 * API: ML_DEFAULT_LIMIT (25)   quota() -> { limit, used, left, day }   mlEnabled() -> boolean   canUseMicrolink() -> boolean
 *      mapMicrolink(data, url) -> result | null   (the shape fetchMeta returns, plus `audio`)
 *      microlinkMeta(url, { fetch?, now? }) -> Promise<result | null>   (null = not used / failed; never throws)
 *      subscribeQuota(fn) -> off      (called when the numbers change, for the little counter in Settings and Preview)
 */
import { prefs } from './local-prefs.js';
import { log } from './logger.js';

export const ML_DEFAULT_LIMIT = 25;
const K_ON = 'meta.microlink', K_DAY = 'ml.day';
const subs = new Set();
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);
const emit = () => { for (const f of [...subs]) { try { f(quota()); } catch { /* a listener must not break the call */ } } };

export const mlEnabled = () => prefs.get(K_ON, true) !== false;
export function quota(now = Date.now()) {
  const st = prefs.get(K_DAY, null), day = dayOf(now);
  const cur = st && st.day === day ? st : { day, used: 0, limit: ML_DEFAULT_LIMIT };
  const limit = Number(cur.limit) > 0 ? Number(cur.limit) : ML_DEFAULT_LIMIT, used = Math.max(0, Number(cur.used) || 0);
  return { day, limit, used, left: Math.max(0, limit - used) };
}
export const canUseMicrolink = (now = Date.now()) => mlEnabled() && quota(now).left > 0;
export const subscribeQuota = (fn) => { subs.add(fn); return () => subs.delete(fn); };
function save(q, patch) { prefs.set(K_DAY, { day: q.day, used: q.used, limit: q.limit, ...patch }); emit(); }

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const urlOf = (v) => { const u = v && typeof v === 'object' ? v.url : v; return typeof u === 'string' && /^https?:\/\//i.test(u) ? u.slice(0, 2048) : undefined; };

/** Microlink `data` -> the result shape the app already uses (worker-client.js). null when nothing readable came back. */
export function mapMicrolink(d, url) {
  if (!d || typeof d !== 'object') return null;
  const r = { url, ok: true, engine: 'microlink', title: str(d.title, 300), desc: str(d.description, 2000), lang: str(d.lang, 16), author: str(d.author, 120), site: str(d.publisher, 120),
    canonical: urlOf(d.url) && urlOf(d.url) !== url ? urlOf(d.url) : undefined, favicon: urlOf(d.logo), image: urlOf(d.image), video: urlOf(d.video), audio: urlOf(d.audio), published: str(d.date, 40) };
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  if (!r.title && !r.desc && !r.image && !r.video) return null;
  return r;
}

let inflight = 0;
export async function microlinkMeta(url, { fetch: f = (typeof fetch === 'function' ? fetch : null), now = Date.now() } = {}) {
  if (!f || !canUseMicrolink(now)) return null;
  const q = quota(now), t0 = Date.now();
  inflight++;
  try {
    const res = await f(`https://api.microlink.io/?url=${encodeURIComponent(url)}&video=true&audio=true`, { headers: { Accept: 'application/json' } });
    // the real numbers, when the browser lets us read the headers (the server may not expose them: then our own count stands)
    const hl = Number(res.headers && res.headers.get && res.headers.get('x-rate-limit-limit')), hr = res.headers && res.headers.get && res.headers.get('x-rate-limit-remaining');
    const limit = hl > 0 ? hl : q.limit;
    const used = hr != null && hr !== '' && Number.isFinite(Number(hr)) ? Math.max(0, limit - Number(hr)) : q.used + 1;
    save(q, { limit, used });
    if (res.status === 429) { save(q, { limit, used: limit }); log.info('microlink', 'daily limit reached'); return null; }
    if (!res.ok) return null;
    const j = await res.json();
    const out = j && j.status === 'success' ? mapMicrolink(j.data, url) : null;
    if (out) out.log = [{ engine: 'microlink', ok: true, ms: Date.now() - t0 }];
    return out;
  } catch (e) { log.warn('microlink', 'call failed', { message: e && e.message }); return null; }
  finally { inflight--; }
}
