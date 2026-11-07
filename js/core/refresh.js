/**
 * Linkivo — js/core/refresh.js  (v2.5.3)
 * Purpose: ONE refresh for the whole app (owner: the Refresh button did nothing on many pages). Refresh = bring in what changed (account sync) and then rebuild the page on screen
 *          from scratch, which is what a reload does to the page's data, without the splash or an app restart. The pull-down gesture, the header icon and the folder menu all call it.
 *          boot.js installs the real handler once the router exists.
 * API: setRefreshHandler(fn)   refreshApp() -> Promise<void>
 */
let handler = null;
export const setRefreshHandler = (fn) => { handler = fn; };
export const refreshApp = async () => { if (handler) await handler(); };
