/**
 * Linkivo — js/features/random/random-range.js  (v2.4.3)
 * Purpose: the "Point range" control of the Random filter panel (owner: ONE bar with TWO handles instead of two number boxes). The bar is drawn on a gentle
 *          curve (finer steps at the low end, where most links live) and shows a small histogram of the person's own points behind it, so the choice is
 *          informed. Pointer (mouse, touch, pen) and keyboard both work; each handle is a real slider for screen readers.
 * v2.4.4 (owner): the bars became ONE continuous graph (a smooth area), the part inside the chosen range is coloured, and pointing at the graph shows how many
 *          links have points in that part (a tip with the range and the count). The middle of the readout always says how many links are inside the chosen range.
 * API: valueAt(p) -> points   posOf(points) -> 0..1   histogram(points[], bins) -> counts[]   areaPath(counts, w, h) -> svg path d   inRange(list, a, b)  (pure, tested)
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

/** A smooth area under the counts (quadratic curves through the middles), closed at the bottom. */
export function areaPath(counts, w = 100, hgt = 40) {
  const n = counts.length; if (!n) return '';
  const top = Math.max(1, ...counts), pts = counts.map((c, i) => [(i + 0.5) / n * w, hgt - 2 - (c / top) * (hgt - 7)]);
  const f = (v) => Math.round(v * 100) / 100;
  let d = `M0,${hgt} L0,${f(pts[0][1])} L${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) { const [x, y] = pts[i], [x2, y2] = pts[i + 1]; d += ` Q${f(x)},${f(y)} ${f((x + x2) / 2)},${f((y + y2) / 2)}`; }
  return `${d} L${f(pts[n - 1][0])},${f(pts[n - 1][1])} L${w},${f(pts[n - 1][1])} L${w},${hgt} Z`;
}
export const inRange = (list, a, b) => list.reduce((n, v) => n + (v >= a && v <= b ? 1 : 0), 0);
const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
const BINS = 40;

export function buildRange({ lo = MIN, hi = MAX, pointsList = [], onInput = () => {}, onCommit = () => {} }) {
  let a = lo, b = hi, dragging = null;
  const base = svgEl('path', { class: 'rg-area' }), lit = svgEl('path', { class: 'rg-area is-lit' }), cursor = svgEl('line', { class: 'rg-cursor', y1: '0', y2: '40' });
  const svg = svgEl('svg', { viewBox: '0 0 100 40', preserveAspectRatio: 'none', class: 'rg-svg' }); svg.append(base, lit, cursor);
  const tip = h('span', { class: 'rg-tip', hidden: true });
  const bars = h('div', { class: 'rg-graph', 'aria-hidden': 'true' }, svg, tip);   // (kept the old name `bars` for the layout below)
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
    const n = inRange(pointsList, a, b); note.textContent = a <= MIN && b >= MAX ? `${n.toLocaleString()} links` : `${n.toLocaleString()} of ${pointsList.length.toLocaleString()} links`;
    lit.style.clipPath = `inset(0 ${100 - pb}% 0 ${pa}%)`;
    el.classList.toggle('is-set', a > MIN || b < MAX);
  }
  let counts = [];
  function paintBars() { counts = histogram(pointsList, BINS); const d = areaPath(counts); base.setAttribute('d', d); lit.setAttribute('d', d); note.textContent = note.textContent; paint(); }
  // pointing at the graph: the tip names the part under the pointer and how many links have points in it
  bars.addEventListener('pointermove', (e) => {
    const r = bars.getBoundingClientRect(); if (!r.width || !counts.length) return;
    const p = Math.min(0.9999, Math.max(0, (e.clientX - r.left) / r.width)), i = Math.floor(p * BINS), lo = valueAt(i / BINS), hi = i === BINS - 1 ? MAX : Math.max(lo, valueAt((i + 1) / BINS) - 1);
    tip.textContent = `${lo.toLocaleString()} to ${hi.toLocaleString()} points: ${counts[i].toLocaleString()} ${counts[i] === 1 ? 'link' : 'links'}`; tip.hidden = false;
    tip.style.left = `${Math.min(88, Math.max(12, p * 100))}%`; cursor.setAttribute('x1', String((i + 0.5) / BINS * 100)); cursor.setAttribute('x2', String((i + 0.5) / BINS * 100)); cursor.style.opacity = '1';
  });
  bars.addEventListener('pointerleave', () => { tip.hidden = true; cursor.style.opacity = '0'; });
  const refresh = () => { paint(); };

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

  paintBars();
  return {
    el,
    /** Sets the handles from outside (a clear button, a loaded filter). Ignored while a handle is being dragged. */
    set(nlo, nhi) { if (dragging) return; a = Math.min(MAX, Math.max(MIN, nlo)); b = Math.max(a, Math.min(MAX, nhi)); refresh(); },
    setPoints(list) { pointsList = list; paintBars(); },
  };
}
