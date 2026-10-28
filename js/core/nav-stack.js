/**
 * Linkivo — js/core/nav-stack.js  (v2.1.0, history-backed since v2.3.1)
 * Purpose: back-layer stack. Every overlay (sheet, dialog, popover, preview panel, minimized-job details) registers
 *          here when it opens, so the Back button closes the topmost overlay before any page navigation (ARCHITECTURE s.7).
 *          v2.3.1 (owner: "Back with a three-dot menu open goes to the previous page and the menu stays"): since v2.2.4 Back is the browser's own and the
 *          router showed the page of the address bar without asking the overlays, so NO overlay closed on Back. Now each layer pushes ONE history entry
 *          when it opens; the router asks handlePop() first, which closes the top layer when that entry is popped. When a layer is closed another way
 *          (a tap, Escape, a button) its entry is removed again in the next tick, but only while it is still the top entry: a navigation that happened
 *          in between (a menu item that opens a page) must not be undone. A leftover entry is skipped automatically the next time Back reaches it.
 * API: pushLayer(close) -> { remove() }   closeTopLayer() -> boolean   layerCount()   resetLayers()   handlePop() -> boolean (true = the popstate was consumed)
 *   `close` must dismiss the overlay (it normally calls handle.remove() itself).
 */
const layers = [];
let skip = 0;        // popstate events that WE caused with history.back(): the router must not see them
let nextId = 1;
const hist = () => (typeof history !== 'undefined' && typeof history.pushState === 'function' ? history : null);
const marker = (id) => ({ lk: 'layer', id });
const isMarker = (s) => !!s && s.lk === 'layer';

export function pushLayer(close) {
  const layer = { close, id: nextId++, entry: false };
  layers.push(layer);
  const H = hist();
  if (H) { try { H.pushState(marker(layer.id), '', location.href); layer.entry = true; } catch { /* no history: Back just leaves the page, as before */ } }
  return {
    remove() {
      const i = layers.indexOf(layer); if (i >= 0) layers.splice(i, 1);
      if (!layer.entry) return;
      layer.entry = false;
      // next tick, only when this layer's entry is still the current one (no navigation happened since)
      setTimeout(() => { const h = hist(); if (h && isMarker(h.state) && h.state.id === layer.id) { skip++; h.back(); } }, 0);
    }
  };
}

/** Close the top layer from code (not from the Back button). Its history entry is left for handlePop() to skip later. */
export function closeTopLayer() {
  const top = layers[layers.length - 1];
  if (!top) return false;
  layers.pop(); top.entry = false;
  try { top.close(); } catch { /* closing must never throw into the router */ }
  return true;
}

/** Called by the router on every popstate. Returns true when the event was ours (the router then does nothing). */
export function handlePop() {
  if (skip > 0) { skip--; return true; }
  if (layers.length) {
    const top = layers.pop(); top.entry = false;   // its entry has just been popped by the browser
    try { top.close(); } catch { /* ignore */ }
    return true;
  }
  const h = hist();
  if (h && isMarker(h.state)) { skip++; h.back(); return true; }   // a leftover entry of a layer that is long closed: step over it
  return false;
}

export const layerCount = () => layers.length;
export const resetLayers = () => { layers.length = 0; };
