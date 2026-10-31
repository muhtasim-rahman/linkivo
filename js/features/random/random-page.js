/**
 * Linkivo — js/features/random/random-page.js  (v2.4.1)
 * Purpose: Random Discover, route /random. Two states on one page:
 *          HUB     before the first link: a "Surprise me" card (how many links are in play, the active filters as chips, the pick mode) next to the merged
 *                  folder and filter panel (random-filters.js). On phones the card comes first, on wide screens the panel sits beside it.
 *          PLAYING the normal link Preview embedded (preview-page.js with `embedded`), plus two extra buttons in its action bar: "New random link" and
 *                  "Filters" (the same panel in a popup). A slim strip shows the session count and, when the setting is on, a countdown to the next link.
 *          Picking: engine/picker.js (filters, then points and the other weights; no repeats until the pool is used up). Every random open applies the
 *          owner's point rule (-10, like steps restart: engine/points.js onRandomOpen) and goes into History with src "random".
 *          `/random?folder=<id>` (the folder page's "Random from this folder") presets that folder and opens a link at once.
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { prefs } from '../../core/local-prefs.js';
import { loadCss } from '../../core/css-loader.js';
import { getEngine } from '../../core/app-data.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { emptyState } from '../../ui/empty-state.js';
import { pickNext, PICKER, describeFilters } from '../../engine/picker.js';
import { onRandomOpen } from '../../engine/points.js';
import { buildFilterPanel, loadFilters, saveFilters, poolCount } from './random-filters.js';

const MODE_LABEL = { balanced: 'Balanced', points: 'Points only', equal: 'Equal chance', underdog: 'Low points first', fresh: 'Never opened first' };

export async function mount(container, ctx) {
  const engine = getEngine(), router = ctx.router;
  await loadCss('/css/pages/random.css');
  if (!engine) { container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'Your data is not ready', text: 'Wait a moment and try again, or reload the app.', actions: [{ label: 'Open library', href: '/library', primary: true }] }))); return () => {}; }

  const presetFolder = ctx.query && ctx.query.folder && engine.getFolder(ctx.query.folder) ? ctx.query.folder : null;
  const filters = loadFilters(prefs, { folder: presetFolder });
  const seen = new Set();                         // this session: nothing repeats until the pool is used up
  let current = null, stopPreview = null, disposed = false, timer = 0, auto = 0, picking = false, filterSheet = null;

  // the phone bottom bar steps aside while a link is open (the preview is full screen there, like the normal Preview page)
  const setBar = (on) => { const app = document.getElementById('app'); if (app) app.dataset.nobar = on ? '' : '1'; };
  const skipDead = () => prefs.get('random.skipDead', true) !== false;
  const opts = () => ({ mode: prefs.get('random.mode', 'balanced'), gamma: PICKER.GAMMA[prefs.get('random.gamma', 'normal')] || 1, avoid: prefs.get('random.avoid', '24h'), drift: prefs.get('random.drift', false) === true });
  const pool = () => poolCount(engine.listLinks(), filters, skipDead());
  const nameOf = (fid) => (engine.getFolder(fid) ? engine.getFolder(fid).name : 'Folder');

  // ---- hub ----------------------------------------------------------------------------------------------------------------------------------
  const hubCard = h('section', { class: 'rnd-card', 'aria-labelledby': 'rnd-h' });
  const panel = buildFilterPanel({ engine, filters, onChange: () => { saveFilters(prefs, filters); paintCard(); } });
  const hub = h('div', { class: 'rnd-hub' }, hubCard, h('div', { class: 'rnd-side' }, h('h2', { class: 'rnd-panel-h', text: 'Folders and filters' }), panel.el));
  const stage = h('div', { class: 'rnd-stage', hidden: true });
  const strip = h('div', { class: 'rnd-strip', hidden: true, role: 'status' });
  const page = h('div', { class: 'page rnd page-enter' },
    h('header', { class: 'page-head rnd-head' }, h('h1', { class: 'page-title', text: 'Random Discover' }), h('a', { class: 'btn btn-sm btn-quiet rnd-set', href: '/settings/random' }, icon('settings', { size: 18 }), h('span', { text: 'Settings' }))),
    hub, strip, stage);
  container.appendChild(page);

  function paintCard() {
    const n = pool(), chips = describeFilters(filters, nameOf);
    const go = h('button', { type: 'button', class: 'btn btn-primary rnd-go', disabled: n === 0, on: { click: () => next(true) } }, icon('random', { size: 22 }), h('span', { text: seen.size ? 'Surprise me again' : 'Surprise me' }));
    hubCard.replaceChildren(
      h('div', { class: 'rnd-art', 'aria-hidden': 'true' }, h('span', { class: 'rnd-ring r1' }), h('span', { class: 'rnd-ring r2' }), h('span', { class: 'rnd-die' }, icon('random', { size: 34 }))),
      h('h2', { id: 'rnd-h', class: 'rnd-title', text: n ? 'Open something you saved' : 'Nothing to pick from' }),
      h('p', { class: 'rnd-pool' }, h('strong', { text: n.toLocaleString() }), h('span', { text: n === 1 ? ' link in play' : ' links in play' }), seen.size ? h('span', { class: 'rnd-seen', text: ` \u00b7 ${seen.size} seen this time` }) : null),
      h('div', { class: 'rnd-chips', role: 'list', 'aria-label': 'Active filters' }, ...(chips.length ? chips : ['No filters']).map((c) => h('span', { class: ['rnd-chip', !chips.length && 'is-quiet'], role: 'listitem', text: c }))),
      go,
      h('p', { class: 'rnd-mode' }, h('span', { text: `Mode: ${MODE_LABEL[prefs.get('random.mode', 'balanced')] || 'Balanced'}` }), h('a', { href: '/settings/random', text: 'Change' })),
      n === 0 ? h('p', { class: 'rnd-warn', text: engine.listLinks().length ? 'The filters leave no links. Loosen them on the right, or below on a phone.' : 'Add links to a folder first. Random Discover picks from your own library.' }) : null);
  }

  // ---- picking and opening --------------------------------------------------------------------------------------------------------------------
  async function next(fromHub = false) {
    if (picking || disposed) return;
    picking = true;
    try {
      const r = pickNext({ links: engine.listLinks(), filters: { ...filters, skipDead: skipDead() }, opts: opts(), seen, now: engine.now(), rng: Math.random, lastId: current });
      if (!r) { toast('No link matches the filters.'); showHub(); return; }
      if (r.reset) { seen.clear(); toast('You have seen every link in this pool. Starting over.'); }
      seen.add(r.link.id); current = r.link.id;
      const patch = onRandomOpen(r.link, engine.now());
      if (patch) engine.updateLinks([r.link.id], patch).catch(() => {});   // the owner's rule: -10 points, like steps start again
      await openPreview(r.link.id);
    } finally { picking = false; }
    if (fromHub) page.scrollTop = 0;
  }

  async function openPreview(lid) {
    stopAuto();
    try { stopPreview && stopPreview(); } catch { /* ignore */ }
    stage.replaceChildren(); hub.hidden = true; stage.hidden = false; strip.hidden = false;
    document.documentElement.dataset.rnd = '1'; setBar(false);
    const m = await import('../preview/preview-page.js');
    if (disposed) return;
    const embedded = {
      src: 'random', onClose: showHub,
      bar: () => [
        h('button', { type: 'button', class: 'pv-act pv-act-new', 'aria-label': 'Open a new random link', 'data-tip': 'New random link (N)', on: { click: () => next() } }, icon('random', { size: 22 })),
        h('button', { type: 'button', class: 'pv-act', 'aria-label': 'Filters', 'data-tip': 'Filters', on: { click: openFilters } }, icon('filter', { size: 22 }))
      ]
    };
    stopPreview = await m.mount(stage, { params: { lid }, query: {}, router, embedded });
    paintStrip(); startAuto();
  }

  function showHub() {
    stopAuto();
    try { stopPreview && stopPreview(); } catch { /* ignore */ } stopPreview = null;
    stage.replaceChildren(); stage.hidden = true; strip.hidden = true; hub.hidden = false;
    delete document.documentElement.dataset.rnd; setBar(true);
    panel.refresh(); paintCard(); document.title = 'Random Discover | Linkivo';
  }

  function openFilters() {
    if (filterSheet) return;
    const p = buildFilterPanel({ engine, filters, onChange: () => saveFilters(prefs, filters) });
    filterSheet = openSheet({ title: 'Random filters', wide: true, body: p.el, actions: [{ label: 'Done', variant: 'primary' }], onClose: () => { filterSheet = null; paintStrip(); } });
  }

  // ---- strip: session count and the countdown ---------------------------------------------------------------------------------------------
  function paintStrip() {
    const n = pool();
    const left = Math.max(0, n - [...seen].filter((id) => engine.getLink(id)).length);
    strip.replaceChildren(h('span', { class: 'rnd-s-n' }, icon('random', { size: 16 }), h('span', { text: `${seen.size} seen \u00b7 ${left.toLocaleString()} left in this pool` })), h('span', { class: 'rnd-s-auto', id: 'rnd-auto' }));
    paintAuto();
  }
  function autoSeconds() { const v = Number(prefs.get('random.auto', 'off')); return Number.isFinite(v) && v > 0 ? v : 0; }
  function startAuto() {
    stopAuto(); const s = autoSeconds(); if (!s) return;
    auto = s; paintAuto();
    timer = setInterval(() => { if (disposed || document.hidden) return; auto -= 1; if (auto <= 0) { next(); return; } paintAuto(); }, 1000);
  }
  function stopAuto() { clearInterval(timer); timer = 0; auto = 0; paintAuto(); }
  function paintAuto() {
    const el = strip.querySelector('#rnd-auto'); if (!el) return;
    if (!timer) { el.replaceChildren(); return; }
    el.replaceChildren(h('span', { text: `Next link in ${auto}s` }), h('button', { type: 'button', class: 'rnd-stop', on: { click: stopAuto } }, 'Stop'));
  }
  // any touch inside the preview means the person is reading: the countdown stops (it can be started again with the next link)
  stage.addEventListener('pointerdown', () => { if (timer) stopAuto(); });

  const onKey = (e) => { if (disposed || stage.hidden || e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return; if (e.key === 'n' || e.key === 'N') { e.preventDefault(); next(); } };
  document.addEventListener('keydown', onKey);
  const off = engine.subscribe((ev) => { if (ev.type === 'change' && !hub.hidden) { panel.refresh(); paintCard(); } });

  paintCard();
  if (presetFolder) next(true);   // "Random from this folder": no panel stop, a link opens straight away
  document.title = 'Random Discover | Linkivo';
  return () => { disposed = true; stopAuto(); off(); document.removeEventListener('keydown', onKey); try { stopPreview && stopPreview(); } catch { /* ignore */ } try { filterSheet && filterSheet.close(); } catch { /* ignore */ } delete document.documentElement.dataset.rnd; setBar(true); };
}
