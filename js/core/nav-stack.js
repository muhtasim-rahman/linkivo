/**
 * Linkivo — js/core/nav-stack.js  (v2.1.0)
 * Purpose: back-layer stack. Every overlay (sheet, dialog, popover, preview panel, minimized-job details) registers
 *          here when it opens, so the Back button closes the topmost overlay before any page navigation (ARCHITECTURE s.7).
 * API: pushLayer(close) -> { remove() }   closeTopLayer() -> boolean   layerCount()   resetLayers()
 *   `close` must dismiss the overlay (it normally calls handle.remove() itself).
 */
const layers = [];

export function pushLayer(close) {
  const layer = { close };
  layers.push(layer);
  return { remove() { const i = layers.indexOf(layer); if (i >= 0) layers.splice(i, 1); } };
}
export function closeTopLayer() {
  const top = layers[layers.length - 1];
  if (!top) return false;
  layers.pop();
  try { top.close(); } catch { /* closing must never throw into the router */ }
  return true;
}
export const layerCount = () => layers.length;
export const resetLayers = () => { layers.length = 0; };
