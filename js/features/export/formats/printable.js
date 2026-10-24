/** Linkivo — js/features/export/formats/printable.js (v2.2.0) A clean, self-contained, print-friendly page (light or dark), grouped. */
import { commonOptions, selectItems, groupItems, fmtDate, esc, eachChunked, textBlob } from './common.js';

async function toText(items, o) {
  const dark = o.theme === 'dark', groups = groupItems(selectItems(items, o), o.group || 'folder');
  const body = [];
  for (const g of groups) {
    if (g.name && o.group !== 'none') body.push(`<h2>${esc.html(g.name)} <small>${g.items.length}</small></h2>`);
    body.push('<ol>');
    await eachChunked(g.items, (i) => body.push(`<li><a href="${esc.html(i.url)}">${esc.html(i.title || i.host || i.url)}</a><span class="u">${esc.html(i.host)}</span>${o.description && i.desc ? `<span class="d">${esc.html(i.desc)}</span>` : ''}${o.tags && i.tags ? `<span class="t">${esc.html(i.tags)}</span>` : ''}${o.added ? `<span class="t">${fmtDate(i.added, o.dateFormat)}</span>` : ''}</li>`));
    body.push('</ol>');
  }
  const css = `body{font:14px/1.5 system-ui,sans-serif;margin:32px auto;max-width:820px;padding:0 20px;background:${dark ? '#0b1730' : '#fff'};color:${dark ? '#d4e6f6' : '#0c1629'}}h1{font-size:24px}h2{font-size:16px;margin:28px 0 6px;border-bottom:1px solid ${dark ? '#27406b' : '#d6dfed'};padding-bottom:4px}h2 small{color:#7f9bb8;font-weight:400}ol{padding-left:22px;margin:0}li{margin:6px 0}li a{color:${dark ? '#8ab8ff' : '#1d4fc4'};word-break:break-word}.u,.d,.t{display:block;font-size:12px;color:#7f9bb8}@media print{body{background:#fff;color:#000;margin:0}a{color:#000}}`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Linkivo links</title><style>${css}</style></head><body><h1>Linkivo links</h1><p class="u">${fmtDate(Date.now(), 'iso')}</p>${body.join('')}</body></html>`;
}
export default {
  id: 'printable', label: 'Printable page', desc: 'A tidy page you can print or save as PDF from the browser.', ext: 'html', mime: 'text/html', text: true,
  options: [{ id: 'theme', type: 'select', label: 'Theme', choices: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], default: 'light' }, { id: 'description', type: 'switch', label: 'Include description', default: false }, { id: 'tags', type: 'switch', label: 'Include tags', default: false }, { id: 'added', type: 'switch', label: 'Include added date', default: false }, ...commonOptions()],
  preview: async (items, o) => (await toText(items.slice(0, 3), o)).replace(/<style>[\s\S]*?<\/style>/, '<style>...</style>').slice(0, 900),
  toText,
  async build(items, o) { return textBlob(await toText(items, o), 'text/html'); }
};
