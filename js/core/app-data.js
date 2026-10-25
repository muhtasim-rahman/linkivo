/**
 * Linkivo — js/core/app-data.js  (v2.1.0)
 * Purpose: owns the data layer for the current session: the Engine (local for guests, cloud for accounts) and its job queue.
 *          Features call getEngine() / getQueue(); nothing else decides which engine is used.
 * API: initData(session) -> Promise<void>   teardownData() -> Promise<void>   getEngine() getQueue() dataReady() -> boolean
 */
import { createLocalEngine } from '../engine/local-engine.js';
import { createCloudEngine } from '../engine/cloud-engine.js';
import { createRtdbAdapter } from '../engine/rtdb-adapter.js';
import { createJobQueue } from '../engine/job-queue.js';
import { registerImportJobs, pruneJobs } from '../features/import/import-job.js';
import { fetchMeta } from './worker-client.js';
import { loadFirebase } from './firebase-loader.js';
import { log } from './logger.js';
import { prefs } from './local-prefs.js';
import { createSettingsSync } from './settings-sync.js';

let engine = null, queue = null, scope = null, settingsSync = null;

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
    engine.purgeExpired().catch((e) => log.warn('data', 'recycle bin purge failed', e)); // v2.2.0: items deleted more than 15 days ago go for good
    scope = wanted;
    if (session.mode === 'account') startSettingsSync(session.user.uid); // v2.2.1: the account's settings follow the user across devices
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
export const getSettingsSync = () => settingsSync;

export async function teardownData() {
  try { settingsSync?.dispose(); } catch { /* ignore */ }
  settingsSync = null;
  if (engine) { try { engine.dispose(); engine.db.close(); } catch { /* ignore */ } }
  engine = null; queue = null; scope = null;
}

/** Tests only: installs an engine and queue built elsewhere (jsdom has no IndexedDB). */
export function installDataForTests(e, q) { engine = e; queue = q; scope = 'test'; }

export const getEngine = () => engine;
export const getQueue = () => queue;
export const dataReady = () => !!engine;
