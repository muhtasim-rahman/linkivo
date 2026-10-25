/**
 * Linkivo — js/core/keyboard-safe.js  (v2.2.1)
 * Purpose: on a phone the on-screen keyboard must never cover the field being typed in (owner report: the fixed import fields slid below the keyboard).
 *          Two layers: (1) index.html asks Chrome to resize the page for the keyboard (interactive-widget=resizes-content); (2) this module covers iOS Safari,
 *          which only moves the VISUAL viewport: it measures the keyboard with visualViewport, sets --kb / --vvh / --vvt on <html> and marks
 *          data-kb="open", and css/components/kit.css shrinks #app to the visible area and hides the floating bars. The focused field is scrolled into view.
 * API: initKeyboardSafe() -> void      keyboardHeight(inner, vvHeight, vvTop) -> px (pure, tested)      isTextField(el) -> boolean (pure)
 */
export const keyboardHeight = (inner, vvHeight, vvTop = 0) => Math.max(0, Math.round(inner - vvHeight - vvTop));
export const isTextField = (el) => !!el && ((el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true) || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type)));

export function initKeyboardSafe() {
  const vv = window.visualViewport, root = document.documentElement;
  const update = () => {
    const kb = vv ? keyboardHeight(window.innerHeight, vv.height, vv.offsetTop) : 0;
    const open = kb > 120 && isTextField(document.activeElement);   // under 120px it is a toolbar or an address bar, not a keyboard
    if (open) { root.dataset.kb = 'open'; root.style.setProperty('--kb', kb + 'px'); root.style.setProperty('--vvh', vv.height + 'px'); root.style.setProperty('--vvt', vv.offsetTop + 'px'); }
    else { delete root.dataset.kb; root.style.removeProperty('--kb'); root.style.removeProperty('--vvh'); root.style.removeProperty('--vvt'); }
  };
  vv?.addEventListener('resize', update); vv?.addEventListener('scroll', update);
  document.addEventListener('focusin', (e) => {
    if (!isTextField(e.target)) return;
    // wait for the keyboard animation, then bring the field to the middle of what is left
    setTimeout(() => { update(); try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* old browsers */ } }, 320);
  });
  document.addEventListener('focusout', () => setTimeout(update, 120));
}
