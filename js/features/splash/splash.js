/**
 * Linkivo — js/features/splash/splash.js  (v2.1.3)
 * Purpose: drives the splash defined in index.html + css/pages/splash.css (spec: DESIGN section 6). It is the v1 logo-creation
 *          animation the owner built (ripple, left ring pop, shackle lock with sparkles and background reveal, bar, second ring,
 *          typed wordmark) WITHOUT the url badges, the shrink and the spiral. Timeline is about 3.2 s.
 * Modes:   full  = the whole animation (the DEFAULT, every start)
 *          short = the finished logo fades in (0.5 s)      still = finished logo at once (reduced motion)
 *          Setting "ui.splash": 'full' (default) | 'short'. v2.1.3: "Automatic" was removed; a stored 'auto' from v2.1.2 counts as 'full'.
 * v2.1.3: no background grid, a slightly smaller logo, no blur filters (they stutter on phones; opacity and transform only), and the first
 *          frame is never blank (index.html shows a CSS ring until startSplash() runs, which now happens from splash-start.js).
 * The splash ends when BOTH the animation and the app are ready. If loading outlasts it, three loading dots appear.
 * API: startSplash() -> void     endSplash() -> Promise<void> (call when the first page is mounted)     resolveMode(prefsLike, reduce) -> mode
 */
import { prefs } from '../../core/local-prefs.js';
import { sleep } from '../../core/utils.js';

const MIN_MS = { full: 3200, short: 600, still: 300 };
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
let el, mode = 'still', startedAt = 0, started = false, ended = false, timeline = Promise.resolve();

/** Pure: which mode to run. Exported for the unit tests. */
export function resolveMode({ setting = 'full', reduce = false } = {}) {
  if (reduce) return 'still';
  return setting === 'short' ? 'short' : 'full';
}

const $ = (id) => document.getElementById(id);
const at = (ms, fn) => new Promise((resolve) => setTimeout(() => { try { Promise.resolve(fn()).then(resolve, resolve); } catch { resolve(); } }, ms));
/** Web Animations helper: keeps the end state (fill forwards); resolves also when the browser can not animate a property. */
function play(node, frames, opts = {}) {
  if (!node || typeof node.animate !== 'function') return Promise.resolve();
  try { return node.animate(frames, { fill: 'forwards', easing: EASE, ...opts }).finished.catch(() => {}); } catch { return Promise.resolve(); }
}
const draw = (node, ms, opts = {}) => play(node, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: ms, ...opts });
const fillIn = (node, ms) => play(node, [{ fillOpacity: 0 }, { fillOpacity: 1 }], { duration: ms, easing: 'linear' });

function starPath(size) { const q = size * 0.2; return `M 0 ${-size} Q ${q} ${-q} ${size} 0 Q ${q} ${q} 0 ${size} Q ${-q} ${q} ${-size} 0 Q ${-q} ${-q} 0 ${-size} Z`; }

/** The "lock" moment: a shock ring, two stars and a few dots fly out of one end of the shackle (positions are SVG units). */
function sparkles(x, y) {
  const NS = 'http://www.w3.org/2000/svg';
  const group = $('sp-sparks');
  if (!group) return;
  const add = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); group.appendChild(n); return n; };
  const wave = add('circle', { cx: x, cy: y, r: 0, fill: 'none', 'stroke-width': 5 }); wave.style.stroke = 'var(--brand-a)';
  play(wave, [{ r: 0, opacity: 1, strokeWidth: 5 }, { r: 50, opacity: 0, strokeWidth: 0 }], { duration: 500, easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)', fill: 'none' }).then(() => wave.remove());
  for (let i = 0; i < 2; i++) {
    const star = add('path', { d: starPath(10 + Math.random() * 8) }); star.style.fill = i % 2 ? 'var(--brand-a)' : 'var(--brand-b)';
    const a = Math.PI * i + Math.random() * 0.5, dist = 25 + Math.random() * 20, ex = x + Math.cos(a) * dist, ey = y + Math.sin(a) * dist, rot = 45 + Math.random() * 90;
    play(star, [{ transform: `translate(${x}px, ${y}px) scale(0) rotate(0deg)`, opacity: 1 }, { transform: `translate(${(x + ex) / 2}px, ${(y + ey) / 2}px) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 0.4 }, { transform: `translate(${ex}px, ${ey}px) scale(0) rotate(${rot * 2}deg)`, opacity: 0 }], { duration: 600 + Math.random() * 200, easing: 'ease-out', fill: 'none' }).then(() => star.remove());
  }
  for (let i = 0; i < 4; i++) {
    const dot = add('circle', { cx: x, cy: y, r: 1.5 + Math.random() * 2 }); dot.style.fill = 'var(--brand-b)';
    const a = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 40;
    play(dot, [{ transform: 'translate(0, 0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist}px)`, opacity: 0 }], { duration: 450, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'none' }).then(() => dot.remove());
  }
}

function runFull() {
  const svg = $('sp-svg');
  const box = svg ? svg.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  // centre of the left ring in screen pixels (viewBox 180 210 680 630, ring centre 353,648): the background disc grows from there
  const cx = box.left + ((353 - 180) / 680) * box.width, cy = box.top + ((648 - 210) / 630) * box.height;
  const ringl = $('sp-ringl'), ringr = $('sp-ringr');
  const chars = [...document.querySelectorAll('.t-char')];
  const typed = () => Promise.all(chars.map((c, i) => at(i * 55, () => {
    const dot = c.querySelector('.idot');
    if (dot) at(150, () => play(dot, [{ transform: 'translateX(-50%) scale(0)', opacity: 0 }, { transform: 'translateX(-50%) scale(1)', opacity: 1 }], { duration: 400, easing: SPRING }));
    return play(c, [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
  })));
  return Promise.all([
    at(0, () => Promise.all([
      play($('sp-pulse'), [{ r: 0, opacity: 1 }, { r: 180, opacity: 0 }], { duration: 800, easing: 'ease-out' }),
      play($('sp-lring-g'), [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 650, easing: SPRING }),
      draw(ringl, 520, { easing: 'ease-out' })])),
    at(380, () => fillIn(ringl, 350)),
    at(520, () => draw($('sp-shackle-mask'), 620, { easing: 'cubic-bezier(0.5, 0, 0.2, 1.1)' })),
    at(900, () => {
      play($('sp-la'), [{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: 350, easing: 'ease-out' });
      sparkles(259, 520); sparkles(447, 520);
      return play($('sp-expand'), [{ clipPath: `circle(0px at ${cx}px ${cy}px)` }, { clipPath: `circle(150vmax at ${cx}px ${cy}px)` }], { duration: 1000, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
    }),
    at(1120, () => draw($('sp-bar-mask'), 520, { easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })),
    at(1500, () => Promise.all([play($('sp-pulse2'), [{ r: 0, opacity: 1 }, { r: 150, opacity: 0 }], { duration: 800, easing: 'ease-out' }), draw(ringr, 600, { easing: 'ease-out' })])),
    at(1900, () => fillIn(ringr, 350)),
    at(2250, typed),
    at(2750, () => play($('sp-tag'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 480 }))
  ]);
}

export function startSplash() {
  if (started) return; // splash-start.js runs it first; main.js calls it again as a safety net
  el = $('splash');
  if (!el) return;
  started = true;
  const reduce = (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || prefs.get('ui.reduceMotion', 'system') === 'reduce';
  mode = resolveMode({ setting: prefs.get('ui.splash', 'full'), reduce });
  // a browser that can not run the Web Animations API still gets the finished logo
  if (mode === 'full' && typeof el.animate !== 'function') mode = 'short';
  el.dataset.mode = mode;
  startedAt = performance.now();
  if (mode === 'full') timeline = runFull();
  setTimeout(() => { if (!ended) $('splash-dots')?.classList.add('show'); }, MIN_MS[mode] + 80);
}

export async function endSplash() {
  if (!el || ended) return;
  const remaining = MIN_MS[mode] - (performance.now() - startedAt);
  await Promise.race([Promise.all([timeline, sleep(Math.max(0, remaining))]), sleep(MIN_MS[mode] + 900)]);
  ended = true;
  el.classList.add('out');
  setTimeout(() => el.remove(), 560);
}
