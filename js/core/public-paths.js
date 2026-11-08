/**
 * Linkivo — js/core/public-paths.js  (v2.5.4)
 * Purpose: which addresses are PUBLIC STATIC PAGES (Documentation, Privacy, Terms), not routes of the app. They are separate pages with no app lock, no splash and no sidebar,
 *          so the app never renders them itself: a link to one opens it in a NEW tab (Menu, Settings, Search), and a start on one of these addresses (a rewrite that served the app shell)
 *          goes to the real page once.
 * API: isPublicPath(path) -> boolean     openPublic(path) -> void
 */
export const PUBLIC_RE = /^\/(docs(\/[a-z0-9-]+)?|privacy|terms)\/?$/;
export const isPublicPath = (p) => PUBLIC_RE.test(String(p || '').split(/[?#]/)[0]);
export function openPublic(path) {
  let w = null;
  try { w = window.open(path, '_blank', 'noopener'); } catch { w = null; }
  if (!w) location.assign(path);   // a blocked pop-up: open it here instead of doing nothing
}
