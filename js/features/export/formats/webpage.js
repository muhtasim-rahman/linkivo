/**
 * Linkivo — js/features/export/formats/webpage.js  (v2.2.1)
 * Purpose: "Web page" export: the normal HTML export, a designed single file to read on screen or share (list, table or cards; header with the logo and
 *          export details; footer with the app address and the developer link). Built by page-render.js, which the Print export shares.
 * API: default export format { id:'webpage', options, visual:true, previewHtml(items, o, ctx), toText, build }
 */
import { commonOptions, textBlob } from './common.js';
import { renderPage, loadLogo, ACCENTS, SHOW_CHOICES } from './page-render.js';

export const LAYOUT_CHOICES = [{ value: 'list', label: 'List', icon: 'rows' }, { value: 'table', label: 'Table', icon: 'table' }, { value: 'cards', label: 'Cards', icon: 'cards' }];
export const pageOptions = (print = false) => [
  { id: 'layout', group: 'layout', type: 'seg', label: 'Layout', choices: LAYOUT_CHOICES, default: 'list' },
  { id: 'show', group: 'content', type: 'multi', label: 'Show', choices: SHOW_CHOICES, default: ['icon', 'url', 'desc'] },
  { id: 'title', group: 'content', type: 'text', label: 'Title', placeholder: 'My links', default: '' },
  { id: 'caption', group: 'content', type: 'text', label: 'Caption', placeholder: 'Saved links', default: '' },
  ...(print ? [] : [{ id: 'theme', group: 'style', type: 'seg', label: 'Theme', choices: [{ value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }, { value: 'auto', label: 'Auto', icon: 'monitor' }], default: 'light' }]),
  { id: 'accent', group: 'style', type: 'swatch', label: 'Accent', choices: Object.entries(ACCENTS).map(([value, color]) => ({ value, label: value, color })), default: 'blue' },
  { id: 'density', group: 'style', type: 'seg', label: 'Spacing', choices: [{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Roomy' }], default: 'compact' },
  { id: 'header', group: 'layout', type: 'switch', label: 'Header', default: true },
  { id: 'footer', group: 'layout', type: 'switch', label: 'Footer', default: true }
];

async function toText(items, o, ctx = {}) { return renderPage(items, o, { mode: 'web', label: ctx.label, now: ctx.now, logo: await loadLogo() }); }
export default {
  id: 'webpage', label: 'Web page', icon: 'globe', desc: 'A designed HTML page.', ext: 'html', mime: 'text/html', text: true, visual: true,
  options: [...pageOptions(false), ...commonOptions()],
  preview: async (items, o, ctx) => (await toText(items.slice(0, 4), o, ctx)).slice(0, 600),
  previewHtml: async (items, o, ctx = {}) => renderPage(items, o, { mode: 'web', label: ctx.label, limit: 6, logo: await loadLogo() }),
  toText,
  async build(items, o, ctx) { return textBlob(await toText(items, o, ctx), 'text/html'); }
};
