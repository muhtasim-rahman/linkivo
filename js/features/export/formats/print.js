/**
 * Linkivo — js/features/export/formats/print.js  (v2.2.1)
 * Purpose: "Print" export: the Web page design set up for paper. Page size (A4, A5, Letter), orientation, margins, colour or black and white, a header and
 *          footer that repeat on every page and page numbers. The file opens ready to print: the browser's print dialog also saves it as PDF.
 *          [verify] "Page 1 of N" uses CSS page margin boxes, which Chrome and Edge support; a browser without them prints the repeating footer without numbers.
 * API: default export format { id:'print', options, visual:true, previewHtml, toText, build }
 */
import { commonOptions, textBlob } from './common.js';
import { renderPage, loadLogo, PAGE_SIZES } from './page-render.js';
import { pageOptions } from './webpage.js';

async function toText(items, o, ctx = {}) { return renderPage(items, o, { mode: 'print', label: ctx.label, now: ctx.now, logo: await loadLogo() }); }
export default {
  id: 'print', label: 'Print', icon: 'printer', desc: 'A page set up for paper or PDF.', ext: 'html', mime: 'text/html', text: true, visual: true,
  options: [
    { id: 'pageSize', group: 'layout', type: 'seg', label: 'Page', choices: Object.entries(PAGE_SIZES).map(([value, label]) => ({ value, label })), default: 'a4' },
    { id: 'orientation', group: 'layout', type: 'seg', label: 'Direction', choices: [{ value: 'portrait', label: 'Portrait', icon: 'file' }, { value: 'landscape', label: 'Landscape', icon: 'rows' }], default: 'portrait' },
    { id: 'margin', group: 'layout', type: 'seg', label: 'Margins', choices: [{ value: 'narrow', label: 'Narrow' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }], default: 'normal' },
    ...pageOptions(true),
    { id: 'color', group: 'style', type: 'seg', label: 'Ink', choices: [{ value: 'color', label: 'Color' }, { value: 'mono', label: 'Black and white' }], default: 'color' },
    { id: 'scale', group: 'style', type: 'seg', label: 'Text size', choices: [{ value: 'small', label: 'Small' }, { value: 'normal', label: 'Normal' }, { value: 'large', label: 'Large' }], default: 'normal' },
    { id: 'pageNumbers', group: 'layout', type: 'switch', label: 'Page numbers', default: true },
    ...commonOptions()
  ],
  preview: async (items, o, ctx) => (await toText(items.slice(0, 4), o, ctx)).slice(0, 600),
  previewHtml: async (items, o, ctx = {}) => renderPage(items, { ...o, theme: 'light' }, { mode: 'web', label: ctx.label, limit: 6, logo: await loadLogo() }),
  toText,
  async build(items, o, ctx) { return textBlob(await toText(items, o, ctx), 'text/html'); }
};
