/**
 * Linkivo — js/features/random/random-session.js  (v2.4.0)
 * Purpose: ONE Random Discover session kept in memory while the app is open: the chosen filters and options, the links already shown (no repeats until
 *          the pool is exhausted), and the current link. The Random page, the Preview (new random link, filter icon) and the folder menu share it.
 *          Choosing a link also applies the points rule (engine/points.js onRandomOpen: -10, like steps restart) and writes a History entry.
 * API: session (state object)   defaults()   poolOf(engine) -> links   nextLink(engine) -> Promise<link | null>   resetSeen()   startFor(fid)
 *      Options persist per device in prefs: random.mode, random.avoid, random.gamma, random.auto (seconds, 0 = off).
 */
import { prefs } from '../../core/local-prefs.js';
import { filterPool, pickNext } from '../../engine/picker.js';
import { onRandomOpen } from '../../engine/points.js';
import { record } from '../../core/history.js';

export const AUTO_CHOICES = [[0, 'Off'], [10, '10 seconds'], [20, '20 seconds'], [30, '30 seconds'], [60, '1 minute']];

export const session = { filters: { fids: [], fav: false, liked: false, unseen: false, skipDead: true, min: null, max: null }, folderWeights: {}, seen: new Set(), current: null, active: false };

/** The options that live in Settings (mode, avoid recent, point influence, auto-advance). */
export const options = () => ({
  mode: prefs.get('random.mode', 'balanced'), avoidRecent: prefs.get('random.avoid', true) !== false,
  gamma: Number(prefs.get('random.gamma', 1)) || 1, auto: Number(prefs.get('random.auto', 0)) || 0
});

export const poolOf = (engine) => filterPool(engine.listLinks(), { ...session.filters, min: session.filters.min ?? undefined, max: session.filters.max ?? undefined });
export function resetSeen() { session.seen.clear(); session.current = null; }
export function startFor(fid) { resetSeen(); session.filters = { ...session.filters, fids: fid ? [fid] : [] }; }

export async function nextLink(engine) {
  const o = options();
  const link = pickNext(poolOf(engine), { mode: o.mode, gamma: o.gamma, avoidRecent: o.avoidRecent, folderWeights: session.folderWeights, seen: session.seen, last: session.current });
  if (!link) return null;
  session.current = link.id; session.active = true;
  const patch = onRandomOpen(link);
  try { if (patch) await engine.updateLinks([link.id], patch); } catch { /* the points are a bonus: the link still opens */ }
  await record(engine, link, 'random');
  return link;
}
