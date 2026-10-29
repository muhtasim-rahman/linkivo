/**
 * Linkivo — js/core/microlink.js  (v2.3.1)
 * Purpose: Microlink as the FIRST metadata source (owner request). Its free endpoint is limited per caller address, so each user's own browser asks it
 *          (never the Worker: one shared Worker address would give all users one shared limit). It reads the widest range of pages and also returns video,
 *          audio and the page logo. When the daily allowance is used up, the switch is off, or a call fails, the normal chain (Worker, then device
 *          services) takes over. Every answer is stored once per link (linkMeta), so the same link never costs a second call.
 *          The day's count is kept on this device (UTC day) and corrected from the `x-rate-limit-*` response headers when the browser may read them.
 *          v2.3.2 (verified in Microlink's rate-limit docs, 2026-10-29): the free endpoint WITHOUT an API key allows 5 requests per window per IP address and 2 at a
 *          time (a 429 with ECONCURRENCY only means "wait a second"); 25 a day belongs to a free API KEY, which in a browser would be shared by every user.
 *          So the default is 5, the real numbers come from `x-rate-limit-limit`, `x-rate-limit-remaining` and `x-rate-limit-reset` (epoch seconds), and the
 *          window ends at that reset time, not at a fixed midnight.
 *          v2.3.2: `lastAttempt()` says why the last call gave nothing ('off', 'limit', 'busy', 'error', 'empty'); an answer with nothing readable returns
 *          { empty: true } so the caller can remember that Microlink was asked and does not ask again for the same link.
 * API: ML_DEFAULT_LIMIT (5)   lastAttempt() -> { ok, reason, ms }   quota() -> { limit, used, left, day }   mlEnabled() -> boolean   canUseMicrolink() -> boolean
 *      mapMicrolink(data, url) -> result | null   (the shape fetchMeta returns, plus `audio`)
 *      microlinkMeta(url, { fetch?, now? }) -> Promise<result | null>   (null = not used / failed; never throws)
 *      subscribeQuota(fn) -> off      (called when the numbers change, for the little counter in Settings and Preview)
 */
import { prefs } from './local-prefs.js';
import { log } from './logger.js';

export const ML_DEFAULT_LIMIT = 5;
const K_ON = 'meta.microlink', K_DAY = 'ml.day';
const subs = new Set();
const dayOf = (now) => new Date(now).toISOString().slice(0, 10);
const emit = () => { for (const f of [...subs]) { try { f(quota()); } catch { /* a listener must not break the call */ } } };

export const mlEnabled = () => prefs.get(K_ON, true) !== false;
export function quota(now = Date.now()) {
  const st = prefs.get(K_DAY, null), day = dayOf(now);
  // the stored window is valid until its reset time (when the server told us one), else for the same UTC day
  const live = st && (st.reset ? now < st.reset : st.day === day);
  const cur = live ? st : { day, used: 0, limit: st && Number(st.limit) > 0 ? st.limit : ML_DEFAULT_LIMIT, reset: 0 };
  const limit = Number(cur.limit) > 0 ? Number(cur.limit) : ML_DEFAULT_LIMIT, used = Math.max(0, Number(cur.used) || 0);
  return { day, limit, used, left: Math.max(0, limit - used), reset: Number(cur.reset) || 0 };
}
export const canUseMicrolink = (now = Date.now()) => mlEnabled() && quota(now).left > 0;
export const subscribeQuota = (fn) => { subs.add(fn); return () => subs.delete(fn); };
function save(q, patch) { prefs.set(K_DAY, { day: q.day, used: q.used, limit: q.limit, reset: q.reset, ...patch }); emit(); }

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

/** A 429 body carries a code; ECONCURRENCY means "too many at the same time". An unreadable body counts as a real limit. */
async function isConcurrency(res) { try { const j = await (res.clone ? res.clone() : res).json(); return !!j && j.code === 'ECONCURRENCY'; } catch { return false; } }

let inflight = 0, attempt = { ok: false, reason: 'off', ms: 0 };
export const lastAttempt = () => attempt;
export async function microlinkMeta(url, { fetch: f = (typeof fetch === 'function' ? fetch : null), now = Date.now() } = {}) {
  if (!f || !canUseMicrolink(now)) { attempt = { ok: false, reason: mlEnabled() ? 'limit' : 'off', ms: 0 }; return null; }
  const q = quota(now), t0 = Date.now();
  inflight++;
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}&video=true&audio=true`;
    let res = await f(endpoint, { headers: { Accept: 'application/json' } });
    // 2 requests at a time are allowed: a 429 with ECONCURRENCY is not "used up", wait a second and try once more
    if (res.status === 429 && await isConcurrency(res)) { await new Promise((r) => setTimeout(r, 1100)); res = await f(endpoint, { headers: { Accept: 'application/json' } }); }
    // the real numbers, when the browser lets us read the headers (the server may not expose them: then our own count stands)
    const hl = Number(res.headers && res.headers.get && res.headers.get('x-rate-limit-limit')), hr = res.headers && res.headers.get && res.headers.get('x-rate-limit-remaining');
    const hz = Number(res.headers && res.headers.get && res.headers.get('x-rate-limit-reset')), reset = hz > 0 ? hz * 1000 : q.reset;
    const limit = hl > 0 ? hl : q.limit;
    const used = hr != null && hr !== '' && Number.isFinite(Number(hr)) ? Math.max(0, limit - Number(hr)) : q.used + 1;
    if (res.status === 429) {
      if (await isConcurrency(res)) { log.info('microlink', 'too many at once'); attempt = { ok: false, reason: 'busy', ms: Date.now() - t0 }; return null; }   // busy, not used up
      save(q, { limit, used: limit, reset }); log.info('microlink', 'limit reached'); attempt = { ok: false, reason: 'limit', ms: Date.now() - t0 }; return null;
    }
    save(q, { limit, used, reset });
    if (!res.ok) { attempt = { ok: false, reason: 'error', ms: Date.now() - t0 }; return null; }
    const j = await res.json();
    const out = j && j.status === 'success' ? mapMicrolink(j.data, url) : null;
    const ms = Date.now() - t0;
    if (!out) { attempt = { ok: false, reason: 'empty', ms }; return { empty: true, ok: false, engine: 'microlink', log: [{ engine: 'microlink', ok: false, ms, error: 'nothing readable' }] }; }
    attempt = { ok: true, reason: '', ms };
    out.log = [{ engine: 'microlink', ok: true, ms }];
    return out;
  } catch (e) { log.warn('microlink', 'call failed', { message: e && e.message }); attempt = { ok: false, reason: 'error', ms: Date.now() - t0 }; return null; }
  finally { inflight--; }
}
