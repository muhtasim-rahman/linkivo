/**
 * Linkivo — js/features/history/history-page.js  (v2.4.0)
 * Purpose: /profile/history — every link that was opened, grouped by day (Today, Yesterday, dates): search, a three-dot menu per entry (open in Preview,
 *          open in a new tab, copy address, remove), multi-select with remove, Clear all and a short note about the auto-delete setting.
 *          Entries come from core/history.js (this device). The first 200 matches are drawn, "Show more" adds 200 (cheap for the DOM, no windowing needed).
 * Page module: mount(container, ctx) -> unmount;  refresh()
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openMenu } from '../../ui/popover.js';
import { mountDock } from '../../ui/dock.js';
import { selBarContent } from '../../ui/sel-bar.js';
import { emptyState } from '../../ui/empty-state.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { loadCss } from '../../core/css-loader.js';
import { getEngine } from '../../core/app-data.js';
import { prefs } from '../../core/local-prefs.js';
import { plural, relativeTime } from '../../core/format.js';
import { list, removeIds, clearAll, groupByDay, KEEP_OPTIONS } from '../../core/history.js';
import { copyText } from '../library/link-actions.js';
import { safeHref, faviconUrl } from '../library/folder-style.js';

const HOW = { click: 'Opened', preview: 'Previewed', random: 'Random' };
const PAGE = 200;

export async function mount(container, ctx) {
  const engine = getEngine(), router = ctx.router;
  await loadCss('/css/pages/history.css');
  const st = { all: [], q: '', shown: PAGE, selecting: false, selected: new Set() };
  const page = h('div', { class: 'page hp page-enter' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search history', 'aria-label': 'Search history', autocomplete: 'off' });
  const selBtn = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Select entries', 'aria-pressed': 'false' }, icon('check-square', { size: 20 }));
  const clearBtn = h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => clearEverything() } }, icon('trash', { size: 16 }), 'Clear all');
  const note = h('p', { class: 'help hp-note' }), body = h('div', { class: 'hp-body' }), bar = h('div', { class: 'selbar', role: 'toolbar', 'aria-label': 'Selected entries', hidden: true });
  page.append(
    h('header', { class: 'page-head is-stack' }, h('div', { class: 'lib-headrow' }, h('h1', { class: 'page-title', text: 'History' }), h('div', { class: 'page-actions' }, selBtn, clearBtn)), note),
    h('div', { class: 'fp-tools' }, h('div', { class: 'fp-search' }, icon('search', { size: 18 }), search)), body);
  container.appendChild(page);
  const removeDock = mountDock(bar);

  const visible = () => { const n = st.q.trim().toLowerCase(); return n ? st.all.filter((e) => `${e.title} ${e.url} ${e.host}`.toLowerCase().includes(n)) : st.all; };
  const keepLabel = () => (KEEP_OPTIONS.find(([v]) => v === prefs.get('history.keep', '90d')) || [0, '90 days'])[1];

  function entryRow(e) {
    const more = h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Actions for this entry', 'aria-haspopup': 'menu' }, icon('more', { size: 18 }));
    more.addEventListener('click', (ev) => { ev.stopPropagation(); openMenu(more, [
      { label: 'Open in Preview', icon: 'eye', onSelect: () => router.navigate(`/link/${encodeURIComponent(e.lid)}`), disabled: !engine || !engine.getLink(e.lid) || engine.getLink(e.lid).del },
      { label: 'Open in a new tab', icon: 'external', onSelect: () => { const href = safeHref(e.url); if (href !== '#') window.open(href, '_blank', 'noopener,noreferrer'); } },
      { label: 'Copy address', icon: 'copy', onSelect: () => copyText(e.url) },
      { separator: true },
      { label: 'Remove from history', icon: 'trash', danger: true, onSelect: () => removeSome([e.id]) }]); });
    const fav = h('span', { class: 'hp-fav', 'aria-hidden': 'true' }, h('span', { text: (e.host || '?').replace(/^www\./, '').charAt(0).toUpperCase() }));
    const im = h('img', { src: faviconUrl(e.host), alt: '', width: '20', height: '20', loading: 'lazy', referrerpolicy: 'no-referrer' }); im.addEventListener('error', () => im.remove(), { once: true }); fav.appendChild(im);
    const check = st.selecting && h('span', { class: ['hp-check', st.selected.has(e.id) && 'is-on'], 'aria-hidden': 'true' }, icon('check', { size: 14 }));
    const main = h('div', { class: 'hp-main' }, check, fav, h('span', { class: 'hp-tx' }, h('span', { class: 'hp-t', text: e.title || e.host || e.url }), h('span', { class: 'hp-u', text: `${e.host || ''}  \u00b7  ${HOW[e.how] || 'Opened'} ${relativeTime(e.ts)}` })));
    main.addEventListener('click', () => {
      if (st.selecting) { st.selected.has(e.id) ? st.selected.delete(e.id) : st.selected.add(e.id); paint(); return; }
      const l = engine && engine.getLink(e.lid); if (l && !l.del) router.navigate(`/link/${encodeURIComponent(e.lid)}`); else { const href = safeHref(e.url); if (href !== '#') window.open(href, '_blank', 'noopener,noreferrer'); }
    });
    return h('li', { class: ['hp-row', st.selected.has(e.id) && 'is-sel'] }, main, !st.selecting && more);
  }

  function paintBar() {
    bar.hidden = !st.selecting; if (!st.selecting) return;
    const rows = visible(), n = st.selected.size, allOn = rows.length > 0 && n === rows.length;
    bar.replaceChildren(...selBarContent({ count: n, allOn, closeLabel: 'Done selecting', onClose: () => setSelecting(false),
      onAll: () => { st.selected = new Set(allOn ? [] : rows.map((e) => e.id)); paint(); },
      actions: [{ icon: 'trash', label: 'Remove', danger: true, disabled: !n, onClick: () => removeSome([...st.selected]) }] }));
  }

  function paint() {
    note.textContent = `Entries are deleted after: ${keepLabel()}. Change this in Settings > Random and history.`;
    clearBtn.hidden = !st.all.length; selBtn.hidden = !st.all.length;
    selBtn.setAttribute('aria-pressed', String(st.selecting));
    const rows = visible();
    if (!st.all.length) { body.replaceChildren(emptyState({ art: 'search', title: 'Nothing here yet', text: prefs.get('history.keep', '90d') === 'none' ? 'History is switched off in Settings.' : 'Links you open from a list, in the Preview or with Random Discover are listed here.', actions: [{ label: 'Open library', href: '/library', primary: true }] })); paintBar(); return; }
    if (!rows.length) { body.replaceChildren(emptyState({ art: 'search', title: 'No entries match', text: 'Try another word.' })); paintBar(); return; }
    const slice = rows.slice(0, st.shown), nodes = [];
    for (const g of groupByDay(slice)) nodes.push(h('section', { class: 'hp-group' }, h('h2', { class: 'hp-day', text: `${g.label}  \u00b7  ${g.items.length}` }), h('ul', { class: 'hp-list', role: 'list' }, g.items.map(entryRow))));
    if (rows.length > st.shown) nodes.push(h('button', { type: 'button', class: 'btn btn-sm hp-more', on: { click: () => { st.shown += PAGE; paint(); } } }, `Show more (${rows.length - st.shown} left)`));
    body.replaceChildren(...nodes); paintBar();
  }

  function setSelecting(on) { st.selecting = on; if (!on) st.selected.clear(); page.classList.toggle('has-dock', on); paint(); }
  async function removeSome(ids) { await removeIds(engine, ids); st.all = st.all.filter((e) => !ids.includes(e.id)); for (const id of ids) st.selected.delete(id); toast(ids.length === 1 ? 'Removed from history.' : `Removed ${plural(ids.length, 'entry')}.`); paint(); }
  async function clearEverything() {
    if (!(await confirmDialog({ title: 'Clear all history?', message: 'Every entry on this device is removed. Your links stay.', confirmLabel: 'Clear all', danger: true }))) return;
    await clearAll(engine); st.all = []; setSelecting(false); toast('History cleared.');
  }

  let t = 0; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; st.shown = PAGE; paint(); }, 120); });
  selBtn.addEventListener('click', () => setSelecting(!st.selecting));
  st.all = await list(engine); paint();
  return () => { clearTimeout(t); removeDock(); };
}

export async function refresh() { /* the page reads its list when it opens; nothing to refresh from the network */ }
