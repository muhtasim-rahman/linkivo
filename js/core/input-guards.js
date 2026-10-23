/**
 * Linkivo — js/core/input-guards.js  (v2.1.3)
 * Purpose: owner request (v2.1.2): no browser context menu on right-click (PC) and no long-press menu (phones). Always on since v2.1.3
 *          (the on/off setting was removed on the owner's request). Text fields and anything marked .selectable keep their normal
 *          menu so copy and paste still work. The matching CSS (no text selection, no touch callout) is in css/core/base.css.
 * v2.1.3: text can always be selected. If some text IS selected, the native menu stays available so Copy works (right-click on a selection,
 *          or the long-press toolbar on phones). Right-click on an IMAGE opens the app's own small image menu instead (ui/image-menu.js).
 * API: installInputGuards() -> void     shouldBlockContext(target, enabled, hasSelection) -> boolean (pure, tested)
 */
export function shouldBlockContext(target, enabled, hasSelection = false) {
  if (!enabled || hasSelection) return false;
  const el = target && target.closest ? target : target && target.parentElement;
  return !(el && el.closest && el.closest('input, textarea, [contenteditable=""], [contenteditable="true"], .selectable'));
}

export function installInputGuards() {
  document.addEventListener('contextmenu', (e) => {
    const sel = typeof getSelection === 'function' ? getSelection() : null;
    if (shouldBlockContext(e.target, true, !!sel && !sel.isCollapsed && sel.toString().trim().length > 0)) e.preventDefault();
  });
}
