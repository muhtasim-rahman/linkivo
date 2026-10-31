/**
 * Linkivo — js/core/app-data.js  (v2.1.0)
 * Purpose: owns the data layer for the current session: the Engine (local for guests, cloud for accounts) and its job queue.
 *          Features call getEngine() / getQueue(); nothing else decides which engine is used.
 * API: initData(session) -> Promise<void>   teardownData() -> Promise<void>   getEngine() getQueue() getImportLog() getHistory() recordOpen(link, src) dataReady() -> boolean
 */
import { createLocalEngine } from '../engine/local-engine.js';
import { createCloudEngine } from '../engine/cloud-engine.js';
import { createRtdbAdapter } from '../engine/rtdb-adapter.js';
import { createJobQueue } from '../engine/job-queue.js';
import { registerImportJobs, pruneJobs } from '../features/import/import-job.js';
import { registerCheckJob } from '../features/check/check-job.js';
import { checkLinks } from './worker-client.js';
import { fetchMeta, whoami } from './worker-client.js';
import { createDeviceService } from './devices.js';
import { loadFirebase } from './firebase-loader.js';
import { log } from './logger.js';
import { prefs } from './local-prefs.js';
import { createSettingsSync } from './settings-sync.js';
import { createImportLog } from './import-log.js';
import { createHistory } from './history.js';   // v2.4.1
import { isAdminView } from './admin.js';

let engine = null, queue = null, scope = null, settingsSync = null, importLog = null, devices = null, history = null;

export async function initData(session) {
  const wanted = session.mode === 'guest' ? 'guest' : session.mode === 'account' ? session.user.uid : null;
  if (!wanted || wanted === scope) return;
  await teardownData();
  try {
    if (session.mode === 'guest') engine = await createLocalEngine();
    else { const firebase = await loadFirebase(); engine = await createCloudEngine({ uid: session.user.uid, adapter: createRtdbAdapter({ firebase }) }); }
    queue = createJobQueue({ db: engine.db, now: () => engine.now() });
    registerCheckJob({ queue, engine, check: checkLinks }); // v2.3.0: dead-link checker (must be registered before start() resumes jobs)
    registerImportJobs({ queue, engine, fetchMeta }); // v2.2.0: import and title-fetch handlers must exist before start() resumes interrupted jobs
    await queue.start();
    pruneJobs(queue).catch(() => {});
    importLog = createImportLog({ adapter: session.mode === 'account' ? engine.adapter : null, uid: session.mode === 'account' ? session.user.uid : null, queue, autoDays: () => (prefs.get('import.autoClear', false) ? 7 : 0) }); // v2.2.2: Recent imports follow the account
    prefs.onChange('import.autoClear', (v) => { if (v) importLog?.purgeOld().catch(() => {}); });   // v2.2.3: turning the setting on cleans the list at once
    startHistory(session);   // v2.4.1
    engine.purgeExpired().catch((e) => log.warn('data', 'recycle bin purge failed', e)); // v2.2.0: items deleted more than 15 days ago go for good
    scope = wanted;
    if (session.mode === 'account') { startSettingsSync(session.user.uid); startDevices(session.user.uid); startAdmin(session.user.uid); } // v2.2.1: the account's settings follow the user across devices
    if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__linkivo = { engine, queue }; // development only
  } catch (e) { log.error('data', 'data layer failed to start', e); engine = null; queue = null; scope = null; throw e; }
}

/** v2.4.1: the History list. Where it is kept (this device or the account) and for how long are settings; a failure here never breaks the app. */
function startHistory(session) {
  try {
    const account = session.mode === 'account';
    history = createHistory({ db: engine.db, adapter: account ? engine.adapter : null, uid: account ? session.user.uid : null, now: () => engine.now(),
      getKeep: () => prefs.get('history.keep', '7d'), getWhere: () => prefs.get('history.where', 'local'), isAdmin: () => isAdminView() });
    const h = history;
    h.load().then(() => h.prune()).catch(() => {});
    prefs.onChange('history.where', () => { if (history === h) h.load().catch(() => {}); });   // another store is shown: read it
    prefs.onChange('history.keep', () => { if (history === h) h.prune().catch(() => {}); });
  } catch (e) { log.warn('data', 'history did not start', e); history = null; }
}
export const getHistory = () => history;
/** Records that a link was opened. `src` is "click" (opened the site), "preview" (opened in the preview) or "random". Never throws. */
export const recordOpen = (link, src) => { try { return history ? history.record({ link, src }) : null; } catch { return null; } };

/** v2.2.1: mirrors the settings catalog's preferences to users/<uid>/settings (js/core/settings-sync.js). A failure here must never break the app. */
async function startSettingsSync(uid) {
  try {
    const { CATALOG } = await import('../features/settings/catalog.js');
    const { syncedEntries, syncedKeySet, choiceKeys } = await import('./sync-choice.js');
    const entries = syncedEntries(CATALOG, prefs);   // v2.3.1: the person's choice (Settings > Account > Select which settings to sync); `device: true` and `local: true` settings start off
    const defaults = Object.fromEntries(entries.map((e) => [e.key, e.default]));
    if (!engine || scope !== uid || !engine.adapter) return;
    // v2.3.2: the choices themselves (sync.c.<id>) are always synced, so every device sees the same list
    settingsSync = createSettingsSync({ adapter: engine.adapter, uid, store: prefs, keys: [...entries.map((e) => e.key), ...choiceKeys(CATALOG)], defaults });
    settingsSync.start();
    // a choice that arrives from another device changes WHICH keys are synced here: rebuild the sync with the new list (only when the list really changed)
    const was = syncedKeySet(CATALOG, prefs); let t = 0;
    for (const off of choiceWatch) { try { off(); } catch { /* ignore */ } } choiceWatch = [];
    for (const k of choiceKeys(CATALOG)) choiceWatch.push(prefs.onChange(k, () => { clearTimeout(t); t = setTimeout(() => { if (scope === uid && syncedKeySet(CATALOG, prefs) !== was) restartSettingsSync(); }, 400); }));
  } catch (e) { log.warn('data', 'settings sync did not start', e); }
}
/** v2.2.2: this device registers itself in users/<uid>/devices and signs out when another device asks it to. Failure never breaks the app. */
async function startDevices(uid) {
  try {
    const { signOutUser } = await import('../features/auth/auth-service.js');
    if (!engine || scope !== uid || !engine.adapter) return;
    const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
    devices = createDeviceService({ adapter: engine.adapter, uid, store: prefs, ua: navigator.userAgent, via: standalone ? 'pwa' : 'web', where: whoami, now: () => engine.now(), signOut: signOutUser });
    await devices.start();
  } catch (e) { log.warn('data', 'device list did not start', e); }
}
/** v2.3.1: is this account in the `admins` list? One read; a failure just means a normal user. */
async function startAdmin(uid) {
  try { const { loadAdmin } = await import('./admin.js'); if (engine && scope === uid && engine.adapter) await loadAdmin(engine.adapter, uid); } catch (e) { log.warn('data', 'admin check did not run', e); }
}
/** v2.3.1: the sync choice changed: stop the running sync and start it again with the new list of keys. */
let choiceWatch = [];
export async function restartSettingsSync() {
  const uid = scope; if (!uid || uid === 'test') return;
  try { settingsSync?.dispose(); } catch { /* ignore */ }
  settingsSync = null; await startSettingsSync(uid);
}
export const getSettingsSync = () => settingsSync;
export const getDevices = () => devices;

export async function teardownData() {
  try { (await import('./admin.js')).clearAdmin(); } catch { /* ignore */ }
  try { settingsSync?.dispose(); } catch { /* ignore */ }
  settingsSync = null; for (const off of choiceWatch) { try { off(); } catch { /* ignore */ } } choiceWatch = [];
  try { devices?.stop(); } catch { /* ignore */ }
  devices = null;
  try { importLog?.dispose(); } catch { /* ignore */ }
  importLog = null; history = null;
  if (engine) { try { engine.dispose(); engine.db.close(); } catch { /* ignore */ } }
  engine = null; queue = null; scope = null;
}

/** Tests only: installs an engine and queue built elsewhere (jsdom has no IndexedDB). */
export function installDataForTests(e, q, l = null, hist = null) { engine = e; queue = q; importLog = l; history = hist; scope = 'test'; }

export const getEngine = () => engine;
export const getQueue = () => queue;
export const getImportLog = () => importLog;
export const dataReady = () => !!engine;
