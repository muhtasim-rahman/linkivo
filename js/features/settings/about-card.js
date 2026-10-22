/**
 * Linkivo — js/features/settings/about-card.js  (v2.1.2)
 * Purpose: the "About" layout used by Settings > App and the mobile Menu page: app header with version, highlights, the developer
 *          card (photo, website, GitHub, email) and useful links. Redesigned in v2.1.2 (the v2.1.0 version was a plain key/value list).
 * API: aboutCard() -> Element
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import app from '../../core/app-info.js';

const HIGHLIGHTS = [
  ['user', 'Sign in with Google or email, or just visit as a guest'],
  ['database', 'Your links are cached on the device and synced to your account'],
  ['wifi-off', 'Opens offline and updates itself when a new version is out'],
  ['install', 'Installs like an app on your phone and your computer']
];

function developerPhoto() {
  const initials = app.developer.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const wrap = h('span', { class: 'dev-photo', 'aria-hidden': 'true' }, h('span', { text: initials }));
  const img = h('img', { src: app.photo, alt: '', width: 64, height: 64, loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.remove()); // photo host unreachable or blocked: the initials stay
  wrap.appendChild(img);
  return wrap;
}

const ext = (href, label, iconName) => h('a', { class: 'btn btn-sm', href, target: '_blank', rel: 'noopener', 'data-native': '' }, icon(iconName, { size: 16 }), h('span', { text: label }));
const linkRow = (iconName, label, desc, props) => h('a', { class: 'row', ...props }, h('span', { class: 'row-ic' }, icon(iconName)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), h('span', { class: 'row-end' }, icon(props.target ? 'external' : 'chevron-right', { size: 18 })));

export function aboutCard() {
  const mail = `mailto:${app.contact}?subject=${encodeURIComponent(`Linkivo ${app.version} feedback`)}`;
  return h('div', { class: 'about-card' },
    h('div', { class: 'about-hero' },
      h('img', { class: 'about-tile', src: '/assets/brand/logo-tile.svg', alt: '', width: 64, height: 64 }),
      h('div', { class: 'about-id' }, h('span', { class: 'wordmark' }, 'l', h('i', { text: 'i' }), 'nk', h('i', { text: 'i' }), 'vo'), h('span', { class: 'muted', text: app.tagline })),
      h('span', { class: 'tag', text: `Version ${app.version}` })),
    h('p', { class: 'about-lead', text: 'A fast, private link manager for people with hundreds or thousands of links. Free, with no ads.' }),
    h('ul', { class: 'about-hl' }, HIGHLIGHTS.map(([ic, text]) => h('li', null, h('span', { class: 'hl-ic' }, icon(ic, { size: 18 })), h('span', { text })))),
    h('div', { class: 'dev-card' }, developerPhoto(),
      h('div', { class: 'dev-info' }, h('strong', { text: app.developer }), h('span', { class: 'muted', text: 'Developer of Linkivo' }),
        h('div', { class: 'dev-links' }, ext(app.site, 'Website', 'globe'), ext(app.github, 'GitHub', 'code'), h('a', { class: 'btn btn-sm', href: mail }, icon('mail', { size: 16 }), h('span', { text: 'Email' }))))),
    h('div', { class: 'about-links' },
      linkRow('code', 'Source code', 'github.com/muhtasim-rahman/linkivo', { href: app.repo, target: '_blank', rel: 'noopener', 'data-native': '' }),
      linkRow('mail', 'Report a problem or suggest something', app.contact, { href: mail }),
      linkRow('book', 'Documentation', null, { href: '/docs' }),
      linkRow('shield', 'Privacy', null, { href: '/privacy' }),
      linkRow('bookmark', 'Terms', null, { href: '/terms' })));
}
