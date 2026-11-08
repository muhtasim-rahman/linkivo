/**
 * Linkivo — js/features/docs/docs-page.js  (v2.5.2)
 * Purpose: /docs (topic index) and /docs/:topic (one article with the topic list beside it on wide screens and Previous / Next at the end). Public, indexable, one h1.
 * Page module: mount(container, ctx)
 * UNUSED since v2.5.4 (owner): Documentation, Privacy and Terms are separate static pages now (js/features/public/public-render.js, written by gen-seo.mjs). The router no longer renders this page: a link to it opens the static page in a new tab. Kept, not deleted, so the older tests and the history stay readable; safe to remove in a later cleanup.
 */
import { applyPageMeta, pageMeta } from '../../core/page-meta.js';
import { topicMeta, topicBanner } from '../../core/seo-pages.js';
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { TOPICS, findTopic } from './docs-content.js';

export async function mount(container, ctx) {
  await loadCss('/css/pages/pages.css');
  const cur = findTopic(ctx.params && ctx.params.topic);
  if (cur) applyPageMeta(pageMeta(topicMeta(cur)));   // v2.5.3: every topic has its own title, description, canonical and share image (same data as the static page)
  const nav = h('nav', { class: 'dc-nav', 'aria-label': 'Documentation topics' }, TOPICS.map((t) => h('a', { class: ['dc-link', cur && cur.id === t.id && 'is-on'], href: `/docs/${t.id}`, 'aria-current': cur && cur.id === t.id ? 'page' : null }, icon(t.icon, { size: 18 }), h('span', { text: t.title }))));
  let main;
  if (!cur) main = h('div', { class: 'dc-main' }, h('p', { class: 'dc-lead', text: 'Everything Linkivo can do, one topic at a time.' }), h('figure', { class: 'dc-fig' }, h('img', { src: '/assets/showcase/hero.webp', width: 1200, height: 630, alt: 'Linkivo: save, organise, rediscover your links', decoding: 'async' })), h('div', { class: 'dc-grid' }, TOPICS.map((t) => h('a', { class: 'dc-card', href: `/docs/${t.id}` }, icon(t.icon, { size: 22 }), h('span', { class: 'dc-card-t', text: t.title }), h('span', { class: 'dc-card-s', text: t.lead })))));
  else {
    const i = TOPICS.indexOf(cur), prev = TOPICS[i - 1], next = TOPICS[i + 1];
    main = h('article', { class: 'dc-main' }, h('h2', { class: 'dc-title', text: cur.title }), h('p', { class: 'dc-lead', text: cur.lead }),
      topicBanner(cur.id) ? h('figure', { class: 'dc-fig' }, h('img', { src: topicBanner(cur.id), width: 1200, height: 630, alt: `Linkivo: ${cur.title}`, loading: 'lazy', decoding: 'async' })) : null,   // v2.5.3: the banner of this topic; width and height are set so nothing jumps while it loads
      ...cur.parts.map((p) => h('section', { class: 'dc-part' }, h('h3', { class: 'dc-h', text: p.h }), p.p ? h('p', { class: 'legal-p', text: p.p }) : null, p.items ? h('ul', { class: 'dc-items' }, p.items.map((x) => h('li', { text: x }))) : null)),
      h('div', { class: 'dc-pager' }, prev ? h('a', { class: 'btn btn-sm', href: `/docs/${prev.id}`, text: `Previous: ${prev.title}` }) : h('span'), next ? h('a', { class: 'btn btn-sm', href: `/docs/${next.id}`, text: `Next: ${next.title}` }) : h('span')));
  }
  container.appendChild(h('div', { class: 'page page-enter docs' }, h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Documentation' })), h('div', { class: 'dc-wrap' }, nav, main)));
}
