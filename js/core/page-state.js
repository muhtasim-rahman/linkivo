/**
 * Linkivo — js/core/page-state.js  (v2.4.1)
 * Purpose: remembers where a list page was (search text, filters, sort, view and scroll) while the person is on another page, so the browser's Back button
 *          returns to the same place instead of a fresh page (owner: closing a preview sent the folder back to the top with every filter cleared).
 *          Pages call savePageState() when they unmount and takePageState() when they mount after Back or Forward (router passes ctx.pop = true).
 *          A normal visit, for example tapping a folder in the Library, starts clean. Memory only: a reload starts clean too.
 * API: savePageState(key, state)  takePageState(key, { pop }) -> state | null   clearPageStates()
 */
const MAX = 12;           // a person never walks back through more than a handful of lists
const store = new Map();  // key -> { state, at }

export function savePageState(key, state) {
  if (!key || !state) return;
  store.delete(key); store.set(key, { state, at: Date.now() });
  while (store.size > MAX) store.delete(store.keys().next().value);   // drop the oldest
}

/** Returns the saved state only after Back or Forward (`pop`). A fresh visit never restores, so it always starts clean. */
export function takePageState(key, { pop = false } = {}) {
  const hit = store.get(key);
  if (!hit || !pop) { if (!pop) store.delete(key); return null; }
  return hit.state;
}

export const clearPageStates = () => store.clear();
