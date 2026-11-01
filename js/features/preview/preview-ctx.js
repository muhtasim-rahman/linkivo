/**
 * Linkivo — js/features/preview/preview-ctx.js  (v2.4.2)
 * Purpose: tiny shared flag that says whether the Preview on screen is the one INSIDE Random Discover. Random opens many links quickly, so the two services with a
 *          small daily allowance (Microlink, thum.io) are used there only when the person turned them on in Settings > Random Discover (default off).
 * API: setInRandom(boolean)   inRandom() -> boolean   microlinkAllowed() -> boolean   thumAllowed() -> boolean   (the last two only look at the Random switches)
 */
import { prefs } from '../../core/local-prefs.js';

let random = false;
export const setInRandom = (on) => { random = !!on; };
export const inRandom = () => random;
export const microlinkAllowed = () => !random || prefs.get('random.microlink', false) === true;
export const thumAllowed = () => !random || prefs.get('random.thum', false) === true;
