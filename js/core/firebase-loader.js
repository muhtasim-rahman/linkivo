/**
 * Linkivo — js/core/firebase-loader.js  (v2.1.0)
 * Purpose: lazy-loads the Firebase modular SDK from Google's CDN at ONE pinned version (RULES section 2).
 *          Version 12.19.0 (published 2026-09-09); 13.0.0 was too new when this was written. The CDN path is [verify]:
 *          check it once on the first deploy (the boot log shows a clear error if the import fails).
 * API: loadFirebase() -> Promise<{ app, auth, db, mods:{ app, auth, database } }>   FIREBASE_VERSION
 */
import { FIREBASE_CONFIG } from './config.js';
import { log } from './logger.js';

export const FIREBASE_VERSION = '12.19.0';
const BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
let pending = null;

export function loadFirebase() {
  if (pending) return pending;
  pending = (async () => {
    const t0 = performance.now();
    const [appMod, authMod, dbMod] = await Promise.all([
      import(BASE + 'firebase-app.js'),
      import(BASE + 'firebase-auth.js'),
      import(BASE + 'firebase-database.js')
    ]);
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    const db = dbMod.getDatabase(app);
    log.info('firebase', `SDK ${FIREBASE_VERSION} ready`, { ms: Math.round(performance.now() - t0) });
    return { app, auth, db, mods: { app: appMod, auth: authMod, database: dbMod } };
  })().catch((e) => { pending = null; log.error('firebase', 'SDK failed to load', e); throw e; });
  return pending;
}
