/**
 * Linkivo — js/features/splash/splash-start.js  (v2.1.3)
 * Purpose: starts the splash animation from a tiny module graph (splash.js, local-prefs.js, utils.js) that index.html loads and preloads BEFORE
 *          main.js. main.js pulls in dozens of modules; waiting for all of them before the first animation frame left new visitors on an empty
 *          background. startSplash() is idempotent, so main.js calling it again is harmless.
 */
import { startSplash } from './splash.js';

startSplash();
