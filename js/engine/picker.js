/**
 * Linkivo — js/engine/picker.js  (v2.4.0)
 * Purpose: Random Discover's picker as PURE functions (no DOM, no engine): hard filters first, then a weighted draw without replacement.
 *          Weight  W = points^gamma x fresh x recency x age x folderWeight   (FEATURES.md section 8; numbers in PARAMS, proposed at the v2.4.0 kickoff and
 *          waiting for the owner's confirmation, so they live in ONE object).
 *          Draw: key = random^(1/W), the largest key wins (Efraimidis-Spirakis), so a heavier link is picked more often but any link can win.
 *          Blocked links are never in the pool. A session keeps a `seen` set: nobody repeats until the pool is exhausted, then the set restarts.
 * API: PARAMS   MODES   weightOf(link, opts, now) -> number   filterPool(links, filters, now) -> links   pickNext(links, opts) -> link | null
 *      opts = { mode, gamma, avoidRecent, folderWeights: {fid: 0.5|1|2}, seen: Set, rng: () => [0,1), now }
 */
export const PARAMS = {
  gamma: 1,
  freshBoost: 0.6,                                  // fresh = 1 + freshBoost / (1 + openCount)
  recency: [[6, 0.05], [24, 0.2], [72, 0.5], [168, 0.8]],   // [hours since last open, multiplier]; older than the last row: 1
  ageMax: 0.25, ageDays: 730,                       // age = 1 + min(ageMax, daysSinceAdded / ageDays)
  folder: { low: 0.5, normal: 1, high: 2 }
};
export const MODES = { balanced: 'Balanced', points: 'Points only', equal: 'Equal', underdog: 'Underdog', fresh: 'Fresh first' };

const HOUR = 3600e3, DAY = 86400e3;
const pts = (l) => (typeof l.pt === 'number' ? l.pt : 100);

export function recencyFactor(l, now) {
  if (!l.lo) return 1;
  const h = (now - l.lo) / HOUR;
  for (const [limit, mult] of PARAMS.recency) if (h < limit) return mult;
  return 1;
}
export function weightOf(l, { mode = 'balanced', gamma = PARAMS.gamma, avoidRecent = true, folderWeights = {} } = {}, now = Date.now()) {
  const p = Math.max(1, pts(l)), oc = l.oc || 0;
  const fresh = 1 + PARAMS.freshBoost / (1 + oc);
  const age = 1 + Math.min(PARAMS.ageMax, Math.max(0, (now - (l.ts || now)) / DAY) / PARAMS.ageDays);
  const rec = avoidRecent ? recencyFactor(l, now) : 1;
  const fw = folderWeights[l.fid] ?? 1;
  let w;
  if (mode === 'equal') w = 1;
  else if (mode === 'points') w = Math.pow(p, gamma);
  else if (mode === 'underdog') w = Math.pow(1000 / p, gamma) * rec;     // low points first
  else if (mode === 'fresh') w = Math.pow(p, gamma) * Math.pow(fresh, 3) * rec;
  else w = Math.pow(p, gamma) * fresh * rec * age;
  return Math.max(1e-9, w * fw);
}

/** Hard filters. filters = { fids?:[], include?:[hosts], exclude?:[hosts], tags?:[], fav?, liked?, min?, max?, unseen?, skipDead? } */
export function filterPool(links, f = {}, now = Date.now()) {
  const fids = f.fids && f.fids.length ? new Set(f.fids) : null;
  const inc = f.include && f.include.length ? new Set(f.include) : null, exc = new Set(f.exclude || []);
  const tags = (f.tags || []).map((t) => t.toLowerCase());
  return links.filter((l) => {
    if (l.del || l.bl) return false;
    if (fids && !fids.has(l.fid)) return false;
    if (inc && !inc.has(l.host)) return false;
    if (exc.has(l.host)) return false;
    if (f.fav && !l.fv) return false;
    if (f.liked && !(l.ls > 0 || pts(l) > 100)) return false;
    if (f.skipDead !== false && l.dd) return false;
    if (typeof f.min === 'number' && pts(l) < f.min) return false;
    if (typeof f.max === 'number' && pts(l) > f.max) return false;
    if (f.unseen && (l.oc || 0) > 0) return false;
    if (tags.length) { const have = String(l.tags || '').toLowerCase().split(','); if (!tags.some((t) => have.includes(t))) return false; }
    return true;
  });
}

/** One draw. Returns null for an empty pool. `seen` (a Set of ids) is updated; when every link has been seen it restarts, keeping the last pick out. */
export function pickNext(pool, opts = {}) {
  if (!pool.length) return null;
  const rng = opts.rng || Math.random, now = opts.now || Date.now(), seen = opts.seen || new Set();
  let cand = pool.filter((l) => !seen.has(l.id));
  if (!cand.length) { const last = opts.last; seen.clear(); cand = pool.length > 1 && last ? pool.filter((l) => l.id !== last) : pool; }
  let best = null, bestKey = -1;
  for (const l of cand) {
    const key = Math.pow(Math.max(rng(), 1e-12), 1 / weightOf(l, opts, now));
    if (key > bestKey) { bestKey = key; best = l; }
  }
  if (best) seen.add(best.id);
  return best;
}
