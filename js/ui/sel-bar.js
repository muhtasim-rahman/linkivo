/**
 * Linkivo — js/ui/sel-bar.js  (v2.2.2)
 * Purpose: the content of the fixed selection bar (folder page, Recycle Bin). v2.2.1 had a text count, a "Select all" text button and labelled buttons
 *          that scrolled sideways on a phone. Now (owner request) the bar is icon based and fits without scrolling: the count is a small pill sitting
 *          on the top-left corner of the bar, "select all" is its own icon button, the few most important actions follow as icons (their names are
 *          tooltips and aria-labels, and show as text on wide screens), and everything else lives behind the three-dot button.
 * API: selBarContent({ count, allOn, onAll, onClose, closeLabel?, actions:[{ icon, label, onClick, danger?, disabled? }], more?: items[] | () => items[] }) -> Node[]
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { openMenu } from './popover.js';

export function selBarContent({ count, allOn, onAll, onClose, closeLabel = 'Done selecting', actions = [], more = null }) {
  const btn = (ic, label, fn, { danger = false, disabled = false, on = false } = {}) =>
    h('button', { type: 'button', class: ['selbtn', danger && 'is-danger', on && 'is-on'], 'aria-label': label, 'aria-pressed': on ? 'true' : null, disabled, 'data-tip': label, on: { click: fn } },
      icon(ic, { size: 20 }), h('span', { class: 'selbtn-l', text: label }));
  const none = count === 0;
  const nodes = [
    h('span', { class: 'selcount', role: 'status', text: none ? 'Select links' : `${count} selected` }),
    btn('close', closeLabel, onClose),
    btn('check-square', allOn ? 'Select none' : 'Select all', onAll, { on: allOn }),
    h('span', { class: 'selgap', 'aria-hidden': 'true' }),
    ...actions.map((a) => btn(a.icon, a.label, a.onClick, { danger: a.danger, disabled: none || a.disabled }))
  ];
  if (more) nodes.push(h('button', { type: 'button', class: 'selbtn', 'aria-label': 'More actions', 'aria-haspopup': 'menu', disabled: none, 'data-tip': 'More actions',
    on: { click: (e) => openMenu(e.currentTarget, typeof more === 'function' ? more() : more) } }, icon('more-h', { size: 20 })));
  return nodes;
}
