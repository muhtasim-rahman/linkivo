/**
 * Linkivo — js/features/insights/stats-core.js  (v2.5.2)
 * Purpose: pure numbers for the Stats page, so they can be tested without a DOM. Works on the lists the engine already holds (no extra reads).
 * API: computeStats(folders, links, now) -> { folders, links, favourites, readLater, dead, blocked, tagged, topFolders[5], topHosts[5], topTags[5], months[6] }
 *      dayLabel(ts, now) -> 'Today' | 'Yesterday' | 'This week' | 'Earlier'   (activity page groups)
 */
const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([name, count]) => ({ name, count }));

export function computeStats(folders, links, now = Date.now()) {
  const live = links.filter((l) => !l.del), byFolder = new Map(), hosts = new Map(), tags = new Map();
  const names = new Map(folders.map((f) => [f.id, f.name]));
  let favourites = 0, readLater = 0, dead = 0, blocked = 0, tagged = 0;
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(now); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - (5 - i)); return { key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }), count: 0 }; });
  for (const l of live) {
    if (l.fv) favourites++; if (l.rl) readLater++; if (l.dd) dead++; if (l.bl) blocked++;
    byFolder.set(names.get(l.fid) || 'Unknown', (byFolder.get(names.get(l.fid) || 'Unknown') || 0) + 1);
    if (l.host) hosts.set(l.host, (hosts.get(l.host) || 0) + 1);
    const t = String(l.tags || '').split(',').map((x) => x.trim()).filter(Boolean); if (t.length) tagged++;
    for (const x of t) tags.set(x, (tags.get(x) || 0) + 1);
    const d = new Date(l.ts || 0), m = months.find((x) => x.key === `${d.getUTCFullYear()}-${d.getUTCMonth()}`); if (m) m.count++;
  }
  return { folders: folders.filter((f) => !f.del).length, links: live.length, favourites, readLater, dead, blocked, tagged, topFolders: top(byFolder, 5), topHosts: top(hosts, 5), topTags: top(tags, 5), months };
}

export function dayLabel(ts, now = Date.now()) { const d = Math.floor((now - ts) / 86400000); return d < 1 ? 'Today' : d < 2 ? 'Yesterday' : d < 7 ? 'This week' : 'Earlier'; }
