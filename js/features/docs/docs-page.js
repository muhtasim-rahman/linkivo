/**
 * Linkivo — js/features/docs/docs-page.js  (v2.5.2)
 * Purpose: /docs (topic index) and /docs/:topic (one article with the topic list beside it on wide screens and Previous / Next at the end). Public, indexable, one h1.
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { TOPICS, findTopic } from './docs-content.js';

export async function mount(container, ctx) {
  await loadCss('/css/pages/pages.css');
  const cur = findTopic(ctx.params && ctx.params.topic);
  const nav = h('nav', { class: 'dc-nav', 'aria-label': 'Documentation topics' }, TOPICS.map((t) => h('a', { class: ['dc-link', cur && cur.id === t.id && 'is-on'], href: `/docs/${t.id}`, 'aria-current': cur && cur.id === t.id ? 'page' : null }, icon(t.icon, { size: 18 }), h('span', { text: t.title }))));
  let main;
  if (!cur) main = h('div', { class: 'dc-main' }, h('p', { class: 'dc-lead', text: 'Everything Linkivo can do, one topic at a time.' }), h('div', { class: 'dc-grid' }, TOPICS.map((t) => h('a', { class: 'dc-card', href: `/docs/${t.id}` }, icon(t.icon, { size: 22 }), h('span', { class: 'dc-card-t', text: t.title }), h('span', { class: 'dc-card-s', text: t.lead })))));
  else {
    const i = TOPICS.indexOf(cur), prev = TOPICS[i - 1], next = TOPICS[i + 1];
    main = h('article', { class: 'dc-main' }, h('h2', { class: 'dc-title', text: cur.title }), h('p', { class: 'dc-lead', text: cur.lead }),
      ...cur.parts.map((p) => h('section', { class: 'dc-part' }, h('h3', { class: 'dc-h', text: p.h }), p.p ? h('p', { class: 'legal-p', text: p.p }) : null, p.items ? h('ul', { class: 'dc-items' }, p.items.map((x) => h('li', { text: x }))) : null)),
      h('div', { class: 'dc-pager' }, prev ? h('a', { class: 'btn btn-sm', href: `/docs/${prev.id}`, text: `Previous: ${prev.title}` }) : h('span'), next ? h('a', { class: 'btn btn-sm', href: `/docs/${next.id}`, text: `Next: ${next.title}` }) : h('span')));
  }
  container.appendChild(h('div', { class: 'page page-enter docs' }, h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Documentation' })), h('div', { class: 'dc-wrap' }, nav, main)));
}
