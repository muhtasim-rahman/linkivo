/**
 * Linkivo — js/features/settings/about-card.js  (v2.1.3, v2.2.2)
 * Purpose: the "About" layout used by Settings > App and the mobile Menu page: app header with version, highlights and useful links.
 *          v2.1.3: the developer is NOT part of this card any more (owner request). developerCard() is its own compact section placed
 *          after the About card: the badge (photo in a gradient ring), name, role and three small link buttons.
 *          v2.2.1: appInfoCard() is the Menu page's SINGLE card (header, short description, highlighted features and the developer badge inside it) and
 *          appLinkButtons() the row of link buttons under it. aboutCard() and developerCard() stay for Settings > App.
 *          v2.2.2 (owner): the developer block is TWO columns (photo | name, caption and the three round links below them); the link buttons end with
 *          "Report a problem" as the fifth, full-width one; Settings > App on wide screens shows the same card with the links as rows with short captions
 *          (appDetails()). aboutCard() and developerCard() are no longer used by the catalog but stay for older callers.
 * API: appDetails() -> Element[]     aboutCard() -> Element     developerCard() -> Element     appInfoCard() -> Element     appLinkButtons() -> Element
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

/** The developer's badge: a gradient ring around the photo; initials show while the photo loads or if its host is unreachable. */
function developerBadge() {
  const initials = app.developer.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const photo = h('span', { class: 'dev-photo' }, h('span', { text: initials }));
  const img = h('img', { src: app.photo, alt: '', width: 56, height: 56, loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.remove());
  photo.appendChild(img);
  return h('span', { class: 'dev-badge', 'aria-hidden': 'true' }, photo, h('span', { class: 'dev-check' }, icon('check', { size: 11 })));
}

const ext = (href, label, iconName) => h('a', { class: 'btn btn-sm', href, target: '_blank', rel: 'noopener', 'data-native': '' }, icon(iconName, { size: 16 }), h('span', { text: label }));
const linkRow = (iconName, label, desc, props) => h('a', { class: 'row', ...props }, h('span', { class: 'row-ic' }, icon(iconName)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), desc && h('span', { class: 'row-desc', text: desc })), h('span', { class: 'row-end' }, icon(props.target ? 'external' : 'chevron-right', { size: 18 })));

const mailto = () => `mailto:${app.contact}?subject=${encodeURIComponent(`Linkivo ${app.version} feedback`)}`;

export function developerCard() {
  return h('section', { class: 'dev-section', 'aria-label': 'Developer' },
    developerBadge(),
    h('div', { class: 'dev-info' }, h('strong', { text: app.developer }), h('span', { class: 'muted', text: 'Developer of Linkivo' })),
    h('div', { class: 'dev-links' }, ext(app.site, 'Website', 'globe'), ext(app.github, 'GitHub', 'code'), h('a', { class: 'btn btn-sm', href: mailto(), 'data-tip': app.contact }, icon('mail', { size: 16 }), h('span', { text: 'Email' }))));
}

export function aboutCard() {
  const mail = mailto();
  return h('div', { class: 'about-card' },
    h('div', { class: 'about-hero' },
      h('img', { class: 'about-tile', src: '/assets/brand/logo-tile.svg', alt: '', width: 64, height: 64 }),
      h('div', { class: 'about-id' }, h('span', { class: 'wordmark' }, 'l', h('i', { text: 'i' }), 'nk', h('i', { text: 'i' }), 'vo'), h('span', { class: 'muted', text: app.tagline })),
      h('span', { class: 'tag', text: `Version ${app.version}` })),
    h('p', { class: 'about-lead', text: 'A fast, private link manager for people with hundreds or thousands of links. Free, with no ads.' }),
    h('ul', { class: 'about-hl' }, HIGHLIGHTS.map(([ic, text]) => h('li', null, h('span', { class: 'hl-ic' }, icon(ic, { size: 18 })), h('span', { text })))),
    h('div', { class: 'about-links' },
      linkRow('code', 'Source code', 'github.com/muhtasim-rahman/linkivo', { href: app.repo, target: '_blank', rel: 'noopener', 'data-native': '' }),
      linkRow('mail', 'Report a problem or suggest something', app.contact, { href: mail }),
      linkRow('book', 'Documentation', null, { href: '/docs' }),
      linkRow('shield', 'Privacy', null, { href: '/privacy' }),
      linkRow('bookmark', 'Terms', null, { href: '/terms' })));
}

// ---- v2.2.1: the Menu page's app info card ---------------------------------------------------------------------------------
const FEATURES = [['library', 'Folders for every topic'], ['import', 'Import from 20+ file types'], ['shield', 'Private, with guest mode'], ['wifi-off', 'Works offline']];

export function appInfoCard() {
  const roundLink = (href, label, ic, extra = {}) => h('a', { class: 'dev-round', href, 'aria-label': label, 'data-tip': label, ...extra }, icon(ic, { size: 18 }));
  return h('section', { class: 'infocard', 'aria-label': 'About Linkivo' },
    h('div', { class: 'infocard-head' },
      h('img', { class: 'about-tile', src: '/assets/brand/logo-tile.svg', alt: '', width: 52, height: 52 }),
      h('div', { class: 'about-id' }, h('span', { class: 'wordmark' }, 'l', h('i', { text: 'i' }), 'nk', h('i', { text: 'i' }), 'vo'), h('span', { class: 'muted', text: app.tagline })),
      h('span', { class: 'tag', text: `v${app.version}` })),
    h('p', { class: 'about-lead', text: 'A fast, private link manager for people with hundreds or thousands of links. Free, with no ads.' }),
    h('ul', { class: 'infocard-feats' }, FEATURES.map(([ic, text]) => h('li', null, h('span', { class: 'hl-ic' }, icon(ic, { size: 16 })), h('span', { text })))),
    h('div', { class: 'infocard-dev' }, developerBadge(),
      h('div', { class: 'dev-info' }, h('strong', { text: app.developer }), h('span', { class: 'muted', text: 'Developer of Linkivo' }),
        h('div', { class: 'dev-rounds' }, roundLink(app.site, 'Website', 'globe', { target: '_blank', rel: 'noopener', 'data-native': '' }), roundLink(app.github, 'GitHub', 'code', { target: '_blank', rel: 'noopener', 'data-native': '' }), roundLink(mailto(), 'Email the developer', 'mail')))));
}

export function appLinkButtons() {
  const btn = (ic, label, { class: extra = '', ...props }) => h('a', { class: ['alink', extra], ...props }, icon(ic, { size: 18 }), h('span', { text: label }));
  return h('nav', { class: 'alinks', 'aria-label': 'About links' },
    btn('code', 'Source code', { href: app.repo, target: '_blank', rel: 'noopener', 'data-native': '' }),
    btn('book', 'Documentation', { href: '/docs' }),
    btn('shield', 'Privacy policy', { href: '/privacy' }),
    btn('bookmark', 'Terms', { href: '/terms' }),
    btn('mail', 'Report a problem', { href: mailto(), class: 'is-wide' }));   // fifth and full width on phones
}

// ---- v2.2.2: Settings > App on wide screens ---------------------------------------------------------------------------------
/** The same card as the Menu page, then the links as rows with a short caption each (wide screens have the room for them). */
export function appDetails() {
  return [
    appInfoCard(),
    h('div', { class: 'about-links app-links' },
      linkRow('code', 'Source code', 'The project on GitHub', { href: app.repo, target: '_blank', rel: 'noopener', 'data-native': '' }),
      linkRow('book', 'Documentation', 'A guide to every feature', { href: '/docs' }),
      linkRow('shield', 'Privacy policy', 'What is stored and who can see it', { href: '/privacy' }),
      linkRow('bookmark', 'Terms', 'The rules of using Linkivo', { href: '/terms' }),
      linkRow('mail', 'Report a problem', 'Tell the developer, or suggest something', { href: mailto() }))
  ];
}
