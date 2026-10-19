// Test helper: a jsdom window exposed as the globals the app expects. jsdom is installed OUTSIDE the project
// (see docs/TESTING.md): set JSDOM_PATH to its node_modules folder, default /home/claude/tools-node/node_modules.
import { createRequire } from 'node:module';
const require = createRequire((process.env.JSDOM_PATH || '/home/claude/tools-node/node_modules') + '/');

export function setupDom(url = 'http://localhost/library') {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><head><meta name="theme-color" content="#fff"><meta name="theme-color" content="#000"></head><body><div id="app" data-chrome="none"><aside id="sidebar"></aside><div class="app-main"><main id="page-root"></main></div><nav id="bar"></nav></div><div id="toast-host"></div><div id="splash"></div></body></html>', { url, pretendToBeVisual: true });
  const w = dom.window;
  const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  for (const k of ['window', 'document', 'location', 'history', 'Node', 'SVGElement', 'HTMLElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'DOMParser', 'localStorage', 'sessionStorage']) define(k, w[k]);
  define('navigator', w.navigator);
  define('matchMedia', (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  define('addEventListener', w.addEventListener.bind(w)); define('removeEventListener', w.removeEventListener.bind(w));
  define('innerWidth', 390); define('innerHeight', 800);
  define('requestAnimationFrame', (fn) => setTimeout(fn, 0));
  // jsdom does not load stylesheets: fire "load" so loadCss() resolves immediately
  const append = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = (el) => { const r = append(el); if (el.tagName === 'LINK') setTimeout(() => el.dispatchEvent(new w.Event('load')), 0); return r; };
  return { dom, w };
}
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
/** Polls until fn() is truthy (slow CI machines make fixed sleeps flaky). */
export async function waitFor(fn, ms = 2000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await tick(10); } return !!fn(); }
