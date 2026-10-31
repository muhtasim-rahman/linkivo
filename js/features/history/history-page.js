/**
 * Linkivo — js/features/history/history-page.js  (v2.4.1)
 * Purpose: the History page (route /profile/history, reached from Profile and Settings). Every link you opened, newest first, grouped by day
 *          (Today, Yesterday, then dates). Search over title, address and site; a filter for how it was opened (Preview, Opened site, Random);
 *          a three-dot menu per entry; multi-select with Remove; Clear history in the page menu. The list is read from where the History setting keeps it
 *          (this device or the account) and entries past the chosen keep time are removed when the page opens.
 *          Long lists show 150 entries at a time ("Show more") so 2,000 entries stay light.
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { prefs } from '../../core/local-prefs.js';
import { getEngine, getHistory } from '../../core/app-data.js';
import { openMenu } from '../../ui/popover.js';
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { emptyState } from '../../ui/empty-state.js';
import { mountDock } from '../../ui/dock.js';
import { selBarContent } from '../../ui/sel-bar.js';
import { faviconUrl, safeHref } from '../library/folder-style.js';
import { copyText } from '../library/link-actions.js';
import { keepMs } from '../../core/history.js';
import { isAdminView } from '../../core/admin.js';
import { plural } from '../../core/format.js';

const PAGE = 150;
const SRC = { preview: { label: 'Preview', icon: 'eye' }, click: { label: 'Opened site', icon: 'external' }, random: { label: 'Random', icon: 'random' } };
const FILTERS = [['all', 'All'], ['preview', 'Preview'], ['click', 'Opened site'], ['random', 'Random']];

/** "Today", "Yesterday", a weekday for the last week, otherwise the date. */
export function dayLabel(ts, now = Date.now()) {
  const d = new Date(ts), n = new Date(now);
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 864e5);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return d.toLocaleDateString('en', { weekday: 'long' });
  return d.toLocaleDateString('en', { day: 'numeric', month: 'long', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}
const timeOf = (ts) => new Date(ts).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
/** Groups entries (already newest first) by calendar day. */
export function groupByDay(rows, now = Date.now()) {
  const out = []; let key = '';
  for (const e of rows) { const label = dayLabel(e.ts, now); const k = new Date(e.ts).toDateString(); if (k !== key) { key = k; out.push({ label, rows: [] }); } out[out.length - 1].rows.push(e); }
  return out;
}

export async function mount(container, ctx) {
  const engine = getEngine(), hist = getHistory(), router = ctx.router;
  await loadCss('/css/pages/history.css');
  if (!engine || !hist) { container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'History is not ready', text: 'Wait a moment and try again, or reload the app.', actions: [{ label: 'Open profile', href: '/profile', primary: true }] }))); return () => {}; }

  const st = { q: '', src: 'all', shown: PAGE, selecting: false, selected: new Set() };
  const list = h('div', { class: 'hs-list' });
  const info = h('p', { class: 'hs-info', role: 'status' });
  const bar = h('div', { class: 'selbar', role: 'toolbar', 'aria-label': 'Selected entries', hidden: true });
  const removeDock = mountDock(bar);
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search history', 'aria-label': 'Search history', autocomplete: 'off' });
  const filter = h('div', { class: 'seg hs-filter', role: 'radiogroup', 'aria-label': 'How it was opened' });
  const moreBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'More actions', 'aria-haspopup': 'menu' }, icon('more-h', { size: 20 }));
  const selBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Select entries', 'aria-pressed': 'false' }, icon('check-square', { size: 20 }));

  container.appendChild(h('div', { class: 'page hs page-enter' },
    h('header', { class: 'page-head hs-head' },
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Back to profile', on: { click: () => router.navigate('/profile') } }, icon('arrow-left', { size: 20 })),
      h('h1', { class: 'page-title', text: 'History' }), h('div', { class: 'page-actions' }, selBtn, moreBtn)),
    h('div', { class: 'hs-tools' }, h('div', { class: 'hs-search' }, icon('search', { size: 18 }), search), filter), info, list));

  const rows = () => {
    const q = st.q.trim().toLowerCase();
    return hist.list().filter((e) => (st.src === 'all' || e.src === st.src) && (!q || `${e.title} ${e.url} ${e.host}`.toLowerCase().includes(q)));
  };
  const keepText = () => { const k = keepMs(prefs.get('history.keep', '7d'), isAdminView()); return k === 0 ? 'History is off' : k === Infinity ? 'Kept with no time limit' : `Kept for ${Math.round(k / 36e5) < 24 ? plural(Math.round(k / 36e5), 'hour') : plural(Math.round(k / 864e5), 'day')}`; };
  const whereText = () => (hist.where() === 'account' ? 'in your account' : 'on this device');

  function paintFilter() {
    filter.replaceChildren(...FILTERS.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.src === v), text: l, on: { click: () => { st.src = v; st.shown = PAGE; paint(); } } })));
  }
  function menuFor(e, anchor) {
    const l = engine.getLink(e.lid); const live = l && !l.del;
    return openMenu(anchor, [
      live && { label: 'Open preview', icon: 'eye', onSelect: () => router.navigate(`/link/${encodeURIComponent(e.lid)}`) },
      { label: 'Open in new tab', icon: 'external', onSelect: () => { const href = safeHref(e.url); if (href !== '#') window.open(href, '_blank', 'noopener,noreferrer'); } },
      { label: 'Copy URL', icon: 'copy', onSelect: () => copyText(e.url, 'Link copied.') },
      { separator: true },
      { label: 'Remove from history', icon: 'trash', danger: true, onSelect: () => hist.remove([e.id]).then(() => toast('Removed from history.')).catch(() => toast('Could not remove it.', { type: 'error' })) }
    ].filter(Boolean));
  }
  function item(e) {
    const l = engine.getLink(e.lid), live = l && !l.del, s = SRC[e.src] || SRC.preview;
    const fav = h('span', { class: 'hs-fav', 'aria-hidden': 'true' }, h('span', { text: (e.host || '?').replace(/^www\./, '').charAt(0).toUpperCase() }));
    const im = h('img', { src: faviconUrl(e.host), alt: '', width: '20', height: '20', loading: 'lazy', referrerpolicy: 'no-referrer' }); im.addEventListener('error', () => im.remove(), { once: true }); fav.appendChild(im);
    const more = h('button', { type: 'button', class: 'btn-icon hs-more', 'aria-label': `Options for ${e.title || e.host || 'entry'}`, 'aria-haspopup': 'menu' }, icon('more', { size: 18 }));
    more.addEventListener('click', (ev) => { ev.stopPropagation(); more._m = menuFor(e, more); });
    const on = st.selected.has(e.id);
    const main = h(live ? 'a' : 'div', { class: 'hs-main', href: live ? `/link/${encodeURIComponent(e.lid)}` : null, 'data-native': st.selecting ? '' : null },
      st.selecting ? h('span', { class: ['hs-check', on && 'is-on'], 'aria-hidden': 'true' }, on ? icon('check', { size: 14 }) : null) : fav,
      h('span', { class: 'hs-tx' }, h('span', { class: 'hs-t', text: e.title || e.host || e.url }), h('span', { class: 'hs-u' }, h('span', { text: e.host || e.url }), live ? null : h('em', { class: 'hs-gone', text: 'removed' }))),
      h('span', { class: 'hs-meta' }, h('span', { class: 'hs-src', 'data-tip': s.label }, icon(s.icon, { size: 14, label: s.label })), h('time', { text: timeOf(e.ts), datetime: new Date(e.ts).toISOString() })));
    main.addEventListener('click', (ev) => {
      if (st.selecting) { ev.preventDefault(); st.selected.has(e.id) ? st.selected.delete(e.id) : st.selected.add(e.id); paint(); return; }
      if (!live) { ev.preventDefault(); const href = safeHref(e.url); if (href !== '#') window.open(href, '_blank', 'noopener,noreferrer'); }
    });
    return h('li', { class: ['hs-item', on && 'is-on'] }, main, st.selecting ? null : more);
  }

  function paintBar() {
    bar.hidden = !st.selecting; if (!st.selecting) return;
    const all = rows(), allOn = all.length > 0 && all.every((e) => st.selected.has(e.id));
    bar.replaceChildren(...selBarContent({ count: st.selected.size, allOn, closeLabel: 'Done selecting', onClose: () => setSelecting(false),
      onAll: () => { st.selected = new Set(allOn ? [] : all.map((e) => e.id)); paint(); },
      actions: [{ icon: 'trash', label: 'Remove', danger: true, onClick: async () => { const ids = [...st.selected]; if (!ids.length) return; try { await hist.remove(ids); st.selected.clear(); toast(`Removed ${plural(ids.length, 'entry', 'entries')}.`); } catch { toast('Could not remove them.', { type: 'error' }); } } }] }));
  }
  function setSelecting(on) { st.selecting = on; if (!on) st.selected.clear(); selBtn.setAttribute('aria-pressed', String(on)); paint(); }

  function paint() {
    const all = rows(), shown = all.slice(0, st.shown);
    paintFilter(); paintBar();
    const keep = keepMs(prefs.get('history.keep', '7d'), isAdminView());
    info.textContent = keep === 0 ? 'History is off. Nothing is being recorded.' : `${all.length ? plural(all.length, 'entry', 'entries') : 'No entries'} \u00b7 ${keepText()} \u00b7 ${whereText()}`;
    if (!all.length) {
      list.replaceChildren(emptyState({ art: 'search', title: st.q || st.src !== 'all' ? 'Nothing matches' : keep === 0 ? 'History is off' : 'No history yet',
        text: st.q || st.src !== 'all' ? 'Try another word or show every kind of entry.' : keep === 0 ? 'Choose how long to keep history and links you open will be listed here.' : 'Links you open from a folder, the preview or Random Discover show up here, newest first.',
        actions: [st.q || st.src !== 'all' ? { label: 'Clear search', onClick: () => { st.q = ''; st.src = 'all'; search.value = ''; paint(); } } : { label: 'History settings', href: '/settings/history', primary: true }] }));
      return;
    }
    const groups = groupByDay(shown);
    const nodes = groups.map((g) => h('section', { class: 'hs-group' }, h('h2', { class: 'hs-day', text: g.label }), h('ul', { class: 'hs-ul' }, g.rows.map(item))));
    if (all.length > shown.length) nodes.push(h('button', { type: 'button', class: 'btn btn-quiet hs-more-btn', text: `Show ${Math.min(PAGE, all.length - shown.length)} more`, on: { click: () => { st.shown += PAGE; paint(); } } }));
    list.replaceChildren(...nodes);
  }

  let t = 0; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; st.shown = PAGE; paint(); }, 120); });
  selBtn.addEventListener('click', () => setSelecting(!st.selecting));
  moreBtn.addEventListener('click', () => { moreBtn._m = openMenu(moreBtn, [
    { label: 'Select entries', icon: 'check-square', onSelect: () => setSelecting(true) },
    { label: 'History settings', icon: 'settings', onSelect: () => router.navigate('/settings/history') },
    { separator: true },
    { label: 'Clear history', icon: 'trash', danger: true, disabled: hist.list().length === 0, onSelect: async () => {
      if (!(await confirmDialog({ title: 'Clear all history?', message: `Every entry ${whereText()} is removed. Your links and folders are not touched.`, confirmLabel: 'Clear history', danger: true }))) return;
      try { await hist.clear(); toast('History cleared.'); } catch { toast('Could not clear history. Try again.', { type: 'error' }); }
    } }]); });
  const off = hist.subscribe(() => paint());
  hist.load().then(() => hist.prune()).catch(() => {});   // reads the chosen store again (the account list may have grown on another device) and applies the keep time
  paint();
  return () => { off(); removeDock(); clearTimeout(t); };
}
