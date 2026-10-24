/**
 * Linkivo — js/engine/points.js  (v2.2.0)
 * Purpose: the owner's fixed points rules (FEATURES section 8) as pure functions. Each one takes a link record and returns a PATCH
 *          (fields to set; null removes a field) or null when the action is not allowed. The caller applies the patch with
 *          engine.updateLinks(). The advanced weighted picker is NOT here: it is frozen with the owner at the start of v2.4.0.
 * Rules:   start 100; random open -10; like +50 then +20 then +10 (then disabled until the next random open); dislike -50 once per
 *          random open; favourite +100; unfavourite -120; block -> 0 (old value kept in `pb`, restored on unblock);
 *          in the normal preview like and dislike work once per week per link; never below 1 for a live link; cap 1000.
 * Fields:  pt points, pb value before block, ls like step 0..3, ds dislike used, lo last random open, oc random-open count, pw last normal-preview point action.
 * API: START MIN MAX WEEK_MS clampPoints(n)  onRandomOpen(link, now)  like(link, ctx)  dislike(link, ctx)  favourite(link)  unfavourite(link)
 *      block(link)  unblock(link)  canLike(link, ctx)  canDislike(link, ctx)    ctx = { random: boolean, now }
 */
export const START = 100, MIN = 1, MAX = 1000, WEEK_MS = 7 * 24 * 3600 * 1000;
const LIKE_STEPS = [50, 20, 10];
export const clampPoints = (n) => Math.min(MAX, Math.max(MIN, Math.round(n)));
const pts = (l) => (typeof l.pt === 'number' ? l.pt : START);
const weeklyBlocked = (l, ctx) => !ctx.random && !!l.pw && (ctx.now ?? Date.now()) - l.pw < WEEK_MS;

export function canLike(l, ctx = { random: false }) { return !l.bl && !weeklyBlocked(l, ctx) && (ctx.random ? (l.ls || 0) < LIKE_STEPS.length : true); }
export function canDislike(l, ctx = { random: false }) { return !l.bl && !weeklyBlocked(l, ctx) && (ctx.random ? !l.ds : true); }

/** A link was opened by Random Discover: -10, the like and dislike allowances start again. */
export function onRandomOpen(l, now = Date.now()) {
  if (l.bl) return null;
  return { pt: clampPoints(pts(l) - 10), oc: (l.oc || 0) + 1, lo: now, ls: null, ds: null };
}
export function like(l, ctx = { random: false, now: Date.now() }) {
  if (!canLike(l, ctx)) return null;
  const step = ctx.random ? LIKE_STEPS[l.ls || 0] : LIKE_STEPS[0]; // the normal preview always gives the first step (once a week)
  const patch = { pt: clampPoints(pts(l) + step) };
  if (ctx.random) patch.ls = (l.ls || 0) + 1; else patch.pw = ctx.now ?? Date.now();
  return patch;
}
export function dislike(l, ctx = { random: false, now: Date.now() }) {
  if (!canDislike(l, ctx)) return null;
  const patch = { pt: clampPoints(pts(l) - 50) };
  if (ctx.random) patch.ds = true; else patch.pw = ctx.now ?? Date.now();
  return patch;
}
export function favourite(l) { if (l.fv) return null; return { fv: true, pt: l.bl ? l.pt : clampPoints(pts(l) + 100) }; }
export function unfavourite(l) { if (!l.fv) return null; return { fv: null, pt: l.bl ? l.pt : clampPoints(pts(l) - 120) }; }
export function block(l) { if (l.bl) return null; return { bl: true, pb: pts(l), pt: 0 }; }
export function unblock(l) { if (!l.bl) return null; return { bl: null, pt: clampPoints(typeof l.pb === 'number' && l.pb > 0 ? l.pb : START), pb: null }; }
