/**
 * Linkivo — js/ui/dock.js  (v2.2.1)
 * Purpose: a bar that is ALWAYS fixed at the bottom of the page area (owner request): the selection bar of the folder page and the Recycle Bin, the
 *          import action bar. It is placed inside .app-main (not inside the scrolling page), so it never scrolls away, stays beside the sidebar on wide
 *          screens, sits above the floating bottom bar on phones and drops to the bottom edge while the keyboard is open (css/components/kit.css).
 * API: mountDock(el) -> remove()
 */
export function mountDock(el) {
  const host = document.querySelector('.app-main') || document.body;
  el.classList.add('dock');
  host.appendChild(el);
  return () => el.remove();
}
