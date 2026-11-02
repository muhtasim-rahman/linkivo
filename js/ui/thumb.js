/**
 * Linkivo — js/ui/thumb.js  (v2.4.4)
 * Purpose: the picture of a link in every list (owner: thumbnails instead of site icons everywhere). Order: the saved page image, then the saved screenshot, then the site
 *          icon (always there underneath, so a row never looks empty and nothing jumps). Only pictures that are already saved in the link's extra data on this device are used:
 *          a list never starts a request for a picture. It can be switched off in Settings (ui.thumbs): then only the site icon shows.
 * API: thumbSources(meta) -> [url, ...]   (pure, tested)      thumbsOn() -> boolean      createThumb({ engine, id, host, favicon, variant: 'row'|'sm'|'card' }) -> Element
 */
import { h } from '../core/dom.js';
import { prefs } from '../core/local-prefs.js';
import { faviconFace } from './pick-tile.js';

const web = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');
export const thumbSources = (meta) => (meta ? [web(meta.image), typeof meta.shot === 'string' && /^https:\/\//.test(meta.shot) ? meta.shot : ''].filter(Boolean) : []);
export const thumbsOn = () => prefs.get('ui.thumbs', true) !== false;

// the saved extra data is read once per link (a short memory); "no picture yet" is only remembered for a few seconds, so a picture saved by a preview shows up soon
const found = new Map(), missed = new Map(), MISS_MS = 20000, MAX = 3000;
async function sourcesFor(engine, id) {
  if (found.has(id)) return found.get(id);
  const t = missed.get(id); if (t && Date.now() - t < MISS_MS) return [];
  let list = []; try { list = thumbSources(engine && engine.peekLinkMeta ? await engine.peekLinkMeta(id) : null); } catch { list = []; }
  if (list.length) { if (found.size > MAX) found.clear(); found.set(id, list); } else { if (missed.size > MAX) missed.clear(); missed.set(id, Date.now()); }
  return list;
}

export function createThumb({ engine, id, host, favicon, variant = 'row' }) {
  const el = h('span', { class: `thb is-${variant}`, 'aria-hidden': 'true' }, faviconFace(host, favicon, variant === 'card' ? 40 : 28));
  if (!thumbsOn() || !id) return el;
  sourcesFor(engine, id).then((list) => {
    const queue = [...list];
    const next = () => {
      const src = queue.shift(); if (!src || !el.isConnected && !el.parentNode) return;
      const im = h('img', { class: 'thb-img', src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      im.addEventListener('load', () => el.classList.add('has-img'), { once: true });
      im.addEventListener('error', () => { im.remove(); next(); }, { once: true });
      el.prepend(im);
    };
    next();
  });
  return el;
}
