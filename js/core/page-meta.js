/**
 * Linkivo — js/core/page-meta.js  (v2.1.2)
 * Purpose: per-route SEO metadata (RULES section 9). The router calls applyPageMeta() on every navigation: it sets the document
 *          title, description, robots, canonical link and the social-card tags. Private pages are noindex; public pages
 *          (route.index === true) are indexable and carry a canonical URL. Pure builder + one DOM applier, so it is unit-tested.
 * API: pageMeta(route, params, origin?) -> { title, description, robots, canonical }
 *      applyPageMeta(meta, doc?) -> void
 */
export const SITE = Object.freeze({
  name: 'Linkivo',
  origin: 'https://linkivo.web.app',
  description: 'Linkivo is a fast, private link manager. Save, organise and rediscover thousands of links and bookmarks, in a browser or as an installed app.'
});

export function pageMeta(route, params = {}, origin = SITE.origin) {
  const t = typeof route.title === 'function' ? route.title(params) : route.title;
  const indexable = route.index === true;
  return {
    title: t ? `${t} - ${SITE.name}` : `${SITE.name}: manage your links`,
    description: route.desc || SITE.description,
    robots: indexable ? 'index,follow' : 'noindex,nofollow',
    canonical: indexable ? origin + (route.canonical || route.pattern) : ''
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
  let link = doc.head.querySelector('link[rel="canonical"]');
  if (meta.canonical) {
    if (!link) { link = doc.createElement('link'); link.setAttribute('rel', 'canonical'); doc.head.appendChild(link); }
    link.setAttribute('href', meta.canonical);
    setMeta(doc, 'meta[property="og:url"]', 'property', 'og:url', meta.canonical);
  } else if (link) link.remove();
}
