/**
 * Linkivo — js/features/random/random-panel.js  (v2.4.0)
 * Purpose: the MERGED panel of Random Discover (owner spec): folder selection and filters in one place. It is the body of the Random page and, while a
 *          link is open, of the filter popup, so both edit the same session. Changes apply at once; the live line shows how many links match.
 * API: buildPanel({ engine, onChange, onStart? }) -> { el, refresh() }      openFilterPopup({ engine, onChange })
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { createSelect } from '../../ui/select.js';
import { openSheet } from '../../ui/sheet.js';
import { prefs } from '../../core/local-prefs.js';
import { plural } from '../../core/format.js';
import { MODES, PARAMS } from '../../engine/picker.js';
import { session, poolOf, resetSeen, AUTO_CHOICES } from './random-session.js';
import { colorOf } from '../library/folder-style.js';

const WEIGHTS = [['low', 'Low', PARAMS.folder.low], ['normal', 'Normal', 1], ['high', 'High', PARAMS.folder.high]];
const wName = (v) => (WEIGHTS.find((w) => w[2] === v) || WEIGHTS[1])[0];

export function buildPanel({ engine, onChange = () => {}, onStart = null }) {
  const live = h('p', { class: 'rp-live', role: 'status', 'aria-live': 'polite' });
  const chips = h('div', { class: 'rp-chips' });
  const toggles = h('div', { class: 'rp-toggles' });
  const startBtn = onStart && h('button', { type: 'button', class: 'btn btn-primary rp-start', on: { click: onStart } }, icon('random', { size: 20 }), 'Open a random link');

  const changed = () => { resetSeen(); paint(); onChange(); };
  const toggle = (key, label, hint) => h('button', { type: 'button', class: ['rp-tg', session.filters[key] && 'is-on'], role: 'switch', 'aria-checked': String(!!session.filters[key]), on: { click: () => { session.filters[key] = !session.filters[key]; changed(); } } },
    h('span', { class: 'rp-tg-t' }, h('strong', { text: label }), h('small', { text: hint })), h('span', { class: 'switch', 'aria-hidden': 'true' }));

  function paint() {
    const folders = engine.listFolders().filter((f) => !f.del);
    const all = !session.filters.fids.length;
    chips.replaceChildren(h('button', { type: 'button', class: ['chip', all && 'is-on'], 'aria-pressed': String(all), on: { click: () => { session.filters.fids = []; changed(); } } }, 'All folders'),
      ...folders.map((f) => {
        const on = session.filters.fids.includes(f.id), w = session.folderWeights[f.id] ?? 1;
        const b = h('button', { type: 'button', class: ['chip', on && 'is-on'], style: { '--fc': colorOf(f) }, 'aria-pressed': String(on), on: { click: () => { const s = new Set(session.filters.fids); on ? s.delete(f.id) : s.add(f.id); session.filters.fids = [...s]; changed(); } } }, f.name, h('span', { class: 'chip-n', text: String(f.lc || 0) }));
        if (!on) return b;
        // a selected folder shows its weight; tapping the small label cycles Low, Normal, High
        const next = h('button', { type: 'button', class: 'chip rp-w', 'aria-label': `Weight of ${f.name}: ${wName(w)}. Change`, on: { click: () => { const i = WEIGHTS.findIndex((x) => x[2] === w); session.folderWeights[f.id] = WEIGHTS[(i + 1) % 3][2]; changed(); } } }, wName(w));
        return h('span', { class: 'rp-pair' }, b, next);
      }));
    toggles.replaceChildren(toggle('fav', 'Favourites only', 'Links with a heart'), toggle('liked', 'Liked only', 'Raised by points up'), toggle('unseen', 'Unseen only', 'Never opened by Random'), toggle('skipDead', 'Skip dead links', 'Flagged by the checker'));
    const n = poolOf(engine).length;
    live.textContent = n ? `${plural(n, 'link')} match${n === 1 ? 'es' : ''}.` : 'No link matches these filters.';
    if (startBtn) startBtn.disabled = !n;
  }

  const modeSel = createSelect({ options: Object.entries(MODES).map(([value, label]) => ({ value, label })), value: prefs.get('random.mode', 'balanced'), label: 'Mode', block: true, onChange: (v) => { prefs.set('random.mode', v); changed(); } });
  const autoSel = createSelect({ options: AUTO_CHOICES.map(([value, label]) => ({ value: String(value), label })), value: String(prefs.get('random.auto', 0)), label: 'Auto-advance', block: true, onChange: (v) => { prefs.set('random.auto', v); onChange(); } });
  const avoid = h('button', { type: 'button', class: ['rp-tg', prefs.get('random.avoid', true) !== false && 'is-on'], role: 'switch', 'aria-checked': String(prefs.get('random.avoid', true) !== false), on: { click: (e) => { const v = !(prefs.get('random.avoid', true) !== false); prefs.set('random.avoid', v); e.currentTarget.classList.toggle('is-on', v); e.currentTarget.setAttribute('aria-checked', String(v)); onChange(); } } },
    h('span', { class: 'rp-tg-t' }, h('strong', { text: 'Avoid recent links' }), h('small', { text: 'Links opened lately are picked less often' })), h('span', { class: 'switch', 'aria-hidden': 'true' }));

  const el = h('div', { class: 'rp' },
    h('h2', { class: 'rp-h', text: 'Folders' }), chips,
    h('h2', { class: 'rp-h', text: 'Filters' }), toggles,
    h('h2', { class: 'rp-h', text: 'Picking' }), h('div', { class: 'rp-grid' }, h('label', { class: 'rp-f' }, h('span', { text: 'Mode' }), modeSel), h('label', { class: 'rp-f' }, h('span', { text: 'Auto-advance' }), autoSel)), avoid,
    live, startBtn);
  paint();
  return { el, refresh: paint };
}

/** The filter icon inside a Random Preview: the same panel in a popup (edits apply to the running session). */
export function openFilterPopup({ engine, onChange }) {
  const p = buildPanel({ engine, onChange });
  return openSheet({ title: 'Random filters', body: p.el, actions: [{ label: 'Done', variant: 'primary' }] });
}
