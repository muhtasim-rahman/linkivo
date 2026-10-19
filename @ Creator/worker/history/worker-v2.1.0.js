/**
 * Linkivo Worker  (v2.1.0)  -  one Cloudflare Worker, free plan, paste this whole file into Workers & Pages > linkivo > Edit code.
 *
 * Routes in this version
 *   GET  /health   status and version
 *   POST /meta     batch metadata for up to 25 URLs (guests: 10). Body: { "urls": ["https://..."], "shot": false }
 *
 * What /meta does for each URL (first engine that returns a title or image wins; every attempt is logged):
 *   1. site handler (oEmbed) for YouTube, Vimeo, X, Reddit, TikTok, Spotify, SoundCloud
 *   2. direct fetch with a browser-like User-Agent, manual redirects (every hop re-checked by the SSRF guard), streamed and cut at </head>
 *   3. fallback services, in the order of FALLBACKS below (data-driven: reorder or remove entries here, nothing else changes)
 * The answer also carries `frameable` (can the page be shown in an iframe?) and, on request, a screenshot URL.
 *
 * Free-plan budget (verified 2026-10-18 on developers.cloudflare.com/workers/platform/limits): 100,000 requests/day, 10 ms CPU per
 * request, 50 external subrequests per request. A shared counter (SUBREQUEST_BUDGET) stops engines before the cap is hit.
 *
 * Secrets: none are needed in v2.1.0. PIN_PEPPER and FIREBASE_SERVICE_ACCOUNT arrive with v2.5.0 and live only in Cloudflare.
 * Nothing in this file is secret; the Firebase project id below is public.
 */
const VERSION = '2.1.0';

const CONFIG = {
  firebaseProject: 'linkivo',
  jwksUrl: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  origins: ['https://linkivo.web.app', 'https://linkivo.firebaseapp.com'],
  localOrigin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  maxUrlsAccount: 25,
  maxUrlsGuest: 10,
  maxBodyBytes: 65536,
  maxUrlLength: 2048,
  headCapBytes: 200000,          // stop reading a page after this many bytes, or at </head>
  directTimeoutMs: 6000,
  fallbackTimeoutMs: 4000,
  maxRedirects: 5,
  subrequestBudget: 45,          // free plan allows 50 per invocation; keep a margin for the token key fetch
  poolSize: 6,                   // simultaneous connections per invocation
  cacheTtlMs: 10 * 60 * 1000,
  cacheMax: 300,
  limits: { account: { capacity: 400, perMs: 60000 }, guest: { capacity: 60, perMs: 60000 }, ipAll: { capacity: 800, perMs: 60000 } }
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Linkivo/2.1';
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
// Sites that always refuse or challenge server-side requests: skip the direct attempt and go to the handlers/fallbacks.
const DIRECT_SKIP = ['linkedin.com', 'facebook.com', 'fb.com', 'instagram.com', 'x.com', 'twitter.com', 'threads.net'];

/* ------------------------------------------------------------------------------------------------------------- small helpers */
const hostIs = (u, domains) => domains.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
const shortErr = (e) => (e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e).slice(0, 90));
const err = (message, extra = {}) => Object.assign(new Error(message), extra);
const nowMs = () => Date.now();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

function corsHeaders(origin) {
  const ok = origin && (CONFIG.origins.includes(origin) || CONFIG.localOrigin.test(origin));
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
}

const b64urlToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

/* ------------------------------------------------------------------------------------------------------------- HTML entities */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', copy: '(c)', middot: '.' };
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(cp); } catch { return ''; } }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const clean = (s, max) => decodeEntities(String(s ?? '')).replace(/\s+/g, ' ').trim().slice(0, max);

/* ------------------------------------------------------------------------------------------------------------- URL safety (SSRF guard) */
function normalizeTarget(input) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s || s.length > CONFIG.maxUrlLength || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) s = 'https://' + s.replace(/^\/\//, '');
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  u.hash = '';
  return u;
}

function ipv4Blocked(a, b, c) {
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

function isBlockedHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) return ipv4Blocked(+v4[1], +v4[2], +v4[3]);
  if (h.includes(':')) { // IPv6
    if (h === '::' || h === '::1') return true;
    const first = parseInt(h.split(':')[0] || '0', 16);
    if (first >= 0xfc00 && first <= 0xfdff) return true;     // unique local fc00::/7
    if (first >= 0xfe80 && first <= 0xfebf) return true;     // link local fe80::/10
    if (first === 0x2002) return true;                        // 6to4 can embed private IPv4
    const tail = /(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h) || /(?:::ffff:|64:ff9b::)(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
    if (tail) {
      if (tail.length === 5) return ipv4Blocked(+tail[1], +tail[2], +tail[3]);
      const hi = parseInt(tail[1], 16), lo = parseInt(tail[2], 16);
      return ipv4Blocked(hi >> 8, hi & 255, lo >> 8);
    }
    return false;
  }
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa') || h.endsWith('.corp')) return true;
  if (!h.includes('.')) return true; // single-label names only resolve inside private networks
  return false;
}

function isBlockedUrl(u) { return isBlockedHost(u.hostname) || !ALLOWED_PORTS.has(u.port); }

/* ------------------------------------------------------------------------------------------------------------- HTML head parsing */
function parseAttrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}
const absolute = (href, base) => { if (!href) return ''; try { const u = new URL(decodeEntities(href).trim(), base); return /^https?:$/.test(u.protocol) && u.href.length <= 2048 ? u.href : ''; } catch { return ''; } };

function parseHead(html, baseUrl) {
  const meta = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (key && a.content != null && !(key in meta)) meta[key] = a.content;
  }
  const icons = [];
  let canonical = '';
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    const rel = (a.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical') && a.href) canonical = absolute(a.href, baseUrl);
    else if (rel.includes('icon') || rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) icons.push({ href: a.href, rel, sizes: a.sizes || '' });
  }
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = clean(t ? t[1] : '', 300) || clean(meta['og:title'] || meta['twitter:title'], 300);
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]{2,10})/i.exec(html.slice(0, 3000));

  const sized = icons.filter((i) => absolute(i.href, baseUrl)).map((i) => ({ ...i, px: Math.max(0, ...(i.sizes.match(/\d+/g) || [0]).map(Number)) }));
  const pick = sized.filter((i) => i.rel.includes('icon') && i.px >= 32).sort((a, b) => a.px - b.px)[0] || sized.find((i) => i.rel.includes('icon')) || sized[0];
  const video = ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream'].map((k) => absolute(meta[k], baseUrl)).find(Boolean) || '';
  const ogType = (meta['og:type'] || '').toLowerCase();
  const type = ogType.startsWith('video') ? 'video' : ogType.startsWith('music') ? 'audio' : ogType === 'article' ? 'article' : ogType === 'profile' ? 'profile' : ogType.startsWith('product') ? 'product' : video ? 'video' : 'website';
  return {
    title,
    desc: clean(meta.description || meta['og:description'] || meta['twitter:description'], 1000),
    kw: clean(meta.keywords, 200),
    lang: lang ? lang[1].toLowerCase() : '',
    author: clean(meta.author || meta['article:author'] || meta['twitter:creator'], 100),
    site: clean(meta['og:site_name'] || meta['application-name'], 100),
    canonical,
    favicon: pick ? absolute(pick.href, baseUrl) : absolute('/favicon.ico', baseUrl),
    image: absolute(meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'], baseUrl),
    video, type
  };
}

/** Can the page be shown inside an iframe on Linkivo? true / false / null (unknown, for engines that return no headers). */
function computeFrameable(headers) {
  const xfo = (headers.get('x-frame-options') || '').toLowerCase();
  if (xfo) return false; // deny, sameorigin, allow-from: none of them lets linkivo.web.app embed the page
  const csp = headers.get('content-security-policy') || '';
  const fa = /(?:^|;)\s*frame-ancestors\s+([^;]*)/i.exec(csp);
  if (fa) { const v = fa[1].toLowerCase(); return v.includes('*') && !v.includes("'none'") ? true : /linkivo\.web\.app/.test(v); }
  return true;
}

/** Streams the body and stops at </head> (or the byte cap), so a 3 MB page costs about the same as its head. */
async function readHead(res, cap = CONFIG.headCapBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const cs = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') || '');
  let dec; try { dec = new TextDecoder(cs ? cs[1] : 'utf-8'); } catch { dec = new TextDecoder('utf-8'); }
  let out = '', bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    const text = dec.decode(value, { stream: true });
    const probe = out.slice(-12) + text;
    out += text;
    if (/<\/head\s*>/i.test(probe) || bytes >= cap) break;
  }
  reader.cancel().catch(() => {});
  return out;
}

/* ------------------------------------------------------------------------------------------------------------- fetch plumbing */
function createBudget(max = CONFIG.subrequestBudget) {
  let used = 0;
  return { spend() { if (used >= max) return false; used++; return true; }, left: () => max - used, get used() { return used; }, max };
}

async function fetchTimeout(ctx, url, init, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try { return await ctx.fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(timer); }
}

/** GET with manual redirects: every hop is checked by the SSRF guard and counted against the subrequest budget. */
async function guardedGet(start, ctx, { ms, accept }) {
  let url = start;
  for (let hop = 0; hop <= CONFIG.maxRedirects; hop++) {
    if (isBlockedUrl(url)) throw err('blocked target');
    if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
    const res = await fetchTimeout(ctx, url.href, { redirect: 'manual', headers: { 'User-Agent': BROWSER_UA, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' } }, ms);
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (loc) { res.body && res.body.cancel().catch(() => {}); try { url = new URL(loc, url); } catch { throw err('bad redirect'); } continue; }
    return { res, url };
  }
  throw err('too many redirects');
}

const CHALLENGE = /^(just a moment|attention required|access denied|are you a robot|verify you are human|403 forbidden|checking your browser)/i;

async function engineDirect(u, ctx) {
  const { res, url } = await guardedGet(u, ctx, { ms: CONFIG.directTimeoutMs, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' });
  if (!res.ok) { res.body && res.body.cancel().catch(() => {}); throw err(`HTTP ${res.status}`); }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const frameable = computeFrameable(res.headers);
  if (ct && !/html|xml/.test(ct)) { // a file: image, video, pdf ...
    res.body && res.body.cancel().catch(() => {});
    const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname);
    const kind = ct.startsWith('image/') ? 'image' : ct.startsWith('video/') ? 'video' : ct.startsWith('audio/') ? 'audio' : ct.includes('pdf') ? 'pdf' : 'file';
    return { title: name, image: kind === 'image' ? url.href : '', video: kind === 'video' ? url.href : '', type: kind, frameable, finalUrl: url.href };
  }
  const html = await readHead(res);
  const p = parseHead(html, url.href);
  if ((!p.title && !p.image && !p.desc) || CHALLENGE.test(p.title)) throw err('no usable metadata');
  return { ...p, frameable, finalUrl: url.href };
}

/* ------------------------------------------------------------------------------------------------------------- site handlers (oEmbed) */
function youtubeId(u) {
  if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
  const m = /^\/(?:shorts|embed|live|v)\/([\w-]{6,})/.exec(u.pathname);
  return m ? m[1] : u.searchParams.get('v') || '';
}
const stripTags = (h) => decodeEntities(String(h || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const OEMBED = [
  { id: 'oembed:youtube', domains: ['youtube.com', 'youtu.be'], endpoint: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.href)}`,
    map: (j, u) => { const id = youtubeId(u); return { title: j.title, desc: j.author_name ? `Video by ${j.author_name}` : '', author: j.author_name, site: 'YouTube', image: j.thumbnail_url, video: id ? `https://www.youtube.com/embed/${id}` : '', type: 'video', frameable: false }; } },
  { id: 'oembed:vimeo', domains: ['vimeo.com'], endpoint: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u.href)}`,
    map: (j) => ({ title: j.title, desc: j.description, author: j.author_name, site: 'Vimeo', image: j.thumbnail_url, video: j.video_id ? `https://player.vimeo.com/video/${j.video_id}` : '', type: 'video', frameable: false }) },
  { id: 'oembed:x', domains: ['twitter.com', 'x.com'], endpoint: (u) => `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(u.href.replace('//x.com/', '//twitter.com/'))}`,
    map: (j) => ({ title: j.author_name ? `${j.author_name} on X` : 'Post on X', desc: stripTags(j.html), author: j.author_name, site: 'X', type: 'website', frameable: false }) },
  { id: 'oembed:reddit', domains: ['reddit.com'], endpoint: (u) => `https://www.reddit.com/oembed?url=${encodeURIComponent(u.href)}`,
    map: (j) => ({ title: j.title, desc: j.author_name ? `Posted by ${j.author_name}` : '', author: j.author_name, site: 'Reddit', type: 'website', frameable: false }) },
  { id: 'oembed:tiktok', domains: ['tiktok.com'], endpoint: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u.href)}`,
    map: (j) => ({ title: j.title, desc: j.author_name ? `By ${j.author_name}` : '', author: j.author_name, site: 'TikTok', image: j.thumbnail_url, type: 'video', frameable: false }) },
  { id: 'oembed:spotify', domains: ['open.spotify.com'], endpoint: (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u.href)}`,
    map: (j) => ({ title: j.title, site: 'Spotify', image: j.thumbnail_url, type: 'audio', frameable: false }) },
  { id: 'oembed:soundcloud', domains: ['soundcloud.com'], endpoint: (u) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u.href)}`,
    map: (j) => ({ title: j.title, desc: j.description, author: j.author_name, site: 'SoundCloud', image: j.thumbnail_url, type: 'audio', frameable: false }) }
];

function oembedStep(h) {
  return { id: h.id, async run(u, ctx) {
    if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
    const res = await fetchTimeout(ctx, h.endpoint(u), { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }, CONFIG.fallbackTimeoutMs);
    if (!res.ok) throw err(`HTTP ${res.status}`);
    const data = h.map(await res.json(), u);
    if (!data.title && !data.image) throw err('empty answer');
    return { ...data, finalUrl: u.href };
  } };
}

/* ------------------------------------------------------------------------------------------------------------- fallback services (ordered by free limit, highest first; edit here) */
const jsonFallback = (id, endpoint, map) => ({ id, async run(u, ctx) {
  if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
  const res = await fetchTimeout(ctx, endpoint(u), { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }, CONFIG.fallbackTimeoutMs);
  if (!res.ok) throw err(`HTTP ${res.status}`);
  const data = map(await res.json());
  if (!data || (!data.title && !data.image)) throw err('empty answer');
  return { ...data, finalUrl: u.href };
} });

const FALLBACKS = [
  // Dub.co public metatags endpoint. Free limit not documented [verify].
  jsonFallback('dub', (u) => `https://api.dub.co/metatags?url=${encodeURIComponent(u.href)}`, (j) => ({ title: j.title, desc: j.description, image: j.image })),
  // AllOrigins returns the raw page, so it is parsed like a direct fetch. No documented limit [verify].
  { id: 'allorigins', async run(u, ctx) {
    if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
    const res = await fetchTimeout(ctx, `https://api.allorigins.win/raw?url=${encodeURIComponent(u.href)}`, { headers: { 'User-Agent': BROWSER_UA } }, CONFIG.fallbackTimeoutMs);
    if (!res.ok) throw err(`HTTP ${res.status}`);
    const p = parseHead(await readHead(res), u.href);
    if ((!p.title && !p.image) || CHALLENGE.test(p.title)) throw err('no usable metadata');
    return { ...p, frameable: null, finalUrl: u.href };
  } },
  // JSONLink. Free limit [verify].
  jsonFallback('jsonlink', (u) => `https://jsonlink.io/api/extract?url=${encodeURIComponent(u.href)}`, (j) => ({ title: j.title, desc: j.description, image: Array.isArray(j.images) ? j.images[0] : '', favicon: j.favicon, site: j.sitename, author: j.author })),
  // Microlink: the free plan is very small (about 50 requests a day [verify]), so it comes last.
  jsonFallback('microlink', (u) => `https://api.microlink.io?url=${encodeURIComponent(u.href)}`, (j) => (j.status === 'success' && j.data ? { title: j.data.title, desc: j.data.description, image: j.data.image && j.data.image.url, favicon: j.data.logo && j.data.logo.url, author: j.data.author, site: j.data.publisher, lang: j.data.lang, video: j.data.video && j.data.video.url } : null))
];

/* ------------------------------------------------------------------------------------------------------------- one URL, whole chain */
const resultCache = new Map();

async function metaForUrl(input, ctx, opts = {}) {
  const t0 = nowMs();
  const log = [];
  const base = { url: input, ok: false, log };
  const u = normalizeTarget(input);
  if (!u) return { ...base, error: 'invalid URL' };
  if (isBlockedUrl(u)) return { ...base, error: 'blocked target' };

  const hit = resultCache.get(u.href);
  if (hit && nowMs() - hit.t < CONFIG.cacheTtlMs) return { ...hit.result, url: input, cached: true, ms: 0 };

  const steps = [];
  const site = OEMBED.find((h) => hostIs(u, h.domains));
  if (site) steps.push(oembedStep(site));
  if (!hostIs(u, DIRECT_SKIP)) steps.push({ id: 'direct', run: engineDirect });
  steps.push(...FALLBACKS);

  let data = null, used = '';
  for (const step of steps) {
    if (ctx.budget.left() <= 0) { log.push({ engine: step.id, ok: false, error: 'subrequest budget used up' }); break; }
    const s = nowMs();
    try { data = await step.run(u, ctx); used = step.id; log.push({ engine: step.id, ok: true, ms: nowMs() - s }); break; }
    catch (e) { log.push({ engine: step.id, ok: false, ms: nowMs() - s, error: shortErr(e) }); }
  }
  if (!data) return { ...base, error: 'every engine failed', ms: nowMs() - t0 };

  const host = u.hostname.replace(/^www\./, '');
  const result = {
    url: input, ok: true,
    title: clean(data.title, 300), desc: clean(data.desc, 1000), kw: clean(data.kw, 200), lang: data.lang || '', author: clean(data.author, 100), site: clean(data.site, 100),
    canonical: data.canonical || '', favicon: absolute(data.favicon, u.href) || `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
    image: absolute(data.image, u.href), video: absolute(data.video, u.href), type: data.type || 'website',
    frameable: data.frameable === undefined ? null : data.frameable, engine: used, finalUrl: data.finalUrl || u.href, log, ms: nowMs() - t0
  };
  if (opts.shot) result.shot = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(result.finalUrl)}?w=1200&h=800`;
  resultCache.set(u.href, { t: nowMs(), result });
  if (resultCache.size > CONFIG.cacheMax) resultCache.delete(resultCache.keys().next().value);
  return result;
}

async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } }));
  return out;
}

/* ------------------------------------------------------------------------------------------------------------- Firebase ID token (RS256, Google public keys) */
let jwksCache = { keys: null, exp: 0, at: 0 };

async function getJwks(ctx, force = false) {
  if (!force && jwksCache.keys && nowMs() < jwksCache.exp) return jwksCache.keys;
  if (ctx.budget && !ctx.budget.spend()) throw err('subrequest budget used up');
  const res = await ctx.fetch(CONFIG.jwksUrl);
  if (!res.ok) throw err('could not load token keys');
  const body = await res.json();
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  jwksCache = { keys: body.keys || [], exp: nowMs() + (maxAge ? Number(maxAge[1]) : 3600) * 1000, at: nowMs() };
  return jwksCache.keys;
}

async function verifyIdToken(token, ctx, { project = CONFIG.firebaseProject, now = nowMs() } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw err('malformed token');
  let header, payload;
  try { header = b64urlToJson(parts[0]); payload = b64urlToJson(parts[1]); } catch { throw err('malformed token'); }
  if (header.alg !== 'RS256' || !header.kid) throw err('unsupported token');
  let keys = await getJwks(ctx);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk && nowMs() - jwksCache.at > 60000) { keys = await getJwks(ctx, true); jwk = keys.find((k) => k.kid === header.kid); }
  if (!jwk) throw err('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!ok) throw err('bad signature');
  const sec = Math.floor(now / 1000);
  if (payload.aud !== project || payload.iss !== `https://securetoken.google.com/${project}`) throw err('wrong audience');
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) throw err('no subject');
  if (!(payload.exp > sec) || !(payload.iat <= sec + 60)) throw err('token expired');
  return { uid: payload.sub, email: payload.email || '', authTime: payload.auth_time || 0 };
}

/* ------------------------------------------------------------------------------------------------------------- rate limits (per isolate: cheap, and enough to stop casual abuse) */
const buckets = new Map();
function takeTokens(key, cost, { capacity, perMs }, now = nowMs()) {
  let b = buckets.get(key);
  if (!b) { b = { tokens: capacity, last: now }; buckets.set(key, b); }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / perMs) * capacity);
  b.last = now;
  if (b.tokens >= cost) { b.tokens -= cost; return { ok: true }; }
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.last > perMs * 2) buckets.delete(k);
  return { ok: false, retryAfter: Math.max(1, Math.ceil(((cost - b.tokens) / capacity) * (perMs / 1000))) };
}

/* ------------------------------------------------------------------------------------------------------------- routes */
async function readJsonBody(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > CONFIG.maxBodyBytes) throw err('too_large', { status: 413 });
  const text = await request.text();
  if (text.length > CONFIG.maxBodyBytes) throw err('too_large', { status: 413 });
  try { return JSON.parse(text); } catch { throw err('bad_request', { status: 400, detail: 'Body must be JSON' }); }
}

async function handleMeta(request, ctx, cors) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  let user = null;
  const auth = request.headers.get('authorization') || '';
  if (auth) {
    if (!/^Bearer\s+\S+$/i.test(auth)) return json({ ok: false, error: 'unauthorized' }, 401, cors);
    try { user = await verifyIdToken(auth.replace(/^Bearer\s+/i, ''), ctx); } catch { return json({ ok: false, error: 'unauthorized', message: 'Sign in again' }, 401, cors); }
  }
  let body;
  try { body = await readJsonBody(request); } catch (e) { return json({ ok: false, error: e.message, message: e.detail }, e.status || 400, cors); }
  const urls = body && body.urls;
  const max = user ? CONFIG.maxUrlsAccount : CONFIG.maxUrlsGuest;
  if (!Array.isArray(urls) || urls.length === 0 || urls.some((s) => typeof s !== 'string' || s.length > CONFIG.maxUrlLength)) return json({ ok: false, error: 'bad_request', message: 'Send { "urls": [ ... ] }' }, 400, cors);
  if (urls.length > max) return json({ ok: false, error: 'too_many_urls', message: `At most ${max} URLs per request`, max }, 413, cors);

  const who = user ? { key: 'u:' + user.uid, cfg: CONFIG.limits.account } : { key: 'g:' + ip, cfg: CONFIG.limits.guest };
  const a = takeTokens(who.key, urls.length, who.cfg), b = takeTokens('ip:' + ip, urls.length, CONFIG.limits.ipAll);
  if (!a.ok || !b.ok) { const retryAfter = Math.max(a.retryAfter || 0, b.retryAfter || 0); return json({ ok: false, error: 'rate_limited', retryAfter }, 429, { ...cors, 'Retry-After': String(retryAfter) }); }

  const results = await mapPool(urls, CONFIG.poolSize, (u) => metaForUrl(u, ctx, { shot: body.shot === true }).catch((e) => ({ url: u, ok: false, error: shortErr(e), log: [] })));
  return json({ ok: true, version: VERSION, results, budget: { used: ctx.budget.used, max: ctx.budget.max } }, 200, cors);
}

async function route(request, env, deps = {}) {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin);
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return new Response(null, { status: cors['Access-Control-Allow-Origin'] ? 204 : 403, headers: cors });
  if (origin && !cors['Access-Control-Allow-Origin']) return json({ ok: false, error: 'forbidden_origin' }, 403, cors);
  const ctx = { fetch: deps.fetch || ((...a) => fetch(...a)), budget: createBudget() };
  try {
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, version: VERSION, time: nowMs(), project: CONFIG.firebaseProject }, 200, cors);
    if (url.pathname === '/meta' && request.method === 'POST') return await handleMeta(request, ctx, cors);
    if (url.pathname === '/health' || url.pathname === '/meta') return json({ ok: false, error: 'method_not_allowed' }, 405, cors);
    return json({ ok: false, error: 'not_found' }, 404, cors);
  } catch (e) {
    return json({ ok: false, error: 'internal' }, 500, cors);
  }
}

export default {
  fetch: (request, env) => route(request, env),
  // Pure functions exposed for the unit tests in @ Creator/tests/worker.test.mjs. Harmless in production.
  __test: { CONFIG, FALLBACKS, OEMBED, jsonFallback, guardedGet, normalizeTarget, isBlockedHost, isBlockedUrl, parseHead, computeFrameable, readHead, decodeEntities, metaForUrl, verifyIdToken, takeTokens, route, createBudget, youtubeId, resetCaches() { resultCache.clear(); buckets.clear(); jwksCache = { keys: null, exp: 0, at: 0 }; } }
};
