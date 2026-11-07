/**
 * Linkivo — js/core/page-meta.js  (v2.1.2, extended v2.5.3)
 * Purpose: per-route SEO metadata (RULES section 9). The router calls applyPageMeta() on every navigation: it sets the document title, description, robots, canonical link and the social-card
 *          tags (Open Graph and Twitter: title, description, url, type, image and its alt text). Private pages are noindex; public pages (route.index === true) are indexable and carry a canonical
 *          URL. v2.5.3: a route may give `fullTitle` (used as it is), `image` (a path under /assets/social) and `imageAlt`; the default share image is the Linkivo thumbnail. The same data is written
 *          into static HTML files by @ Creator/tools/gen-seo.mjs (js/core/seo-pages.js), so a crawler that does not run JavaScript sees the same title and description as a browser.
 *          Pure builder + one DOM applier, so it is unit-tested.
 * API: SITE   pageMeta(route, params?, origin?) -> { title, description, robots, canonical, image, imageAlt, type }      applyPageMeta(meta, doc?) -> void
 */
export const SITE = Object.freeze({
  name: 'Linkivo',
  origin: 'https://linkivo.web.app',
  description: 'Linkivo is a fast, private link manager. Save, organise and rediscover thousands of links and bookmarks, in a browser or as an installed app.',
  image: '/assets/social/og-default.jpg',
  imageAlt: 'Linkivo: save, organise, rediscover your links. Folders, smart import, search and a private vault.'
});

export function pageMeta(route, params = {}, origin = SITE.origin) {
  const t = typeof route.title === 'function' ? route.title(params) : route.title;
  const indexable = route.index === true;
  return {
    title: route.fullTitle || (t ? `${t} - ${SITE.name}` : `${SITE.name}: manage your links`),
    description: route.desc || SITE.description,
    robots: indexable ? 'index,follow' : route.follow ? 'noindex,follow' : 'noindex,nofollow',
    canonical: indexable ? origin + (route.canonical || route.pattern) : '',
    image: origin + (route.image || SITE.image),
    imageAlt: route.imageAlt || SITE.imageAlt,
    type: route.ogType || 'website'
  };
}

function setMeta(doc, selector, attr, key, value) {
  let el = doc.head.querySelector(selector);
  if (!el) { el = doc.createElement('meta'); el.setAttribute(attr, key); doc.head.appendChild(el); }
  el.setAttribute('content', value);
}

export function applyPageMeta(meta, doc = document) {
  doc.title = meta.title;
  setMeta(doc, 'meta[name="description"]', 'name', 'description', meta.description);
  setMeta(doc, 'meta[name="robots"]', 'name', 'robots', meta.robots);
  setMeta(doc, 'meta[property="og:title"]', 'property', 'og:title', meta.title);
  setMeta(doc, 'meta[property="og:description"]', 'property', 'og:description', meta.description);
  setMeta(doc, 'meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  setMeta(doc, 'meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
  if (meta.type) setMeta(doc, 'meta[property="og:type"]', 'property', 'og:type', meta.type);
  if (meta.image) {
    setMeta(doc, 'meta[property="og:image"]', 'property', 'og:image', meta.image);
    setMeta(doc, 'meta[name="twitter:image"]', 'name', 'twitter:image', meta.image);
    setMeta(doc, 'meta[property="og:image:alt"]', 'property', 'og:image:alt', meta.imageAlt || SITE.imageAlt);
    setMeta(doc, 'meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', meta.imageAlt || SITE.imageAlt);
  }
  let link = doc.head.querySelector('link[rel="canonical"]');
  if (meta.canonical) {
    if (!link) { link = doc.createElement('link'); link.setAttribute('rel', 'canonical'); doc.head.appendChild(link); }
    link.setAttribute('href', meta.canonical);
    setMeta(doc, 'meta[property="og:url"]', 'property', 'og:url', meta.canonical);
    setMeta(doc, 'meta[name="twitter:url"]', 'name', 'twitter:url', meta.canonical);
  } else if (link) link.remove();
}
