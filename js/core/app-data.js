/**
 * Linkivo — js/core/app-data.js  (v2.1.0)
 * Purpose: owns the data layer for the current session: the Engine (local for guests, cloud for accounts) and its job queue.
 *          Features call getEngine() / getQueue(); nothing else decides which engine is used.
 * API: initData(session) -> Promise<void>   teardownData() -> Promise<void>   getEngine() getQueue() getImportLog() dataReady() -> boolean
 */
import { createLocalEngine } from '../engine/local-engine.js';
import { createCloudEngine } from '../engine/cloud-engine.js';
import { createRtdbAdapter } from '../engine/rtdb-adapter.js';
import { createJobQueue } from '../engine/job-queue.js';
import { registerImportJobs, pruneJobs } from '../features/import/import-job.js';
import { fetchMeta, whoami } from './worker-client.js';
import { createDeviceService } from './devices.js';
import { loadFirebase } from './firebase-loader.js';
import { log } from './logger.js';
import { prefs } from './local-prefs.js';
import { createSettingsSync } from './settings-sync.js';
import { createImportLog } from './import-log.js';

let engine = null, queue = null, scope = null, settingsSync = null, importLog = null, devices = null;

export async function initData(session) {
  const wanted = session.mode === 'guest' ? 'guest' : session.mode === 'account' ? session.user.uid : null;
  if (!wanted || wanted === scope) return;
  await teardownData();
  try {
    if (session.mode === 'guest') engine = await createLocalEngine();
    else { const firebase = await loadFirebase(); engine = await createCloudEngine({ uid: session.user.uid, adapter: createRtdbAdapter({ firebase }) }); }
    queue = createJobQueue({ db: engine.db, now: () => engine.now() });
    registerImportJobs({ queue, engine, fetchMeta }); // v2.2.0: import and title-fetch handlers must exist before start() resumes interrupted jobs
    await queue.start();
    pruneJobs(queue).catch(() => {});
    importLog = createImportLog({ adapter: session.mode === 'account' ? engine.adapter : null, uid: session.mode === 'account' ? session.user.uid : null, queue, autoDays: () => (prefs.get('import.autoClear', false) ? 7 : 0) }); // v2.2.2: Recent imports follow the account
    prefs.onChange('import.autoClear', (v) => { if (v) importLog?.purgeOld().catch(() => {}); });   // v2.2.3: turning the setting on cleans the list at once
    engine.purgeExpired().catch((e) => log.warn('data', 'recycle bin purge failed', e)); // v2.2.0: items deleted more than 15 days ago go for good
    scope = wanted;
    if (session.mode === 'account') { startSettingsSync(session.user.uid); startDevices(session.user.uid); } // v2.2.1: the account's settings follow the user across devices
    if (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__linkivo = { engine, queue }; // development only
  } catch (e) { log.error('data', 'data layer failed to start', e); engine = null; queue = null; scope = null; throw e; }
}

/** v2.2.1: mirrors the settings catalog's preferences to users/<uid>/settings (js/core/settings-sync.js). A failure here must never break the app. */
async function startSettingsSync(uid) {
  try {
    const { CATALOG } = await import('../features/settings/catalog.js');
    const entries = CATALOG.filter((e) => e.key && !e.device);                 // `device: true` on a catalog entry keeps it on this device only
    const defaults = Object.fromEntries(entries.map((e) => [e.key, e.default]));
    if (!engine || scope !== uid || !engine.adapter) return;
    settingsSync = createSettingsSync({ adapter: engine.adapter, uid, store: prefs, keys: entries.map((e) => e.key), defaults });
    settingsSync.start();
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
export const getSettingsSync = () => settingsSync;
export const getDevices = () => devices;

export async function teardownData() {
  try { settingsSync?.dispose(); } catch { /* ignore */ }
  settingsSync = null;
  try { devices?.stop(); } catch { /* ignore */ }
  devices = null;
  try { importLog?.dispose(); } catch { /* ignore */ }
  importLog = null;
  if (engine) { try { engine.dispose(); engine.db.close(); } catch { /* ignore */ } }
  engine = null; queue = null; scope = null;
}

/** Tests only: installs an engine and queue built elsewhere (jsdom has no IndexedDB). */
export function installDataForTests(e, q, l = null) { engine = e; queue = q; importLog = l; scope = 'test'; }

export const getEngine = () => engine;
export const getQueue = () => queue;
export const getImportLog = () => importLog;
export const dataReady = () => !!engine;
