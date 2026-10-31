/**
 * Linkivo — js/engine/picker.js  (v2.4.1)
 * Purpose: chooses links for Random Discover. Pure functions (no DOM, no storage) so every rule is unit-tested with a seeded random generator.
 *          The point rules themselves (start 100, -10 per random open, like steps, favourite, block) live in engine/points.js; this file only decides
 *          WHICH link comes next. Filters first (hard rules), then weights (soft rules), then weighted sampling without replacement.
 *
 *          Weight of one candidate (mode "balanced"):   W = points^gamma x fresh x recency x age x folderWeight
 *            fresh   = 1 + FRESH_BONUS / (1 + openCount)         never opened x1.6, fading to x1.0
 *            recency = the "avoid recent" table below            opened less than 6 h ago x0.05 ... older than the chosen window x1
 *            age     = 1 + min(AGE_CAP, daysSinceAdded / AGE_DAYS) a very old, never opened link gets a small lift
 *            folderWeight = low 0.5 / normal 1 / high 2 per selected folder
 *          Other modes: "points" (points^gamma only), "equal" (all 1), "underdog" (the lowest points weigh most), "fresh" (never opened first, then balanced).
 *          Optional gentle drift (off by default): the points used for weighing move 1 toward 100 for every 14 days since the link was last touched.
 *          Sampling: key = random^(1 / W), the largest key wins (Efraimidis-Spirakis), so a link with twice the weight is twice as likely, and
 *          pickNext never repeats a link inside one session until the pool is used up.
 * API: PICKER (every tunable number)   mulberry32(seed) -> rng   isCandidate(link, filters) -> boolean
 *      weightOf(link, opts, now) -> number   pickNext({ links, filters, opts, seen, now, rng }) -> { link, poolSize, reset } | null
 *      emptyFilters()   describeFilters(filters, nameOf) -> string[]
 * Filters: { folders: { [fid]: 'low'|'normal'|'high' } (empty = every folder), include: [host], exclude: [host], tags: [tag], onlyFav, onlyLiked,
 *            minPts, maxPts, skipDisliked, skipDead, unseenOnly }
 */
import { START, MIN, MAX, pointsOf } from './points.js';

const H = 3600e3, D = 24 * H;
export const PICKER = Object.freeze({
  GAMMA: { soft: 0.5, normal: 1, sharp: 1.5 },
  FRESH_BONUS: 0.6,
  AGE_CAP: 0.25, AGE_DAYS: 730,
  FOLDER_WEIGHT: { low: 0.5, normal: 1, high: 2 },
  // "avoid recent": [window, steps...] a link opened within `within` ms gets that factor
  RECENT: { '6h': [[6 * H, 0.05]], '24h': [[6 * H, 0.05], [24 * H, 0.2]], '72h': [[6 * H, 0.05], [24 * H, 0.2], [72 * H, 0.5]], '7d': [[6 * H, 0.05], [24 * H, 0.2], [72 * H, 0.5], [7 * D, 0.8]] },
  DRIFT_DAYS: 14,
  FLOOR: 0.0001
});

/** Small seeded random generator (mulberry32): the same seed gives the same sequence, which is what the tests rely on. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const emptyFilters = () => ({ folders: {}, include: [], exclude: [], tags: [], onlyFav: false, onlyLiked: false, minPts: MIN, maxPts: MAX, skipDisliked: false, skipDead: true, unseenOnly: false });

const hostKey = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
const tagsOf = (l) => String(l.tags || '').toLowerCase().split(',').map((t) => t.trim()).filter(Boolean);

/** Hard filters. A blocked or deleted link is never a candidate. "Liked" means its points are above the start value. */
export function isCandidate(l, f) {
  if (!l || l.del || l.bl) return false;
  const folderIds = Object.keys(f.folders || {});
  if (folderIds.length && !folderIds.includes(l.fid)) return false;
  const host = hostKey(l.host);
  if (f.include && f.include.length && !f.include.map(hostKey).includes(host)) return false;
  if (f.exclude && f.exclude.length && f.exclude.map(hostKey).includes(host)) return false;
  if (f.tags && f.tags.length) { const have = tagsOf(l); if (!f.tags.some((t) => have.includes(String(t).toLowerCase()))) return false; }
  if (f.onlyFav && !l.fv) return false;
  const p = pointsOf(l);
  if (f.onlyLiked && !(p > START)) return false;
  if (p < (f.minPts ?? MIN) || p > (f.maxPts ?? MAX)) return false;
  if (f.skipDisliked && l.ds) return false;
  if (f.skipDead && l.dd) return false;
  if (f.unseenOnly && (l.oc || 0) > 0) return false;
  return true;
}

/** Points as used for weighing. With drift on, a link that has not been touched for a long time moves toward 100, one point per 14 days. */
function weighedPoints(l, drift, now) {
  const p = pointsOf(l);
  if (!drift) return p;
  const days = Math.max(0, (now - (l.lo || l.ts || now)) / D);
  const move = Math.floor(days / PICKER.DRIFT_DAYS);
  if (p > START) return Math.max(START, p - move);
  if (p < START) return Math.min(START, p + move);
  return p;
}

export function recencyFactor(l, avoid, now) {
  const table = PICKER.RECENT[avoid];
  if (!table || !l.lo) return 1;
  const since = now - l.lo;
  for (const [within, factor] of table) if (since < within) return factor;
  return 1;
}

/** opts: { mode, gamma, avoid, drift, folders }  (folders = the filter's per-folder weights). Always returns a positive number. */
export function weightOf(l, opts = {}, now = Date.now()) {
  const mode = opts.mode || 'balanced';
  const gamma = typeof opts.gamma === 'number' ? opts.gamma : PICKER.GAMMA.normal;
  const p = weighedPoints(l, !!opts.drift, now);
  const fresh = 1 + PICKER.FRESH_BONUS / (1 + (l.oc || 0));
  const age = 1 + Math.min(PICKER.AGE_CAP, Math.max(0, (now - (l.ts || now)) / D) / PICKER.AGE_DAYS);
  const fw = PICKER.FOLDER_WEIGHT[(opts.folders && opts.folders[l.fid]) || 'normal'] || 1;
  let w;
  if (mode === 'equal') w = 1;
  else if (mode === 'points') w = Math.pow(p, gamma);
  else if (mode === 'underdog') w = Math.pow((MAX + 1 - p), gamma);
  else {
    w = Math.pow(p, gamma) * fresh * recencyFactor(l, opts.avoid, now) * age * fw;
    if (mode === 'fresh' && (l.oc || 0) === 0) w *= 1000;   // never opened first; among those the normal weights still decide
  }
  return Math.max(PICKER.FLOOR, w);
}

/**
 * Picks the next link. `seen` is the Set of link ids already shown in this session. When every candidate has been shown the session starts over
 * (`reset: true`), but the link just shown is kept out of the very next pick when there is more than one candidate.
 */
export function pickNext({ links, filters = emptyFilters(), opts = {}, seen = new Set(), now = Date.now(), rng = Math.random, lastId = null }) {
  const all = links.filter((l) => isCandidate(l, filters));
  if (!all.length) return null;
  let pool = all.filter((l) => !seen.has(l.id)), reset = false;
  if (!pool.length) { reset = true; pool = all.length > 1 ? all.filter((l) => l.id !== lastId) : all; }
  const withFolders = { ...opts, folders: { ...(filters.folders || {}), ...(opts.folders || {}) } };
  let best = null, bestKey = -1;
  for (const l of pool) {
    const w = weightOf(l, withFolders, now);
    const key = Math.pow(rng() || 1e-12, 1 / w);   // larger weight pushes the key toward 1
    if (key > bestKey) { bestKey = key; best = l; }
  }
  return { link: best, poolSize: all.length, remaining: pool.length - 1, reset };
}

/** Short readable lines for the active filters (the panel's summary chips). `nameOf(fid)` turns a folder id into its name. */
export function describeFilters(f, nameOf = (x) => x) {
  const out = [];
  const fids = Object.keys(f.folders || {});
  if (fids.length) out.push(fids.length === 1 ? nameOf(fids[0]) : `${fids.length} folders`);
  if (f.include && f.include.length) out.push(`Only ${f.include.length === 1 ? f.include[0] : f.include.length + ' sites'}`);
  if (f.exclude && f.exclude.length) out.push(`Not ${f.exclude.length === 1 ? f.exclude[0] : f.exclude.length + ' sites'}`);
  if (f.tags && f.tags.length) out.push(`Tags: ${f.tags.slice(0, 2).join(', ')}${f.tags.length > 2 ? '...' : ''}`);
  if (f.onlyFav) out.push('Favourites only');
  if (f.onlyLiked) out.push('Liked only');
  if ((f.minPts ?? MIN) > MIN || (f.maxPts ?? MAX) < MAX) out.push(`Points ${f.minPts ?? MIN} to ${f.maxPts ?? MAX}`);
  if (f.skipDisliked) out.push('Skip disliked');
  if (f.unseenOnly) out.push('Never opened');
  return out;
}
