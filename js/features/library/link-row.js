/**
 * Linkivo — js/features/library/link-row.js  (v2.2.0, v2.2.2)
 * Purpose: builds one link as a list row or as a grid card. Pure DOM, no listeners: the folder page uses event delegation on data-id and data-act,
 *          so windowed rows can be created and thrown away cheaply. Favicons load lazily and fall back to a letter tile.
 * v2.2.1: grid cards keep the flags INSIDE the text block, the checkbox is its own column (it used to float over the title) and the three-dot button
 *          has a fixed size so it can not leave the card. List rows get an "open in new tab" icon on mouse screens (it left the link menu).
 * v2.2.2 (owner request): there is no separate checkbox column any more. The check box is always in the row, laid over the favicon: on mouse screens it
 *          shows when the pointer is on the favicon (a click starts selecting), selected rows keep it, unselected rows show their favicon again until hovered.
 * v2.2.3 (owner): while select mode is ON every row shows its check box (no hover needed), on mouse screens too. Outside select mode only hover shows it.
 *          On touch screens it shows on every row while selecting.
 * API: createLinkRow(link, { card, selecting, selected, show: { url, points, added } }) -> Element      ROW_HEIGHT  CARD_HEIGHT  CARD_MIN_WIDTH
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { relativeTime } from '../../core/format.js';
import { faviconUrl, linkTitle, safeHref } from './folder-style.js';

export const ROW_HEIGHT = 62, CARD_HEIGHT = 112, CARD_MIN_WIDTH = 230;

function favicon(l) {
  const letter = (l.host || l.url || '?').replace(/^www\./, '').charAt(0).toUpperCase();
  const img = h('img', { src: faviconUrl(l.host), alt: '', width: '20', height: '20', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.remove(), { once: true });
  return h('span', { class: 'lfav', 'aria-hidden': 'true' }, h('span', { class: 'lfav-l', text: letter }), img);
}

export function createLinkRow(l, { card = false, selecting = false, selected = false, show = {} } = {}) {
  const flags = h('span', { class: 'lflags' },
    l.pn && h('span', { class: 'lflag', 'data-tip': 'Pinned' }, icon('pin', { size: 14, label: 'Pinned' })),
    l.fv && h('span', { class: 'lflag is-fav', 'data-tip': 'Favourite' }, icon('star', { size: 14, label: 'Favourite' })),
    l.rl && h('span', { class: 'lflag', 'data-tip': 'Read later' }, icon('clock', { size: 14, label: 'Read later' })),
    l.bl && h('span', { class: 'lflag is-block', 'data-tip': 'Blocked from Random' }, icon('block', { size: 14, label: 'Blocked from Random' })));
  const hasFlags = l.pn || l.fv || l.rl || l.bl;
  const meta = [show.url !== false ? l.host : '', show.added !== false ? relativeTime(l.ts) : '', show.points ? `${l.pt ?? 100} pts` : ''].filter(Boolean).join('  \u00b7  ');
  const tags = l.tags ? h('span', { class: 'ltags' }, l.tags.split(',').slice(0, 3).map((t) => h('span', { class: 'ltag', text: t }))) : null;
  return h('div', { class: `lrow${card ? ' is-card' : ''}${selected ? ' is-selected' : ''}${selecting ? ' is-selecting' : ''}`, role: 'listitem', 'data-id': l.id },
    h('button', { type: 'button', class: 'lcheck', 'data-act': 'toggle', role: 'checkbox', tabindex: selecting ? '0' : '-1', 'aria-checked': String(selected), 'aria-label': `Select ${linkTitle(l)}` }, icon('check', { size: 16 })),
    h('a', { class: 'lmain', href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer', 'data-act': 'open', title: l.url },
      favicon(l),
      h('span', { class: 'ltext' }, h('span', { class: 'ltitle', text: linkTitle(l) }), h('span', { class: 'lsub', text: meta }), card && tags, card && hasFlags && flags),
      !card && hasFlags && flags),
    // mouse screens: a quick "open in new tab" button beside the menu (the row itself opens the link on touch screens)
    !card && h('a', { class: 'icon-btn is-sm lopen', href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer', 'data-act': 'open', 'aria-label': `Open ${linkTitle(l)} in a new tab`, 'data-tip': 'Open in new tab' }, icon('external', { size: 16 })),
    h('button', { type: 'button', class: 'icon-btn is-sm lmore', 'data-act': 'menu', 'aria-label': `Actions for ${linkTitle(l)}`, 'aria-haspopup': 'menu' }, icon('more', { size: 18 })));
}
