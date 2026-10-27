/**
 * Linkivo — js/core/devices.js  (v2.2.2)
 * Purpose: the list of signed-in devices (users/<uid>/devices/<deviceId>, schema DEVICE). Firebase Auth has no such list, so every signed-in device writes
 *          one small record about itself: browser, system, kind, first and last time seen and the approximate place (from the Worker's /whoami).
 *          Signing a device out from another device:
 *            this is APP-LEVEL sign-out. The other device gets `rv` (a time) written on its record and signs itself out as soon as it sees it (at once if the app
 *            is open, otherwise the next time it is opened). The login token that device already holds is NOT revoked: that needs the Firebase Admin SDK
 *            (service account), which arrives with v2.5.0. The page says so.
 *          A device record is replaced whole at every deliberate sign-in, which also clears an old `rv` and `out`.
 *          v2.2.3 (owner): a device that signed out (on request, or by its own user) does NOT delete its record any more: it writes `out` (the time) and
 *          the list shows it grey as "Signed out" until a person removes it with the cross icon. `rv` without `out` = "Signing out" (yellow).
 * API: createDeviceService({ adapter, uid, store, ua, via, where?, now, signOut }) -> { start(), stop(), list(), signOutDevice(id), forget(id), id }
 *      list() -> Promise<[{ id, ...record, current }]> newest activity first
 */
import { newDeviceId, buildDeviceRecord, signOutRequested } from './device-info.js';
import { log } from './logger.js';

const BEAT_MS = 10 * 60 * 1000;

export function createDeviceService({ adapter, uid, store, ua = '', via = 'web', where = async () => null, now = Date.now, signOut = async () => {} }) {
  let id = store.get('device.id', '');
  if (!id) { id = newDeviceId(); store.set('device.id', id); }
  const base = `users/${uid}/devices`;
  let off = null, timer = 0, lastBeat = 0, stopped = false;

  async function register() {
    const t = now();
    let ts = store.get('device.ts', 0);
    if (!ts) { ts = t; store.set('device.ts', ts); }
    const place = await Promise.race([where().catch(() => null), new Promise((r) => setTimeout(() => r(null), 4000))]);
    await adapter.update({ [`${base}/${id}`]: buildDeviceRecord({ ua, via, where: place, ts, seen: t }) });
    lastBeat = t;
  }
  async function beat() {
    if (stopped || now() - lastBeat < BEAT_MS) return;
    lastBeat = now();
    try { await adapter.update({ [`${base}/${id}/seen`]: now() }); } catch (e) { log.debug?.('devices', 'heartbeat failed', e); }
  }
  async function handleRv(rv) {
    if (stopped || !signOutRequested(rv, store.get('device.login', 0))) return;
    stopped = true; off?.(); clearInterval(timer);   // nothing more to watch or write after this
    try { await adapter.update({ [`${base}/${id}/out`]: now() }); } catch { /* the sign-out goes on; the row then stays yellow until the device opens again */ }
    await signOut();
  }

  return {
    id,
    async start() {
      stopped = false;
      // A stale sign-out request must be looked at BEFORE registering, otherwise the new record would hide it.
      try { const rv = await adapter.get(`${base}/${id}/rv`); if (signOutRequested(rv, store.get('device.login', 0))) { await handleRv(rv); return; } } catch { /* offline: register later */ }
      try { await register(); } catch (e) { log.warn('devices', 'device not registered', e); }
      off = adapter.watchValue(`${base}/${id}/rv`, handleRv);
      const onVis = () => { if (document.visibilityState === 'visible') beat(); };
      document.addEventListener('visibilitychange', onVis);
      timer = setInterval(beat, BEAT_MS);
      this._onVis = onVis;
    },
    stop() { stopped = true; off?.(); clearInterval(timer); if (this._onVis) document.removeEventListener('visibilitychange', this._onVis); },
    async list() {
      const all = (await adapter.get(base)) || {};
      return Object.entries(all).filter(([, r]) => r && typeof r === 'object').map(([k, r]) => ({ id: k, ...r, current: k === id })).sort((a, b) => (b.current ? 1 : 0) - (a.current ? 1 : 0) || (b.seen || 0) - (a.seen || 0));
    },
    /** Asks another device to sign out. The record stays (marked) until that device removes it or someone forgets it. */
    async signOutDevice(otherId) { await adapter.update({ [`${base}/${otherId}/rv`]: now() }); },
    /** Removes a record from the list (a device that was reset and will never come back). */
    async forgetSelf() { try { await adapter.update({ [`${base}/${id}/out`]: now() }); } catch { /* signing out goes on */ } },   // v2.2.3: marked, not deleted
    async forget(otherId) { await adapter.update({ [`${base}/${otherId}`]: null }); }
  };
}
