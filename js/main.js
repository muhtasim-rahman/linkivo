/**
 * Linkivo — js/main.js  (v2.1.0)
 * Purpose: the entry point. Kept tiny on purpose so the splash starts at once; everything else loads in boot.js.
 */
import { installGlobalHandlers, log } from './core/logger.js';
import { applyAppearance } from './core/appearance.js';
import { startSplash } from './features/splash/splash.js';

installGlobalHandlers();
applyAppearance();
startSplash();
import('./boot.js').then((m) => m.boot()).catch((e) => {
  log.error('boot', 'the app could not start', e);
  const fail = document.getElementById('splash-fail');
  if (fail) fail.hidden = false;
});
