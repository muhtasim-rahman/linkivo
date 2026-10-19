/**
 * Linkivo — js/engine/local-engine.js  (v2.1.0)
 * Purpose: guest-mode engine. IndexedDB is the only storage (database "linkivo-guest"): nothing ever leaves the device.
 * API: createLocalEngine({ db?, now? }) -> Promise<Engine> (already initialised)   GUEST_DB
 */
import { Engine } from './engine.js';
import { openDbSafe } from './idb.js';

export const GUEST_DB = 'linkivo-guest';

export async function createLocalEngine({ db, now, sleep } = {}) {
  const engine = new Engine({ kind: 'guest', db: db || (await openDbSafe(GUEST_DB)), now, sleep });
  await engine.init();
  return engine;
}
