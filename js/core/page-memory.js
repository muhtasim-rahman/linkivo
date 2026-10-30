/**
 * Linkivo — js/core/page-memory.js  (v2.4.0)
 * Purpose: a page remembers its filters and scroll position while the person is away (for example in the Preview) and gets them back when the browser's
 *          Back button returns to it (owner: "closing the preview cleared all filters and jumped to the top of the folder"). Only a BACK or FORWARD move
 *          (`ctx.pop`) restores; opening the page afresh from a link or the menu always starts clean. Memory only: nothing is stored on disk.
 * API: remember(key, state)   recall(key) -> state | null   forget(key)   resetPageMemory()
 */
const saved = new Map();
const MAX = 24;   // a long session must not grow this without limit: the oldest page is dropped

export function remember(key, state) {
  if (!key || !state) return;
  saved.delete(key); saved.set(key, { ...state });
  while (saved.size > MAX) saved.delete(saved.keys().next().value);
}
export const recall = (key) => (saved.has(key) ? { ...saved.get(key) } : null);
export const forget = (key) => { saved.delete(key); };
export const resetPageMemory = () => saved.clear();
