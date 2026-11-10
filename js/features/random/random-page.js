/**
 * Linkivo — js/features/random/random-page.js  (v2.4.1, v2.4.2)
 * Purpose: Random Discover, route /random. Two states on one page:
 *          HUB     before the first link: a "Surprise me" card (how many links are in play, the active filters as chips, the pick mode) next to the merged
 *                  folder and filter panel (random-filters.js). On phones the card comes first, on wide screens the panel sits beside it.
 *          PLAYING the normal link Preview embedded (preview-page.js with `embedded`), plus two extra buttons in its action bar: "New random link" and
 *                  "Filters" (the same panel in a popup). A slim strip shows the session count and, when the setting is on, a countdown to the next link.
 *          Picking: engine/picker.js (filters, then points and the other weights; no repeats until the pool is used up). Every random open applies the
 *          owner's point rule (-10, like steps restart: engine/points.js onRandomOpen) and goes into History with src "random".
 *          `/random?folder=<id>` (the folder page's "Random from this folder") presets that folder and opens a link at once.
 *          v2.4.2 (owner): HUB is two columns on wide screens (left: the Surprise card, the quick options and the links picked this time, sticky; right: the
 *          rebuilt compact filter panel); phones get one compact column. The options people change often (pick mode, automatic next link, avoid repeats, point
 *          influence, skip dead, drift) live HERE; Settings keeps only defaults. PLAYING: the "Random" button (primary colour) with Filters and Random options
 *          floats at the bottom right of the preview area (embedded.float), so the action bar stays on one line; the "x seen, n left" strip is at the bottom on phones;
 *          the automatic next link starts at 15 seconds by default and can be paused, resumed and stopped.
 * Page module: mount(container, ctx) -> unmount
 */
import { lockButton } from '../../ui/lock-button.js';
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { prefs } from '../../core/local-prefs.js';
import { loadCss } from '../../core/css-loader.js';
import { getEngine } from '../../core/app-data.js';
import { openSheet } from '../../ui/sheet.js';
import { pushLayer } from '../../core/nav-stack.js';
import { toast } from '../../ui/toast.js';
import { emptyState } from '../../ui/empty-state.js';
import { pickNext, PICKER, describeFilters } from '../../engine/picker.js';
import { onRandomOpen } from '../../engine/points.js';
import { buildFilterPanel, loadFilters, saveFilters, poolCount } from './random-filters.js';
import { createSelect } from '../../ui/select.js';
import { settingsShortcut } from '../../ui/settings-shortcut.js';
import { createMiniCard } from './mini-card.js';   // v2.5.6: the thin Surprise bar on phones

const MODE_LABEL = { balanced: 'Balanced', points: 'Points only', equal: 'Equal chance', underdog: 'Low points first', fresh: 'Never opened first' };

export async function mount(container, ctx) {
  const engine = getEngine(), router = ctx.router;
  await loadCss('/css/pages/random.css');
  if (!engine) { container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'Your data is not ready', text: 'Wait a moment and try again, or reload the app.', actions: [{ label: 'Open library', href: '/library', primary: true }] }))); return () => {}; }

  const presetFolder = ctx.query && ctx.query.folder && engine.getFolder(ctx.query.folder) ? ctx.query.folder : null;
  const filters = loadFilters(prefs, { folder: presetFolder });
  const seen = new Set();                         // this session: nothing repeats until the pool is used up
  let current = null, stopPreview = null, disposed = false, timer = 0, auto = 0, picking = false, filterSheet = null, optSheet = null;
  let sessionAuto = null, paused = false;     // sessionAuto: null = follow the setting, 'off' = the person pressed Stop, or a number of seconds
  const picked = [];                          // this time's links, newest first (shown under the quick options)

  // the phone bottom bar steps aside while a link is open (the preview is full screen there, like the normal Preview page)
  const setBar = (on) => { const app = document.getElementById('app'); if (app) app.dataset.nobar = on ? '' : '1'; };
  const skipDead = () => prefs.get('random.skipDead', true) !== false;
  const opts = () => ({ mode: prefs.get('random.mode', 'balanced'), gamma: PICKER.GAMMA[prefs.get('random.gamma', 'normal')] || 1, avoid: prefs.get('random.avoid', '24h'), drift: prefs.get('random.drift', false) === true });
  const pool = () => poolCount(engine.listLinks(), filters, skipDead());
  const nameOf = (fid) => (engine.getFolder(fid) ? engine.getFolder(fid).name : 'Folder');

  // ---- hub ----------------------------------------------------------------------------------------------------------------------------------
  const hubCard = h('section', { class: 'rnd-card', 'aria-labelledby': 'rnd-h' });
  const quick = h('section', { class: 'rnd-quick', 'aria-label': 'Random options' });
  const recent = h('section', { class: 'rnd-recent', 'aria-label': 'Picked this time' });
  const panel = buildFilterPanel({ engine, filters, onChange: () => { saveFilters(prefs, filters); paintCard(); } });
  const hub = h('div', { class: 'rnd-hub' }, h('div', { class: 'rnd-left' }, hubCard, quick, recent),
    h('div', { class: 'rnd-side' }, panel.el));   // v2.4.3: no 'Folders and filters' title (PC alignment); the card on the left already shows how many links are in play
  const stage = h('div', { class: 'rnd-stage', hidden: true });
  const strip = h('div', { class: 'rnd-strip', hidden: true, role: 'status' });
  // v2.4.4 (owner): wherever text or buttons change, the new content eases in (a short fade and rise) instead of cutting. The three boxes restart the animation on each repaint.
  const restart = (box) => { box.classList.remove('rnd-swap'); void box.offsetWidth; box.classList.add('rnd-swap'); };
  for (const box of [hubCard, recent, strip]) { const orig = box.replaceChildren.bind(box); box.replaceChildren = (...n) => { orig(...n); restart(box); }; }
  let autoSig = '';
  // v2.5.6 (owner): on phones a thin version of the card sticks to the top once the big card has scrolled away (it leaves again when you scroll back up)
  const mini = createMiniCard({ scroller: container, card: hubCard, hub, onGo: () => next(true) });
  const page = h('div', { class: 'page rnd is-wide page-enter' },
    h('header', { class: 'page-head rnd-head' }, h('h1', { class: 'page-title', text: 'Random Discover' }), h('div', { class: 'page-actions' }, lockButton(), settingsShortcut('random', 'Random settings'))),
    mini.el, hub, stage, strip);   // the strip comes after the stage: at the bottom on phones (css puts it on top on wide screens)
  container.appendChild(page);

  // ---- quick options (also shown in a popup while a link is open) -----------------------------------------------------------------------------
  /** v2.4.3 (owner): every option can explain itself in one short line behind a small (i) button; the line opens and closes with a fade. */
  const withInfo = (row, text, mainEl) => {
    const note = h('p', { class: 'rnd-info', hidden: true, text });
    const btn = h('button', { type: 'button', class: 'rnd-i', 'aria-label': 'What does this do?', 'aria-expanded': 'false', 'data-tip': 'What is this?' }, icon('info', { size: 16 }));
    btn.addEventListener('click', () => { const open = note.hidden; note.hidden = !open; btn.setAttribute('aria-expanded', String(open)); note.classList.toggle('is-open', open); });
    return h('div', { class: 'rnd-row' }, h('div', { class: 'rnd-rowline' }, mainEl || row, btn), note);
  };
  const sel = (label, key, options, def, after, info) => {
    let cur = String(prefs.get(key, def)); if (!options.some((o) => o.value === cur)) cur = def;
    const c = createSelect({ options, value: cur, label, align: 'end', small: true, onChange: (v) => { prefs.set(key, v); if (after) after(v); paintCard(); } });
    return withInfo(h('div', { class: 'rnd-opt' }, h('span', { class: 'rnd-opt-l', text: label }), c), info);
  };
  const flip = (label, key, def, info) => {
    const on = () => prefs.get(key, def) === true || (def === true && prefs.get(key, def) !== false);
    const btn = h('button', { type: 'button', class: 'rnd-opt rnd-opt-sw', role: 'switch', 'aria-checked': String(on()), 'aria-label': label }, h('span', { class: 'rnd-opt-l', text: label }), h('span', { class: 'switch', 'aria-checked': String(on()) }));
    btn.addEventListener('click', () => { prefs.set(key, !on()); btn.setAttribute('aria-checked', String(on())); btn.lastChild.setAttribute('aria-checked', String(on())); paintCard(); paintStrip(); });
    return withInfo(btn, info);
  };
  function optionsEl() {
    return h('div', { class: 'rnd-opts' },
      sel('Pick mode', 'random.mode', Object.entries(MODE_LABEL).map(([value, label]) => ({ value, label })), 'balanced', null, 'How the next link is chosen: by points, with an equal chance for all, low points first, or never-opened links first.'),
      sel('Next link by itself', 'random.auto', [['off', 'Off'], ['10', '10 seconds'], ['15', '15 seconds'], ['30', '30 seconds'], ['60', '1 minute'], ['120', '2 minutes']].map(([value, label]) => ({ value, label })), '15', () => { sessionAuto = null; if (!stage.hidden) startAuto(); }, 'Opens a new random link after this many seconds. Pause, resume or stop it from the bar at any time.'),
      sel('Avoid recent links', 'random.avoid', [['off', 'Off'], ['6h', '6 hours'], ['24h', '1 day'], ['72h', '3 days'], ['7d', '7 days']].map(([value, label]) => ({ value, label })), '24h', null, 'Links you opened lately are much less likely to come up again for this long.'),
      sel('Point influence', 'random.gamma', [['soft', 'Soft'], ['normal', 'Normal'], ['sharp', 'Sharp']].map(([value, label]) => ({ value, label })), 'normal', null, 'How strongly points matter. Soft is close to an equal chance; sharp strongly favours high points.'),
      flip('Skip dead links', 'random.skipDead', true, 'Leaves out links the dead-link checker found to be gone.'), flip('Let points drift to 100', 'random.drift', false, 'A link you have not touched for a long time slowly counts as 100 points again (1 point per 14 days). Stored points never change.'));
  }
  function paintQuick() { quick.replaceChildren(h('h2', { class: 'rnd-panel-h', text: 'Options' }), optionsEl()); }
  function paintRecent() {
    recent.hidden = !picked.length;
    recent.replaceChildren(h('h2', { class: 'rnd-panel-h', text: 'Picked this time' }), h('ol', { class: 'rnd-rec' }, picked.slice(0, 6).map((p) => h('li', null, h('button', { type: 'button', class: 'rnd-rec-b', title: p.title, on: { click: () => openPreview(p.id) } }, h('span', { class: 'rnd-rec-t', text: p.title }), h('span', { class: 'rnd-rec-h', text: p.host }))))));
  }
  function openOptions() {
    if (optSheet) return;
    optSheet = openSheet({ title: 'Random options', body: optionsEl(), actions: [{ label: 'Done', variant: 'primary' }], onClose: () => { optSheet = null; paintStrip(); } });
  }

  function paintCard() {
    const n = pool(), chips = describeFilters(filters, nameOf);
    mini.paint(n, seen.size);
    const go = h('button', { type: 'button', class: 'btn btn-primary rnd-go', disabled: n === 0, on: { click: () => next(true) } }, icon('random', { size: 22 }), h('span', { text: seen.size ? 'Surprise me again' : 'Surprise me' }));
    hubCard.replaceChildren(...[
      h('div', { class: 'rnd-art' }, h('span', { class: 'rnd-ring r1', 'aria-hidden': 'true' }), h('span', { class: 'rnd-ring r2', 'aria-hidden': 'true' }), h('button', { type: 'button', class: 'rnd-die', disabled: n === 0, 'aria-label': 'Surprise me', 'data-tip': 'Surprise me', on: { click: () => next(true) } }, icon('random', { size: 34 }))),   // v2.4.3: the dice starts it too
      h('h2', { id: 'rnd-h', class: 'rnd-title', text: n ? 'Open something you saved' : 'Nothing to pick from' }),
      h('p', { class: 'rnd-pool' }, h('strong', { text: n.toLocaleString() }), h('span', { text: n === 1 ? ' link in play' : ' links in play' }), seen.size ? h('span', { class: 'rnd-seen', text: ` \u00b7 ${seen.size} seen this time` }) : null),
      h('div', { class: 'rnd-chips', role: 'list', 'aria-label': 'Active filters' }, ...(chips.length ? chips : ['No filters']).map((c) => h('span', { class: ['rnd-chip', !chips.length && 'is-quiet'], role: 'listitem', text: c }))),
      go,
      n === 0 ? h('p', { class: 'rnd-warn', text: engine.listLinks().length ? 'The filters leave no links. Loosen the filters (on the right, or below on a phone).' : 'Add links to a folder first. Random Discover picks from your own library.' }) : null].filter(Boolean));
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
      picked.unshift({ id: r.link.id, title: r.link.title || r.link.host || r.link.url, host: r.link.host || '' }); picked.length = Math.min(picked.length, 20);
      const patch = onRandomOpen(r.link, engine.now());
      if (patch) engine.updateLinks([r.link.id], patch).catch(() => {});   // the owner's rule: -10 points, like steps start again
      await openPreview(r.link.id);
    } finally { picking = false; }
    if (fromHub) page.scrollTop = 0;
  }

  async function openPreview(lid) {
    stopAuto();
    try { stopPreview && stopPreview(); } catch { /* ignore */ }
    stage.replaceChildren(); hub.hidden = true; stage.hidden = false; strip.hidden = false; mini.sync();
    document.documentElement.dataset.rnd = '1'; setBar(false);
    // v2.5.1 (owner): Back from the playing preview returns to the Random hub, not to the page before Random. The playing view is a back layer, like a popup.
    if (!playLayer) playLayer = pushLayer(() => { playLayer = null; showHub(); });
    const m = await import('../preview/preview-page.js');
    if (disposed) return;
    const fab = h('div', { class: 'rnd-fab', role: 'group', 'aria-label': 'Random controls' },
      h('button', { type: 'button', class: 'rnd-fab-go', 'aria-label': 'Open a new random link', 'data-tip': 'New random link (N)', on: { click: () => next() } }, icon('random', { size: 20 }), h('span', { class: 'rnd-fab-l', text: 'Random' })),
      h('span', { class: 'rnd-fab-sep', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'rnd-fab-b', 'aria-label': 'Filters', 'data-tip': 'Filters', on: { click: openFilters } }, icon('filter', { size: 20 })),
      h('button', { type: 'button', class: 'rnd-fab-b', 'aria-label': 'Random options', 'data-tip': 'Random options', on: { click: openOptions } }, icon('settings', { size: 20 })));
    // v2.5.0 (owner): deleting the link that is open in Random does not close the preview: the next random link opens (onGone). Only when nothing is left does it return to the hub.
    const embedded = { src: 'random', onClose: showHub, onGone: () => { toast('Link deleted. Here is the next one.', { duration: 2200 }); next(); }, bar: () => [], float: () => fab };   // v2.4.2: the action bar keeps its normal single line
    stopPreview = await m.mount(stage, { params: { lid }, query: {}, router, embedded });
    fabEl = fab; paintStrip(); placeStrip(); paintRecent(); startAuto();
  }

  let playLayer = null;
  function showHub() {
    if (playLayer) { const l = playLayer; playLayer = null; l.remove(); }   // v2.5.1: leaving the playing view by a button also drops its history entry
    stopAuto(); fabEl = null; placeStrip();
    try { stopPreview && stopPreview(); } catch { /* ignore */ } stopPreview = null;
    stage.replaceChildren(); stage.hidden = true; strip.hidden = true; hub.hidden = false; mini.sync();
    delete document.documentElement.dataset.rnd; setBar(true);
    panel.refresh(); paintCard(); paintRecent(); document.title = 'Random Discover | Linkivo';
  }

  // v2.4.3 (owner): on a wide screen the "x seen / next in" strip floats INSIDE the preview (bottom left, opposite the Random group) instead of sitting above it,
  // so the page no longer grows a second scrollbar; on a phone it stays in the strip at the bottom.
  let fabEl = null;
  const wideMq = window.matchMedia ? window.matchMedia('(min-width: 900px)') : { matches: false, addEventListener() {}, removeEventListener() {} };
  function placeStrip() {
    const inside = wideMq.matches && fabEl && fabEl.parentNode;
    strip.classList.toggle('is-float', !!inside);
    if (inside) { if (strip.parentNode !== fabEl.parentNode) fabEl.parentNode.appendChild(strip); }
    else if (strip.parentNode !== page) page.appendChild(strip);
  }
  wideMq.addEventListener && wideMq.addEventListener('change', placeStrip);

  function openFilters() {
    if (filterSheet) return;
    const p = buildFilterPanel({ engine, filters, onChange: () => saveFilters(prefs, filters) });
    filterSheet = openSheet({ title: 'Random filters', wide: true, body: p.el, actions: [{ label: 'Done', variant: 'primary' }], onClose: () => { filterSheet = null; paintStrip(); } });
  }

  // ---- strip: session count and the countdown ---------------------------------------------------------------------------------------------
  function paintStrip() {
    const n = pool();
    const left = Math.max(0, n - [...seen].filter((id) => engine.getLink(id)).length);
    strip.replaceChildren(h('span', { class: 'rnd-s-n' }, icon('random', { size: 16 }), h('span', { text: `${seen.size} seen \u00b7 ${left.toLocaleString()} left` })), h('span', { class: 'rnd-s-auto', id: 'rnd-auto' }));
    paintAuto();
  }
  /** Seconds for the automatic next link: the person's Stop wins, then a number chosen this time, then the option (default 15). */
  function autoSeconds() {
    if (sessionAuto === 'off') return 0;
    if (typeof sessionAuto === 'number') return sessionAuto;
    const v = Number(prefs.get('random.auto', '15')); return Number.isFinite(v) && v > 0 ? v : 0;
  }
  function startAuto() {
    clearInterval(timer); timer = 0; paused = false;
    const s0 = autoSeconds(); if (!s0) { auto = 0; paintAuto(); return; }
    auto = s0; paintAuto();
    timer = setInterval(() => { if (disposed || document.hidden || paused) return; auto -= 1; if (auto <= 0) { next(); return; } paintAuto(); }, 1000);
    if (timer && typeof timer.unref === 'function') timer.unref();   // (tests in Node: a pending countdown must not keep the process alive; a browser returns a number)
  }
  function stopAuto() { clearInterval(timer); timer = 0; auto = 0; paused = false; paintAuto(); }   // leaving the preview: no state change for the person's choice
  function pauseAuto() { if (!timer || paused) return; paused = true; paintAuto(); }
  function resumeAuto() { if (!timer || !paused) return; paused = false; paintAuto(); }
  function userStop() { sessionAuto = 'off'; stopAuto(); }       // Stop: no more automatic links this time (Start brings it back)
  function userStart() { sessionAuto = Number(prefs.get('random.auto', '15')) > 0 ? null : 15; startAuto(); }
  function paintAuto() {
    const el = strip.querySelector('#rnd-auto'); if (!el) return;
    const btn = (ic, label, fn) => h('button', { type: 'button', class: 'rnd-ab', 'aria-label': label, 'data-tip': label, on: { click: fn } }, icon(ic, { size: 18 }));
    const sig = !timer ? 'off' : paused ? 'paused' : 'run', changed = sig !== autoSig; autoSig = sig;   // the countdown ticks without animating; a state change eases in
    if (!timer) { el.replaceChildren(h('span', { class: 'rnd-s-off', text: 'Auto next off' }), btn('play', 'Start automatic next link', userStart)); if (changed) restart(el); return; }
    el.replaceChildren(h('span', { class: 'rnd-s-time', text: paused ? `Paused at ${auto}s` : `Next in ${auto}s` }), paused ? btn('play', 'Resume', resumeAuto) : btn('pause', 'Pause', pauseAuto), btn('stop', 'Stop automatic next link', userStop));
    if (changed) restart(el);
  }
  // a touch inside the preview means the person is reading: the countdown pauses (Resume continues it, Stop ends it)
  stage.addEventListener('pointerdown', () => { if (timer && !paused) pauseAuto(); });

  const onKey = (e) => { if (disposed || stage.hidden || e.target.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return; if (e.key === 'n' || e.key === 'N') { e.preventDefault(); next(); } };
  document.addEventListener('keydown', onKey);
  const off = engine.subscribe((ev) => { if (ev.type === 'change' && !hub.hidden) { panel.refresh(); paintCard(); } });

  paintCard(); paintQuick(); paintRecent();
  if (presetFolder) next(true);   // "Random from this folder": no panel stop, a link opens straight away
  document.title = 'Random Discover | Linkivo';
  return () => { disposed = true; mini.destroy(); if (playLayer) { const l = playLayer; playLayer = null; l.remove(); } stopAuto(); off(); document.removeEventListener('keydown', onKey); wideMq.removeEventListener && wideMq.removeEventListener('change', placeStrip); try { stopPreview && stopPreview(); } catch { /* ignore */ } try { filterSheet && filterSheet.close(); } catch { /* ignore */ } try { optSheet && optSheet.close(); } catch { /* ignore */ } delete document.documentElement.dataset.rnd; setBar(true); };
}
