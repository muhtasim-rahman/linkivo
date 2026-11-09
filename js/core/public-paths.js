/**
 * Linkivo — js/core/public-paths.js  (v2.5.4)
 * Purpose: which addresses are PUBLIC STATIC PAGES (Documentation, Privacy, Terms), not routes of the app. They are separate pages with no app lock, no splash and no sidebar,
 *          so the app never renders them itself: a link to one opens it in a NEW tab (Menu, Settings, Search), and a start on one of these addresses (a rewrite that served the app shell)
 *          goes to the real page once.
 *          v2.5.5: openPublic uses a target=_blank link click (see below), so it opens ONE new tab and never moves the app's own tab.
 * API: isPublicPath(path) -> boolean     openPublic(path) -> void
 */
export const PUBLIC_RE = /^\/(docs(\/[a-z0-9-]+)?|privacy|terms)\/?$/;
export const isPublicPath = (p) => PUBLIC_RE.test(String(p || '').split(/[?#]/)[0]);
/** v2.5.5 (owner: it opened in a new tab AND in the same tab). Cause: window.open(url, '_blank', 'noopener') ALWAYS returns null (that is what "noopener" means), so the old fallback for a
 *  blocked pop-up ran every time and moved this tab too. A click on a target=_blank link opens exactly one new tab and needs no return value. Never moves the app's own tab. */
export function openPublic(path) {
  try {
    const a = document.createElement('a');
    a.href = path; a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  } catch { /* nothing else to try: the app stays where it is */ }
}
