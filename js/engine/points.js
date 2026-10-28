/**
 * Linkivo — js/engine/points.js  (v2.2.0, rules changed v2.3.1 on the owner's request)
 * Purpose: the points rules (FEATURES section 8) as pure functions. Each one takes a link record and returns a PATCH
 *          (fields to set; null removes a field) or null when the action changes nothing. The caller applies the patch with
 *          engine.updateLinks(). The advanced weighted picker is NOT here: it is frozen with the owner at the start of v2.4.0.
 * Rules (v2.3.1): start 100; random open -10 (and the like steps start again); like +50, then +30, then +20, then +10 every time (no limit, only the cap);
 *          dislike -20 every time; favourite +100; unfavourite -100; read later +200 (removing it -200); block -> 0 (old value kept in `pb`,
 *          restored on unblock); a blocked link changes no points; never below 1 for a live link; cap 1000. The weekly limit of v2.2.0 is gone.
 * Fields:  pt points, pb value before block, ls like step 0..3 (3 stays 3: +10 for ever), ds unused since v2.3.1, lo last random open, oc random-open count,
 *          pw unused since v2.3.1 (kept in the schema so old data stays valid).
 * API: START MIN MAX LIKE_STEPS clampPoints(n)  onRandomOpen(link, now)  like(link)  dislike(link)  favourite(link)  unfavourite(link)
 *      readLater(link)  unreadLater(link)  block(link)  unblock(link)  canLike(link)  canDislike(link)  pointsOf(link)
 */
export const START = 100, MIN = 1, MAX = 1000;
export const LIKE_STEPS = [50, 30, 20, 10];   // the last step repeats for ever
export const clampPoints = (n) => Math.min(MAX, Math.max(MIN, Math.round(n)));
const pts = (l) => (typeof l.pt === 'number' ? l.pt : START);
export const pointsOf = pts;
const step = (l) => LIKE_STEPS[Math.min(l.ls || 0, LIKE_STEPS.length - 1)];

/** Like and dislike are always allowed, except on a blocked link and when the number can not move any more (cap 1000, floor 1). */
export const canLike = (l) => !l.bl && pts(l) < MAX;
export const canDislike = (l) => !l.bl && pts(l) > MIN;

/** A link was opened by Random Discover: -10, and the like steps start again at +50. */
export function onRandomOpen(l, now = Date.now()) {
  if (l.bl) return null;
  return { pt: clampPoints(pts(l) - 10), oc: (l.oc || 0) + 1, lo: now, ls: null, ds: null };
}
export function like(l) {
  if (!canLike(l)) return null;
  return { pt: clampPoints(pts(l) + step(l)), ls: Math.min((l.ls || 0) + 1, LIKE_STEPS.length - 1) };
}
export function dislike(l) {
  if (!canDislike(l)) return null;
  return { pt: clampPoints(pts(l) - 20) };
}
const move = (l, delta) => (l.bl ? l.pt : clampPoints(pts(l) + delta));
export function favourite(l) { if (l.fv) return null; return { fv: true, pt: move(l, 100) }; }
export function unfavourite(l) { if (!l.fv) return null; return { fv: null, pt: move(l, -100) }; }
/** Read later is a strong "I want to see this": +200 so such links are likely to come up in Random. Removing it takes the 200 back. */
export function readLater(l) { if (l.rl) return null; return { rl: true, pt: move(l, 200) }; }
export function unreadLater(l) { if (!l.rl) return null; return { rl: null, pt: move(l, -200) }; }
export function block(l) { if (l.bl) return null; return { bl: true, pb: pts(l), pt: 0 }; }
export function unblock(l) { if (!l.bl) return null; return { bl: null, pt: clampPoints(typeof l.pb === 'number' && l.pb > 0 ? l.pb : START), pb: null }; }
