/**
 * Linkivo — js/ui/thumb.js  (v2.4.4)
 * Purpose: the picture of a link in every list (owner: thumbnails instead of site icons everywhere). Order: the saved page image, then the saved screenshot, then (v2.5.3, owner:
 *          "it used to work") a free screenshot of the page itself (WordPress mShots, no quota, requested only for rows that scroll into view), then the site icon, which is always
 *          there underneath so a row never looks empty and nothing jumps. mShots answers a brand-new address with a placeholder picture first: only a picture of the asked width is
 *          accepted, anything else is dropped and the next paint asks again. Switch it off in Settings (ui.thumbs): then only the site icon shows.
 * v2.5.4: the account's saved picture is read before the screenshot is used (see lookup()).
 * API: thumbSources(meta, url?) -> [url, ...]   (pure, tested)      thumbsOn() -> boolean      shotFallback(url) -> url | ''
 *      createThumb({ engine, id, host, url, favicon, variant: 'row'|'sm'|'card' }) -> Element
 */
import { h } from '../core/dom.js';
import { prefs } from '../core/local-prefs.js';
import { faviconFace } from './pick-tile.js';

const web = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');
export const SHOT_W = 320;
export const shotFallback = (url) => (web(url) ? `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=${SHOT_W}` : '');
export const thumbSources = (meta, url = '') => [meta ? web(meta.image) : '', meta && typeof meta.shot === 'string' && /^https:\/\//.test(meta.shot) ? meta.shot : '', shotFallback(url)].filter(Boolean);
export const thumbsOn = () => prefs.get('ui.thumbs', true) !== false;

// the saved extra data is read once per link (a short memory); "no picture yet" is only remembered for a few seconds, so a picture saved by a preview shows up soon
const found = new Map(), missed = new Map(), MISS_MS = 20000, MAX = 3000;
// v2.5.4 (owner: a screenshot showed although the link HAS a thumbnail): the page picture lives in the account (linkMeta), and this device only has a copy of it after the link was fetched or previewed HERE.
// With no local copy the row used to jump straight to the free screenshot. Now the account is asked once (4 reads at a time, only for rows that are on screen; the answer is kept on the device), and the
// screenshot is only the last choice. An id the account has nothing for is not asked again in this session.
const remoteNone = new Set();
let active = 0; const waiting = [];
const slot = () => new Promise((res) => { const go = () => { active++; res(); }; if (active < 4) go(); else waiting.push(go); });
const release = () => { active--; const n = waiting.shift(); if (n) n(); };
async function lookup(engine, id) {
  let local = null;
  try { local = engine && engine.peekLinkMeta ? await engine.peekLinkMeta(id) : null; } catch { local = null; }
  if ((local && thumbSources(local).length) || !engine || !engine.getLinkMeta || remoteNone.has(id)) return local;
  await slot();
  try { const m = await engine.getLinkMeta(id); if (!m || !thumbSources(m).length) { if (remoteNone.size > MAX) remoteNone.clear(); remoteNone.add(id); } return m || local; }
  catch { return local; } finally { release(); }
}
async function sourcesFor(engine, id, url) {
  if (found.has(id)) return found.get(id);
  const t = missed.get(id); if (t && Date.now() - t < MISS_MS) return thumbSources(null, url);
  const meta = await lookup(engine, id);
  const saved = thumbSources(meta).length > 0, list = thumbSources(meta, url);
  if (saved) { if (found.size > MAX) found.clear(); found.set(id, list); } else { if (missed.size > MAX) missed.clear(); missed.set(id, Date.now()); }
  return list;
}

export function createThumb({ engine, id, host, url = '', favicon, variant = 'row' }) {
  const el = h('span', { class: `thb is-${variant}`, 'aria-hidden': 'true' }, faviconFace(host, favicon, variant === 'card' ? 40 : 28));
  if (!thumbsOn() || !id) return el;
  sourcesFor(engine, id, url).then((list) => {
    const queue = [...list];
    // v2.5.3 (owner: thumbnails did not show): a row is built BEFORE it is put on the page and the saved data can answer in the same moment, so the old check "is it on the page"
    // failed and nothing was ever loaded. Wait a few frames for the row to arrive; only a row that never arrives (removed meanwhile) is skipped.
    const arrived = (cb, tries = 12) => { if (el.isConnected || el.parentNode) cb(); else if (tries > 0) (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f) => setTimeout(f, 16))(() => arrived(cb, tries - 1)); };
    const next = () => {
      const src = queue.shift(); if (!src) return;
      if (!(el.isConnected || el.parentNode)) { queue.unshift(src); arrived(next); return; }
      const im = h('img', { class: 'thb-img', src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      const isShot = src.includes('/mshots/v1/');
      im.addEventListener('load', () => { if (isShot && im.naturalWidth !== SHOT_W) { im.remove(); return; } el.classList.add('has-img'); }, { once: true });   // a placeholder (other width) is not a picture of the page
      im.addEventListener('error', () => { im.remove(); next(); }, { once: true });
      el.prepend(im);
    };
    next();
  });
  return el;
}
