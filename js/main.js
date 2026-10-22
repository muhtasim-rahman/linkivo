/**
 * Linkivo — js/main.js  (v2.1.2)
 * Purpose: the entry point. Kept tiny on purpose so the splash starts at once; everything else loads in boot.js.
 */
import { installGlobalHandlers, log } from './core/logger.js';
import { applyAppearance } from './core/appearance.js';
import { startSplash } from './features/splash/splash.js';
import { initInstall } from './core/install.js';
import { installInputGuards } from './core/input-guards.js';

installGlobalHandlers();
applyAppearance();
startSplash();
// The browser fires `beforeinstallprompt` soon after load, often BEFORE boot.js has been imported. In v2.1.0 the listener was added
// inside boot() and the event was missed (the install banner and button never appeared on PC). Listen from the first line instead.
initInstall();
installInputGuards();
import('./boot.js').then((m) => m.boot()).catch((e) => {
  log.error('boot', 'the app could not start', e);
  const fail = document.getElementById('splash-fail');
  if (fail) fail.hidden = false;
});
