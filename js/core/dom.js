/**
 * Linkivo — js/core/dom.js  (v2.1.0)
 * Purpose: safe element builder. Text is ALWAYS set as text nodes, never parsed as markup, so page titles,
 *          imported text and user input cannot inject HTML (RULES section 2).
 * API: h(tag, props, ...children) -> Element     svg(tag, props, ...children)     clear(el)     qs(sel, root) qsa(sel, root)
 *   props: class (string|array) text  attrs {k:v}  on {event: fn}  style {prop: value}  dataset {k:v}  plus plain attributes
 *          and the property-style keys value, checked, disabled, selected, hidden.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'g', 'defs', 'linearGradient', 'stop', 'mask', 'polyline', 'ellipse', 'use', 'title']);
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden']);

function apply(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v));
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style' && typeof v === 'object') for (const [p, val] of Object.entries(v)) (p.startsWith('--') ? el.style.setProperty(p, val) : (el.style[p] = val));
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'attrs') for (const [a, val] of Object.entries(v)) { if (val != null && val !== false) el.setAttribute(a, val === true ? '' : String(val)); }
    else if (PROPS.has(k) && !(el instanceof SVGElement)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export function h(tag, props = null, ...children) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  apply(el, props);
  append(el, children);
  return el;
}
export const svg = (tag, props, ...children) => h(tag, props, ...children);
export const clear = (el) => { el.replaceChildren(); return el; };
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
