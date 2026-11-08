/**
 * Linkivo — js/features/public/public-render.js  (v2.5.4)
 * Purpose: builds the PUBLIC pages as plain HTML strings: Documentation (home and one page per topic), Privacy and Terms. They are separate pages, not part of the app:
 *          no splash, no app lock, no sidebar or bottom bar, no sign-in needed, no Firebase. A slim header carries the way back, the logo (a link to the app), the page title, a small info
 *          chip and the theme switch. The text is in the page itself, so crawlers, link previews and people without JavaScript read the real content (and the pages work offline).
 *          `@ Creator/tools/gen-seo.mjs` writes the files; js/public.js adds only the small behaviours (back, theme, video, highlighted section).
 * API: renderPublicPage({ head, themeScript, kind, topic?, legal?, version, buildDate }) -> string      kind: 'docs-home' | 'docs-topic' | 'legal'
 *      slug(text) -> string     PUBLIC_PATHS -> string[]  (every address that is served by a static file)
 * Design: the tutorial order lives in docs-content.js (FLOW). Each docs page shows its step number, a rail of all steps, an "On this page" list, and Previous / Next cards.
 */
import { TOPICS, FLOW, INTRO_VIDEO, flowTopics } from '../docs/docs-content.js';
import { PRIVACY, TERMS, LEGAL_UPDATED, CONTACT } from './legal-content.js';
import { iconSvg } from '../../ui/icons.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const slug = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
export const PUBLIC_PATHS = ['/docs', ...TOPICS.map((t) => `/docs/${t.id}`), '/privacy', '/terms'];

const ic = (n, s = 20, c = '') => iconSvg(n, s, c);
const WORD = '<span class="wordmark">l<i>i</i>nk<i>i</i>vo</span>';

function header({ title, crumb, version }) {
  return `<header class="pub-head">
    <div class="pub-head-in">
      <button type="button" class="pub-icon" data-pub="back" aria-label="Go back" title="Back">${ic('arrow-left', 22)}</button>
      <a class="pub-brand" href="/" aria-label="Linkivo: open the app" title="Open the app"><span class="logo-mark" style="--w:30px" aria-hidden="true"></span>${WORD}</a>
      <div class="pub-crumb" aria-hidden="true"><span class="pub-crumb-t">${esc(title)}</span>${crumb ? `<span class="pub-crumb-s">${esc(crumb)}</span>` : ''}</div>
      <span class="pub-chip" title="This page is separate from the app: no sign-in needed">Version ${esc(version)}</span>
      <button type="button" class="pub-icon" data-pub="theme" aria-label="Switch light or dark theme" title="Light or dark">${ic('sun', 22, 'pub-sun')}${ic('moon', 22, 'pub-moon')}</button>
    </div>
  </header>`;
}

function footer(version) {
  return `<footer class="pub-foot"><div class="pub-wrap pub-foot-in">
    <a class="pub-brand" href="/" aria-label="Open the app"><span class="logo-mark" style="--w:24px" aria-hidden="true"></span>${WORD}</a>
    <nav aria-label="Linkivo pages"><a href="/docs">Documentation</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/">Open the app</a></nav>
    <p>Free, private link manager by Muhtasim Rahman (Turzo). Version ${esc(version)}. <a href="mailto:${CONTACT}">${CONTACT}</a></p>
  </div></footer>`;
}

/** A list of paragraphs, bullets and a table, for a docs part or a legal section. */
function blocks(sec) {
  const out = [];
  for (const p of [].concat(sec.p || [])) out.push(`<p>${esc(p)}</p>`);
  if (sec.items) out.push(`<ul class="pub-list">${sec.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`);
  if (sec.table) {
    const { head, rows } = sec.table;
    out.push(`<div class="pub-table-wrap"><table class="pub-table"><thead><tr>${head.map((x) => `<th scope="col">${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row" data-label="${esc(head[0] || '')}">${esc(c)}</th>` : `<td data-label="${esc(head[i] || '')}">${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`);
  }
  return out.join('\n');
}

const toc = (items, label = 'On this page') => `<nav class="pub-toc" aria-label="${esc(label)}"><p class="pub-toc-h">${esc(label)}</p><ol>${items.map(([id, t]) => `<li><a href="#${esc(id)}">${esc(t)}</a></li>`).join('')}</ol></nav>`;

/** The tutorial rail: one numbered dot per step; done, current and coming steps look different. */
function rail(index) {
  const steps = flowTopics();
  return `<nav class="pub-rail" aria-label="Tutorial steps"><ol>${steps.map((t, i) => `<li class="${i < index ? 'is-done' : i === index ? 'is-now' : ''}"><a href="/docs/${t.id}"${i === index ? ' aria-current="step"' : ''} title="${esc(t.title)}"><span class="pub-rail-n">${i < index ? ic('check', 14) : i + 1}</span><span class="pub-rail-t">${esc(t.title)}</span></a></li>`).join('')}</ol></nav>`;
}

function stepCard(t, i, dir) {
  if (!t) return `<span class="pub-step is-empty${dir === 'next' ? ' is-next' : ''}"></span>`;
  return `<a class="pub-step ${dir === 'next' ? 'is-next' : 'is-prev'}" href="/docs/${t.id}" rel="${dir}">
    <span class="pub-step-k">${dir === 'next' ? 'Next' : 'Previous'} step ${i + 1}</span>
    <span class="pub-step-t">${dir === 'prev' ? ic('arrow-left', 18) : ''}<b>${esc(t.title)}</b>${dir === 'next' ? ic('chevron-right', 18) : ''}</span>
    <span class="pub-step-l">${esc(t.lead)}</span></a>`;
}

function docsSide(currentId) {
  const steps = flowTopics();
  return `<aside class="pub-side" aria-label="Documentation"><a class="pub-side-home${currentId === '' ? ' is-now' : ''}" href="/docs">${ic('book', 18)}<span>Documentation home</span></a>
    <p class="pub-side-h">The tutorial</p><ol class="pub-side-list">${steps.map((t, i) => `<li><a href="/docs/${t.id}"${t.id === currentId ? ' class="is-now" aria-current="page"' : ''}><span class="pub-side-n">${i + 1}</span><span>${esc(t.title)}</span></a></li>`).join('')}</ol>
    <p class="pub-side-h">Also</p><ul class="pub-side-list is-plain"><li><a href="/privacy">${ic('shield', 16)}<span>Privacy</span></a></li><li><a href="/terms">${ic('info', 16)}<span>Terms of use</span></a></li></ul></aside>`;
}

function videoCard() {
  return `<figure class="pub-video"><button type="button" class="pub-video-btn" data-pub="video" data-embed="${esc(INTRO_VIDEO.embed)}" aria-label="Play the introduction video: ${esc(INTRO_VIDEO.title)}">
    <img src="${INTRO_VIDEO.poster}" width="1280" height="720" alt="Linkivo introduction video" loading="lazy" decoding="async"><span class="pub-play" aria-hidden="true">${ic('play', 30)}</span></button>
    <figcaption>${esc(INTRO_VIDEO.title)}. The video loads from YouTube only when you press play.</figcaption></figure>`;
}

function docsHome(version) {
  const steps = flowTopics(), first = steps[0];
  const feat = steps.slice(0, 3), rest = steps.slice(3);
  return `<main id="main" class="pub-wrap pub-home">
    <section class="pub-hero">
      <div class="pub-hero-copy"><p class="pub-eyebrow">Documentation</p><h1>Everything Linkivo does, in the order you will need it.</h1>
        <p class="pub-lead">A short tutorial from your first folder to locked folders and backups. Read it start to finish in a few minutes, or jump to what you need.</p>
        <div class="pub-cta"><a class="pub-btn is-primary" href="/docs/${first.id}">Start the tutorial ${ic('chevron-right', 18)}</a><a class="pub-btn" href="/">Open the app</a></div></div>
      ${videoCard()}
    </section>
    <section class="pub-start" aria-labelledby="h-start"><h2 id="h-start" class="pub-h2">Start here</h2>
      <div class="pub-start-grid">${feat.map((t, i) => `<a class="pub-tile is-t${i}" href="/docs/${t.id}"><span class="pub-tile-n">${i + 1}</span><span class="pub-tile-ic">${ic(t.icon, 26)}</span><b>${esc(t.title)}</b><span>${esc(t.lead)}</span></a>`).join('')}</div></section>
    <section class="pub-path" aria-labelledby="h-path"><h2 id="h-path" class="pub-h2">Then, step by step</h2>
      <ol class="pub-path-list">${rest.map((t, i) => `<li><a href="/docs/${t.id}"><span class="pub-path-n">${i + 4}</span><span class="pub-path-ic">${ic(t.icon, 20)}</span><span class="pub-path-tx"><b>${esc(t.title)}</b><span>${esc(t.lead)}</span></span>${ic('chevron-right', 18, 'pub-path-go')}</a></li>`).join('')}</ol></section>
    <section class="pub-also" aria-label="Privacy and terms"><a href="/privacy">${ic('shield', 22)}<span><b>Privacy</b><span>What is stored, where it goes and how you take it back.</span></span></a><a href="/terms">${ic('info', 22)}<span><b>Terms of use</b><span>The simple rules for using Linkivo.</span></span></a></section>
  </main>`;
}

function docsTopic(topic) {
  const steps = flowTopics(), i = steps.findIndex((t) => t.id === topic.id), prev = steps[i - 1] || null, next = steps[i + 1] || null;
  const parts = topic.parts.map((p) => ({ id: slug(p.h), ...p }));
  return `<div class="pub-wrap pub-grid">
    ${docsSide(topic.id)}
    <main id="main" class="pub-main">
      ${rail(i)}
      <article class="pub-article">
        <p class="pub-eyebrow">Step ${i + 1} of ${steps.length}</p>
        <h1><span class="pub-h1-ic">${ic(topic.icon, 28)}</span>${esc(topic.title)}</h1>
        <p class="pub-lead">${esc(topic.lead)}</p>
        <div class="pub-progress" role="img" aria-label="Step ${i + 1} of ${steps.length}"><i style="width:${Math.round(((i + 1) / steps.length) * 100)}%"></i></div>
        ${parts.map((p, n) => `<section id="${esc(p.id)}" class="pub-part"><h2><span class="pub-part-n">${n + 1}</span>${esc(p.h)}</h2>${blocks(p)}</section>`).join('\n')}
      </article>
      <nav class="pub-steps" aria-label="Previous and next step">${stepCard(prev, i - 1, 'prev')}${stepCard(next, i + 1, 'next')}</nav>
      ${i === steps.length - 1 ? `<p class="pub-done">${ic('check-circle', 20)} That is the whole tutorial. <a href="/docs">Back to the documentation home</a> or <a href="/">open the app</a>.</p>` : ''}
    </main>
    <div class="pub-right">${toc(parts.map((p) => [p.id, p.h]))}</div>
  </div>`;
}

function legalPage(doc, key) {
  const secs = doc.sections;
  return `<div class="pub-wrap pub-grid is-legal">
    <aside class="pub-side" aria-label="${esc(doc.title)}"><a class="pub-side-home" href="/docs">${ic('book', 18)}<span>Documentation home</span></a>
      <p class="pub-side-h">Legal</p><ul class="pub-side-list is-plain"><li><a href="/privacy"${key === 'privacy' ? ' class="is-now" aria-current="page"' : ''}>${ic('shield', 16)}<span>Privacy</span></a></li><li><a href="/terms"${key === 'terms' ? ' class="is-now" aria-current="page"' : ''}>${ic('info', 16)}<span>Terms of use</span></a></li></ul>
      ${toc(secs.map((s) => [s.id, s.h]), 'On this page')}</aside>
    <main id="main" class="pub-main"><article class="pub-article is-legal">
      <p class="pub-eyebrow">Last updated ${esc(LEGAL_UPDATED)}</p>
      <h1>${esc(doc.title)}</h1><p class="pub-lead">${esc(doc.lead)}</p>
      <aside class="pub-summary" aria-label="In short"><p class="pub-summary-h">${ic('zap', 18)} In short</p><ul>${doc.summary.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></aside>
      ${secs.map((s, n) => `<section id="${esc(s.id)}" class="pub-part"><h2><span class="pub-part-n">${n + 1}</span>${esc(s.h)}</h2>${blocks(s)}</section>`).join('\n')}
      <p class="pub-done">${ic('mail', 18)} Questions? <a href="mailto:${CONTACT}">${CONTACT}</a>. See also <a href="${key === 'privacy' ? '/terms' : '/privacy'}">${key === 'privacy' ? 'Terms of use' : 'Privacy'}</a>.</p>
    </article></main>
  </div>`;
}

export function renderPublicPage({ head, themeScript, kind, topic = null, legal = null, version, buildDate = '' }) {
  const title = kind === 'legal' ? (legal === 'terms' ? TERMS.title : PRIVACY.title) : 'Documentation';
  const crumb = kind === 'docs-topic' ? topic.title : '';
  const body = kind === 'docs-home' ? docsHome(version) : kind === 'docs-topic' ? docsTopic(topic) : legalPage(legal === 'terms' ? TERMS : PRIVACY, legal === 'terms' ? 'terms' : 'privacy');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <!-- Search engine ownership checks (Google Search Console and Bing Webmaster Tools). Public by design. -->
  <meta name="google-site-verification" content="1jRG-liPR6RdCjprv6saCLlbo9T5J3lyNPAXTm4mSl4" />
  <meta name="msvalidate.01" content="53A15EBC0ADF54EC55B307032B3C8559" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
  <meta name="author" content="Muhtasim Rahman">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="theme-color" content="#eef2f8" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#060d1a" media="(prefers-color-scheme: dark)">
  <meta name="color-scheme" content="light dark">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/assets/icons/favicon.ico" sizes="48x48">
  <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <!-- The look settings are applied before the first paint, exactly as in the app (same script, so the same theme and accent). -->
  <script>${themeScript}</script>
  <link rel="stylesheet" href="/css/core/tokens.css">
  <link rel="stylesheet" href="/css/core/base.css">
  <link rel="stylesheet" href="/css/pages/public.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Outfit:wght@600;700;800&display=swap">
  <script type="module" src="/js/public.js"></script>
</head>
<body class="pub" data-page="${esc(kind)}" data-built="${esc(buildDate)}">
  <a class="pub-skip" href="#main">Skip to the content</a>
${header({ title, crumb, version })}
${body}
${footer(version)}
</body>
</html>
`;
}
