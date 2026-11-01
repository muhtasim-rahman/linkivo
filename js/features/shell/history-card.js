/**
 * Linkivo — js/features/shell/history-card.js  (v2.4.2)
 * Purpose: the History card, placed directly ABOVE the Recycle Bin card on the mobile Menu page and at the top of the wide-screen Settings page (owner request).
 * API: historyCard() -> Element
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { getHistory } from '../../core/app-data.js';
import { plural } from '../../core/format.js';
import { prefs } from '../../core/local-prefs.js';

export function historyCard() {
  const hist = getHistory();
  let n = 0; try { n = hist ? hist.list().length : 0; } catch { n = 0; }
  const off = prefs.get('history.keep', '7d') === 'off';
  const desc = off ? 'Off. Turn it on in the History settings.' : n ? `${plural(n, 'link')} opened recently` : 'Links you open show up here, by day.';
  return h('a', { class: 'binrow', href: '/profile/history' }, h('span', { class: 'binrow-ic is-accent' }, icon('history', { size: 20 })),
    h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'History' }), h('span', { class: 'row-desc', text: desc })), h('span', { class: 'row-end' }, icon('chevron-right')));
}
