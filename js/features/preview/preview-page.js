/**
 * Linkivo — js/features/preview/preview-page.js  (v2.3.0)
 * Purpose: the link Preview, route /link/:lid. Phones: full screen, no bottom bar, compact. Wide screens: a rounded panel on the right (like a watch page)
 *          with the other links of the same folder beside it. Header (favicon, title, address, fullscreen, open), tabs in the fixed order Page, Video, Photo,
 *          Screenshot, Details (only the ones that can work), a compact action bar at the bottom and a three-dot menu with everything else.
 *          It opens from the cached data at once. A link that was never looked up is fetched ONCE through the Worker (title, description, image, frameable,
 *          engine log) and the page updates in place. The tab used last (or most) opens first. A site that refuses framing never gets a Page tab.
 * Page module: mount(container, ctx)      Pure logic: preview-model.js     Tabs: preview-tabs.js
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { prefs } from '../../core/local-prefs.js';
import { getEngine } from '../../core/app-data.js';
import { openMenu } from '../../ui/popover.js';
import { emptyState } from '../../ui/empty-state.js';
import { attachScrollRow } from '../../ui/scroll-row.js';
import { toast } from '../../ui/toast.js';
import { faviconUrl, linkTitle, safeHref, folderTile } from '../library/folder-style.js';
import { bulk, linkMenuItems, copyText } from '../library/link-actions.js';
import { TABS, TAB_LABELS, TAB_ICONS, availableTabs, pickTab, needsFetch } from './preview-model.js';
import { buildPanel } from './preview-tabs.js';
import { ensureMeta } from './preview-meta.js';

const K_LAST = 'preview.tab', K_USE = 'preview.tabUse';

export async function mount(container, ctx) {
  const engine = getEngine(), router = ctx.router;
  await loadCss('/css/pages/preview.css');
  const lid = ctx.params.lid;
  const back = () => { if (ctx.from) history.back(); else router.navigate('/library', { replace: true }); };
  const link = () => engine && engine.getLink(lid);
  if (!engine || !link() || link().del) {
    container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'This link is not available', text: 'It may have been deleted or moved to the Recycle Bin.', actions: [{ label: 'Back to library', primary: true, onClick: () => router.navigate('/library', { replace: true }) }] })));
    return;
  }

  let meta = await engine.getLinkMeta(lid), tab = null, panelNode = null, full = false, disposed = false;
  const stage = h('section', { class: 'pv-stage' }), tabsEl = h('div', { class: 'pv-tabs fade-x', role: 'tablist', 'aria-label': 'Preview views' }), panel = h('div', { class: 'pv-panel', role: 'tabpanel' });
  const head = h('header', { class: 'pv-head' }), bar = h('footer', { class: 'pv-bar', role: 'toolbar', 'aria-label': 'Link actions' });
  const side = h('aside', { class: 'pv-side', 'aria-label': 'More links in this folder' });
  const root = h('div', { class: 'pv page-enter' }, h('div', { class: 'pv-wrap' }, head, h('div', { class: 'pv-main' }, h('div', { class: 'pv-col' }, stage, bar), side)));
  container.appendChild(root);
  stage.append(tabsEl, panel);
  const detachTabs = attachScrollRow(tabsEl, { arrows: false });

  // ---- header ------------------------------------------------------------------------------------------------------
  const fsBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Fullscreen', 'data-tip': 'Fullscreen', on: { click: toggleFull } }, icon('expand', { size: 20 }));
  function paintHead() {
    const l = link(); if (!l) return;
    const fav = h('span', { class: 'pv-fav', 'aria-hidden': 'true' }, h('span', { class: 'lfav-l', text: (l.host || '?').replace(/^www\./, '').charAt(0).toUpperCase() }));
    const img = h('img', { src: faviconUrl(l.host), alt: '', width: '24', height: '24', referrerpolicy: 'no-referrer' }); img.addEventListener('error', () => img.remove(), { once: true }); fav.appendChild(img);
    head.replaceChildren(
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Back', 'data-tip': 'Back', on: { click: back } }, icon('arrow-left', { size: 22 })),
      fav,
      h('div', { class: 'pv-id' }, h('h1', { class: 'pv-title', text: linkTitle(l) }), h('p', { class: 'pv-url', text: l.url })),
      h('div', { class: 'pv-head-actions' }, fsBtn, h('a', { class: 'btn-icon', href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open in a new tab', 'data-tip': 'Open in new tab' }, icon('external', { size: 20 }))));
    document.title = `${linkTitle(l)} | Linkivo`;
  }

  // ---- action bar ----------------------------------------------------------------------------------------------------
  function paintBar() {
    const l = link(); if (!l) return;
    const b = (ic, label, fn, on = false) => h('button', { type: 'button', class: ['pv-act', on && 'is-on'], 'aria-label': label, 'aria-pressed': on ? 'true' : null, 'data-tip': label, on: { click: fn } }, icon(ic, { size: 22 }), h('span', { class: 'pv-act-l', text: label }));
    const more = h('button', { type: 'button', class: 'pv-act', 'aria-label': 'More actions', 'aria-haspopup': 'menu', 'data-tip': 'More' }, icon('more-h', { size: 22 }), h('span', { class: 'pv-act-l', text: 'More' }));
    more.addEventListener('click', () => { more._m = openMenu(more, linkMenuItems({ engine, link: link() })); });
    bar.replaceChildren(b('star', l.fv ? 'Favourited' : 'Favourite', () => bulk.favourite(engine, [lid]), !!l.fv), b('copy', 'Copy link', () => copyText(l.url, 'Link copied.')),
      b('edit', 'Edit', () => bulk.editLink(engine, [lid])), b('tag', 'Tags', () => bulk.editTags(engine, [lid])), more);
  }

  // ---- tabs ---------------------------------------------------------------------------------------------------------
  const avail = () => availableTabs(link(), meta);
  function paintTabs() {
    const a = avail();
    tabsEl.replaceChildren(...TABS.filter((t) => a.includes(t)).map((t) => h('button', { type: 'button', role: 'tab', class: 'pv-tab', 'aria-selected': String(t === tab), 'data-tab': t, on: { click: () => choose(t, true) } }, icon(TAB_ICONS[t], { size: 18 }), h('span', { text: TAB_LABELS[t] }))));
  }
  function choose(t, user) {
    if (user) { prefs.set(K_LAST, t); const use = { ...(prefs.get(K_USE, {}) || {}) }; use[t] = (use[t] || 0) + 1; prefs.set(K_USE, use); }
    tab = t; paintTabs();
    panelNode?.dispose?.();
    const built = buildPanel(t, { link: link(), meta, engine, refetch: () => load(true), fullscreen: () => full });
    panelNode = built; panel.replaceChildren(built.el);
    panel.setAttribute('aria-label', TAB_LABELS[t]);
  }
  function toggleFull() {
    full = !full;
    const el = stage;
    if (full && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (!full && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    stage.classList.toggle('is-full', full);   // also the fallback where the Fullscreen API is missing (iPhone Safari)
    fsBtn.replaceChildren(icon(full ? 'shrink' : 'expand', { size: 20 })); fsBtn.setAttribute('aria-label', full ? 'Exit fullscreen' : 'Fullscreen');
  }
  const onFsChange = () => { if (!document.fullscreenElement && full) toggleFull(); };
  document.addEventListener('fullscreenchange', onFsChange);

  // ---- the other links of the folder (wide screens) ----------------------------------------------------------------------------------------
  function paintSide() {
    const l = link(); if (!l) return; const f = engine.getFolder(l.fid);
    const others = engine.listLinks({ fid: l.fid }).filter((x) => x.id !== lid).sort((a, b) => (b.pn ? 1 : 0) - (a.pn ? 1 : 0) || b.ts - a.ts).slice(0, 24);
    side.replaceChildren(
      h('h2', { class: 'pv-side-h' }, f ? folderTile(f, 24) : null, h('span', { text: f ? `More in ${f.name}` : 'More links' })),
      others.length ? h('ul', { class: 'pv-side-list' }, others.map((x) => h('li', null, h('a', { href: `/link/${encodeURIComponent(x.id)}`, class: 'pv-side-item' }, h('span', { class: 'pv-side-t', text: linkTitle(x) }), h('span', { class: 'pv-side-u', text: x.host || '' }))))) : h('p', { class: 'muted', text: 'No other links in this folder.' }));
  }

  // ---- metadata: opened from the cache, fetched once when the link was never looked up ------------------------------------------------------
  async function load(force = false) {
    if (!force && !needsFetch(link(), meta)) return;
    const res = await ensureMeta(engine, lid, { force });
    if (disposed) return;
    if (res.error) { toast(res.error, { type: 'error' }); panelNode?.update?.({ link: link(), meta, error: res.error }); return; }
    meta = await engine.getLinkMeta(lid);
    paintHead(); paintTabs();
    if (!avail().includes(tab)) choose(pickTab(avail(), prefs.get(K_LAST, null), prefs.get(K_USE, {})), false);
    else if (tab === 'details' || tab === 'photo' || tab === 'video' || tab === 'page') choose(tab, false);   // new data for the open tab
  }

  // ---- first paint ------------------------------------------------------------------------------------------------------------------------------
  paintHead(); paintBar(); paintSide();
  choose(pickTab(avail(), prefs.get(K_LAST, null), prefs.get(K_USE, {})), false);
  const off = engine.subscribe((e) => { if (e.type === 'change' && (e.links || []).includes(lid)) { if (!link() || link().del) { back(); return; } paintHead(); paintBar(); } });
  load();

  return () => { disposed = true; off(); detachTabs(); document.removeEventListener('fullscreenchange', onFsChange); panelNode?.dispose?.(); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
}
