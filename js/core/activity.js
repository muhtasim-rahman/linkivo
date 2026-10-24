/**
 * Linkivo — js/core/activity.js  (v2.2.0)
 * Purpose: activity-log HOOKS. Features call logActivity(type, info) when something notable happens (import, export, delete, restore, merge).
 *          Entries are kept on this device in the scope database (store "meta", key "activity", newest 500). The Activity page and the cloud
 *          copy (tree activity/<uid>, already in the rules) arrive in v2.6.0; until then this only collects.
 * API: logActivity(engine, type, info) -> Promise<void>   listActivity(engine) -> Promise<[{ type, info, ts }]>   ACTIVITY_LIMIT
 *      Types used in v2.2.0: import export delete restore merge duplicate folder-delete empty-bin
 */
export const ACTIVITY_LIMIT = 500;
const KEY = 'activity';

export async function listActivity(engine) {
  const rec = await engine.db.get('meta', KEY);
  return rec && Array.isArray(rec.value) ? rec.value : [];
}

export async function logActivity(engine, type, info = '') {
  if (!engine) return;
  try {
    const list = await listActivity(engine);
    list.unshift({ type: String(type).slice(0, 24), info: String(info).slice(0, 200), ts: engine.now() });
    await engine.db.put('meta', { key: KEY, value: list.slice(0, ACTIVITY_LIMIT) });
  } catch { /* the log is a convenience: it must never break the action that wrote it */ }
}
