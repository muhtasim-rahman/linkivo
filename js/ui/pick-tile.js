/**
 * Linkivo — js/ui/pick-tile.js  (v2.4.2)
 * Purpose: the 32px picture tile of a list row (favicon, folder tile) that turns into a check box when a mouse hovers the ROW, or while selecting, or while
 *          it is ticked. One component for every list (owner: "the favicon becomes a check box on hover everywhere"): History, Recycle Bin and, through the
 *          same CSS names, the folder lists. On touch screens there is no hover, so the box shows only while selecting.
 * API: pickTile({ face, on, selecting, label, onToggle }) -> Element   (the row that holds it must carry the class `pk-row`)
 *      faviconFace(host, size?) -> Element   (letter tile with the site icon on top; the letter stays when the icon fails)
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';

export function faviconFace(host, url, size = 32) {
  const letter = (host || '?').replace(/^www\./, '').charAt(0).toUpperCase();
  const el = h('span', { class: 'pk-fav', 'aria-hidden': 'true', style: { '--pk': `${size}px` } }, h('span', { class: 'pk-letter', text: letter }));
  if (url) { const im = h('img', { src: url, alt: '', width: '20', height: '20', loading: 'lazy', referrerpolicy: 'no-referrer' }); im.addEventListener('error', () => im.remove(), { once: true }); el.appendChild(im); }
  return el;
}

export function pickTile({ face, on = false, selecting = false, corner = false, label = 'Select', onToggle }) {   // v2.4.4: `corner` = the box sits in the top left corner of a picture and shows only while selecting (History)
  const box = h('button', { type: 'button', class: 'pk-box', 'aria-label': label, 'aria-pressed': String(!!on), tabindex: selecting || on ? '0' : '-1',
    on: { click: (e) => { e.preventDefault(); e.stopPropagation(); onToggle && onToggle(); } } }, on ? icon('check', { size: 16 }) : null);
  return h('span', { class: ['pk', corner && 'is-corner', on && 'is-on', selecting && 'is-selecting'] }, face, box);
}
