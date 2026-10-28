/**
 * Linkivo — js/core/keyboard-safe.js  (v2.2.1)
 * Purpose: on a phone the on-screen keyboard must never cover the field being typed in (owner report: the fixed import fields slid below the keyboard).
 *          Two layers: (1) index.html asks Chrome to resize the page for the keyboard (interactive-widget=resizes-content); (2) this module covers iOS Safari,
 *          which only moves the VISUAL viewport: it measures the keyboard with visualViewport, sets --kb / --vvh / --vvt on <html> and marks
 *          data-kb="open", and css/components/kit.css shrinks #app to the visible area and hides the floating bars. The focused field is scrolled into view.
 *          v2.3.1 (owner: on a phone the bottom bar rose above the keyboard while searching): with `resizes-content` (Android Chrome) the layout viewport itself
 *          shrinks, so innerHeight and the visual viewport agree and the old measure said "no keyboard". The tallest height seen at this width is now the
 *          baseline, and a text field that has focus while the page is more than 120px shorter than the baseline counts as an open keyboard.
 * API: initKeyboardSafe() -> void      keyboardHeight(inner, vvHeight, vvTop) -> px (pure, tested)      isTextField(el) -> boolean (pure)
 *      keyboardGap(baseline, inner, vvHeight, vvTop) -> px (pure, tested: the larger of the visual-viewport gap and the resize of the page)
 */
export const keyboardHeight = (inner, vvHeight, vvTop = 0) => Math.max(0, Math.round(inner - vvHeight - vvTop));
/** The keyboard height from both signals: the visual viewport (iOS) and the page that was resized (Android with resizes-content). */
export const keyboardGap = (baseline, inner, vvHeight, vvTop = 0) => Math.max(keyboardHeight(inner, vvHeight, vvTop), Math.max(0, Math.round(baseline - inner)));
export const isTextField = (el) => !!el && ((el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable === true) || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type)));

export function initKeyboardSafe() {
  const vv = window.visualViewport, root = document.documentElement;
  let base = window.innerHeight, baseW = window.innerWidth;
  const update = () => {
    if (window.innerWidth !== baseW) { baseW = window.innerWidth; base = window.innerHeight; }   // rotation or a resized window: measure again
    else base = Math.max(base, window.innerHeight);
    const kb = keyboardGap(base, window.innerHeight, vv ? vv.height : window.innerHeight, vv ? vv.offsetTop : 0);
    const open = kb > 120 && isTextField(document.activeElement);   // under 120px it is a toolbar or an address bar, not a keyboard
    if (open) { root.dataset.kb = 'open'; root.style.setProperty('--kb', kb + 'px'); root.style.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px'); root.style.setProperty('--vvt', (vv ? vv.offsetTop : 0) + 'px'); }
    else { delete root.dataset.kb; root.style.removeProperty('--kb'); root.style.removeProperty('--vvh'); root.style.removeProperty('--vvt'); }
  };
  vv?.addEventListener('resize', update); vv?.addEventListener('scroll', update); window.addEventListener('resize', update);   // v2.3.1: also the page itself (Android)
  document.addEventListener('focusin', (e) => {
    if (!isTextField(e.target)) return;
    // wait for the keyboard animation, then bring the field to the middle of what is left
    setTimeout(() => { update(); try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* old browsers */ } }, 320);
  });
  document.addEventListener('focusout', () => setTimeout(update, 120));
}
