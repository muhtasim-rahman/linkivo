/**
 * Linkivo — js/core/css-loader.js  (v2.1.0)
 * Purpose: load a page's stylesheet once, on demand, so the first paint only needs core + component CSS.
 * API: loadCss(href) -> Promise<void>
 */
const loaded = new Map();
export function loadCss(href) {
  if (loaded.has(href)) return loaded.get(href);
  const p = new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => resolve());
    link.addEventListener('error', () => resolve()); // a missing page stylesheet must not block the page
    setTimeout(resolve, 2500); // ...and neither must a very slow one
    document.head.appendChild(link);
  });
  loaded.set(href, p);
  return p;
}
