/**
 * Linkivo — js/core/meta-fallback.js  (v2.1.3)
 * Purpose: makes sure every link gets AT LEAST a real title and a favicon, even when the Cloudflare Worker could not read the page.
 *          Why it exists: sites such as NYT, Stack Overflow, Instagram and LinkedIn answer a data-centre address (the Worker) with 403 or 429, but
 *          answer a normal visitor. Several free metadata services do the same: they refuse the Worker's shared address yet work when called
 *          from the user's own device. The v1 metadata prototype got everything for exactly that reason. So when the Worker result is weak
 *          (failed, or only a title guessed from the URL) this device asks the services itself, in order of how generous their free limits are:
 *            1 Dub metatags (free, no key, ~60 per minute)   2 Jina Reader (20 per minute per address, no key)   3 AllOrigins (no published
 *            limit [verify])   4 JSONLink (limit not published [verify])   5 Microlink (25 per day, so last, and counted locally).
 *          The last floor never fails: a title from the URL and the favicon from Google's favicon service (no key, no published limit [verify]).
 *          Privacy: the services see the link. The setting "meta.browserFallback" (Settings > Advanced) turns the device-side calls off; the
 *          floor (no network except the favicon image itself) stays.
 *          Pages are never inserted into the DOM: HTML is only scanned with regular expressions for a few meta tags.
 * API: rescueMeta(result, opts) -> Promise<result>        isWeak(result)        ensureBasics(result)        basicFromUrl(url)
 *      faviconFor(url)  parseHtmlMeta(html, baseUrl)  titleOk(title, url)  mergeMeta(base, extra, engine)  PROVIDERS  resetFallbackState()
 *      opts: { enabled(): bool, providers, fetchImpl, now(), deadlineMs, perCallMs }   (all optional; the tests inject fakes)
 */
import { prefs } from './local-prefs.js';
import { createRateLimiter } from './rate-limiter.js';

const BLOCK_TITLES = /^(just a moment|attention required|access denied|forbidden|403|429|too many requests|are you a (robot|human)|robot check|security check|please verify|verify you are human|one more step|checking your browser|error|blocked|captcha|cloudflare|ddos protection|pardon our interruption)/i;
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const clean = (v, max = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Favicon floor: Google's favicon service answers for almost any domain. */
export function faviconFor(url) { const host = hostOf(url); return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : ''; }

/** Title and site guessed from the address alone: last path words, else the site name. Never empty for a valid URL. */
export function basicFromUrl(url) {
  let u; try { u = new URL(url); } catch { return { title: '', site: '', favicon: '' }; }
  const host = u.hostname.replace(/^www\./, '');
  const site = host.split('.').slice(-2, -1)[0] || host;
  const words = decodeURIComponent((u.pathname.split('/').filter(Boolean).pop() || '').replace(/\.[a-z0-9]{2,5}$/i, '')).replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nice = words && !/^\d+$/.test(words) && words.length > 2 ? words.charAt(0).toUpperCase() + words.slice(1) : '';
  const siteName = site.charAt(0).toUpperCase() + site.slice(1);
  return { title: clean(nice ? `${nice} - ${siteName}` : host), site: siteName, favicon: faviconFor(url) };
}

/** A title worth keeping: not empty, not just the host name, not a bot-check or error page title. */
export function titleOk(title, url) {
  const t = clean(title);
  if (t.length < 2) return false;
  if (BLOCK_TITLES.test(t)) return false;
  const host = hostOf(url);
  return t.toLowerCase() !== host.toLowerCase();
}

/** Worker results that still need help: failed, guessed from the URL only, or without a usable title. */
export function isWeak(r) { return !r || !r.ok || r.partial === true || !titleOk(r.title, r.url); }

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unescapeHtml = (s) => String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});

/** Pure: pulls the basic tags out of an HTML string. Only the first 300 KB are scanned. */
export function parseHtmlMeta(html, baseUrl = '') {
  const head = String(html || '').slice(0, 300000);
  const metas = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    const key = (/\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
    const val = (/\bcontent\s*=\s*"([^"]*)"/i.exec(tag) || /\bcontent\s*=\s*'([^']*)'/i.exec(tag) || [])[1];
    if (key && val !== undefined && !(key.toLowerCase() in metas)) metas[key.toLowerCase()] = unescapeHtml(val);
  }
  const titleTag = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head) || [])[1];
  const abs = (v) => { try { return v ? new URL(v, baseUrl || undefined).href : ''; } catch { return ''; } };
  let favicon = '';
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    if (/\brel\s*=\s*["'][^"']*\bicon\b/i.test(tag)) { favicon = abs((/\bhref\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1]); if (favicon) break; }
  }
  const canon = (() => { for (const tag of head.match(/<link\b[^>]*>/gi) || []) if (/\brel\s*=\s*["']canonical["']/i.test(tag)) return abs((/\bhref\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1]); return ''; })();
  return {
    title: clean(metas['og:title'] || metas['twitter:title'] || (titleTag ? unescapeHtml(titleTag) : '')),
    desc: clean(metas['og:description'] || metas['twitter:description'] || metas.description, 1000),
    image: abs(metas['og:image'] || metas['twitter:image']), site: clean(metas['og:site_name'], 80), author: clean(metas.author, 80),
    lang: clean((/<html[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(head) || [])[1], 20), kw: clean(metas.keywords, 200), favicon, canonical: canon
  };
}

/** Pure: fills only the EMPTY fields of `base` from `extra`; a usable title found by a fallback replaces a guessed one. */
export function mergeMeta(base, extra, engine) {
  const out = { ...base };
  const real = titleOk(extra.title, base.url);
  if (real && (base.partial === true || !base.ok || !titleOk(base.title, base.url))) out.title = clean(extra.title);
  for (const k of ['desc', 'kw', 'lang', 'author', 'site', 'canonical', 'favicon', 'image']) if (!out[k] && extra[k]) out[k] = clean(extra[k], k === 'desc' ? 1000 : 400);
  if (real) { out.ok = true; out.partial = false; out.engine = engine; delete out.error; }
  return out;
}

/** The floor: a result that failed or is partial always carries a title and a favicon (except blocked and invalid targets). */
export function ensureBasics(r) {
  if (!r || /blocked|invalid/i.test(r.error || '')) return r;
  const b = basicFromUrl(r.url);
  if (!b.title) return r;
  const out = { ...r };
  const hadTitle = titleOk(out.title, out.url);
  if (!hadTitle) { out.title = b.title; out.ok = true; out.partial = true; out.engine = out.engine || 'basic'; delete out.error; }
  if (!out.site) out.site = b.site;
  if (!out.favicon) out.favicon = b.favicon;
  return out;
}

// ---- providers (browser side). Each returns the fields it found or throws. ------------------------------------------------------------
const enc = encodeURIComponent;
async function getJson(f, url, opts, signal) {
  const res = await f(url, { ...opts, signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error('not JSON');
  return JSON.parse(text);
}
export const PROVIDERS = [
  { id: 'dub', perMin: 50, async run(url, f, signal) { const d = await getJson(f, `https://api.dub.co/metatags?url=${enc(url)}`, {}, signal); return { title: d.title, desc: d.description, image: d.image }; } },
  { id: 'jina', perMin: 18, async run(url, f, signal) { const d = await getJson(f, `https://r.jina.ai/${url}`, { headers: { Accept: 'application/json' } }, signal); const x = d.data || d; return { title: x.title, desc: x.description, image: (x.images && Object.values(x.images)[0]) || '' }; } },
  { id: 'allorigins', perMin: 30, async run(url, f, signal) { const d = await getJson(f, `https://api.allorigins.win/get?url=${enc(url)}`, {}, signal); if (!d.contents) throw new Error('empty'); return parseHtmlMeta(d.contents, url); } },
  { id: 'jsonlink', perMin: 20, async run(url, f, signal) { const d = await getJson(f, `https://jsonlink.io/api/extract?url=${enc(url)}`, {}, signal); return { title: d.title, desc: d.description, image: (d.images || [])[0], site: d.sitename, favicon: d.favicon }; } },
  { id: 'microlink', perMin: 0, dailyMax: 20, async run(url, f, signal) { const d = await getJson(f, `https://api.microlink.io/?url=${enc(url)}`, {}, signal); const x = d.data || {}; if (d.status && d.status !== 'success') throw new Error(d.status); return { title: x.title, desc: x.description, image: x.image && x.image.url, favicon: x.logo && x.logo.url, site: x.publisher, author: x.author, lang: x.lang }; } }
];

// per-provider health: a provider that fails 3 times in a row, or answers 429, is skipped for a while (shared by all links in this session)
const state = new Map();
const limiters = new Map();
export function resetFallbackState() { state.clear(); limiters.clear(); }
const st = (id) => { if (!state.has(id)) state.set(id, { fails: 0, until: 0 }); return state.get(id); };
function dailyOk(p, now) {
  if (!p.dailyMax) return true;
  const day = new Date(now).toISOString().slice(0, 10), rec = prefs.get('meta.daily.' + p.id, null);
  return !(rec && rec.day === day && rec.n >= p.dailyMax);
}
function countDaily(p, now) {
  if (!p.dailyMax) return;
  const day = new Date(now).toISOString().slice(0, 10), rec = prefs.get('meta.daily.' + p.id, null);
  prefs.set('meta.daily.' + p.id, rec && rec.day === day ? { day, n: rec.n + 1 } : { day, n: 1 });
}

/** The whole rescue for one result. Never throws; always returns a result with a title and favicon when the target is valid. */
export async function rescueMeta(result, opts = {}) {
  const now = opts.now || Date.now;
  const providers = opts.providers || PROVIDERS;
  const f = opts.fetchImpl || ((...a) => fetch(...a));
  const enabled = opts.enabled ? opts.enabled() : prefs.get('meta.browserFallback', true);
  let r = { ...result, log: [...(result.log || [])] };
  if (!isWeak(r) || !r.url || /blocked|invalid/i.test(r.error || '')) return r;
  if (enabled) {
    const deadline = now() + (opts.deadlineMs ?? 9000);
    for (const p of providers) {
      if (now() >= deadline) break;
      const s = st(p.id);
      if (s.until > now() || !dailyOk(p, now())) continue;
      if (p.perMin) { if (!limiters.has(p.id)) limiters.set(p.id, createRateLimiter({ capacity: p.perMin, perMs: 60000 })); if (limiters.get(p.id).take() > 1500) continue; }
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), opts.perCallMs ?? 4500), t0 = now();
      try {
        countDaily(p, now());
        const found = await p.run(r.url, f, ctrl.signal);
        const ms = now() - t0;
        if (titleOk(found && found.title, r.url)) { r = mergeMeta(r, found, 'browser:' + p.id); r.log.push({ engine: 'browser:' + p.id, ok: true, ms }); s.fails = 0; break; }
        r.log.push({ engine: 'browser:' + p.id, ok: false, ms, error: 'no usable title' });
      } catch (e) {
        const err = e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'failed';
        r.log.push({ engine: 'browser:' + p.id, ok: false, ms: now() - t0, error: err });
        s.fails += 1;
        if (e && e.status === 429) s.until = now() + (p.dailyMax ? 3600000 : 60000);
        else if (s.fails >= 3) { s.until = now() + 300000; s.fails = 0; }
      } finally { clearTimeout(timer); }
    }
  }
  return ensureBasics(r);
}
