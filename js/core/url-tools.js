/**
 * Linkivo — js/core/url-tools.js  (v2.1.0)
 * Purpose: URL parsing and the normalization key used for de-duplication (ARCHITECTURE section 6).
 *          Link EXTRACTION from free text arrives in v2.2.0; this module only handles single URLs.
 * API: parseUrl(input, {assumeHttps}) -> URL|null   hostOf(input) -> "example.com"   dedupeKey(input) -> string|null
 *      cleanTracking(input) -> string   TRACKING_PARAMS
 *      isIconUrl(input) -> boolean   (v2.2.1: favicon and app-icon files, which are not pages and should not be imported as links)
 */
export const TRACKING_PARAMS = /^(utm_[a-z0-9_]*|fbclid|gclid|gbraid|wbraid|dclid|msclkid|mc_[a-z]+|igshid|yclid|twclid|ttclid|li_fat_id|_ga|_gl|_hsenc|_hsmi|vero_id|oly_[a-z_]+|mkt_tok|ref_src|ref_url)$/i;

export function parseUrl(input, { assumeHttps = false } = {}) {
  if (typeof input !== 'string') return null;
  let s = input.trim();
  if (!s || /\s/.test(s)) return null;
  if (assumeHttps && !/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) s = 'https://' + s.replace(/^\/\//, '');
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname || !u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u;
  } catch { return null; }
}

export function hostOf(input) {
  const u = input instanceof URL ? input : parseUrl(input, { assumeHttps: true });
  return u ? u.hostname.toLowerCase().replace(/^www\./, '') : '';
}

/** Remove tracking parameters, keep everything else untouched. */
export function cleanTracking(input) {
  const u = parseUrl(input);
  if (!u) return input;
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  return u.toString();
}

/** Same page, different spelling -> same key (host case, www, fragment, tracking, param order, trailing slash). */
export function dedupeKey(input) {
  const u = parseUrl(input, { assumeHttps: true });
  if (!u) return null;
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  let path = u.pathname.replace(/\/+$/, '');
  if (path === '') path = '';
  const port = u.port && !['80', '443'].includes(u.port) ? ':' + u.port : '';
  const q = u.searchParams.toString();
  return `${host}${port}${path}${q ? '?' + q : ''}`;
}

/** v2.2.1: true for favicon / app-icon files and favicon services. Pages that merely mention "favicon" in a path segment name are NOT matched. */
const ICON_FILE = /(^|\/)(favicon[\w.-]*|apple-touch-icon[\w.-]*|android-chrome-[\w.-]*|mstile-[\w.-]*|safari-pinned-tab|site-icon[\w.-]*)\.(ico|png|svg|jpe?g|gif|webp)$/i;
const ICON_HOSTS = /^(icons\.duckduckgo\.com|favicon\.yandex\.net|favicon\.im|favicons?\.[a-z0-9.-]+|t[0-3]\.gstatic\.com)$/i;
export function isIconUrl(input) {
  const u = parseUrl(input, { assumeHttps: true });
  if (!u) return false;
  const path = u.pathname.toLowerCase(), host = u.hostname.toLowerCase();
  if (path.endsWith('.ico') || ICON_FILE.test(path)) return true;
  if (/(^|\.)google\.com$/.test(host) && path.startsWith('/s2/favicons')) return true;
  if (/(^|\.)gstatic\.com$/.test(host) && path.startsWith('/favicon')) return true;
  return ICON_HOSTS.test(host);
}
