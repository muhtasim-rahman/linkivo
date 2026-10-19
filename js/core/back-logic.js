/**
 * Linkivo — js/core/back-logic.js  (v2.1.0)
 * Purpose: PURE decision for the Back button (unit-tested). The router does the side effects.
 * Order: 1) close the topmost overlay  2) go to the route's parent  3) at the root: first press shows a hint,
 *        a second press within 2 seconds leaves the app.
 * API: resolveBack({ layerCount, parent, now, lastRootBackAt, exitWindowMs }) -> {type, to?}
 *      type: 'close-layer' | 'navigate' | 'root-first' | 'exit'
 */
export function resolveBack({ layerCount = 0, parent = null, now = Date.now(), lastRootBackAt = 0, exitWindowMs = 2000 } = {}) {
  if (layerCount > 0) return { type: 'close-layer' };
  if (parent) return { type: 'navigate', to: parent };
  if (lastRootBackAt && now - lastRootBackAt <= exitWindowMs) return { type: 'exit' };
  return { type: 'root-first' };
}
