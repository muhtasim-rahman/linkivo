/**
 * Linkivo — js/features/preview/preview-tabs.js  (v2.3.0)
 * Purpose: the content of each Preview tab. buildPanel(tab, ctx) -> { el, dispose?, update?(next) }.
 *          page = the site in an iframe (sandboxed, no referrer), video = YouTube/Vimeo player or a <video> file, photo = the page image,
 *          shot = a screenshot from the screenshot service, details = every collected field plus the engine log (which service answered, which failed).
 *          Images and frames load only when their tab is open, so a closed tab never costs data.
 * ctx = { link, meta, engine, refetch(), fullscreen() }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { safeHref } from '../library/folder-style.js';
import { bulk } from '../library/link-actions.js';
import { frameState, videoSource, shotUrl, detailsRows, parseLog } from './preview-model.js';

const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox';
const note = (text, ...kids) => h('div', { class: 'pv-note' }, h('span', { text }), ...kids);
const openBtn = (url) => h('a', { class: 'btn btn-sm', href: safeHref(url), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 16 }), 'Open in new tab');
const loading = () => h('div', { class: 'pv-loading', role: 'status' }, h('span', { class: 'dots', 'aria-hidden': 'true' }), h('span', { text: 'Loading' }));

function frame(src, title, { allow = '' } = {}) {
  const wrap = h('div', { class: 'pv-frame' }, loading());
  const f = h('iframe', { src, title, sandbox: SANDBOX, referrerpolicy: 'no-referrer', allow: allow || null, allowfullscreen: true });
  f.addEventListener('load', () => wrap.querySelector('.pv-loading')?.remove(), { once: true });
  wrap.appendChild(f);
  return { wrap, frame: f };
}

function pageTab({ link, meta }) {
  const state = frameState(meta);
  const { wrap, frame: f } = frame(safeHref(link.url), `Page: ${link.title || link.host}`);
  const el = h('div', { class: 'pv-tabbody' },
    state !== true && note('Some sites do not allow being shown inside other pages. If this stays blank, open it in a new tab.', openBtn(link.url)), wrap);
  return { el, dispose: () => { f.src = 'about:blank'; } };
}

function videoTab({ link, meta }) {
  const v = videoSource(link, meta);
  if (v.kind === 'file') {
    const video = h('video', { class: 'pv-video', controls: true, playsinline: true, preload: 'metadata', src: v.src, 'aria-label': link.title || 'Video' });
    return { el: h('div', { class: 'pv-tabbody' }, video), dispose: () => { video.pause(); video.removeAttribute('src'); video.load(); } };
  }
  const { wrap, frame: f } = frame(v.src, `Video: ${link.title || link.host}`, { allow: 'fullscreen; picture-in-picture; encrypted-media' });
  return { el: h('div', { class: 'pv-tabbody' }, wrap), dispose: () => { f.src = 'about:blank'; } };
}

function imageTab(src, alt, extra = null) {
  const status = h('div', { class: 'pv-imgwrap' }, loading());
  const img = h('img', { class: 'pv-img', src, alt, referrerpolicy: 'no-referrer', decoding: 'async' });
  img.addEventListener('load', () => status.querySelector('.pv-loading')?.remove(), { once: true });
  img.addEventListener('error', () => status.replaceChildren(note('This image could not be loaded.', extra || h('span'))), { once: true });
  status.appendChild(img);
  return status;
}
const photoTab = ({ link, meta }) => ({ el: h('div', { class: 'pv-tabbody' }, imageTab(meta.image, link.title || 'Page image')) });
function shotTab({ link }) {
  const body = h('div', { class: 'pv-tabbody' });
  const show = (bust) => body.replaceChildren(h('p', { class: 'pv-hint', text: 'A picture of the page. A new screenshot can take a few seconds the first time.' }), imageTab(shotUrl(link.url) + (bust ? `&v=${Date.now()}` : ''), `Screenshot of ${link.host || link.url}`), h('button', { type: 'button', class: 'btn btn-sm pv-reshoot', on: { click: () => show(true) } }, icon('refresh', { size: 16 }), 'Take a new screenshot'));
  show(false);
  return { el: body };
}

function detailsTab(ctx) {
  const body = h('div', { class: 'pv-tabbody pv-details' });
  const paint = ({ link, meta, error } = ctx) => {
    const f = ctx.engine.getFolder(link.fid);
    const rows = detailsRows(link, meta, { folder: f ? f.name : '' });
    const log = parseLog(meta && meta.log);
    body.replaceChildren(
      error && h('p', { class: 'help is-error', role: 'alert', text: error }),
      h('dl', { class: 'kv pv-kv' }, rows.flatMap((r) => [h('dt', { text: r.label }), h('dd', { class: r.mono ? 'is-mono' : null }, r.link && r.link !== '#' ? h('a', { href: r.link, target: '_blank', rel: 'noopener noreferrer', text: r.value }) : r.value)])),
      h('h3', { class: 'pv-h3', text: 'How these details were found' }),
      log.length ? h('ul', { class: 'pv-log' }, log.map((x) => h('li', { class: x.ok ? 'is-ok' : 'is-bad' }, icon(x.ok ? 'check-circle' : 'x-circle', { size: 16 }), h('span', { class: 'pv-log-e', text: x.engine }), h('span', { class: 'pv-log-m', text: x.ok ? `${x.ms} ms` : (x.error || 'failed') })))) : h('p', { class: 'muted', text: meta && meta.checkedAt ? 'No log was kept for this link.' : 'The details have not been fetched yet.' }),
      h('div', { class: 'pv-det-actions' }, h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => ctx.refetch() } }, icon('refresh', { size: 16 }), 'Refresh details'), h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => bulk.editLink(ctx.engine, [link.id]) } }, icon('edit', { size: 16 }), 'Edit link')));
  };
  paint();
  return { el: body, update: paint };
}

const BUILDERS = { page: pageTab, video: videoTab, photo: photoTab, shot: shotTab, details: detailsTab };
export function buildPanel(tab, ctx) { return (BUILDERS[tab] || detailsTab)(ctx); }
