/**
 * Linkivo — js/features/export/formats/page-render.js  (v2.2.1)
 * Purpose: builds the two DESIGNED page exports from the same code: "Web page" (a handsome single HTML file to read on screen or share) and "Print"
 *          (the same design set up for paper: page size, orientation, margins, header and footer on every page, page numbers).
 *          Layout (list, table or cards), grouping, theme, accent color, density and which details show are options. The file is fully self-contained
 *          (inline CSS, no scripts, system fonts). Only the small site icons are loaded from Google's favicon service when the file is opened online; a
 *          letter tile sits behind each one, so the page looks right offline too. Header: Linkivo logo, title, caption and the export details.
 *          Footer: the app address, the developer's name (a link to his site) and, in print, page numbers.
 *          Every text goes through esc.html and every address must be http(s), so a link title can never inject markup.
 * API: renderPage(items, o, { mode:'web'|'print', label, limit?, now?, logo? }) -> Promise<string>      loadLogo() -> Promise<string>
 *      PAGE_SIZES  ACCENTS  SHOW_CHOICES  hrefOf(url) -> string|null  (pure, tested)
 */
import { selectItems, groupItems, fmtDate, esc, eachChunked } from './common.js';
import appInfo from '../../../core/app-info.js';

export const ACCENTS = { blue: '#2563eb', emerald: '#059669', violet: '#7c3aed', rose: '#e11d48', amber: '#d97706', slate: '#475569' };
export const PAGE_SIZES = { a4: 'A4', a5: 'A5', letter: 'Letter' };
export const SHOW_CHOICES = [{ value: 'icon', label: 'Icon' }, { value: 'url', label: 'URL' }, { value: 'desc', label: 'Description' }, { value: 'tags', label: 'Tags' }, { value: 'added', label: 'Date' }, { value: 'num', label: 'Numbers' }];
const MARGINS = { narrow: '8mm', normal: '14mm', wide: '22mm' };
const SCALES = { small: 0.88, normal: 1, large: 1.14 };

/** An address that may become a clickable link: http or https only. Anything else (javascript:, data:) is dropped. */
export const hrefOf = (url) => (/^https?:\/\//i.test(String(url || '')) ? String(url) : null);
const shortUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
const initial = (i) => esc.html(((i.host || i.title || '?').replace(/^www\./, '')[0] || '?').toUpperCase());

let logoCache = null;
/** The Linkivo mark, read from assets/brand/logo.svg and inlined (rule: artwork lives in assets). Offline or blocked: an empty string, and the header shows the name only. */
export async function loadLogo() {
  if (logoCache !== null) return logoCache;
  try {
    const r = await fetch('/assets/brand/logo-mark.svg'); if (!r.ok) throw new Error('logo');
    logoCache = (await r.text()).replace(/<\?xml[^>]*>/, '').replace(/<svg /, '<svg class="logo" aria-hidden="true" ').replace(/\s(width|height)="[^"]*"/g, '');
  } catch { logoCache = ''; }
  return logoCache;
}

function css(o, mode) {
  const ac = ACCENTS[o.accent] || ACCENTS.blue, mono = mode === 'print' && o.color === 'mono';
  const dense = o.density === 'comfortable' ? 1.25 : 1, scale = (SCALES[o.scale] || 1) * (mode === 'print' ? 0.95 : 1);
  const theme = mode === 'print' ? 'light' : (o.theme || 'light');
  const light = '--bg:#fff;--fg:#0c1629;--mut:#5b6b82;--line:#e3e8f0;--soft:#f3f6fb;';
  const dark = '--bg:#0b1730;--fg:#e6eef8;--mut:#93a4bd;--line:#223255;--soft:#12213f;';
  const size = PAGE_SIZES[o.pageSize] || 'A4';
  return `:root{${light}--ac:${mono ? '#111' : ac};--sc:${scale};--dn:${dense}}
${theme === 'dark' ? `:root{${dark}}` : ''}${theme === 'auto' ? `@media(prefers-color-scheme:dark){:root{${dark}}}` : ''}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:calc(15px*var(--sc))/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:${mode === 'print' ? 'none' : '880px'};margin:0 auto;padding:${mode === 'print' ? '0' : '40px 22px 56px'}}
.top{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:18px;padding-bottom:18px;margin-bottom:8px;border-bottom:2px solid var(--ac)}
.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.01em;color:var(--ac)}.logo{width:34px;height:34px;flex:none;color:var(--ac)}
.ttl{flex:1 1 280px;min-width:0}h1{margin:2px 0 0;font-size:calc(28px*var(--sc));line-height:1.15;letter-spacing:-.02em}.cap{margin:4px 0 0;color:var(--mut)}
.det{display:flex;flex-wrap:wrap;gap:6px}.det span{padding:3px 11px;border-radius:99px;background:var(--soft);border:1px solid var(--line);font-size:.82em;color:var(--mut);font-variant-numeric:tabular-nums}
h2{display:flex;align-items:center;gap:10px;margin:calc(26px*var(--dn)) 0 8px;font-size:1.05em;break-after:avoid}
h2 .gt{width:26px;height:26px;display:grid;place-items:center;border-radius:8px;background:var(--ac);color:#fff;font-size:.8em;font-weight:700;flex:none}
h2 small{margin-left:auto;color:var(--mut);font-weight:500}
ol{list-style:none;margin:0;padding:0}.r{display:flex;align-items:flex-start;gap:12px;padding:calc(9px*var(--dn)) 4px;border-bottom:1px solid var(--line);break-inside:avoid}
.n{width:2.2em;flex:none;text-align:right;color:var(--mut);font-variant-numeric:tabular-nums;font-size:.85em;padding-top:2px}
.fv{position:relative;width:22px;height:22px;flex:none;margin-top:1px}.fv i{position:absolute;inset:0;display:grid;place-items:center;border-radius:6px;background:var(--soft);color:var(--mut);font:600 11px system-ui;font-style:normal}.fv img{position:relative;width:22px;height:22px;border-radius:5px;background:var(--bg)}
.t{flex:1;min-width:0;display:grid;gap:1px}.t>a{font-weight:600;overflow-wrap:anywhere}.u{color:var(--ac);font-size:.84em;overflow-wrap:anywhere}.d{color:var(--mut);font-size:.88em}.g{color:var(--mut);font-size:.8em}
.dt{flex:none;color:var(--mut);font-size:.82em;white-space:nowrap;padding-top:2px}
table.tb{width:100%;border-collapse:collapse;margin-top:4px}.tb th{text-align:left;font-size:.78em;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);padding:6px 8px;border-bottom:2px solid var(--line)}
.tb td{padding:calc(8px*var(--dn)) 8px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}.tb tr{break-inside:avoid}.tb .fv{display:inline-block;vertical-align:middle;margin-right:8px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(${mode === 'print' ? '170px' : '240px'},1fr));gap:12px;margin-top:6px}
.c{display:grid;gap:4px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--soft);break-inside:avoid;align-content:start}.c .fv{margin-bottom:4px}.c>a{font-weight:600;overflow-wrap:anywhere}
.ft{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-top:34px;padding-top:12px;border-top:1px solid var(--line);color:var(--mut);font-size:.8em}.ft a{color:var(--ac);font-weight:600}
${mode === 'print' ? `@page{size:${size} ${o.orientation === 'landscape' ? 'landscape' : 'portrait'};margin:${MARGINS[o.margin] || MARGINS.normal};${o.pageNumbers === false ? '' : '@bottom-right{content:"Page " counter(page) " of " counter(pages);font:9pt system-ui;color:#5b6b82}'}}
table.sheet{width:100%;border-collapse:collapse}table.sheet>thead{display:table-header-group}table.sheet>tfoot{display:table-footer-group}table.sheet>thead>tr>td,table.sheet>tfoot>tr>td,table.sheet>tbody>tr>td{padding:0;border:0}
.ft{margin-top:10px}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}` : `@media(max-width:560px){.wrap{padding:26px 14px 40px}.dt{display:none}}`}
${mono ? '.gt{background:#111 !important}img{filter:grayscale(1)}' : ''}`;
}

function rowHtml(i, n, show, o) {
  const href = hrefOf(i.url), name = esc.html(i.title || i.host || i.url);
  const icon = show.has('icon') ? `<span class="fv"><i>${initial(i)}</i><img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(i.host || '')}&amp;sz=64" alt="" width="22" height="22" loading="lazy" referrerpolicy="no-referrer"></span>` : '';
  const title = href ? `<a href="${esc.html(href)}">${name}</a>` : `<span>${name}</span>`;
  const bits = `${show.has('url') ? `<span class="u">${esc.html(shortUrl(i.url))}</span>` : ''}${show.has('desc') && i.desc ? `<span class="d">${esc.html(i.desc)}</span>` : ''}${show.has('tags') && i.tags ? `<span class="g">${esc.html(i.tags.split(',').map((t) => '#' + t.trim()).filter((t) => t.length > 1).join('  '))}</span>` : ''}`;
  return { icon, title, bits, date: show.has('added') ? esc.html(fmtDate(i.added, o.dateFormat || 'long')) : '', num: show.has('num') ? n : null };
}

async function groupBody(g, start, show, o) {
  const out = []; let n = start;
  const layout = o.layout === 'table' ? 'table' : o.layout === 'cards' ? 'cards' : 'list';
  if (layout === 'list') { out.push('<ol>'); await eachChunked(g.items, (i) => { const r = rowHtml(i, ++n, show, o); out.push(`<li class="r">${r.num ? `<span class="n">${r.num}</span>` : ''}${r.icon}<span class="t">${r.title}${r.bits}</span>${r.date ? `<span class="dt">${r.date}</span>` : ''}</li>`); }); out.push('</ol>'); }
  else if (layout === 'cards') { out.push('<div class="cards">'); await eachChunked(g.items, (i) => { const r = rowHtml(i, ++n, show, o); out.push(`<div class="c">${r.icon}${r.title}${r.bits}${r.date ? `<span class="g">${r.date}</span>` : ''}</div>`); }); out.push('</div>'); }
  else {
    out.push(`<table class="tb"><thead><tr>${show.has('num') ? '<th>#</th>' : ''}<th>Title</th>${show.has('url') ? '<th>URL</th>' : ''}${show.has('desc') ? '<th>Description</th>' : ''}${show.has('tags') ? '<th>Tags</th>' : ''}${show.has('added') ? '<th>Added</th>' : ''}</tr></thead><tbody>`);
    await eachChunked(g.items, (i) => { const r = rowHtml(i, ++n, show, o); out.push(`<tr>${r.num ? `<td>${r.num}</td>` : ''}<td>${r.icon}${r.title}</td>${show.has('url') ? `<td class="u">${esc.html(shortUrl(i.url))}</td>` : ''}${show.has('desc') ? `<td class="d">${esc.html(i.desc)}</td>` : ''}${show.has('tags') ? `<td class="g">${esc.html(i.tags)}</td>` : ''}${show.has('added') ? `<td class="dt">${r.date}</td>` : ''}</tr>`); });
    out.push('</tbody></table>');
  }
  return { html: out.join(''), end: n };
}

export async function renderPage(items, o = {}, { mode = 'web', label = 'Library', limit = 0, now = Date.now(), logo = '' } = {}) {
  const show = new Set(o.show && o.show.length ? o.show : ['icon', 'url']);
  const sel = selectItems(items, o), shown = limit ? sel.slice(0, limit) : sel;
  const groups = groupItems(shown, o.group || 'folder');
  const body = []; let n = 0;
  for (const g of groups) {
    if (g.name && o.group !== 'none') body.push(`<h2><span class="gt">${esc.html(g.name[0].toUpperCase())}</span>${esc.html(g.name)}<small>${g.items.length}</small></h2>`);
    const r = await groupBody(g, n, show, o); body.push(r.html); n = r.end;
  }
  const folders = new Set(sel.map((i) => i.folder)).size;
  const title = esc.html((o.title || '').trim() || (label === 'library' ? 'My links' : label.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())));
  const header = o.header === false ? '' : `<header class="top"><div class="ttl"><div class="brand">${logo}<span>Linkivo</span></div><h1>${title}</h1><p class="cap">${esc.html((o.caption || '').trim() || 'Saved links')}</p></div><div class="det"><span>${sel.length} link${sel.length === 1 ? '' : 's'}</span><span>${folders} folder${folders === 1 ? '' : 's'}</span><span>${esc.html(fmtDate(now, 'long'))}</span></div></header>`;
  const footer = o.footer === false ? '' : `<footer class="ft"><span>Exported with <a href="${esc.html(appInfo.hosting)}">Linkivo</a> ${esc.html(appInfo.version)}</span><span>Developed by <a href="${esc.html(appInfo.site)}">${esc.html(appInfo.developer)}</a></span></footer>`;
  const main = `<main>${body.join('') || '<p class="cap">No links to show.</p>'}</main>`;
  const content = mode === 'print' ? `<table class="sheet"><thead><tr><td>${header}</td></tr></thead><tbody><tr><td>${main}</td></tr></tbody><tfoot><tr><td>${footer}</td></tr></tfoot></table>` : `${header}${main}${footer}`;
  // watermark: a generator meta and a comment, so the file can be recognised as a Linkivo export by its content
  return `<!DOCTYPE html>\n<!-- Exported by Linkivo ${esc.html(appInfo.version)} - ${esc.html(appInfo.hosting)} -->\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="Linkivo ${esc.html(appInfo.version)}"><title>${title} - Linkivo</title><style>${css(o, mode)}</style></head><body><div class="wrap">${content}</div></body></html>`;
}
