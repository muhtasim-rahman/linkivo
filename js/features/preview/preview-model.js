/**
 * Linkivo — js/features/preview/preview-model.js  (v2.3.0)
 * Purpose: the pure (DOM-free, unit-tested) logic of the link Preview: which tabs exist for a link, which one opens first, how a video address becomes
 *          something that can be shown, the rows of the Details tab and the packed engine log.
 * API: TABS  availableTabs(link, meta) -> ids   pickTab(avail, last, counts) -> id   frameState(meta) -> true|false|null
 *      videoSource(link, meta) -> { kind:'iframe'|'file', src } | null     shotUrl(url, width?)     packLog(log) -> string     parseLog(text) -> [{ engine, ok, ms, error }]
 *      detailsRows(link, meta, { folder, now }) -> [{ label, value, mono?, link? }]     needsFetch(link, meta) -> boolean
 * Tab order is fixed by FEATURES section 5: Page (embedded), Video, Photo, Screenshot, Details. A tab is listed only when it can work.
 */
import { safeHref } from '../library/folder-style.js';
import { hostOf } from '../../core/url-tools.js';
import { dateTime } from '../../core/format.js';

export const TABS = ['page', 'photo', 'shot', 'video', 'audio', 'pdf', 'details'];   // v2.3.1: Audio and PDF added (owner list: Page, Thumbnail/Screenshot, Video, Audio, PDF, Details)
export const TAB_LABELS = { page: 'Page', video: 'Video', audio: 'Audio', pdf: 'PDF', photo: 'Thumbnail', shot: 'Screenshot', details: 'Details' };
export const TAB_ICONS = { page: 'globe', video: 'video', audio: 'music', pdf: 'file', photo: 'image', shot: 'monitor', details: 'info' };

const FILE_VIDEO = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;

/** true = the Worker said the page can be framed, false = it refuses (stored as `nf`), null = nobody knows yet. */
export const frameState = (meta) => (meta && meta.frameable ? true : meta && meta.nf ? false : null);

/** A video address the page can show: YouTube and Vimeo become their own player pages, a plain video file a <video>, anything else an iframe. */
export function videoSource(link, meta) {
  for (const raw of [meta && meta.video, link && link.url]) {
    const src = raw ? embedFor(raw) : null;
    if (src) return src;
  }
  return null;
}
export function embedFor(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\.|^m\./, '');
  const id = (re, s) => { const m = re.exec(s); return m ? m[1] : null; };
  if (host === 'youtu.be') { const v = id(/^\/([\w-]{6,15})/, u.pathname); if (v) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${v}` }; }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v') || id(/^\/(?:embed|shorts|live|v)\/([\w-]{6,15})/, u.pathname);
    if (v && /^[\w-]{6,15}$/.test(v)) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${v}` };
    return null;   // a channel or playlist page is not one video
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') { const v = id(/\/(\d{5,12})(?:\/|$)/, u.pathname); if (v) return { kind: 'iframe', src: `https://player.vimeo.com/video/${v}` }; }
  if (FILE_VIDEO.test(u.pathname + u.search)) return { kind: 'file', src: u.toString() };
  return null;
}

/** Screenshot services. v2.3.1: thum.io first (no key; its free allowance is 1000 hits a month for the whole site, see CONTEXT), WordPress mShots as the second. */
export const mshotUrl = (url, width = 1200) => `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=${width}`;
export const thumUrl = (url, width = 1200) => `https://image.thum.io/get/width/${width}/${url}`;
export const shotUrl = mshotUrl;   // kept: older callers (and tests) ask for the plain mShots address

const FILE_AUDIO = /\.(mp3|m4a|aac|wav|oga|ogg|opus|flac)(\?|#|$)/i, FILE_PDF = /\.pdf(\?|#|$)/i;
/** v2.3.1: an audio address (Microlink found one, or the link itself is an audio file) and a PDF address (the link is a PDF). */
export function audioSource(link, meta) { for (const raw of [meta && meta.audio, link && link.url]) { if (raw && /^https?:\/\//i.test(raw) && FILE_AUDIO.test(raw)) return raw; } return (meta && meta.audio && /^https?:\/\//i.test(meta.audio)) ? meta.audio : null; }
export const pdfSource = (link) => (link && link.url && /^https?:\/\//i.test(link.url) && FILE_PDF.test(link.url) ? link.url : null);

export function availableTabs(link, meta) {
  const m = meta || {}, out = [];
  const web = safeHref(link && link.url) !== '#';
  if (web && frameState(m) !== false && !pdfSource(link)) out.push('page');
  if (m.image && /^https?:\/\//i.test(m.image)) out.push('photo');
  if (web) out.push('shot');
  if (videoSource(link, m)) out.push('video');
  if (audioSource(link, m)) out.push('audio');
  if (pdfSource(link)) out.push('pdf');
  out.push('details');
  return out;
}

/** The tab that opens first: the one used last, else the one used most among the available ones, else the first in the fixed order. */
export function pickTab(avail, last, counts = {}) {
  if (!avail.length) return 'details';
  if (last && avail.includes(last)) return last;
  let best = null, top = 0;
  for (const t of avail) if ((counts[t] || 0) > top) { best = t; top = counts[t]; }
  return best || avail[0];
}

/** The engine log is stored as one short string (the linkMeta `log` field is 3000 characters): one engine per line, fields split by a tab. */
export function packLog(log) {
  if (!Array.isArray(log)) return '';
  const lines = log.map((x) => [String(x.engine || '?').replace(/[\t\n]/g, ' '), x.ok ? 1 : 0, Math.round(x.ms || 0), String(x.error || '').replace(/[\t\n]/g, ' ').slice(0, 80)].join('\t'));
  let out = ''; for (const l of lines) { if ((out + l).length + 1 > 2990) break; out += (out ? '\n' : '') + l; }
  return out;
}
export function parseLog(text) {
  if (!text || typeof text !== 'string') return [];
  return text.split('\n').map((l) => l.split('\t')).filter((p) => p[0]).map((p) => ({ engine: p[0], ok: p[1] === '1', ms: Number(p[2]) || 0, error: p[3] || '' }));
}

/** Does opening the preview need a metadata fetch? Only when the link has never been looked up (no `checkedAt`). Asked ONCE: a fetch always writes checkedAt. */
export const needsFetch = (link, meta) => !!link && !(meta && meta.checkedAt);

/** Everything known about the link EXCEPT image and video (FEATURES section 5), as rows for the Details tab. Empty values are left out. */
export function detailsRows(link, meta, { folder = '', now = Date.now() } = {}) {
  const m = meta || {}, l = link || {};
  const rows = [
    ['Title', l.title || ''], ['Address', l.url || '', { mono: true, link: safeHref(l.url) }], ['Domain', l.host || hostOf(l.url || '')],
    ['Folder', folder], ['Description', m.long || l.desc || ''], ['Keywords', l.kw || ''], ['Tags', (l.tags || '').split(',').filter(Boolean).join(', ')],
    ['Site name', m.site || ''], ['Audio', m.audio || '', { mono: true, link: m.audio ? safeHref(m.audio) : '' }], ['Logo', m.icon || '', { mono: true, link: m.icon ? safeHref(m.icon) : '' }], ['Author', m.author || ''], ['Language', m.lang || ''], ['Published', m.pub || ''], ['Type', m.type || ''],
    ['Canonical address', m.canon || '', { mono: true, link: m.canon ? safeHref(m.canon) : '' }], ['Theme color', m.theme || ''],
    ['Can be shown here', m.frameable ? 'Yes' : m.nf ? 'No, the site refuses' : ''],
    ['Added', l.ts ? dateTime(l.ts) : ''], ['Points', l.pt != null ? String(l.pt) : ''], ['Details fetched', m.checkedAt ? dateTime(m.checkedAt) : (now ? 'Not yet' : '')]
  ];
  return rows.filter(([, v]) => v !== '' && v != null).map(([label, value, o]) => ({ label, value: String(value), ...(o || {}) }));
}

/**
 * v2.3.1: the links shown beside a preview on wide screens ("Related links", 20). Same folder counts most, then the same site, then shared tags;
 * ties go to pinned and newer links. The link itself, deleted and blocked-from-nothing links are left out (blocked links still list: blocking only affects Random).
 */
export function relatedLinks(all, link, limit = 20) {
  if (!link) return [];
  const mine = new Set((link.tags || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean));
  const out = [];
  for (const x of all) {
    if (!x || x.id === link.id || x.del) continue;
    let score = 0;
    if (x.fid === link.fid) score += 30;
    if (x.host && x.host === link.host) score += 20;
    for (const t of (x.tags || '').toLowerCase().split(',')) if (t && mine.has(t.trim())) score += 12;
    if (!score) continue;
    out.push({ link: x, score: score + (x.pn ? 3 : 0) });
  }
  out.sort((a, b) => b.score - a.score || (b.link.ts || 0) - (a.link.ts || 0));
  return out.slice(0, limit).map((r) => r.link);
}
