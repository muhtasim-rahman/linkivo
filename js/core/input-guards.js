/**
 * Linkivo — js/core/input-guards.js  (v2.1.2)
 * Purpose: owner request (v2.1.2): no browser context menu on right-click (PC) and no long-press menu (phones). Controlled by the
 *          setting "Block right-click and long-press" (default on). Text fields and anything marked .selectable keep their normal
 *          menu so copy and paste still work. The matching CSS (no text selection, no touch callout) is in css/core/base.css.
 * API: installInputGuards() -> void     shouldBlockContext(target, enabled) -> boolean (pure, tested)
 */
import { prefs } from './local-prefs.js';
import { KEYS } from './appearance.js';

export function shouldBlockContext(target, enabled) {
  if (!enabled) return false;
  const el = target && target.closest ? target : target && target.parentElement;
  return !(el && el.closest && el.closest('input, textarea, [contenteditable=""], [contenteditable="true"], .selectable'));
}

export function installInputGuards() {
  document.addEventListener('contextmenu', (e) => { if (shouldBlockContext(e.target, prefs.get(KEYS.blockMenu, true))) e.preventDefault(); });
}
