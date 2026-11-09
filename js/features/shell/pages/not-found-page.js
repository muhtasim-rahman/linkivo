/**
 * Linkivo — js/features/shell/pages/not-found-page.js  (v2.4.2)
 * Purpose: the "Page not found" screen (owner: the old placeholder looked plain). Everything is centred: a large 404 with an unlinked-chain mark in the
 *          middle, a short explanation, the address that was asked for (shown as text only), two clear actions and a few places to go.
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { getSession } from '../../../core/session.js';
import { loadCss } from '../../../core/css-loader.js';

const QUICK = [['library', 'Library', '/library'], ['search', 'Search', '/search'], ['random', 'Random', '/random'], ['settings', 'Settings', '/settings']];

export async function mount(container, ctx) {
  // v2.5.5 (owner): the 404 page is a page of its own (404.html: no app lock, no splash, no sidebar). index.html sends a first load there; this covers a link INSIDE the app.
  // ! The page below is kept as a fallback (it shows only if this redirect is blocked) and is no longer the normal 404.
  try { location.replace('/404?from=' + encodeURIComponent((location.pathname + location.search).slice(0, 80))); return; } catch { /* fall through to the page below */ }
  await loadCss('/css/pages/pages.css');
  const signedIn = getSession().mode !== 'none';
  const asked = (location.pathname + location.search).slice(0, 80);
  const home = signedIn ? { label: 'Go to library', href: '/library' } : { label: 'Go to sign in', href: '/login' };
  const back = h('button', { type: 'button', class: 'btn', on: { click: () => (ctx.from ? history.back() : ctx.router.navigate(home.href)) } }, icon('chevron-left', { size: 18 }), 'Go back');
  container.appendChild(h('div', { class: 'page nf page-enter' },
    h('div', { class: 'nf-box' },
      h('div', { class: 'nf-mark', 'aria-hidden': 'true' }, h('span', { class: 'nf-d', text: '4' }), h('span', { class: 'nf-o' }, icon('link', { size: 44 })), h('span', { class: 'nf-d', text: '4' })),
      h('h1', { class: 'nf-title', text: 'This page does not exist' }),
      h('p', { class: 'nf-text', text: 'The address may be mistyped, or the page may have moved.' }),
      h('code', { class: 'nf-path', text: asked }),
      h('div', { class: 'nf-actions' }, back, h('a', { class: 'btn btn-primary', href: home.href }, home.label)),
      signedIn ? h('nav', { class: 'nf-quick', 'aria-label': 'Places to go' }, QUICK.map(([ic, label, href]) => h('a', { class: 'nf-chip', href }, icon(ic, { size: 16 }), label))) : null)));
}
