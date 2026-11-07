// Linkivo: writes the static SEO of every public page (v2.5.3).
//   node "@ Creator/tools/gen-seo.mjs"          writes index.html (home), login.html, docs.html, docs/<topic>.html, privacy.html, terms.html and sitemap.xml
//   node "@ Creator/tools/gen-seo.mjs" --check  fails when any of them is out of date (check.mjs runs this)
// Why: Firebase serves a real file before it applies the "** -> /index.html" rewrite, and `cleanUrls` maps /terms to terms.html. So a crawler or a link preview that does not run JavaScript
// reads the RIGHT title, description, canonical, share image and structured data for each address, instead of the shell's. The text comes from js/core/seo-pages.js (also used in the browser).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { publicPages } = await import(path.join(root, 'js/core/seo-pages.js'));
const { TOPICS } = await import(path.join(root, 'js/features/docs/docs-content.js'));
const { SITE } = await import(path.join(root, 'js/core/page-meta.js'));
const check = process.argv.includes('--check');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));

function head(p) {
  const m = (k, v, attr = 'name') => `  <meta ${attr}="${k}" content="${esc(v)}">`;
  const L = [`  <title>${esc(p.title)}</title>`, m('description', p.description), m('robots', p.robots)];
  if (p.canonical) L.push(`  <link rel="canonical" href="${p.canonical}">`);
  L.push(m('og:type', p.type, 'property'), m('og:site_name', 'Linkivo', 'property'), m('og:locale', 'en_US', 'property'), m('og:title', p.title, 'property'), m('og:description', p.description, 'property'));
  if (p.canonical) L.push(m('og:url', p.canonical, 'property'));
  L.push(m('og:image', SITE.origin + p.image, 'property'), m('og:image:type', 'image/jpeg', 'property'), m('og:image:width', '1200', 'property'), m('og:image:height', '630', 'property'), m('og:image:alt', p.imageAlt, 'property'));
  L.push(m('twitter:card', 'summary_large_image'), m('twitter:creator', '@mdturzo999'), m('twitter:title', p.title), m('twitter:description', p.description), m('twitter:image', SITE.origin + p.image), m('twitter:image:alt', p.imageAlt));
  if (p.canonical) L.push(m('twitter:url', p.canonical));
  for (const j of p.jsonLd) L.push(`  <script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`);
  return L.join('\n');
}
const pages = publicPages(TOPICS);
const tpl = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const swap = (s, a, b, text) => { const i = s.indexOf(a), j = s.indexOf(b); if (i < 0 || j < i) throw new Error(`marker ${a} missing in index.html`); return s.slice(0, i + a.length) + '\n' + text + '\n  ' + s.slice(j); };
const A = '<!-- seo:start (written by "@ Creator/tools/gen-seo.mjs": do not edit between the markers) -->';
const out = new Map();
for (const p of pages) {
  let html = swap(tpl, A, '<!-- seo:end -->', head(p));
  html = swap(html, '<!-- seo:body -->', '<!-- /seo:body -->', `  <noscript><main class="seo-noscript" style="max-width:720px;margin:40px auto;padding:0 20px;font:16px/1.6 system-ui,sans-serif">${p.noscript}</main></noscript>`);
  out.set(p.file, html);
}
const day = (app.buildDate || new Date().toISOString()).slice(0, 10);
const prio = (p) => (p.path === '/' ? '1.0' : p.path === '/docs' ? '0.8' : p.path.startsWith('/docs/') ? '0.6' : '0.4');
out.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${pages.filter((p) => p.canonical).map((p) => `  <url>\n    <loc>${p.canonical}</loc>\n    <lastmod>${day}</lastmod>\n    <changefreq>${p.path === '/' ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${prio(p)}</priority>\n    <image:image><image:loc>${SITE.origin + p.image}</image:loc></image:image>\n  </url>`).join('\n')}\n</urlset>\n`);
let bad = 0;
for (const [file, text] of out) {
  const target = path.join(root, file);
  if (check) { const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null; if (cur !== text) { console.error(`ERROR ${file} is out of date: run gen-seo.mjs`); bad++; } }
  else { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); }
}
if (check) process.exit(bad ? 1 : 0);
console.log(`gen-seo: ${out.size} files written (${pages.length} pages)`);
