/**
 * Linkivo — js/features/splash/splash.js  (v2.1.1)
 * Purpose: the owner's original start animation (v1 splash "v21"): the left ring drops with a ripple, the shackle locks with sparkles while the
 *          background opens like a circle, the bar draws, the right ring appears, the logo lifts and "linkivo" types in. The floating URL badges
 *          are left out (owner request). The same timeline runs scaled down for the short version.
 *          Modes: full = first launch (about 4 s)    short = later launches (about 1.3 s)    still = reduced motion (finished logo at once)
 *          Settings > Appearance > Start animation: Auto (full once, then short) / Always full / Always short.
 *          The splash ends when the first page is ready AND the animation has played; the animation is never stretched.
 * API: startSplash() -> void     endSplash() -> Promise<void>     pickMode(pref, seen, reduceMotion) -> 'full'|'short'|'still'
 */
import { prefs } from '../../core/local-prefs.js';
import { sleep } from '../../core/utils.js';
import app from '../../core/app-info.js';

const SCALE = { full: 1, short: 0.3 };
const HOLD = { full: 650, short: 150, still: 250 };
const LEFT = { x: 353, y: 648 };       // centre of the left ring in logo coordinates
const VIEW = { x: 180, y: 210, w: 680, h: 630 };
let el = null, mode = 'still', done = Promise.resolve(), ended = false, dotsTimer = null;

export function pickMode(pref, seen, reduceMotion) {
  if (reduceMotion) return 'still';
  if (pref === 'full' || pref === 'short') return pref;
  return seen ? 'short' : 'full';
}

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';

function buildName() {
  const box = $('sp-name');
  box.replaceChildren();
  [...'linkivo'].forEach((ch) => { const s = document.createElement('span'); s.className = 'sp-char' + (ch === 'i' ? ' g' : ''); s.textContent = ch; box.appendChild(s); });
}

function star(size) { return `M 0 ${-size} Q ${size * 0.2} ${-size * 0.2} ${size} 0 Q ${size * 0.2} ${size * 0.2} 0 ${size} Q ${-size * 0.2} ${size * 0.2} ${-size} 0 Q ${-size * 0.2} ${-size * 0.2} 0 ${-size} Z`; }

function sparkles(x, y, T) {
  const g = $('sp-sparkles');
  const add = (node, frames, opts) => { g.appendChild(node); try { node.animate(frames, opts).onfinish = () => node.remove(); } catch { node.remove(); } };
  const wave = document.createElementNS(NS, 'circle');
  wave.setAttribute('cx', x); wave.setAttribute('cy', y); wave.setAttribute('fill', 'none'); wave.setAttribute('stroke', 'url(#sg)'); wave.setAttribute('stroke-width', '5');
  add(wave, [{ r: 0, opacity: 1, strokeWidth: 5 }, { r: 50, opacity: 0, strokeWidth: 0 }], { duration: T(500), easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)' });
  for (let i = 0; i < 2; i++) {
    const s = document.createElementNS(NS, 'path'); const size = 10 + Math.random() * 8;
    s.setAttribute('d', star(size)); s.style.fill = i % 2 ? 'var(--brand-a)' : 'var(--brand-b)';
    const a = Math.PI * i + Math.random() * 0.5, dist = 25 + Math.random() * 20, ex = x + Math.cos(a) * dist, ey = y + Math.sin(a) * dist, rot = 45 + Math.random() * 90;
    add(s, [{ transform: `translate(${x}px, ${y}px) scale(0) rotate(0deg)`, opacity: 1 }, { transform: `translate(${(x + ex) / 2}px, ${(y + ey) / 2}px) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 0.4 }, { transform: `translate(${ex}px, ${ey}px) scale(0) rotate(${rot * 2}deg)`, opacity: 0 }], { duration: T(600 + Math.random() * 200), easing: 'ease-out' });
  }
  for (let i = 0; i < 4; i++) {
    const d = document.createElementNS(NS, 'circle'); d.setAttribute('cx', x); d.setAttribute('cy', y); d.setAttribute('r', 1.5 + Math.random() * 2); d.style.fill = 'var(--brand-b)';
    const a = Math.random() * Math.PI * 2, dist = 30 + Math.random() * 40;
    add(d, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist}px)`, opacity: 0 }], { duration: T(450), easing: 'cubic-bezier(0,0,0.2,1)' });
  }
}

/** Puts every part into its FINISHED state (used for "still" and as the safety state when an animation step throws). */
function showFinished() {
  for (const id of ['sp-u', 'sp-b']) $(id).style.strokeDashoffset = '0';
  for (const id of ['sp-lr', 'sp-rr']) { $(id).style.strokeDashoffset = '0'; $(id).style.fillOpacity = '1'; }
  $('sp-lrg').style.transform = 'scale(1)';
  $('sp-bg').style.clipPath = 'circle(150vmax at 50% 50%)';
  $('sp-logo').style.transform = 'translateY(-30px) scale(0.9)';
  for (const c of document.querySelectorAll('.sp-char')) c.classList.add('sp-still');
  $('sp-tag').classList.add('sp-still');
}

async function timeline(k, withSparkles) {
  const T = (ms) => Math.max(1, ms * k);
  const wait = (ms) => sleep(T(ms));
  const [u, b, lr, rr, lrg, bg, logo, tag, la] = ['sp-u', 'sp-b', 'sp-lr', 'sp-rr', 'sp-lrg', 'sp-bg', 'sp-logo', 'sp-tag', 'sp-la'].map($);
  const pulse = $('sp-pulse'), pulse2 = $('sp-pulse2');

  // initial state without transitions
  for (const n of [u, b, lr, rr, lrg, bg, logo, tag]) n.style.transition = 'none';
  for (const n of [u, b, lr, rr]) { n.style.strokeDasharray = '1'; n.style.strokeDashoffset = '1'; }
  lr.style.fillOpacity = '0'; rr.style.fillOpacity = '0'; lrg.style.transform = 'scale(0)'; logo.style.transform = 'translateY(0) scale(1)';
  const r = $('sp-svg').getBoundingClientRect();
  const cx = r.left + ((LEFT.x - VIEW.x) / VIEW.w) * r.width, cy = r.top + ((LEFT.y - VIEW.y) / VIEW.h) * r.height;
  bg.style.clipPath = `circle(0px at ${cx}px ${cy}px)`;
  void el.offsetWidth;
  await wait(300);

  // left ring drops with a ripple
  try { pulse.style.opacity = '1'; pulse.animate([{ r: 0, opacity: 1 }, { r: 180, opacity: 0 }], { duration: T(800), easing: 'ease-out' }); } catch { /* r is not animatable in this browser: skip the ripple */ }
  lrg.style.transition = `transform ${T(700)}ms cubic-bezier(0.34, 1.56, 0.64, 1)`; lrg.style.transform = 'scale(1)';
  lr.style.transition = `stroke-dashoffset ${T(600)}ms ease-out`; lr.style.strokeDashoffset = '0';
  await wait(500);
  lr.style.transition = `fill-opacity ${T(400)}ms ease`; lr.style.fillOpacity = '1';
  await wait(200);

  // shackle locks: bounce, sparkles, background opens from the ring
  u.style.transition = `stroke-dashoffset ${T(700)}ms cubic-bezier(0.5, 0, 0.2, 1.1)`; u.style.strokeDashoffset = '0';
  setTimeout(() => {
    try { la.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: T(350), easing: 'ease-out' }); } catch { /* ignore */ }
    if (withSparkles) { sparkles(259, 520, T); sparkles(447, 520, T); }
    bg.style.transition = `clip-path ${T(1200)}ms cubic-bezier(0.4, 0, 0.2, 1)`; bg.style.clipPath = `circle(150vmax at ${cx}px ${cy}px)`;
  }, T(420));
  await wait(700);

  // bar, then the right ring
  b.style.transition = `stroke-dashoffset ${T(600)}ms cubic-bezier(0.4, 0, 0.2, 1)`; b.style.strokeDashoffset = '0';
  await wait(400);
  try { pulse2.style.opacity = '1'; pulse2.animate([{ r: 0, opacity: 1 }, { r: 150, opacity: 0 }], { duration: T(800), easing: 'ease-out' }); } catch { /* ignore */ }
  rr.style.transition = `stroke-dashoffset ${T(700)}ms ease-out`; rr.style.strokeDashoffset = '0';
  await wait(500);
  rr.style.transition = `fill-opacity ${T(400)}ms ease`; rr.style.fillOpacity = '1';
  await wait(400);

  // logo lifts, name types in, tagline appears
  logo.style.transition = `transform ${T(800)}ms cubic-bezier(0.2, 0, 0, 1)`; logo.style.transform = 'translateY(-30px) scale(0.9)';
  await wait(250);
  for (const c of document.querySelectorAll('.sp-char')) {
    c.style.transition = `opacity ${T(300)}ms ease, filter ${T(400)}ms ease-out, transform ${T(400)}ms cubic-bezier(0.2, 0, 0, 1)`;
    c.style.opacity = '1'; c.style.filter = 'blur(0)'; c.style.transform = 'translateX(0)';
    await wait(60);
  }
  tag.style.transition = `opacity ${T(600)}ms ease, filter ${T(600)}ms, transform ${T(600)}ms cubic-bezier(0.2, 0, 0, 1)`;
  tag.style.opacity = '1'; tag.style.filter = 'blur(0)'; tag.style.transform = 'translateY(0)';
  await wait(600);
}

export async function startSplash() {
  el = $('splash');
  if (!el) return;
  buildName();
  $('sp-badge').textContent = 'v' + app.version;
  const reduce = (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) || prefs.get('ui.reduceMotion', 'system') === 'reduce';
  mode = pickMode(prefs.get('ui.startAnimation', 'auto'), prefs.get('splash.seen', false), reduce);
  if (mode === 'full' && document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(500)]); // let Outfit load so the letters do not swap mid-animation
  el.dataset.mode = mode;
  if (mode === 'still') { showFinished(); done = sleep(HOLD.still); }
  else done = timeline(SCALE[mode], mode === 'full').catch(() => showFinished());
  // if loading outlasts the animation, three loading dots appear (the animation is not stretched)
  done.then(() => { dotsTimer = setTimeout(() => { if (!ended) $('splash-dots')?.classList.add('show'); }, 400); });
}

export async function endSplash() {
  if (!el || ended) return;
  await done;
  await sleep(HOLD[mode]);
  ended = true; clearTimeout(dotsTimer);
  prefs.set('splash.seen', true);
  el.classList.add('out');
  setTimeout(() => el.remove(), 700);
}
