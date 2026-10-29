/**
 * Linkivo — js/features/preview/preview-page.js  (v2.3.0)
 * Purpose: the link Preview, route /link/:lid. Phones: full screen, no bottom bar, compact. Wide screens: a rounded panel on the right (like a watch page)
 *          with the other links of the same folder beside it. Header (favicon, title, address, fullscreen, open), tabs in the fixed order Page, Video, Photo,
 *          Screenshot, Details (only the ones that can work), a compact action bar at the bottom and a three-dot menu with everything else.
 *          It opens from the cached data at once. A link that was never looked up is fetched ONCE through the Worker (title, description, image, frameable,
 *          engine log) and the page updates in place. The tab used last (or most) opens first. A site that refuses framing never gets a Page tab.
 *          v2.3.1 (owner): phones get a bottom bar of Favourite (heart), Point up, Point down, Copy link, Open in new tab and a three-dot menu with the rest;
 *          "Open in new tab" also sits in the tab row as a bold primary strip. Wide screens: two columns, the preview on the left (minimum height 520px) and 20
 *          related links with favicons on the right; the whole page is centred.
 *          v2.3.2 (owner): the bar is icons only on every screen size; from 600px wide it also has Read later and Refresh data (Microlink first); the three-dot
 *          menu gets Microlink and thum.io on/off lines; a slim "Data Fetching (SERVICE)" strip shows while details are being loaded; opening a link starts
 *          the fetch by itself; the Details tab updates live (points); the card has a fixed, sensible height and its two columns scroll on their own.
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
import { faviconUrl, linkTitle, safeHref } from '../library/folder-style.js';
import { bulk, linkMenuItems, copyText } from '../library/link-actions.js';
import { TABS, TAB_LABELS, TAB_ICONS, availableTabs, pickTab, needsFetch, relatedLinks } from './preview-model.js';
import { buildPanel } from './preview-tabs.js';
import { ensureMeta, fetchStatus, wantsMicrolink } from './preview-meta.js';
import { quota as mlQuota, mlEnabled } from '../../core/microlink.js';
import { shotQuota } from '../../core/admin.js';

const K_LAST = 'preview.tab', K_USE = 'preview.tabUse', K_DEF = 'preview.defaultTab';
/** v2.3.1: the tab that opens first: the setting "Tab that opens first" when it is not "Last used" and exists for this link, else the old rule (last used, most used, first). */
const firstTab = (a) => { const d = prefs.get(K_DEF, 'last'); return d !== 'last' && a.includes(d) ? d : pickTab(a, prefs.get(K_LAST, null), prefs.get(K_USE, {})); };

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
  const side = h('aside', { class: 'pv-side', 'aria-label': 'Related links' });
  const fetching = h('div', { class: 'pv-fetch', role: 'status', 'aria-live': 'polite', hidden: true });
  const root = h('div', { class: 'pv page-enter' }, h('div', { class: 'pv-wrap' }, head, h('div', { class: 'pv-main' }, h('div', { class: 'pv-col' }, fetching, stage, bar), side)));
  container.appendChild(root);
  document.documentElement.dataset.pv = '1';   // lifts the toasts above the action bar on wide screens (toast.css)
  const paintFetch = () => { const st = fetchStatus.get(), on = st.lid === lid && !!st.engine; fetching.hidden = !on; fetching.replaceChildren(...(on ? [h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', { text: `Data Fetching (${st.engine})` })] : [])); };
  const offFetch = fetchStatus.subscribe(paintFetch);
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
      h('div', { class: 'pv-head-actions' }, fsBtn));   // v2.3.1: Open in new tab moved to the bottom bar and the tab row
    document.title = `${linkTitle(l)} | Linkivo`;
  }

  // ---- action bar ----------------------------------------------------------------------------------------------------
  function paintBar() {
    const l = link(); if (!l) return;
    // icons only on every screen (owner); the label stays as aria-label and tooltip
    const b = (ic, label, fn, on = false, wide = false) => h('button', { type: 'button', class: ['pv-act', on && 'is-on', wide && 'pv-act-wide'], 'aria-label': label, 'aria-pressed': on ? 'true' : null, 'data-tip': label, on: { click: fn } }, icon(ic, { size: 22 }));
    const more = h('button', { type: 'button', class: 'pv-act', 'aria-label': 'More actions', 'aria-haspopup': 'menu', 'data-tip': 'More' }, icon('more-h', { size: 22 }));
    more.addEventListener('click', () => {
      const wide = typeof matchMedia === 'function' && matchMedia('(min-width: 600px)').matches;   // Read later and Refresh are in the bar from this width
      const SHOWN = new Set(['Add to favourites', 'Remove from favourites', 'Point up', 'Point down', 'Copy URL', ...(wide ? ['Read later', 'Remove from read later'] : [])]);
      const q = mlQuota(), s = shotQuota();
      const svc = [
        { label: mlEnabled() ? `Turn off Microlink (${q.left}/${q.limit} left)` : 'Turn on Microlink', icon: 'zap', onSelect: () => { prefs.set('meta.microlink', !mlEnabled()); toast(mlEnabled() ? 'Microlink is on.' : 'Microlink is off.'); } },
        { label: prefs.get('preview.thum', true) !== false ? `Turn off thum.io${s.limit === null ? '' : ` (${s.left}/${s.limit} left)`}` : 'Turn on thum.io', icon: 'monitor', onSelect: () => { prefs.set('preview.thum', prefs.get('preview.thum', true) === false); toast(prefs.get('preview.thum', true) !== false ? 'thum.io is on.' : 'thum.io is off.'); } }
      ];
      const items = linkMenuItems({ engine, link: link() }).filter((it) => !SHOWN.has(it.label));
      if (!wide) items.unshift({ label: 'Refresh data', icon: 'refresh', onSelect: () => load(true) }, { separator: true });
      more._m = openMenu(more, tidy([...items, { separator: true }, ...svc]));
    });
    const open = h('a', { class: 'pv-act', href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open in a new tab', 'data-tip': 'Open in new tab' }, icon('external', { size: 22 }));
    bar.replaceChildren(b('heart', l.fv ? 'Remove from favourites' : 'Add to favourites', () => bulk.favourite(engine, [lid]), !!l.fv), b('thumb-up', 'Point up', () => bulk.like(engine, [lid])), b('thumb-down', 'Point down', () => bulk.dislike(engine, [lid])),
      b('copy', 'Copy link', () => copyText(l.url, 'Link copied.')), open,
      b('clock', l.rl ? 'Remove from read later' : 'Read later', () => bulk.readLater(engine, [lid]), !!l.rl, true), b('refresh', 'Refresh data', () => load(true), false, true), more);
  }
  /** Removing items can leave two separators in a row, or one at the start or end of the menu. */
  const tidy = (items) => items.filter((it, i, a) => !(it.separator && (i === 0 || i === a.length - 1 || a[i - 1].separator)));

  // ---- tabs ---------------------------------------------------------------------------------------------------------
  const avail = () => availableTabs(link(), meta);
  function paintTabs() {
    const a = avail();
    const l = link();
    tabsEl.replaceChildren(...TABS.filter((t) => a.includes(t)).map((t) => h('button', { type: 'button', role: 'tab', class: 'pv-tab', 'aria-selected': String(t === tab), 'data-tab': t, on: { click: () => choose(t, true) } }, icon(TAB_ICONS[t], { size: 18 }), h('span', { text: TAB_LABELS[t] }))), h('a', { class: 'pv-tab pv-tab-open', href: safeHref(l.url), target: '_blank', rel: 'noopener noreferrer' }, icon('external', { size: 16 }), h('span', { text: 'Open in new tab' })));   // v2.3.1: a bold primary strip, not a button above the frame
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
    const l = link(); if (!l) return;
    const showRel = prefs.get('preview.related', true) !== false;   // v2.3.1: setting "Show related links"
    side.hidden = !showRel; root.classList.toggle('no-side', !showRel); if (!showRel) return;
    const rel = relatedLinks(engine.listLinks(), l, 20);
    const item = (x) => { const fav = h('span', { class: 'pv-side-fav', 'aria-hidden': 'true' }, h('span', { text: (x.host || '?').replace(/^www\./, '').charAt(0).toUpperCase() }));
      const im = h('img', { src: faviconUrl(x.host), alt: '', width: '20', height: '20', loading: 'lazy', referrerpolicy: 'no-referrer' }); im.addEventListener('error', () => im.remove(), { once: true }); fav.appendChild(im);
      return h('li', null, h('a', { href: `/link/${encodeURIComponent(x.id)}`, class: 'pv-side-item' }, fav, h('span', { class: 'pv-side-tx' }, h('span', { class: 'pv-side-t', text: linkTitle(x) }), h('span', { class: 'pv-side-u', text: x.host || '' })))); };
    side.replaceChildren(h('h2', { class: 'pv-side-h' }, h('span', { text: 'Related links' }), h('span', { class: 'pv-side-n', text: String(rel.length) })),
      rel.length ? h('ul', { class: 'pv-side-list' }, rel.map(item)) : h('p', { class: 'muted', text: 'Nothing related yet. Links from the same folder, site or with the same tags show up here.' }));
  }

  // ---- metadata: opened from the cache, fetched once when the link was never looked up ------------------------------------------------------
  async function load(force = false) {
    if (!force && !needsFetch(link(), meta) && !wantsMicrolink(meta, lid)) return;   // v2.3.2: also when only Microlink has not answered yet
    const res = await ensureMeta(engine, lid, { force });
    if (disposed) return;
    if (res.error) { toast(res.error, { type: 'error' }); panelNode?.update?.({ link: link(), meta, error: res.error }); return; }
    if (res.cached && !force) return;               // nothing new arrived
    meta = await engine.getLinkMeta(lid);
    if (force) toast('Details refreshed.');
    paintHead(); paintTabs();
    if (!avail().includes(tab)) choose(firstTab(avail()), false);
    else if (tab === 'details' || tab === 'photo' || tab === 'video' || tab === 'page') choose(tab, false);   // new data for the open tab
  }

  // ---- first paint ------------------------------------------------------------------------------------------------------------------------------
  paintHead(); paintBar(); paintSide();
  choose(firstTab(avail()), false);
  const off = engine.subscribe((e) => { if (e.type === 'change' && (e.links || []).includes(lid)) { if (!link() || link().del) { back(); return; } paintHead(); paintBar(); if (tab === 'details') panelNode?.update?.({ link: link(), meta }); } });   // v2.3.2: points and flags update live in Details
  load();

  return () => { disposed = true; off(); offFetch(); delete document.documentElement.dataset.pv; detachTabs(); document.removeEventListener('fullscreenchange', onFsChange); panelNode?.dispose?.(); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
}
