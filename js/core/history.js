/**
 * Linkivo — js/core/history.js  (v2.4.1)
 * Purpose: the History list. One entry each time a link is opened: from a folder (src "click"), in the preview (src "preview") or by Random Discover
 *          (src "random"). Stored where the person chooses (setting history.where): on this device only (IndexedDB store `history`, the default and the only
 *          choice for guests) or in the account (history/<uid>/<id>, so every device lists the same entries). Entries older than the chosen keep time
 *          (setting history.keep: off, 1 hour, 1, 3, 7, 14, 30 days; admins also get "No limit") are removed when the app starts, on every new entry and
 *          when the History page opens. Everything runs in the background: a failure here never breaks opening a link.
 * API: KEEP_OPTIONS  keepMs(value, isAdmin) -> ms | Infinity | 0 (0 = history is off)   MAX_ENTRIES
 *      createHistory({ db, adapter?, uid?, now, getKeep, getWhere, isAdmin }) -> service:
 *        record({ link, src }) -> Promise<entry|null>     list() -> entry[] (newest first)     load() -> Promise<void> (re-reads the active store)
 *        remove(ids) -> Promise<void>     clear() -> Promise<void>     prune() -> Promise<number>     subscribe(fn) -> off     where() -> 'local'|'account'
 * Rules for the schema live in engine/schema.js (HISTORY) and the database rules (history/$uid/$hid), both from v2.1.0.
 */
import { newId } from './utils.js';
import { log } from './logger.js';
import { HISTORY } from '../engine/schema.js';

const H = 3600e3, D = 24 * H;
export const KEEP_OPTIONS = Object.freeze([
  { value: 'off', label: 'Do not keep history', ms: 0 },
  { value: '1h', label: '1 hour', ms: H },
  { value: '1d', label: '1 day', ms: D },
  { value: '3d', label: '3 days', ms: 3 * D },
  { value: '7d', label: '7 days', ms: 7 * D },
  { value: '14d', label: '14 days', ms: 14 * D },
  { value: '30d', label: '30 days', ms: 30 * D }
]);
const LONGEST = 30 * D;
/** Keep time in ms for a setting value. "never" is for admins; for everyone else it is treated as 30 days. Unknown values fall back to 7 days. */
export function keepMs(value, isAdmin = false) {
  if (value === 'never') return isAdmin ? Infinity : LONGEST;
  const hit = KEEP_OPTIONS.find((o) => o.value === value);
  return hit ? hit.ms : 7 * D;
}
/** A person never needs more than this many entries on screen; admins have no cap other than a sane ceiling for the free database. */
export const MAX_ENTRIES = { user: 2000, admin: 20000 };
const REPEAT_MS = 8000;      // opening the same link the same way again within this time is one entry (double taps, quick re-opens)
const CLOUD_READ = 1000;     // newest entries read from the account at once

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

export function createHistory({ db, adapter = null, uid = null, now = () => Date.now(), getKeep = () => '7d', getWhere = () => 'local', isAdmin = () => false }) {
  const subs = new Set();
  let items = [];     // newest first, the ACTIVE store only
  let loaded = false;
  const where = () => (adapter && uid && getWhere() === 'account' ? 'account' : 'local');
  const cap = () => (isAdmin() ? MAX_ENTRIES.admin : MAX_ENTRIES.user);
  const path = (id) => `history/${uid}/${id}`;
  const emit = () => { for (const fn of [...subs]) { try { fn(items); } catch { /* ignore */ } } };
  const sortNew = () => items.sort((a, b) => b.ts - a.ts);
  const valid = (e) => e && typeof e.lid === 'string' && e.lid && Number.isFinite(e.ts);

  async function load() {
    try {
      if (where() === 'account') {
        const raw = await adapter.recent(`history/${uid}`, 'ts', CLOUD_READ);
        items = Object.entries(raw || {}).map(([id, v]) => ({ id, ...v })).filter(valid);
      } else items = (await db.getAll('history')).filter(valid);
      sortNew(); loaded = true; emit();
    } catch (e) { log.warn('history', 'could not read history', e); if (!loaded) { items = []; loaded = true; } }
  }

  /** Writes removals and additions to the active store. Cloud writes are one multi-path update. */
  async function persist({ add = [], del = [] }) {
    if (where() === 'account') {
      const upd = {};
      for (const e of add) { const { id, ...rest } = e; upd[path(id)] = rest; }
      for (const id of del) upd[path(id)] = null;
      if (Object.keys(upd).length) await adapter.update(upd);
    } else {
      if (add.length) await db.putMany('history', add);
      if (del.length) await db.deleteMany('history', del);
    }
  }

  /** Removes entries past the keep time and entries beyond the cap. Returns how many went. */
  async function prune() {
    if (!loaded) await load();
    const keep = keepMs(getKeep(), isAdmin()), t = now();
    const gone = items.filter((e, i) => (keep !== Infinity && t - e.ts > keep) || i >= cap()).map((e) => e.id);
    if (!gone.length) return 0;
    const set = new Set(gone); items = items.filter((e) => !set.has(e.id));
    try { await persist({ del: gone }); } catch (e) { log.warn('history', 'prune failed', e); }
    emit(); return gone.length;
  }

  async function record({ link, src }) {
    try {
      if (!link || !link.id || keepMs(getKeep(), isAdmin()) === 0) return null;   // history is off
      if (!loaded) await load();
      const t = now();
      const last = items.find((e) => e.lid === link.id && e.src === src);
      if (last && t - last.ts < REPEAT_MS) return null;
      const entry = { id: newId(t), lid: clip(link.id, HISTORY.fields.lid.max), url: clip(link.url, 2048), title: clip(link.title, 300), host: clip(link.host, 253), fid: clip(link.fid, 40), src: clip(src, 10), ts: t };
      items.unshift(entry); emit();
      await persist({ add: [entry] });
      prune().catch(() => {});
      return entry;
    } catch (e) { log.warn('history', 'could not record', e); return null; }
  }

  async function remove(ids) {
    const set = new Set(ids); if (!set.size) return;
    items = items.filter((e) => !set.has(e.id)); emit();
    await persist({ del: [...set] });
  }
  async function clear() {
    items = []; emit();
    if (where() === 'account') {
      // the rules allow writes per entry (history/<uid>/<id>), not on the whole list, so delete in rounds of the newest entries until none are left
      for (let round = 0; round < 40; round++) {
        const raw = await adapter.recent(`history/${uid}`, 'ts', CLOUD_READ);
        const ids = Object.keys(raw || {}); if (!ids.length) break;
        await adapter.update(Object.fromEntries(ids.map((id) => [path(id), null])));
      }
    } else await db.clear('history');
  }

  return {
    where, load, prune, record, remove, clear,
    list: () => items,
    isLoaded: () => loaded,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  };
}
