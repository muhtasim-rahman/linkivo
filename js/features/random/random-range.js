/**
 * Linkivo — js/features/random/random-range.js  (v2.4.3)
 * Purpose: the "Point range" control of the Random filter panel (owner: ONE bar with TWO handles instead of two number boxes). The bar is drawn on a gentle
 *          curve (finer steps at the low end, where most links live) and shows a small histogram of the person's own points behind it, so the choice is
 *          informed. Pointer (mouse, touch, pen) and keyboard both work; each handle is a real slider for screen readers.
 * API: valueAt(p) -> points   posOf(points) -> 0..1   histogram(points[], bins) -> counts[]        (pure, tested)
 *      buildRange({ lo, hi, pointsList, onInput, onCommit }) -> { el, set(lo, hi), setPoints(list) }
 *        onInput(lo, hi) runs while a handle moves; onCommit(lo, hi) runs once when it is released (or after a key press).
 */
import { h } from '../../core/dom.js';
import { MIN, MAX } from '../../engine/points.js';

const CURVE = 2;   // position p (0..1) -> points = MIN + (MAX - MIN) * p^CURVE
export const valueAt = (p) => Math.round(MIN + (MAX - MIN) * Math.pow(Math.min(1, Math.max(0, p)), CURVE));
export const posOf = (v) => Math.pow(Math.min(1, Math.max(0, (v - MIN) / (MAX - MIN))), 1 / CURVE);
/** Counts of points per equal-width bin of the BAR (so the histogram lines up with the handles). */
export function histogram(list, bins = 28) {
  const out = new Array(bins).fill(0);
  for (const v of list) out[Math.min(bins - 1, Math.floor(posOf(v) * bins))]++;
  return out;
}

export function buildRange({ lo = MIN, hi = MAX, pointsList = [], onInput = () => {}, onCommit = () => {} }) {
  let a = lo, b = hi, dragging = null;
  const bars = h('div', { class: 'rg-bars', 'aria-hidden': 'true' });
  const fill = h('div', { class: 'rg-fill', 'aria-hidden': 'true' });
  const mk = (label) => h('div', { class: 'rg-thumb', role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': String(MIN), 'aria-valuemax': String(MAX) });
  const tA = mk('Lowest points'), tB = mk('Highest points');
  const track = h('div', { class: 'rg-track' }, fill, tA, tB);
  const outA = h('output', { class: 'rg-out' }), outB = h('output', { class: 'rg-out' });
  const note = h('span', { class: 'rg-note' });
  const el = h('div', { class: 'rg' }, bars, track, h('div', { class: 'rg-read' }, outA, note, outB));

  function paint() {
    const pa = posOf(a) * 100, pb = posOf(b) * 100;
    tA.style.left = `${pa}%`; tB.style.left = `${pb}%`; fill.style.left = `${pa}%`; fill.style.width = `${Math.max(0, pb - pa)}%`;
    tA.setAttribute('aria-valuenow', String(a)); tB.setAttribute('aria-valuenow', String(b));
    outA.textContent = `${a.toLocaleString()}`; outB.textContent = `${b.toLocaleString()}`;
    note.textContent = a <= MIN && b >= MAX ? 'Any points' : 'points';
    el.classList.toggle('is-set', a > MIN || b < MAX);
  }
  function paintBars() {
    const counts = histogram(pointsList), top = Math.max(1, ...counts);
    bars.replaceChildren(...counts.map((c, i) => { const bar = h('span', { class: 'rg-bar' }); bar.style.height = `${c ? Math.max(14, Math.round((c / top) * 100)) : 6}%`; bar.classList.toggle('is-in', (i + 0.5) / counts.length >= posOf(a) && (i + 0.5) / counts.length <= posOf(b)); return bar; }));
  }
  const refresh = () => { paint(); paintBars(); };

  const pFromEvent = (e) => { const r = track.getBoundingClientRect(); return r.width ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0; };
  function move(which, v) {
    v = Math.min(MAX, Math.max(MIN, v));
    if (which === 'a') a = Math.min(v, b); else b = Math.max(v, a);
    refresh(); onInput(a, b);
  }
  function down(e, which) { dragging = which; (which === 'a' ? tA : tB).setPointerCapture?.(e.pointerId); (which === 'a' ? tA : tB).classList.add('is-drag'); e.preventDefault(); }
  for (const [t, which] of [[tA, 'a'], [tB, 'b']]) {
    t.addEventListener('pointerdown', (e) => down(e, which));
    t.addEventListener('pointermove', (e) => { if (dragging === which) move(which, valueAt(pFromEvent(e))); });
    const up = () => { if (dragging !== which) return; dragging = null; t.classList.remove('is-drag'); onCommit(a, b); };
    t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up);
    t.addEventListener('keydown', (e) => {
      const cur = which === 'a' ? a : b, step = e.shiftKey ? 10 : 1;
      const next = { ArrowLeft: cur - step, ArrowDown: cur - step, ArrowRight: cur + step, ArrowUp: cur + step, PageDown: cur - 50, PageUp: cur + 50, Home: MIN, End: MAX }[e.key];
      if (next == null) return;
      e.preventDefault(); move(which, next); onCommit(a, b);
    });
  }
  // a tap on the bar moves the nearest handle there (and lets it be dragged on)
  track.addEventListener('pointerdown', (e) => {
    if (e.target === tA || e.target === tB) return;
    const v = valueAt(pFromEvent(e)), which = Math.abs(v - a) <= Math.abs(v - b) ? 'a' : 'b';
    move(which, v); down(e, which);
  });

  refresh();
  return {
    el,
    /** Sets the handles from outside (a clear button, a loaded filter). Ignored while a handle is being dragged. */
    set(nlo, nhi) { if (dragging) return; a = Math.min(MAX, Math.max(MIN, nlo)); b = Math.max(a, Math.min(MAX, nhi)); refresh(); },
    setPoints(list) { pointsList = list; paintBars(); },
  };
}
