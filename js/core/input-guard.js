/**
 * Linkivo — js/core/input-guard.js  (v2.1.1)
 * Purpose: owner request: no right-click menu on PC and no long-press menu on phones. Text fields, textareas and elements marked
 *          .selectable keep their normal menu (copy and paste must keep working). Settings > Controls > "Allow the browser menu" turns this off.
 *          Text selection and the touch callout are switched off in CSS (base.css); this handles the contextmenu event itself.
 * API: initInputGuard() -> void     isGuardTarget(el) -> boolean (pure helper, tested)
 */
import { prefs } from './local-prefs.js';
import { KEYS } from './appearance.js';

const KEEP = 'input, textarea, select, [contenteditable="true"], .selectable';
export function isGuardTarget(el) { return !(el && el.closest && el.closest(KEEP)); }

export function initInputGuard() {
  document.addEventListener('contextmenu', (e) => {
    if (prefs.get(KEYS.contextMenu, false)) return;
    if (isGuardTarget(e.target)) e.preventDefault();
  });
}
