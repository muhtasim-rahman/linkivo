/**
 * Linkivo Worker  (v2.1.1)  -  one Cloudflare Worker, free plan, paste this whole file into Workers & Pages > linkivo > Edit code.
 *
 * Routes in this version
 *   GET  /health   status and version
 *   POST /meta     batch metadata for up to 25 URLs (guests: 10). Body: { "urls": ["https://..."], "shot": false, "fresh": false }
 *
 * What /meta does (v2.1.1). Two passes, so one hard URL can not starve the others of the shared subrequest budget:
 *   Pass 1, every URL:   site handler (oEmbed: YouTube, Vimeo, X, Reddit, TikTok, Spotify, SoundCloud) and/or a direct fetch with a browser-like
 *                        User-Agent; redirects are followed by hand and every hop is checked by the SSRF guard; the page is streamed and cut
 *                        shortly after </head>.
 *   Pass 2, failures:    "rescue" engines, at most 2 per URL, in this order: crawler (the same fetch with a link-preview crawler User-Agent, which
 *                        many sites answer with their Open Graph tags), jina (r.jina.ai reader), wayback (the Internet Archive copy), microlink.
 *                        Dub.co, AllOrigins and JSONLink were removed in v2.1.1: from Cloudflare's shared addresses they answered HTML, timed out
 *                        or refused (403) every time in the owner's test.
 * What it reads: title, description, keywords (or derived ones), language, author, site name, canonical, favicon and a large icon, image,
 *   video, type, published/modified dates, theme color, locale, RSS feeds; from the head tags, Open Graph / Twitter tags, JSON-LD and, when the
 *   head has no description, the first paragraph. `frameable` tells whether the page can be shown in an iframe.
 *
 * Free-plan budget (docs checked 2026-10-18): 100,000 requests/day, 10 ms CPU per request, 50 external subrequests per request. The owner's test
 * showed the platform cutting in before a counter of 45, so SUBREQUEST_BUDGET is 36 and every engine spends from one shared counter.
 *
 * Secrets: none are needed in v2.1.1. PIN_PEPPER and FIREBASE_SERVICE_ACCOUNT arrive with v2.5.0 and live only in Cloudflare.
 */
const VERSION = '2.1.1';

const CONFIG = {
  firebaseProject: 'linkivo',
  jwksUrl: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  origins: ['https://linkivo.web.app', 'https://linkivo.firebaseapp.com'],
  localOrigin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  maxUrlsAccount: 25,
  maxUrlsGuest: 10,
  maxBodyBytes: 65536,
  maxUrlLength: 2048,
  headCapBytes: 160000,          // stop reading a page after this many bytes
  bodyExtraChars: 30000,         // read this much AFTER </head> (first paragraph, JSON-LD in the body)
  directTimeoutMs: 6000,
  fallbackTimeoutMs: 5000,
  maxRedirects: 5,
  subrequestBudget: 36,
  rescueAttempts: 2,
  poolSize: 6,
  cacheTtlMs: 10 * 60 * 1000,
  cacheMax: 300,
  limits: { account: { capacity: 400, perMs: 60000 }, guest: { capacity: 60, perMs: 60000 }, ipAll: { capacity: 800, perMs: 60000 } }
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Linkivo/2.1';
const CRAWLER_UA = 'Mozilla/5.0 (compatible; Linkivo-Preview/2.1; +https://linkivo.web.app) facebookexternalhit/1.1 Twitterbot/1.0';
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
// Sites that always refuse or challenge plain server-side requests: skip the direct attempt, go to the handlers and the rescue pass.
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

/* ------------------------------------------------------------------------------------------------------------- HTML parsing */
function parseAttrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}
const absolute = (href, base) => { if (!href || typeof href !== 'string') return ''; try { const u = new URL(decodeEntities(href).trim(), base); return /^https?:$/.test(u.protocol) && u.href.length <= 2048 ? u.href : ''; } catch { return ''; } };
const stripTags = (h) => decodeEntities(String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** JSON-LD (schema.org) nodes from <script type="application/ld+json">, flattened (@graph, arrays). At most 6 scripts of 60 KB. */
function parseJsonLd(html) {
  const nodes = [];
  let n = 0;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (++n > 6) break;
    if (m[1].length > 60000) continue;
    let data; try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { nodes.push(x); if (x['@graph']) walk(x['@graph']); } };
    walk(data);
  }
  const typeOf = (x) => asList(x['@type']).join(',');
  const pri = /(Article|NewsArticle|BlogPosting|Report|VideoObject|Product|Recipe|Movie|Book|Event|WebPage|CollectionPage|ItemPage|Course)/;
  const main = nodes.find((x) => pri.test(typeOf(x)) && (x.headline || x.name)) || nodes.find((x) => x.headline || x.name);
  const org = nodes.find((x) => /Organization|WebSite/.test(typeOf(x)) && x.name);
  if (!main && !org) return null;
  const img = (v) => { const f = asList(v)[0]; return typeof f === 'string' ? f : f && (f.url || f.contentUrl) || ''; };
  const name = (v) => { const f = asList(v)[0]; return typeof f === 'string' ? f : f && f.name || ''; };
  return {
    title: main ? main.headline || main.name || '' : '', desc: main ? main.description || '' : '', image: main ? img(main.image || main.thumbnailUrl) : '',
    kw: main ? asList(main.keywords).join(', ') : '', author: main ? name(main.author) : '', published: main ? main.datePublished || main.uploadDate || '' : '', modified: main ? main.dateModified || '' : '',
    site: (main && name(main.publisher)) || (org && org.name) || '', logo: org ? img(org.logo) : ''
  };
}

const STOP = new Set('about after again also because been before being between both could does doing down during each from have having here into just like made make many more most much only other over same should some such than that their them then there these they this those through under until very want were what when where which while will with would your the and for are but not you all can has her was one our out his how its who get new use'.split(' '));
/** Keywords from the title and description when the page has none (most frequent meaningful words, in order of first use). */
function autoKeywords(text, limit = 8) {
  const count = new Map();
  for (const w of String(text).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]{3,}/gu) || []) if (!STOP.has(w)) count.set(w, (count.get(w) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map((e) => e[0]).join(', ');
}

function parseHead(html, baseUrl, body = '') {
  const meta = {}, tags = [], images = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (!key || a.content == null) continue;
    if (key === 'article:tag') tags.push(a.content);
    if (key === 'og:image' || key === 'og:image:url') images.push(a.content);
    if (!(key in meta)) meta[key] = a.content;
  }
  const icons = [], feeds = [];
  let canonical = '', imageSrc = '';
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    const rel = (a.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical') && a.href) canonical = absolute(a.href, baseUrl);
    else if (rel.includes('image_src') && a.href) imageSrc = a.href;
    else if (rel.includes('alternate') && /rss|atom/i.test(a.type || '') && a.href && feeds.length < 3) feeds.push(absolute(a.href, baseUrl));
    else if (rel.includes('icon') || rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) icons.push({ href: a.href, rel, sizes: a.sizes || '' });
  }
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]{2,10})/i.exec(html.slice(0, 3000));

  let title = clean(t ? t[1] : '', 300) || clean(meta['og:title'] || meta['twitter:title'], 300);
  let desc = clean(meta.description || meta['og:description'] || meta['twitter:description'] || meta['dc.description'], 1000);
  let image = absolute(meta['og:image:secure_url'] || images[0] || meta['twitter:image'] || meta['twitter:image:src'] || meta['itemprop:image'] || meta.image || imageSrc, baseUrl);
  let kw = clean(meta.keywords || meta['news_keywords'] || tags.join(', '), 200);
  let author = clean(meta.author || meta['article:author'] || meta['twitter:creator'], 100);
  let site = clean(meta['og:site_name'] || meta['application-name'], 100);
  let published = clean(meta['article:published_time'] || meta['og:published_time'] || meta['date'] || meta['dc.date'], 40), modified = clean(meta['article:modified_time'] || meta['og:updated_time'], 40);

  // fill the gaps from JSON-LD, then from the page body (cheap: only runs when something is missing)
  if (!title || !desc || !image || !kw || !author || !site || !published) {
    const ld = parseJsonLd(html + body.slice(0, 40000));
    if (ld) {
      title = title || clean(ld.title, 300); desc = desc || clean(ld.desc, 1000); image = image || absolute(ld.image || ld.logo, baseUrl);
      kw = kw || clean(ld.kw, 200); author = author || clean(ld.author, 100); site = site || clean(ld.site, 100); published = published || clean(ld.published, 40); modified = modified || clean(ld.modified, 40);
    }
  }
  if (body && (!title || !desc)) {
    if (!title) { const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body); if (h1) title = clean(stripTags(h1[1]), 300); }
    if (!desc) {
      let k = 0;
      for (const m of body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
        if (++k > 14) break;
        const text = stripTags(m[1]);
        if (text.length >= 70 && !/cookie|javascript|subscribe|sign in|log in|privacy policy/i.test(text)) { desc = clean(text, 300); break; }
      }
    }
  }

  const sized = icons.filter((i) => absolute(i.href, baseUrl)).map((i) => ({ ...i, px: Math.max(0, ...(i.sizes.match(/\d+/g) || [0]).map(Number)) }));
  const pick = sized.filter((i) => i.rel.includes('icon') && i.px >= 32).sort((a, b) => a.px - b.px)[0] || sized.find((i) => i.rel.includes('icon')) || sized[0];
  const big = [...sized].sort((a, b) => (b.px || (b.rel.includes('apple-touch-icon') ? 180 : 0)) - (a.px || (a.rel.includes('apple-touch-icon') ? 180 : 0)))[0];
  const video = ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream'].map((k) => absolute(meta[k], baseUrl)).find(Boolean) || '';
  const ogType = (meta['og:type'] || '').toLowerCase();
  const type = ogType.startsWith('video') ? 'video' : ogType.startsWith('music') ? 'audio' : ogType === 'article' ? 'article' : ogType === 'profile' ? 'profile' : ogType.startsWith('product') ? 'product' : video ? 'video' : 'website';
  const kwAuto = !kw;
  if (kwAuto) kw = autoKeywords(`${title} ${desc}`);
  return {
    title, desc, kw, kwAuto, lang: lang ? lang[1].toLowerCase() : '', author, site, canonical,
    favicon: pick ? absolute(pick.href, baseUrl) : absolute('/favicon.ico', baseUrl), iconLarge: big && big.px >= 96 || big && big.rel.includes('apple-touch-icon') ? absolute(big.href, baseUrl) : '',
    image, video, type, published, modified, themeColor: clean(meta['theme-color'], 20), locale: clean(meta['og:locale'], 12), feeds: feeds.filter(Boolean)
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

/** Streams the body; returns { head, body }: everything up to </head>, then up to `extra` more characters. Stops early so a 3 MB page costs about the same as its top. */
async function readPage(res, cap = CONFIG.headCapBytes, extra = 0) {
  if (!res.body) return { head: '', body: '' };
  const reader = res.body.getReader();
  const cs = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') || '');
  let dec; try { dec = new TextDecoder(cs ? cs[1] : 'utf-8'); } catch { dec = new TextDecoder('utf-8'); }
  let out = '', bytes = 0, headEnd = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    const text = dec.decode(value, { stream: true });
    const probeFrom = Math.max(0, out.length - 12);
    out += text;
    if (headEnd < 0) { const m = /<\/head\s*>/i.exec(out.slice(probeFrom)); if (m) headEnd = probeFrom + m.index + m[0].length; }
    if (headEnd >= 0 && out.length - headEnd >= extra) break;
    if (bytes >= cap) break;
  }
  reader.cancel().catch(() => {});
  return headEnd < 0 ? { head: out, body: '' } : { head: out.slice(0, headEnd), body: out.slice(headEnd) };
}
async function readHead(res, cap = CONFIG.headCapBytes) { return (await readPage(res, cap, 0)).head; }

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
async function guardedGet(start, ctx, { ms, accept, ua = BROWSER_UA }) {
  let url = start;
  for (let hop = 0; hop <= CONFIG.maxRedirects; hop++) {
    if (isBlockedUrl(url)) throw err('blocked target');
    if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
    const res = await fetchTimeout(ctx, url.href, { redirect: 'manual', headers: { 'User-Agent': ua, Accept: accept, 'Accept-Language': 'en-US,en;q=0.9' } }, ms);
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (loc) { res.body && res.body.cancel().catch(() => {}); try { url = new URL(loc, url); } catch { throw err('bad redirect'); } continue; }
    return { res, url };
  }
  throw err('too many redirects');
}

const CHALLENGE = /^(just a moment|attention required|access denied|are you a robot|verify you are human|403 forbidden|checking your browser|please wait|robot check|captcha|human verification)/i;
const HTTP_HINT = { 530: 'site not found (DNS)', 522: 'site did not answer', 523: 'site unreachable', 524: 'site timed out' };
const httpError = (status) => err(`HTTP ${status}${HTTP_HINT[status] ? ' ' + HTTP_HINT[status] : ''}`);

async function fetchPage(u, ctx, { ua, ms = CONFIG.directTimeoutMs, baseUrl = null, finalUrl = null }) {
  const { res, url } = await guardedGet(u, ctx, { ms, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', ua });
  if (!res.ok) { res.body && res.body.cancel().catch(() => {}); throw httpError(res.status); }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const frameable = computeFrameable(res.headers);
  if (ct && !/html|xml/.test(ct)) { // a file: image, video, pdf, json ...
    res.body && res.body.cancel().catch(() => {});
    const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname);
    const kind = ct.startsWith('image/') ? 'image' : ct.startsWith('video/') ? 'video' : ct.startsWith('audio/') ? 'audio' : ct.includes('pdf') ? 'pdf' : ct.includes('json') ? 'json' : 'file';
    return { title: name, image: kind === 'image' ? url.href : '', video: kind === 'video' ? url.href : '', type: kind, frameable, finalUrl: url.href };
  }
  const { head, body } = await readPage(res, CONFIG.headCapBytes, CONFIG.bodyExtraChars);
  const p = parseHead(head, baseUrl || url.href, body);
  if ((!p.title && !p.image && !p.desc) || CHALLENGE.test(p.title)) throw err('no usable metadata');
  return { ...p, frameable, finalUrl: finalUrl || url.href };
}

const engineDirect = (u, ctx) => fetchPage(u, ctx, { ua: BROWSER_UA });
const engineCrawler = (u, ctx) => fetchPage(u, ctx, { ua: CRAWLER_UA });

/** Internet Archive copy: the closest snapshot's own head still holds the original title and tags. Costs 2 subrequests (redirect hop + page). */
async function engineWayback(u, ctx) {
  if (ctx.budget.left() < 2) throw err('subrequest budget used up', { budget: true });
  const r = await fetchPage(new URL('https://web.archive.org/web/2id_/' + u.href), ctx, { ua: BROWSER_UA, ms: CONFIG.fallbackTimeoutMs + 2000, baseUrl: u.href, finalUrl: u.href });
  return { ...r, frameable: null, archived: true };
}

/** Jina Reader (r.jina.ai): renders the page for us and answers JSON with title and description. Free tier is rate limited per address [verify]. */
async function engineJina(u, ctx) {
  if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
  const res = await fetchTimeout(ctx, 'https://r.jina.ai/' + u.href, { headers: { Accept: 'application/json', 'User-Agent': BROWSER_UA, 'X-Return-Format': 'markdown' } }, CONFIG.fallbackTimeoutMs + 2000);
  if (!res.ok) { res.body && res.body.cancel().catch(() => {}); throw httpError(res.status); }
  const j = await res.json().catch(() => null);
  const d = j && (j.data || j);
  if (!d || (!d.title && !d.description)) throw err('empty answer');
  if (CHALLENGE.test(String(d.title || ''))) throw err('no usable metadata');
  const first = String(d.content || '').split(/\n{2,}/).map((x) => stripTags(x.replace(/[#*_>`\[\]()!-]/g, ' '))).find((x) => x.length >= 70) || '';
  return { title: d.title, desc: d.description || first, published: d.publishedTime || '', type: 'website', frameable: null, finalUrl: u.href };
}

/* ------------------------------------------------------------------------------------------------------------- site handlers (oEmbed) */
function youtubeId(u) {
  if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
  const m = /^\/(?:shorts|embed|live|v)\/([\w-]{6,})/.exec(u.pathname);
  return m ? m[1] : u.searchParams.get('v') || '';
}

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
    if (!res.ok) { res.body && res.body.cancel().catch(() => {}); throw httpError(res.status); }
    if (!/json/i.test(res.headers.get('content-type') || '')) throw err('answer was not JSON');
    const data = h.map(await res.json(), u);
    if (!data.title && !data.image) throw err('empty answer');
    return { ...data, finalUrl: u.href };
  } };
}

/** Microlink: the free plan is very small (about 50 requests a day [verify]) and its answer is JSON only when it is not rate limited. */
const microlink = { id: 'microlink', async run(u, ctx) {
  if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
  const res = await fetchTimeout(ctx, `https://api.microlink.io?url=${encodeURIComponent(u.href)}`, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }, CONFIG.fallbackTimeoutMs);
  if (!res.ok) { res.body && res.body.cancel().catch(() => {}); throw httpError(res.status); }
  if (!/json/i.test(res.headers.get('content-type') || '')) throw err('answer was not JSON');
  const j = await res.json();
  const d = j.status === 'success' && j.data;
  if (!d || (!d.title && !(d.image && d.image.url))) throw err('empty answer');
  return { title: d.title, desc: d.description, image: d.image && d.image.url, favicon: d.logo && d.logo.url, author: d.author, site: d.publisher, lang: d.lang, video: d.video && d.video.url, frameable: null, finalUrl: u.href };
} };

/** Rescue engines, in order. Edit this list to reorder or replace them; nothing else changes. */
const RESCUE = [{ id: 'crawler', run: engineCrawler }, { id: 'jina', run: engineJina }, { id: 'wayback', run: engineWayback }, microlink];
const FALLBACKS = RESCUE; // name kept for older tests and docs

/* ------------------------------------------------------------------------------------------------------------- one URL: pass 1, rescue, result */
const resultCache = new Map();
const NO_RESCUE = /HTTP (404|410|451|530|52\d)|blocked target|bad redirect|too many redirects|invalid/i;

async function primaryPhase(input, ctx, opts = {}) {
  const st = { input, t0: nowMs(), log: [], data: null, used: '', u: null, result: null };
  const u = normalizeTarget(input);
  if (!u) { st.result = { url: input, ok: false, log: st.log, error: 'invalid URL' }; return st; }
  if (isBlockedUrl(u)) { st.result = { url: input, ok: false, log: st.log, error: 'blocked target' }; return st; }
  st.u = u;
  const hit = !opts.fresh && resultCache.get(u.href);
  if (hit && nowMs() - hit.t < CONFIG.cacheTtlMs) { st.result = { ...hit.result, url: input, cached: true, ms: 0 }; return st; }
  const steps = [];
  const site = OEMBED.find((h) => hostIs(u, h.domains));
  if (site) steps.push(oembedStep(site));
  if (!hostIs(u, DIRECT_SKIP)) steps.push({ id: 'direct', run: engineDirect });
  await runSteps(st, steps, ctx);
  return st;
}

async function runSteps(st, steps, ctx) {
  for (const step of steps) {
    if (st.data) break;
    if (ctx.budget.left() <= 0) { st.log.push({ engine: step.id, ok: false, error: 'subrequest budget used up' }); break; }
    const s = nowMs();
    try { st.data = await step.run(st.u, ctx); st.used = step.id; st.log.push({ engine: step.id, ok: true, ms: nowMs() - s }); }
    catch (e) { st.log.push({ engine: step.id, ok: false, ms: nowMs() - s, error: shortErr(e) }); }
  }
}

function worthRescue(st) {
  if (st.result || st.data || !st.u) return false;
  const last = [...st.log].reverse().find((l) => !l.ok && !/budget/.test(l.error || ''));
  return !last || !NO_RESCUE.test(last.error || '');
}

async function rescuePhase(st, ctx, max = CONFIG.rescueAttempts) {
  let tried = 0;
  for (const step of RESCUE) {
    if (st.data || tried >= max) break;
    if (ctx.budget.left() <= 0) { st.log.push({ engine: step.id, ok: false, error: 'subrequest budget used up' }); break; }
    tried++;
    await runSteps(st, [step], ctx);
  }
}

function finish(st, opts = {}) {
  if (st.result) return st.result;
  const u = st.u;
  if (!st.data) return { url: st.input, ok: false, log: st.log, error: 'every engine failed', ms: nowMs() - st.t0 };
  const data = st.data, host = u.hostname.replace(/^www\./, '');
  const result = {
    url: st.input, ok: true,
    title: clean(data.title, 300), desc: clean(data.desc, 1000), kw: clean(data.kw, 200), kwAuto: !!data.kwAuto, lang: data.lang || '', author: clean(data.author, 100), site: clean(data.site, 100),
    canonical: data.canonical || '', favicon: absolute(data.favicon, u.href) || `https://www.google.com/s2/favicons?domain=${host}&sz=64`, iconLarge: absolute(data.iconLarge, u.href),
    image: absolute(data.image, u.href), video: absolute(data.video, u.href), type: data.type || 'website',
    published: data.published || '', modified: data.modified || '', themeColor: data.themeColor || '', locale: data.locale || '', feeds: data.feeds || [],
    frameable: data.frameable === undefined ? null : data.frameable, archived: !!data.archived,
    engine: st.used, finalUrl: data.finalUrl || u.href, log: st.log, ms: nowMs() - st.t0
  };
  if (opts.shot) result.shot = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(result.finalUrl)}?w=1200&h=800`;
  resultCache.set(u.href, { t: nowMs(), result });
  if (resultCache.size > CONFIG.cacheMax) resultCache.delete(resultCache.keys().next().value);
  return result;
}

/** One URL, both passes (used for single lookups and tests). /meta uses the two passes across ALL urls so the budget is shared fairly. */
async function metaForUrl(input, ctx, opts = {}) {
  const st = await primaryPhase(input, ctx, opts);
  if (worthRescue(st)) await rescuePhase(st, ctx, opts.rescueAttempts);
  return finish(st, opts);
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

  const opts = { shot: body.shot === true, fresh: body.fresh === true };
  const states = await mapPool(urls, CONFIG.poolSize, (u) => primaryPhase(u, ctx, opts).catch((e) => ({ input: u, result: { url: u, ok: false, error: shortErr(e), log: [] } })));
  const rescue = states.filter((st) => worthRescue(st));
  await mapPool(rescue, CONFIG.poolSize, (st) => rescuePhase(st, ctx).catch(() => {}));
  const results = states.map((st) => { try { return finish(st, opts); } catch (e) { return { url: st.input, ok: false, error: shortErr(e), log: st.log || [] }; } });
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
  __test: { CONFIG, RESCUE, FALLBACKS, OEMBED, guardedGet, normalizeTarget, isBlockedHost, isBlockedUrl, parseHead, parseJsonLd, autoKeywords, computeFrameable, readHead, readPage, decodeEntities, metaForUrl, primaryPhase, rescuePhase, worthRescue, finish, verifyIdToken, takeTokens, route, createBudget, youtubeId, resetCaches() { resultCache.clear(); buckets.clear(); jwksCache = { keys: null, exp: 0, at: 0 }; } }
};
