/**
 * Linkivo — js/core/seo-pages.js  (v2.5.3)
 * Purpose: the single source of the SEO text of every PUBLIC page (home, sign in, docs and each docs topic, terms, privacy): title, description, share image, structured data and the plain-text
 *          summary that a crawler without JavaScript sees. The router meta (routes.js, docs-page.js) and the static HTML files written by `@ Creator/tools/gen-seo.mjs` both read it, so a
 *          browser tab and a crawler never disagree. Pure data and string builders: no DOM, runs in Node.
 * API: HOME_TITLE  HOME_DESC  topicImage(id) -> path     topicMeta(topic) -> route-like meta input     publicPages(topics) -> [{ path, file, title, description, robots, canonical, image, imageAlt, type, jsonLd, noscript }]
 */
import { SITE } from './page-meta.js';
import app from './app-info.js';

export const HOME_TITLE = 'Linkivo: save, organise and rediscover your links';
export const HOME_DESC = 'A fast, private link manager. Organise thousands of links in folders, import from anywhere, search everything, rediscover old saves and export in any format. Free.';
const AUTHOR = { '@type': 'Person', name: app.developer, alternateName: 'Turzo', url: app.site, sameAs: [app.github] };   // one source for the developer: js/core/app-info.js
const FEATURES = ['Folders, tags, favourites and read later', 'Smart import from pasted text, files and browser bookmarks', 'Fast search across links, folders and settings', 'Random Discover brings old saves back', 'App lock and locked folders behind a separate code', 'Export to JSON, CSV, Excel, PDF, HTML, Markdown and more, with an optional passphrase-protected backup', 'Works in the browser and as an installed app, light and dark'];
const IMG = { start: 'overview', library: 'folders', import: 'import', export: 'export', preview: 'preview', search: 'search', random: 'random', history: 'dashboard', security: 'vault', account: 'screens', settings: 'themes-custom', shortcuts: 'library', install: 'screens' };
/** The banner shown inside a docs topic (a small WebP of the same artwork; none for topics without one). */
const SHOW = { start: 'overview', library: 'folders', import: 'import', export: 'export', preview: 'preview', search: 'search', random: 'random', history: 'dashboard', security: 'vault', account: 'offline', settings: 'themes-custom', install: 'screens' };
export const topicBanner = (id) => (SHOW[id] ? `/assets/showcase/${SHOW[id]}.webp` : '');
export const topicImage = (id) => `/assets/social/og-${IMG[id] || 'overview'}.jpg`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const crumbs = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE.origin + path })) });
const nav = '<nav aria-label="Linkivo"><a href="/">Home</a> <a href="/docs">Documentation</a> <a href="/privacy">Privacy</a> <a href="/terms">Terms</a> <a href="/login">Sign in</a></nav>';

/** Route-like input for pageMeta() for one docs topic (used by docs-page.js after it knows the topic). */
export const topicMeta = (t) => ({ fullTitle: `${t.title} - Linkivo documentation`, desc: `${t.lead} Linkivo documentation.`.slice(0, 200), index: true, pattern: `/docs/${t.id}`, image: topicImage(t.id), imageAlt: `Linkivo: ${t.title}`, ogType: 'article' });

function topicBody(t) {
  const parts = (t.parts || []).map((p) => `<h3>${esc(p.h)}</h3>${p.items ? `<ul>${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}${p.p ? `<p>${esc(p.p)}</p>` : ''}`).join('');
  return `<h1>${esc(t.title)}</h1><p>${esc(t.lead)}</p>${parts}${nav}`;
}

export function publicPages(topics = []) {
  const O = SITE.origin;
  const page = (o) => ({ robots: 'index,follow', type: 'website', image: SITE.image, imageAlt: SITE.imageAlt, jsonLd: [], ...o, canonical: o.robots && o.robots.startsWith('noindex') ? '' : O + o.path });
  const list = [
    page({ path: '/', file: 'index.html', title: HOME_TITLE, description: HOME_DESC,
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Linkivo', url: O + '/', description: HOME_DESC, applicationCategory: 'ProductivityApplication', operatingSystem: 'Any (web browser, installable app)', browserRequirements: 'Requires JavaScript', image: O + SITE.image, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, featureList: FEATURES, author: AUTHOR, inLanguage: 'en' },
        { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Linkivo', url: O + '/', inLanguage: 'en', publisher: AUTHOR }],
      noscript: `<h1>Linkivo: save, organise and rediscover your links</h1><p>${esc(HOME_DESC)}</p><ul>${FEATURES.map((f) => `<li>${esc(f)}</li>`).join('')}</ul><p>Linkivo needs JavaScript to run. Enable it, or read the <a href="/docs">documentation</a>.</p>${nav}` }),
    page({ path: '/login', file: 'login.html', title: 'Sign in - Linkivo', description: 'Sign in to Linkivo with Google or email, or try it as a guest. Your links stay yours.', robots: 'noindex,follow',
      noscript: `<h1>Sign in to Linkivo</h1><p>Linkivo is a private link manager. It needs JavaScript to sign you in.</p>${nav}` }),
    page({ path: '/docs', file: 'docs.html', title: 'Documentation - Linkivo', description: 'A guide to every Linkivo feature: folders, import, search, Random Discover, locked folders, backup and settings.', image: topicImage('start'),
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Linkivo documentation', url: O + '/docs', inLanguage: 'en', hasPart: topics.map((t) => ({ '@type': 'WebPage', name: t.title, url: `${O}/docs/${t.id}` })) }, { '@context': 'https://schema.org', ...crumbs([['Linkivo', '/'], ['Documentation', '/docs']]) }],
      noscript: `<h1>Linkivo documentation</h1><p>Everything Linkivo can do, one topic at a time.</p><ul>${topics.map((t) => `<li><a href="/docs/${t.id}">${esc(t.title)}</a>: ${esc(t.lead)}</li>`).join('')}</ul>${nav}` }),
    page({ path: '/privacy', file: 'privacy.html', title: 'Privacy - Linkivo', description: 'How Linkivo handles your data: what is stored, where, who can see it, and how to export or delete everything.', image: topicImage('security'), imageAlt: 'Linkivo privacy: locked folders behind a code',
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Linkivo privacy', url: O + '/privacy', inLanguage: 'en' }, { '@context': 'https://schema.org', ...crumbs([['Linkivo', '/'], ['Privacy', '/privacy']]) }],
      noscript: `<h1>Linkivo privacy</h1><p>Your links belong to you. They are stored in your own account (or only on your device in guest mode), protected by database rules, and never sold or shared. You can export or delete everything at any time.</p>${nav}` }),
    page({ path: '/terms', file: 'terms.html', title: 'Terms of use - Linkivo', description: 'The terms of use for Linkivo, a free link manager by Muhtasim Rahman.',
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Linkivo terms of use', url: O + '/terms', inLanguage: 'en' }, { '@context': 'https://schema.org', ...crumbs([['Linkivo', '/'], ['Terms of use', '/terms']]) }],
      noscript: `<h1>Linkivo terms of use</h1><p>Linkivo is a free link manager. Use it lawfully, keep your sign-in details safe and keep your own backups.</p>${nav}` })
  ];
  for (const t of topics) {
    const m = topicMeta(t);
    list.push(page({ path: `/docs/${t.id}`, file: `docs/${t.id}.html`, title: m.fullTitle, description: m.desc, image: m.image, imageAlt: m.imageAlt, type: 'article',
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'TechArticle', headline: t.title, description: t.lead, url: `${O}/docs/${t.id}`, image: O + m.image, inLanguage: 'en', author: AUTHOR, publisher: AUTHOR, isPartOf: { '@type': 'CollectionPage', name: 'Linkivo documentation', url: O + '/docs' } }, { '@context': 'https://schema.org', ...crumbs([['Linkivo', '/'], ['Documentation', '/docs'], [t.title, `/docs/${t.id}`]]) }],
      noscript: topicBody(t) }));
  }
  return list;
}
