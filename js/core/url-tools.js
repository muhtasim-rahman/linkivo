/**
 * Linkivo — js/core/url-tools.js  (v2.1.0)
 * Purpose: URL parsing and the normalization key used for de-duplication (ARCHITECTURE section 6).
 *          Link EXTRACTION from free text arrives in v2.2.0; this module only handles single URLs.
 * API: parseUrl(input, {assumeHttps}) -> URL|null   hostOf(input) -> "example.com"   dedupeKey(input) -> string|null
 *      cleanTracking(input) -> string   TRACKING_PARAMS
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
