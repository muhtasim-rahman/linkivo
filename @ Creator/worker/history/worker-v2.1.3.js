/**
 * Linkivo Worker  (v2.1.3)  -  one Cloudflare Worker, free plan, paste this whole file into Workers & Pages > linkivo > Edit code.
 *
 * Routes in this version
 *   GET  /health   status and version
 *   POST /meta     batch metadata. Body: { "urls": ["https://..."], "shot": false }. The app sends 6 URLs per call (accounts may send 25, guests 10).
 *
 * What /meta does for each URL. Every attempt is logged; the first engine that returns a REAL title wins, weaker answers are kept and
 * completed from later engines (image from one, description from another):
 *   1. site handler (oEmbed) for YouTube, Vimeo, X, Reddit, TikTok, Spotify, SoundCloud
 *   2. direct fetch with a browser User-Agent; when the site blocks it (403, 429, 503, a captcha page) the same fetch is repeated as the
 *      link-preview crawlers of Facebook and X, which most sites (news, social, shops) answer with full Open Graph tags
 *   3. Jina Reader (renders the page like a browser), then the fallback services in FALLBACKS, then the Wayback Machine snapshot
 *   4. nothing worked but the site is alive: a PARTIAL result built from the URL itself (title from the path, site name, favicon), so every
 *      link can be stored with a decent name. Only dead pages (404, 410) and unknown domains come back ok:false.
 * Third-party services that fail 3 times in a row are skipped for 5 minutes (circuit breaker) so they stop eating the subrequest budget.
 * The answer also carries `frameable` (can the page be shown in an iframe?) and, on request, a screenshot URL.
 *
 * Free-plan limits (verified 2026-10-22 on developers.cloudflare.com/workers/platform/limits): 100,000 requests/day, 10 ms CPU per
 * request, 50 subrequests per request. Budget: 30 per call, split fairly between the URLs of the call (a URL never uses more than 6).
 *
 * Secrets: none are needed in v2.1.2. PIN_PEPPER and FIREBASE_SERVICE_ACCOUNT arrive with v2.5.0 and live only in Cloudflare.
 * Nothing in this file is secret; the Firebase project id below is public.
 */
// 2.1.3: version bump only, no behavior change. The app now compares this number with the one it expects and warns in Settings > App when the
// deployed Worker is older (the owner's test run in v2.1.2 showed the OLD engine list, so the new worker.js had not been pasted).
const VERSION = '2.1.3';

const CONFIG = {
  firebaseProject: 'linkivo',
  jwksUrl: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  origins: ['https://linkivo.web.app', 'https://linkivo.firebaseapp.com'],
  localOrigin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  maxUrlsAccount: 25,
  maxUrlsGuest: 10,
  maxBodyBytes: 65536,
  maxUrlLength: 2048,
  headCapBytes: 150000,          // stop reading a page after this many bytes, or at </head> (less to parse = less CPU, the free plan has 10 ms)
  directTimeoutMs: 6000,
  fallbackTimeoutMs: 4000,
  jinaTimeoutMs: 9000,           // Jina renders the page in a browser, so it needs longer than a plain service
  maxRedirects: 5,
  subrequestBudget: 30,          // free plan allows 50 per invocation; v2.1.0 used 45 and still hit the runtime error on 25-URL calls, so keep a wide margin
  perUrlMax: 6, perUrlMin: 3,    // a URL never uses more than perUrlMax subrequests; with many URLs in one call each gets at least perUrlMin
  poolSize: 6,                   // simultaneous connections per invocation
  cacheTtlMs: 10 * 60 * 1000,
  cacheMax: 300,
  limits: { account: { capacity: 400, perMs: 60000 }, guest: { capacity: 60, perMs: 60000 }, ipAll: { capacity: 800, perMs: 60000 } }
};

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Linkivo/2.1';
// Link-preview crawlers: sites that block ordinary servers still answer these with Open Graph tags (that is what a link preview is).
const UA_FACEBOOK = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
const UA_TWITTER = 'Twitterbot/1.0';
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
// Sites whose browser view is a login wall: the browser-UA attempt is pointless, go straight to the preview crawlers.
const SOCIAL_HOSTS = ['linkedin.com', 'facebook.com', 'fb.com', 'instagram.com', 'x.com', 'twitter.com', 'threads.net', 'threads.com'];

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

const str = (v) => (typeof v === 'string' ? v : '');
const nameOf = (v) => (Array.isArray(v) ? nameOf(v[0]) : v && typeof v === 'object' ? str(v.name) : str(v));
const imageOf = (v) => (Array.isArray(v) ? imageOf(v[0]) : v && typeof v === 'object' ? str(v.url || v.contentUrl) : str(v));

/** Second source of truth: schema.org JSON-LD (news and shop sites often have better data here than in <meta>). Bounded for CPU. */
function parseJsonLd(html) {
  const out = {};
  let n = 0;
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (++n > 4 || m[1].length > 100000) continue;
    let data; try { data = JSON.parse(m[1]); } catch { continue; }
    const nodes = [];
    const walk = (x, d = 0) => { if (!x || typeof x !== 'object' || d > 4) return; if (Array.isArray(x)) { x.forEach((y) => walk(y, d + 1)); return; } nodes.push(x); if (x['@graph']) walk(x['@graph'], d + 1); };
    walk(data);
    for (const x of nodes) {
      if (!/Article|Posting|Product|VideoObject|WebPage|Recipe|Movie|Book|Event|SoftwareApplication|Course|Organization|Person/i.test([].concat(x['@type'] || []).join(' '))) continue;
      out.title ||= str(x.headline || x.name); out.desc ||= str(x.description); out.image ||= imageOf(x.image || x.thumbnailUrl);
      out.author ||= nameOf(x.author); out.published ||= str(x.datePublished || x.uploadDate || x.dateCreated); out.site ||= nameOf(x.publisher);
      out.kw ||= Array.isArray(x.keywords) ? x.keywords.join(', ') : str(x.keywords);
    }
  }
  return out;
}

/** "en.wikipedia.org" -> "Wikipedia", "www.bbc.co.uk" -> "Bbc": a readable site name when the page does not give one. */
function prettyHost(hostname) {
  const parts = hostname.replace(/^www\./, '').split('.');
  if (parts.length > 1) parts.pop(); // the TLD
  if (parts.length > 1 && ['co', 'com', 'org', 'net', 'gov', 'edu', 'ac'].includes(parts[parts.length - 1])) parts.pop(); // bbc.co.uk
  const label = parts[parts.length - 1] || hostname;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function parseHead(html, baseUrl) {
  const meta = {}, tags = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    const key = (a.property || a.name || a.itemprop || '').toLowerCase();
    if (!key || a.content == null) continue;
    if (!(key in meta)) meta[key] = a.content;
    if (key === 'article:tag' && tags.length < 12) tags.push(clean(a.content, 40));
  }
  const icons = [];
  let canonical = '', rss = '';
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = parseAttrs(m[0]);
    const rel = (a.rel || '').toLowerCase().split(/\s+/);
    if (rel.includes('canonical') && a.href) canonical = absolute(a.href, baseUrl);
    else if (rel.includes('alternate') && /rss|atom/i.test(a.type || '') && a.href && !rss) rss = absolute(a.href, baseUrl);
    else if (rel.includes('icon') || rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) icons.push({ href: a.href, rel, sizes: a.sizes || '' });
  }
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let title = clean(t ? t[1] : '', 300) || clean(meta['og:title'] || meta['twitter:title'], 300);
  const lang = /<html\b[^>]*\blang\s*=\s*["']?([a-zA-Z-]{2,10})/i.exec(html.slice(0, 3000));

  const sized = icons.filter((i) => absolute(i.href, baseUrl)).map((i) => ({ ...i, px: Math.max(0, ...(i.sizes.match(/\d+/g) || [0]).map(Number)) }));
  const pick = sized.filter((i) => i.rel.includes('icon') && i.px >= 32).sort((a, b) => a.px - b.px)[0] || sized.find((i) => i.rel.includes('icon')) || sized[0];
  const video = ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream'].map((k) => absolute(meta[k], baseUrl)).find(Boolean) || '';
  const ogType = (meta['og:type'] || '').toLowerCase();
  const type = ogType.startsWith('video') ? 'video' : ogType.startsWith('music') ? 'audio' : ogType === 'article' ? 'article' : ogType === 'profile' ? 'profile' : ogType.startsWith('product') ? 'product' : video ? 'video' : 'website';

  let desc = clean(meta.description || meta['og:description'] || meta['twitter:description'], 1000);
  let image = absolute(meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'], baseUrl);
  // article:author is often a profile URL, not a name: take the first candidate that is not a URL
  let author = [meta.author, meta['article:author'], meta['twitter:creator'], meta['twitter:site']].map((x) => clean(x, 100)).find((x) => x && !/^https?:/i.test(x)) || '';
  let published = clean(meta['article:published_time'] || meta['og:article:published_time'] || meta.date || meta.pubdate || meta['dc.date'] || meta['dcterms.created'] || meta.datepublished, 40);
  let site = clean(meta['og:site_name'] || meta['application-name'] || meta['apple-mobile-web-app-title'] || meta['twitter:app:name:iphone'], 100);
  let kw = clean(meta.keywords || meta.news_keywords || tags.join(', '), 200);
  // schema.org fills what the meta tags left empty (skipped when everything is there: saves CPU on the free plan)
  if ((!title || !desc || !image || !author || !published || !kw) && html.includes('ld+json')) {
    const ld = parseJsonLd(html);
    title ||= clean(ld.title, 300); desc ||= clean(ld.desc, 1000); image ||= absolute(ld.image, baseUrl);
    author ||= clean(ld.author, 100); published ||= clean(ld.published, 40); site ||= clean(ld.site, 100); kw ||= clean(ld.kw, 200);
  }
  const locale = (meta['og:locale'] || '').replace('_', '-').toLowerCase();
  return {
    title, desc, kw,
    lang: lang ? lang[1].toLowerCase() : (clean(meta['content-language'], 10).toLowerCase() || locale),
    author, site, published,
    canonical: canonical || absolute(meta['og:url'], baseUrl),
    favicon: pick ? absolute(pick.href, baseUrl) : absolute('/favicon.ico', baseUrl),
    image, video, type,
    themeColor: /^#[0-9a-f]{3,8}$/i.test(meta['theme-color'] || '') ? meta['theme-color'] : '', rss
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
/** A URL's own slice of the call's budget: it can never take more than `max`, and never more than the call has left. */
function childBudget(parent, max) {
  let used = 0;
  return { spend() { if (used >= max || !parent.spend()) return false; used++; return true; }, left: () => Math.min(max - used, parent.left()), get used() { return used; }, max };
}

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

const CHALLENGE = /^(just a moment|attention required|access denied|are you a robot|verify you are human|403 forbidden|checking your browser)/i;

async function engineDirect(u, ctx, ua = BROWSER_UA) {
  const { res, url } = await guardedGet(u, ctx, { ms: CONFIG.directTimeoutMs, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', ua });
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
    map: (j, u) => ({ title: j.author_name ? `${j.author_name} on X` : deriveFromUrl(u).title, desc: stripTags(j.html), author: j.author_name, site: 'X', type: 'website', frameable: false }) },
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

/* ------------------------------------------------------------------------------------------------------------- engines that fetch the page */
const DIRECT_STEPS = [
  { id: 'direct', direct: true, run: (u, ctx) => engineDirect(u, ctx, BROWSER_UA) },
  { id: 'direct:facebook', direct: true, retry: true, run: (u, ctx) => engineDirect(u, ctx, UA_FACEBOOK) },
  { id: 'direct:twitterbot', direct: true, retry: true, run: (u, ctx) => engineDirect(u, ctx, UA_TWITTER) }
];

/* ------------------------------------------------------------------------------------------------------------- third-party services (ordered by usefulness; edit here) */
const jsonFallback = (id, endpoint, map) => ({ id, service: true, async run(u, ctx) {
  if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
  const res = await fetchTimeout(ctx, endpoint(u), { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }, CONFIG.fallbackTimeoutMs);
  if (!res.ok) throw err(`HTTP ${res.status}`);
  const data = map(await res.json());
  if (!data || (!data.title && !data.image)) throw err('empty answer', { soft: true });
  return { ...data, finalUrl: u.href };
} });

/** First `n` bytes of a response as text (enough for the start of a JSON answer, far cheaper to handle than the whole body). */
async function readPrefix(res, n = 6000) {
  if (!res.body) return '';
  const reader = res.body.getReader(); const dec = new TextDecoder(); let out = '';
  while (out.length < n) { const { done, value } = await reader.read(); if (done) break; out += dec.decode(value, { stream: true }); }
  reader.cancel().catch(() => {});
  return out;
}
const jsonField = (text, key) => { const m = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text); if (!m) return ''; try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; } };

// Jina Reader renders the page in a real browser, so it reads sites that refuse plain servers. Free without a key, 20 requests per minute per IP
// (verified 2026-10-22, jina.ai/reader). Only the start of its JSON is read: title and description come before the page text.
const JINA = { id: 'jina', service: true, async run(u, ctx) {
  if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
  const res = await fetchTimeout(ctx, `https://r.jina.ai/${u.href}`, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json', 'X-Timeout': '8' } }, CONFIG.jinaTimeoutMs);
  if (!res.ok) { res.body && res.body.cancel().catch(() => {}); throw err(`HTTP ${res.status}`); }
  const head = await readPrefix(res);
  const title = clean(jsonField(head, 'title'), 300), desc = clean(jsonField(head, 'description'), 1000);
  if ((!title && !desc) || CHALLENGE.test(title)) throw err('no usable metadata', { soft: true });
  return { title, desc, frameable: null, finalUrl: u.href };
} };

// The Wayback Machine keeps copies of most popular pages. The raw copy (id_) still carries the original <head>.
const WAYBACK = { id: 'wayback', service: true, async run(u, ctx) {
  if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
  const res = await fetchTimeout(ctx, `https://archive.org/wayback/available?url=${encodeURIComponent(u.href)}`, { headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' } }, CONFIG.fallbackTimeoutMs);
  if (!res.ok) throw err(`HTTP ${res.status}`);
  const snap = (await res.json()).archived_snapshots?.closest;
  if (!snap || !snap.available || !snap.url) throw err('no snapshot', { soft: true });
  const raw = new URL(snap.url.replace(/^http:/, 'https:').replace(/\/web\/(\d+)\//, '/web/$1id_/'));
  if (raw.hostname !== 'web.archive.org') throw err('unexpected snapshot host', { soft: true });
  const { res: page } = await guardedGet(raw, ctx, { ms: CONFIG.directTimeoutMs, accept: 'text/html,*/*;q=0.5' });
  if (!page.ok) { page.body && page.body.cancel().catch(() => {}); throw err(`HTTP ${page.status}`); }
  const p = parseHead(await readHead(page), u.href);
  if ((!p.title && !p.image) || CHALLENGE.test(p.title)) throw err('no usable metadata', { soft: true });
  return { ...p, frameable: null, archived: true, finalUrl: u.href };
} };

const FALLBACKS = [
  JINA,
  // Dub.co public metatags endpoint (GET /metatags?url=, no key; documented at dub.co/docs). Free limit not documented [verify].
  jsonFallback('dub', (u) => `https://api.dub.co/metatags?url=${encodeURIComponent(u.href)}`, (j) => ({ title: j.title, desc: j.description, image: j.image })),
  // JSONLink. Free limit [verify].
  jsonFallback('jsonlink', (u) => `https://jsonlink.io/api/extract?url=${encodeURIComponent(u.href)}`, (j) => ({ title: j.title, desc: j.description, image: Array.isArray(j.images) ? j.images[0] : '', favicon: j.favicon, site: j.sitename, author: j.author })),
  // Microlink: the free plan is very small (about 50 requests a day [verify]).
  jsonFallback('microlink', (u) => `https://api.microlink.io?url=${encodeURIComponent(u.href)}`, (j) => (j.status === 'success' && j.data ? { title: j.data.title, desc: j.data.description, image: j.data.image && j.data.image.url, favicon: j.data.logo && j.data.logo.url, site: j.data.publisher, author: j.data.author, lang: j.data.lang } : null)),
  WAYBACK,
  // AllOrigins returns the raw page, so it is parsed like a direct fetch. It timed out on every call in the v2.1.0 field test: last resort.
  { id: 'allorigins', service: true, async run(u, ctx) {
    if (!ctx.budget.spend()) throw err('subrequest budget used up', { budget: true });
    const res = await fetchTimeout(ctx, `https://api.allorigins.win/raw?url=${encodeURIComponent(u.href)}`, { headers: { 'User-Agent': BROWSER_UA } }, CONFIG.fallbackTimeoutMs);
    if (!res.ok) throw err(`HTTP ${res.status}`);
    const p = parseHead(await readHead(res), u.href);
    if ((!p.title && !p.image) || CHALLENGE.test(p.title)) throw err('no usable metadata', { soft: true });
    return { ...p, frameable: null, finalUrl: u.href };
  } }
];

/* ------------------------------------------------------------------------------------------------------------- names built from the URL itself */
function slugTitle(seg) {
  let s; try { s = decodeURIComponent(seg); } catch { s = seg; }
  s = s.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length < 3 || /^[\d\s]+$/.test(s) || /^[0-9a-f]{16,}$/i.test(s)) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** What the URL alone says about the page. Used when no engine could read it, and to replace useless titles ("Reddit", "Post on X"). */
function deriveFromUrl(u) {
  const host = u.hostname.replace(/^www\./, '');
  const seg = u.pathname.split('/').filter(Boolean);
  const site = prettyHost(host);
  const out = (title, siteName = site) => ({ title, site: siteName });
  if (hostIs(u, ['x.com', 'twitter.com']) && seg[0] && !['i', 'home', 'search', 'explore'].includes(seg[0])) return out(seg[1] === 'status' ? `Post by @${seg[0]} on X` : `@${seg[0]} on X`, 'X');
  if (hostIs(u, ['instagram.com']) && seg[0]) return out(['p', 'reel', 'reels', 'tv'].includes(seg[0]) ? `Instagram ${seg[0] === 'p' ? 'post' : 'reel'}` : `@${seg[0]} on Instagram`, 'Instagram');
  if (hostIs(u, ['facebook.com', 'fb.com']) && seg[0] && !['watch', 'groups', 'events', 'marketplace', 'share', 'profile.php'].includes(seg[0])) return out(`${slugTitle(seg[0]) || seg[0]} on Facebook`, 'Facebook');
  if (hostIs(u, ['linkedin.com']) && seg[1]) return out(`${slugTitle(seg[1]) || seg[1]} | LinkedIn`, 'LinkedIn');
  if (hostIs(u, ['tiktok.com']) && seg[0] && seg[0].startsWith('@')) return out(`${seg[0]} on TikTok`, 'TikTok');
  if (hostIs(u, ['reddit.com']) && seg[0] === 'r' && seg[1]) return out(seg[2] === 'comments' && seg[4] ? `${slugTitle(seg[4]) || 'Post'} : r/${seg[1]}` : `r/${seg[1]}`, 'Reddit');
  if (hostIs(u, ['github.com']) && seg[0]) return out(seg[1] ? `${seg[0]}/${seg[1]}: GitHub` : `${seg[0]} on GitHub`, 'GitHub');
  if (hostIs(u, ['youtube.com']) && seg[0] && seg[0].startsWith('@')) return out(`${seg[0]} on YouTube`, 'YouTube');
  for (let i = seg.length - 1; i >= 0; i--) { const t = slugTitle(seg[i]); if (t) return out(`${t} - ${site}`); }
  return out(site);
}

const GENERIC_TITLE = /^(reddit|x|twitter|facebook|instagram|linkedin|log in|login|sign in|sign up|home|homepage|welcome|untitled|loading\.{0,3}|just a moment\.{0,3}|attention required.*|access denied|403 forbidden|404( not found)?|not found|page not found|error|robot check|post on x|captcha|enable javascript.*)$/i;
/** A title that says nothing about the page: too short, a login or error page, or only the site name on a deep link. */
function weakTitle(title, u) {
  const t = String(title || '').trim();
  if (t.length < 3 || GENERIC_TITLE.test(t)) return true;
  return t.toLowerCase() === prettyHost(u.hostname).toLowerCase() && u.pathname.length > 1;
}

/* ------------------------------------------------------------------------------------------------------------- circuit breaker for third-party services */
const breaker = new Map();
const cooling = (id) => { const b = breaker.get(id); return !!b && b.until > nowMs(); };
function noteService(id, e) {
  if (!e) { breaker.delete(id); return; }
  if (e.soft || e.budget) return; // "no data for this page" is normal; only service-level failures count
  const b = breaker.get(id) || { fails: 0, until: 0 };
  b.fails++;
  if (b.fails >= 3) { b.until = nowMs() + 5 * 60 * 1000; b.fails = 0; }
  breaker.set(id, b);
}

/* ------------------------------------------------------------------------------------------------------------- one URL, whole chain */
const resultCache = new Map();
const FILL = ['title', 'desc', 'kw', 'lang', 'author', 'site', 'canonical', 'favicon', 'image', 'video', 'published', 'themeColor', 'rss', 'archived'];
/** Keep `base`, complete its empty fields from `extra`. */
function fill(base, extra) {
  const out = { ...base };
  for (const k of FILL) if (!out[k] && extra[k]) out[k] = extra[k];
  if (out.frameable == null && extra.frameable != null) out.frameable = extra.frameable;
  if ((!out.type || out.type === 'website') && extra.type && extra.type !== 'website') out.type = extra.type;
  if (!out.finalUrl && extra.finalUrl) out.finalUrl = extra.finalUrl;
  return out;
}
const FINAL_ERROR = /^HTTP (404|410|530)$/; // the page is gone or the domain does not exist: other engines can not help

async function metaForUrl(input, ctx, opts = {}) {
  const t0 = nowMs();
  const log = [];
  const base = { url: input, ok: false, log };
  const u = normalizeTarget(input);
  if (!u) return { ...base, error: 'invalid URL' };
  if (isBlockedUrl(u)) return { ...base, error: 'blocked target' };

  const hit = resultCache.get(u.href);
  if (hit && nowMs() - hit.t < CONFIG.cacheTtlMs) return { ...hit.result, url: input, cached: true, ms: 0 };

  const c = { ...ctx, budget: childBudget(ctx.budget, ctx.perUrl || CONFIG.perUrlMax) };
  const social = hostIs(u, SOCIAL_HOSTS);
  const steps = [];
  const handler = OEMBED.find((h) => hostIs(u, h.domains));
  if (handler) steps.push(oembedStep(handler));
  steps.push(...DIRECT_STEPS.filter((d) => !(social && d.id === 'direct')), ...FALLBACKS);

  let best = null, bestEngine = '', directBlocked = false, finalError = '';
  for (const step of steps) {
    if (c.budget.left() <= 0) { log.push({ engine: step.id, ok: false, error: 'subrequest budget used up' }); break; }
    if (step.retry && !directBlocked && !social) continue;  // preview-crawler retries only after a blocked browser fetch, never after a plain 404
    if (step.service && cooling(step.id)) { log.push({ engine: step.id, ok: false, ms: 0, error: 'skipped (cooling down after repeated failures)' }); continue; }
    const s = nowMs();
    try {
      const d = await step.run(u, c);
      if (step.service) noteService(step.id, null);
      log.push({ engine: step.id, ok: true, ms: nowMs() - s });
      const good = !weakTitle(d.title, u) && !!(d.title || d.image);
      if (!best) { best = d; bestEngine = step.id; } else if (good && weakTitle(best.title, u)) { best = fill(d, best); bestEngine = step.id; } else best = fill(best, d);
      if (good) break;
    } catch (e) {
      if (step.service) noteService(step.id, e);
      const msg = shortErr(e);
      log.push({ engine: step.id, ok: false, ms: nowMs() - s, error: msg });
      if (msg === 'blocked target') return { ...base, error: 'blocked target', ms: nowMs() - t0 }; // a redirect led to a private address: stop everything
      if (step.direct) { directBlocked = true; if (FINAL_ERROR.test(msg)) { finalError = msg; break; } }
    }
  }

  const derived = deriveFromUrl(u);
  const host = u.hostname.replace(/^www\./, '');
  if (!best && finalError) {
    return { ...base, error: finalError === 'HTTP 530' ? 'site not found' : 'page not found', status: Number(finalError.slice(5)), title: derived.title, site: derived.site, favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=64`, ms: nowMs() - t0 };
  }
  // Nothing readable, but the site is alive: a partial result keeps the link usable (title from the path, site name, favicon).
  const partial = !best || weakTitle(best.title, u);
  const data = best || { type: 'website', frameable: null };
  const result = {
    url: input, ok: true, partial,
    title: clean(partial ? (derived.title || data.title) : data.title, 300), desc: clean(data.desc, 1000), kw: clean(data.kw, 200), lang: data.lang || '',
    author: clean(data.author, 100), site: clean(data.site || derived.site, 100), published: clean(data.published, 40),
    canonical: data.canonical || '', favicon: absolute(data.favicon, u.href) || `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
    image: absolute(data.image, u.href), video: absolute(data.video, u.href), type: data.type || 'website',
    themeColor: data.themeColor || '', rss: data.rss || '', archived: data.archived === true,
    frameable: data.frameable === undefined ? null : data.frameable, engine: bestEngine || 'derived', finalUrl: data.finalUrl || u.href, log, ms: nowMs() - t0
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

  // every URL gets its own slice of the call's subrequest budget (fair share, between perUrlMin and perUrlMax)
  ctx.perUrl = Math.max(CONFIG.perUrlMin, Math.min(CONFIG.perUrlMax, Math.floor(ctx.budget.max / urls.length)));
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
  __test: { CONFIG, FALLBACKS, OEMBED, jsonFallback, guardedGet, normalizeTarget, isBlockedHost, isBlockedUrl, parseHead, computeFrameable, readHead, decodeEntities, metaForUrl, verifyIdToken, takeTokens, route, createBudget, childBudget, youtubeId, deriveFromUrl, weakTitle, prettyHost, parseJsonLd, DIRECT_STEPS, breaker, resetCaches() { resultCache.clear(); buckets.clear(); breaker.clear(); jwksCache = { keys: null, exp: 0, at: 0 }; } }
};
