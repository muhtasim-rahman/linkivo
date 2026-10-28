/**
 * Linkivo — js/features/share/share-model.js  (v2.3.0)
 * Purpose: the pure part of the Web Share Target. Android (and Chrome on desktop) hands a shared page to the installed app as /share?title=&text=&url=.
 *          Apps put the address in any of the three, so all of them are searched. A signed-out person's share is parked for 30 minutes and picked up after login.
 * API: sharedLinks({ title, text, url }) -> { items: [{ url, title? }], title }     PENDING_TTL     isFresh(pending, now) -> boolean     pendingFromQuery(query, now) -> pending|null
 */
import { extractLinks } from '../../core/extract.js';
import { parseUrl, dedupeKey } from '../../core/url-tools.js';

export const PENDING_TTL = 30 * 60 * 1000;
export const MAX_SHARED = 20;

export function sharedLinks({ title = '', text = '', url = '' } = {}) {
  const found = [];
  const direct = parseUrl(String(url || '').trim(), { assumeHttps: false });
  if (direct) found.push({ url: direct.toString() });
  for (const src of [text, title]) for (const l of extractLinks(String(src || ''))) found.push({ url: l.url, title: l.title });
  const seen = new Set(), items = [];
  for (const f of found) { const k = dedupeKey(f.url); if (!k || seen.has(k)) continue; seen.add(k); items.push(f); if (items.length >= MAX_SHARED) break; }
  // a title is useful only when it is a real name, not the address again or a copy of the shared text
  const t = String(title || '').trim();
  const clean = t && !items.some((i) => t.includes(i.url)) && t !== String(text || '').trim() ? t.slice(0, 300) : '';
  return { items, title: items.length === 1 ? clean : '' };
}

export const isFresh = (p, now = Date.now()) => !!p && typeof p.at === 'number' && now - p.at >= 0 && now - p.at < PENDING_TTL;
export function pendingFromQuery(q, now = Date.now()) {
  const { title = '', text = '', url = '' } = q || {};
  return title || text || url ? { title: String(title).slice(0, 500), text: String(text).slice(0, 4000), url: String(url).slice(0, 2048), at: now } : null;
}
