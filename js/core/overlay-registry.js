/**
 * Linkivo — js/core/overlay-registry.js  (v2.5.2)
 * Purpose: one list of everything that sits ABOVE the page (sheets, dialogs, popover menus, the clipboard card). The app lock needs to remove all of it
 *          at once: before v2.5.2 `router.suspend()` only emptied the back-layer array, so an open popup (for example Edit profile) stayed on screen over
 *          the lock screen, kept the page inert, and its Back entry was gone, which is why closing it later never led to the PIN gate (owner report 4).
 * API: trackOverlay(forceClose) -> untrack()   closeAllOverlays() -> number closed   overlayCount()
 *      forceClose is called WITHOUT any "discard changes?" question: a locked app does not ask, it closes. Unsaved typing is lost by design.
 */
const open = new Set();

export function trackOverlay(forceClose) {
  open.add(forceClose);
  return () => { open.delete(forceClose); };
}

export const overlayCount = () => open.size;

/** Closes every tracked overlay, then sweeps the DOM for any stray overlay node (defence in depth), and clears the toasts. */
export function closeAllOverlays() {
  let n = 0;
  for (const fn of [...open]) { n++; try { fn(); } catch { /* closing must never throw into the lock */ } }
  open.clear();
  if (typeof document !== 'undefined') {
    for (const el of document.querySelectorAll('.overlay, .pop-menu, .pop-backdrop, .clip-card')) el.remove();
    const host = document.getElementById('toast-host'); if (host) host.replaceChildren();
    const app = document.getElementById('app'); if (app) app.inert = false;
  }
  return n;
}
