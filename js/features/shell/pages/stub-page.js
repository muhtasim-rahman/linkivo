/**
 * Linkivo — js/features/shell/pages/stub-page.js  (v2.1.0)
 * Purpose: designed placeholder for every route whose feature arrives in a later version. It says what will live here and
 *          offers something useful to do now. Replaced route by route as versions ship (the route table switches its loader).
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { emptyState } from '../../../ui/empty-state.js';
import { getSession } from '../../../core/session.js';

const COPY = {
  library: { art: 'library', title: 'Your library is empty', text: 'Folders and the links inside them will live here. Library arrives in v2.2.0.' },
  folder: { art: 'library', title: 'Folder view', text: 'The links of one folder, with search, filters and bulk actions, arrive in v2.2.0.' },
  import: { art: 'import', title: 'Import links', text: 'Paste text or drop files and Linkivo pulls out every link. Import arrives in v2.2.0.' },
  link: { art: 'search', title: 'Link preview', text: 'A rich preview with page, video, image and details tabs arrives in v2.3.0.' },
  search: { art: 'search', title: 'Search everything', text: 'One search across folders, links and settings arrives in v2.3.0.' },
  random: { art: 'random', title: 'Random Discover', text: 'Open a surprise from your own links, weighted by what you like. Arrives in v2.4.0.' },
  history: { art: 'library', title: 'History', text: 'Links you opened will be listed here by day. History arrives in v2.4.0.' },
  terms: { art: 'library', title: 'Terms', text: 'The terms of use arrive in v2.6.0.' },
  privacy: { art: 'library', title: 'Privacy', text: 'The privacy notice arrives in v2.6.0.' },
  docs: { art: 'library', title: 'Documentation', text: 'A full guide to every feature arrives in v2.6.0.' },
  lost: { art: 'lost', title: 'This page does not exist', text: 'The address may be mistyped, or the page may have moved.' }
};

export function mount(container, ctx) {
  const route = ctx.router.current().route;
  const c = COPY[route.stub] || COPY.lost;
  const signedIn = getSession().mode !== 'none';
  const actions = route.stub === 'lost' || !signedIn
    ? [{ label: signedIn ? 'Go to library' : 'Go to sign in', href: signedIn ? '/library' : '/login', primary: true }]
    : route.id === 'library' ? [{ label: 'Open settings', href: '/settings' }] : [{ label: 'Go to library', href: '/library' }];
  container.appendChild(h('div', { class: 'page stub' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: route.stub === 'lost' ? 'Page not found' : route.title })),
    emptyState({ art: c.art, title: c.title, text: c.text, actions })));
}
