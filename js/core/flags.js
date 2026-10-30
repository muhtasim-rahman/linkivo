/**
 * Linkivo — js/core/flags.js  (v2.1.0)
 * Purpose: feature flags, so a feature of a later version can ship disabled (RULES section 1).
 * API: isEnabled(name) -> boolean   FLAGS (read-only defaults)
 * A developer can force a flag with prefs key "flag.<name>" (true/false) on localhost only.
 */
import { prefs } from './local-prefs.js';

export const FLAGS = Object.freeze({
  randomFromFolder: true,  // Folder view "Random from this folder" button (enabled in v2.4.0)
  shareTarget: true,       // Web Share Target (switched on in v2.3.0)
  appLock: false           // App lock and vault UI (v2.5.0)
});

export function isEnabled(name) {
  if (!(name in FLAGS)) return false;
  const dev = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (dev) { const o = prefs.get('flag.' + name, null); if (typeof o === 'boolean') return o; }
  return FLAGS[name];
}
