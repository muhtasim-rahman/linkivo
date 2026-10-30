/**
 * Linkivo — js/core/history.js  (v2.4.0)
 * Purpose: the History of opened links. One entry each time a link is opened: from a list ("click", a new tab), in the Preview ("preview") or by
 *          Random Discover ("random"). Kept on THIS device in the scope database (store "meta", key "history"), like the activity log (D-075): no schema
 *          or rules change. Entries keep a copy of title, address and host so they still read well after the link is deleted.
 *          Setting `history.keep`: none (record nothing) | 1h | 24h | 3d | 7d | 30d | 90d | 365d | never (default 90d); old entries are dropped on read and write.
 * API: record(engine, link, how) -> Promise<void>   list(engine) -> Promise<entry[]>   removeIds(engine, ids)   clearAll(engine)
 *      groupByDay(entries, now) -> [{ label, items }]   KEEP_OPTIONS   keepMs(value) -> ms | null (never) | 0 (none)
 *      entry = { id, lid, title, url, host, how, ts }
 */
import { prefs } from './local-prefs.js';

const KEY = 'history', LIMIT = 2000, DUP_MS = 4000;
export const KEEP_OPTIONS = [['none', 'No history'], ['1h', '1 hour'], ['24h', '24 hours'], ['3d', '3 days'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['365d', '365 days'], ['never', 'Never delete']];
const H = 3600e3;
const MS = { '1h': H, '24h': 24 * H, '3d': 72 * H, '7d': 168 * H, '30d': 720 * H, '90d': 2160 * H, '365d': 8760 * H };
export const keepMs = (v) => (v === 'none' ? 0 : v === 'never' ? null : MS[v] || MS['90d']);
let seq = 0;

async function read(engine) { const r = await engine.db.get('meta', KEY); return r && Array.isArray(r.value) ? r.value : []; }
const write = (engine, list) => engine.db.put('meta', { key: KEY, value: list.slice(0, LIMIT) });
// `none` only stops NEW entries; what is already listed stays until the person clears it (nothing is deleted behind their back)
function prune(list, now) { const ms = keepMs(prefs.get('history.keep', '90d')); return ms === null || ms === 0 ? list : list.filter((e) => now - e.ts < ms); }

export async function list(engine) { if (!engine) return []; try { return prune(await read(engine), Date.now()); } catch { return []; } }

export async function record(engine, link, how = 'click') {
  if (!engine || !link || keepMs(prefs.get('history.keep', '90d')) === 0) return;
  try {
    const now = Date.now(), cur = await read(engine);
    if (cur[0] && cur[0].lid === link.id && now - cur[0].ts < DUP_MS) return;   // one open often fires two hooks (list click and Preview): keep one entry
    cur.unshift({ id: `${now.toString(36)}${(seq++).toString(36)}`, lid: link.id, title: String(link.title || link.host || link.url || '').slice(0, 300), url: String(link.url || '').slice(0, 2048), host: String(link.host || '').slice(0, 120), how, ts: now });
    await write(engine, prune(cur, now));
  } catch { /* history is a convenience: it must never break opening a link */ }
}
export async function removeIds(engine, ids) { const set = new Set(ids); await write(engine, (await read(engine)).filter((e) => !set.has(e.id))); }
export const clearAll = (engine) => write(engine, []);

const DAY = 86400e3, startOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function groupByDay(entries, now = Date.now()) {
  const today = startOf(now), groups = [];
  for (const e of entries) {
    const d = startOf(e.ts), n = Math.round((today - d) / DAY);
    const label = n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: n > 300 ? 'numeric' : undefined });
    const g = groups[groups.length - 1];
    if (g && g.key === d) g.items.push(e); else groups.push({ key: d, label, items: [e] });
  }
  return groups;
}
