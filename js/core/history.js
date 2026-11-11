/**
 * Linkivo — js/core/history.js  (v2.4.1)
 * Purpose: the History list. One entry each time a link is opened: from a folder (src "click"), in the preview (src "preview") or by Random Discover
 *          (src "random"). Stored where the person chooses (setting history.where): on this device only (IndexedDB store `history`, the default and the only
 *          choice for guests) or in the account (history/<uid>/<id>, so every device lists the same entries). Entries older than the chosen keep time
 *          (setting history.keep: off, 1 hour, 1, 3, 7, 14, 30 days; admins also get "No limit") are removed when the app starts, on every new entry and
 *          when the History page opens. Everything runs in the background: a failure here never breaks opening a link.
 *          v2.5.7 (owner): (1) with "My account" the list is LIVE: another device's opens appear without a reload (adapter.watchRecent). (2) The history of LOCKED links is no longer thrown away
 *          when the locked folders close: it is stored with the link, in the vault part of the account (vault/<uid>/history, same shape, same server gate), whatever the
 *          "Where history is kept" setting says, because that is the only place the server hides until the code is entered. It loads when the locked folders open and leaves memory when
 *          they close. Locking a link moves its entries there, unlocking moves them back. Guests have no vault, so for them it stays in memory only.
 * API: KEEP_OPTIONS  keepMs(value, isAdmin) -> ms | Infinity | 0 (0 = history is off)   MAX_ENTRIES
 *      createHistory({ db, adapter?, uid?, now, getKeep, getWhere, isAdmin }) -> service:
 *        record({ link, src }) -> Promise<entry|null>   (v2.5.4: a locked link is kept in memory only)     wipeLocked()     list() -> entry[] (newest first)     load() -> Promise<void> (re-reads the active store)
 *        loadLocked() -> Promise<void> (vault opened)     restoreLinks(lids) (links unlocked)     dispose()     remove(ids) -> Promise<void>     clear() -> Promise<void>     prune() -> Promise<number>     subscribe(fn) -> off     where() -> 'local'|'account'
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
  let vitems = [];    // v2.5.4 (owner): opens of LOCKED links, kept in MEMORY only while the locked folders are unlocked (never written anywhere, wiped when they lock), so History shows them after an unlock
  let loaded = false, watchOff = null, disposed = false, vloaded = false;   // vloaded: the vault's stored entries were read for this opening
  const vpath = (id) => `vault/${uid}/history/${id}`;
  const canVault = () => !!(adapter && uid);   // accounts only (a guest has no vault)
  const fromRaw = (raw) => Object.entries(raw || {}).map(([id, v]) => ({ id, ...v })).filter(valid);
  const stripLk = (e) => { const { id, lk, ...rest } = e; return rest; };
  const where = () => (adapter && uid && getWhere() === 'account' ? 'account' : 'local');
  const cap = () => (isAdmin() ? MAX_ENTRIES.admin : MAX_ENTRIES.user);
  const path = (id) => `history/${uid}/${id}`;
  const emit = () => { for (const fn of [...subs]) { try { fn(items); } catch { /* ignore */ } } };
  const sortNew = () => items.sort((a, b) => b.ts - a.ts);
  const valid = (e) => e && typeof e.lid === 'string' && e.lid && Number.isFinite(e.ts);

  /** v2.5.7: the account list follows the database live (another device opened a link, cleared the list...). Started by load() when the list is kept in the account, stopped when it is not. */
  function stopWatch() { if (watchOff) { try { watchOff(); } catch { /* ignore */ } watchOff = null; } }
  function startWatch() {
    if (watchOff || disposed || typeof adapter?.watchRecent !== 'function') return;
    const again = () => { stopWatch(); if (!disposed && where() === 'account') setTimeout(() => { if (!disposed && where() === 'account') startWatch(); }, 15000); };   // listener cancelled (app lock closed the data): try again later
    watchOff = adapter.watchRecent(`history/${uid}`, 'ts', CLOUD_READ, (raw) => {
      if (disposed || where() !== 'account') return;
      items = fromRaw(raw); sortNew(); loaded = true; emit();
    }, again);
  }
  async function load() {
    try {
      if (where() === 'account') {
        const raw = await adapter.recent(`history/${uid}`, 'ts', CLOUD_READ);
        items = fromRaw(raw);
      } else { stopWatch(); items = (await db.getAll('history')).filter(valid); }
      sortNew(); loaded = true; emit();
      if (where() === 'account') startWatch();
    } catch (e) { log.warn('history', 'could not read history', e); if (!loaded) { items = []; loaded = true; } }
  }
  /** v2.5.7: the vault's own history (entries about locked links), read when the locked folders open. Entries made while they were open stay (memory copies are replaced by the stored ones). */
  async function loadLocked() {
    if (!canVault() || vloaded) return;
    vloaded = true;
    try {
      const raw = await adapter.recent(`vault/${uid}/history`, 'ts', CLOUD_READ);
      const have = new Set(vitems.map((e) => e.id));
      for (const e of fromRaw(raw)) if (!have.has(e.id)) vitems.push({ ...e, lk: true });
      vitems.sort((a, b) => b.ts - a.ts); emit();
    } catch (e) { vloaded = false; log.warn('history', 'locked history not read', e); }
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
    const vgone = keep === Infinity ? [] : vitems.filter((e) => t - e.ts > keep).map((e) => e.id);   // v2.5.7: stored entries of locked links follow the same keep time (only the open ones are reachable)
    if (vgone.length) { const vs = new Set(vgone); vitems = vitems.filter((e) => !vs.has(e.id)); if (canVault()) { try { await adapter.update(Object.fromEntries(vgone.map((id) => [vpath(id), null]))); } catch { /* vault closed meanwhile: they go at the next open */ } } emit(); }
    if (!gone.length) return gone.length + vgone.length;
    const set = new Set(gone); items = items.filter((e) => !set.has(e.id));
    try { await persist({ del: gone }); } catch (e) { log.warn('history', 'prune failed', e); }
    emit(); return gone.length + vgone.length;
  }

  async function record({ link, src }) {
    try {
      if (!link || !link.id || keepMs(getKeep(), isAdmin()) === 0) return null;   // history is off
      if (link.lk) {   // v2.5.4/2.5.7: a locked link is listed only while the vault is open; it is stored in the vault part of the account, never in the normal list, so a locked vault shows no trace
        const tv = now(), lastV = vitems.find((e) => e.lid === link.id && e.src === src);
        if (lastV && tv - lastV.ts < REPEAT_MS) return null;
        const ev = { id: newId(tv), lid: clip(link.id, HISTORY.fields.lid.max), url: clip(link.url, 2048), title: clip(link.title, 300), host: clip(link.host, 253), fid: clip(link.fid, 40), src: clip(src, 10), ts: tv, lk: true };
        vitems.unshift(ev); emit();
        if (canVault()) { try { await adapter.update({ [vpath(ev.id)]: stripLk(ev) }); } catch (e) { log.warn('history', 'locked entry kept in memory only', e); } }   // v2.5.7: stored with the link (vault gate); a failure leaves the memory copy
        return ev;
      }
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
    const vdel = vitems.filter((e) => set.has(e.id)).map((e) => e.id);
    vitems = vitems.filter((e) => !set.has(e.id));
    items = items.filter((e) => !set.has(e.id)); emit();
    if (vdel.length && canVault()) { try { await adapter.update(Object.fromEntries(vdel.map((id) => [vpath(id), null]))); } catch (e) { log.warn('history', 'locked entries not removed', e); } }
    const rest = [...set].filter((id) => !vdel.includes(id));
    if (rest.length) await persist({ del: rest });
  }
  /** v2.5.3: a link was locked: its entries leave the normal list. v2.5.7 (owner): they are MOVED, not thrown away: written into the vault part of the account first (the locked
   *  folders are open while the lock job runs), and only then removed from the normal store(s). If the vault write fails they are still removed from the normal list (privacy first). */
  async function forgetLinks(lids) {
    const set = new Set(lids); if (!set.size) return 0;
    const moving = items.filter((e) => set.has(e.lid));
    let local = [];
    try { if (where() === 'account') local = (await db.getAll('history')).filter((e) => set.has(e.lid)); } catch { /* ignore */ }   // this device's own copy may hold entries too
    const all = [...moving, ...local.filter((e) => !moving.some((m) => m.id === e.id))];
    items = items.filter((e) => !set.has(e.lid));
    for (const e of moving) if (!vitems.some((v) => v.id === e.id)) vitems.push({ ...e, lk: true });
    vitems.sort((a, b) => b.ts - a.ts); emit();
    if (canVault() && all.length) { try { await adapter.update(Object.fromEntries(all.map((e) => [vpath(e.id), stripLk(e)]))); } catch (e) { log.warn('history', 'locked history not stored in the vault', e); } }
    try { if (moving.length) await persist({ del: moving.map((e) => e.id) }); } catch (e) { log.warn('history', 'could not forget locked links', e); }
    try { if (local.length) await db.deleteMany('history', local.map((e) => e.id)); } catch { /* ignore */ }
    return moving.length;
  }
  /** v2.5.7: links were unlocked: their entries go back to the normal list (the store the setting picks) and leave the vault. */
  async function restoreLinks(lids) {
    const set = new Set(lids); if (!set.size) return 0;
    const back = vitems.filter((e) => set.has(e.lid));
    if (!back.length) return 0;
    vitems = vitems.filter((e) => !set.has(e.lid));
    const plain = back.map(({ lk, ...e }) => e);
    for (const e of plain) if (!items.some((i) => i.id === e.id)) items.push(e);
    sortNew(); emit();
    try { await persist({ add: plain }); } catch (e) { log.warn('history', 'restored entries not saved', e); }
    if (canVault()) { try { await adapter.update(Object.fromEntries(back.map((e) => [vpath(e.id), null]))); } catch (e) { log.warn('history', 'vault entries not removed', e); } }
    return back.length;
  }
  async function clear() {
    const vdel = vitems.map((e) => e.id);   // v2.5.7: the open locked entries go too (the closed ones are out of reach until the vault opens, and are cleared then if the person clears again)
    items = []; vitems = []; emit();
    if (vdel.length && canVault()) { try { await adapter.update(Object.fromEntries(vdel.map((id) => [vpath(id), null]))); } catch (e) { log.warn('history', 'locked entries not cleared', e); } }
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
    where, load, prune, record, remove, clear, forgetLinks, restoreLinks, loadLocked,
    /** v2.5.7: stops the live listener (logout, account switch). */
    dispose() { disposed = true; stopWatch(); subs.clear(); },
    /** v2.5.4/2.5.7: the locked folders were locked again: their entries leave the screen and memory (they stay stored in the vault until it opens again). */
    wipeLocked() { vloaded = false; if (vitems.length) { vitems = []; emit(); } },
    list: () => (vitems.length ? [...vitems, ...items].sort((a, b) => b.ts - a.ts) : items),
    isLoaded: () => loaded,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  };
}
