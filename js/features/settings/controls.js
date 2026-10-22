/**
 * Linkivo — js/features/settings/controls.js  (v2.1.0)
 * Purpose: renders one registry entry (seg, switch, swatch, select) as a row and stores the value through local-prefs.
 * API: renderControl(entry) -> Element
 */
import { h } from '../../core/dom.js';
import { prefs } from '../../core/local-prefs.js';

function shell(entry, control, stack = false) {
  return h('div', { class: ['row', stack && 'is-stack'], 'data-setting': entry.id },
    h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: entry.label }), entry.desc && h('span', { class: 'row-desc', text: entry.desc })),
    h('span', { class: 'row-end' }, control));
}

export function renderControl(entry) {
  const get = () => prefs.get(entry.key, entry.default);
  if (entry.type === 'switch') {
    const sw = h('button', { type: 'button', class: 'switch-hit', role: 'switch', 'aria-label': entry.label, on: { click: () => { prefs.set(entry.key, !get()); sync(); } } }, h('span', { class: 'switch' }));
    const sync = () => { sw.setAttribute('aria-checked', String(!!get())); sw.firstChild.setAttribute('aria-checked', String(!!get())); };
    sync();
    return shell(entry, sw);
  }
  if (entry.type === 'seg') {
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': entry.label }, entry.options.map((o) => h('button', { type: 'button', role: 'radio', text: o.label, 'data-v': o.value, on: { click: () => { prefs.set(entry.key, o.value); sync(); } } })));
    const sync = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === get())));
    sync();
    return shell(entry, seg, true);
  }
  if (entry.type === 'swatch') {
    const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': entry.label }, entry.options.map((o) => h('button', { type: 'button', role: 'radio', class: 'swatch', 'aria-label': o.label, 'data-v': o.value, style: { '--c': o.color }, on: { click: () => { prefs.set(entry.key, o.value); sync(); } } }, h('i'))));
    const sync = () => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === get())));
    sync();
    return shell(entry, wrap, true);
  }
  if (entry.type === 'select') {
    const sel = h('select', { class: 'select', 'aria-label': entry.label, on: { change: () => prefs.set(entry.key, sel.value) } }, entry.options.map((o) => h('option', { value: o.value, text: o.label })));
    sel.value = get();
    return shell(entry, sel);
  }
  return h('div');
}
