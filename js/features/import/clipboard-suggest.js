/**
 * Linkivo — js/features/import/clipboard-suggest.js  (v2.2.2)
 * Purpose: the small suggestion card that offers to import links found in the clipboard (core/clipboard-watch.js). It sits at one side of the screen
 *          (bottom right on wide screens, above the bottom bar on phones), never blocks the page, hides itself after 15 seconds and remembers
 *          what it showed so the same clipboard is not offered again. "Import" opens the Import page with the text already pasted.
 * API: initClipboardSuggest({ router }) -> stop()
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { prefs } from '../../core/local-prefs.js';
import { extractLinks } from '../../core/extract.js';
import { startClipboardWatch } from '../../core/clipboard-watch.js';
import { stashText } from './import-form.js';
import { plural } from '../../core/format.js';
import { getSession } from '../../core/session.js';

const SHOW_MS = 15000;

export function initClipboardSuggest({ router }) {
  let card = null, timer = 0;
  const hide = () => { clearTimeout(timer); card?.classList.remove('is-in'); const c = card; card = null; if (c) setTimeout(() => c.remove(), 220); };
  function show({ text, links, markSeen }) {
    if (card) return;
    const path = location.pathname;
    if (path === '/import' || path.startsWith('/login') || getSession().mode === 'none') return;   // already importing, or not signed in
    markSeen();
    card = h('div', { class: 'clip-card', role: 'region', 'aria-label': 'Links found in your clipboard', 'aria-live': 'polite' },
      h('span', { class: 'clip-ic' }, icon('link', { size: 20 })),
      h('span', { class: 'clip-text' }, h('strong', { text: `${plural(links.length, 'link')} in your clipboard` }), h('span', { text: 'Import them into your library?' })),
      h('span', { class: 'clip-actions' },
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', on: { click: () => { stashText(text); hide(); router.navigate('/import'); } } }, 'Import'),
        h('button', { type: 'button', class: 'btn-icon is-sm', 'aria-label': 'Dismiss', on: { click: hide } }, icon('close', { size: 16 }))));
    document.body.appendChild(card);
    requestAnimationFrame(() => card?.classList.add('is-in'));
    timer = setTimeout(hide, SHOW_MS);
  }
  const stop = startClipboardWatch({ onFound: show, enabled: () => prefs.get('lib.clipboard', true) !== false, extract: (t) => extractLinks(t, { bare: false }) });
  return () => { stop(); hide(); };
}
