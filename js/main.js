/**
 * Linkivo — js/main.js  (v2.1.1)
 * Purpose: the entry point. Kept tiny on purpose so the splash starts at once; everything else loads in boot.js.
 */
import { installGlobalHandlers, log } from './core/logger.js';
import { applyAppearance } from './core/appearance.js';
import { startSplash } from './features/splash/splash.js';
import { initInstall } from './core/install.js';
import { initInputGuard } from './core/input-guard.js';

installGlobalHandlers();
applyAppearance();
initInstall(); // early on purpose: the browser's install event can fire before the rest of the app has loaded
initInputGuard();
startSplash();
import('./boot.js').then((m) => m.boot()).catch((e) => {
  log.error('boot', 'the app could not start', e);
  const fail = document.getElementById('splash-fail');
  if (fail) fail.hidden = false;
});
