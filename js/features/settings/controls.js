/**
 * Linkivo — js/features/settings/controls.js  (v2.1.3, v2.2.2)
 * Purpose: renders one registry entry (seg, switch, swatch) as a row and stores the value through local-prefs.
 *          v2.2.1: a choice with more than 3 options is the shared dropdown (ui/select.js); 2 or 3 short options stay a segmented control that fills the row
 *          on phones.
 *          v2.2.2 (owner): from 600px up EVERY choice is the dropdown on the right (like Folder order); on phones 2 or 3 options stay a full-width segmented
 *          control under the label, more options are the dropdown. Both exist in the row and CSS shows the right one, so rotating a tablet needs no rebuild.
 *          v2.3.0 (owner): a row with a switch toggles when ANY part of the row is tapped (the small switch button is still the keyboard and screen reader
 *          target); captions get a tighter line height and the few long ones are set a little smaller (`descEl`).
 * API: renderControl(entry) -> Element     descEl(text) -> Element     LONG_DESC (characters from which a caption counts as long)
 */
import { h } from '../../core/dom.js';
import { prefs } from '../../core/local-prefs.js';
import { createSelect } from '../../ui/select.js';
import { askClipboard } from '../../core/clipboard-watch.js';
import { icon } from '../../ui/icons.js';
import { quota as mlQuota, subscribeQuota } from '../../core/microlink.js';
import { shotQuota, subscribeAdmin } from '../../core/admin.js';

export const LONG_DESC = 100;
/** A row caption. Over LONG_DESC characters it gets `.is-long` (one step smaller text), so only the few big captions shrink. */
export const descEl = (text) => h('span', { class: ['row-desc', String(text).length > LONG_DESC && 'is-long'], text });

/** v2.3.2: live text after a label, e.g. "(Left: 5/25)" (entry.suffix) followed by an info button that opens a short note (entry.info), on hover, tap and keyboard. */
const SUFFIX = {
  mlLeft: () => { const q = mlQuota(); return `(Left: ${q.left}/${q.limit})`; },
  thumLeft: () => { const q = shotQuota(); return q.limit === null ? '(No limit)' : `(Left: ${q.left}/${q.limit})`; }
};
const EXTRA = {
  mlLeft: () => { const q = mlQuota(); if (!q.reset || q.reset < Date.now()) return ''; const mins = Math.max(1, Math.round((q.reset - Date.now()) / 60000)); return `The counter resets in ${mins >= 90 ? Math.round(mins / 60) + ' h' : mins + ' min'}.`; }
};
function labelEl(entry) {
  if (!entry.suffix || !SUFFIX[entry.suffix]) return h('span', { class: 'row-label', text: entry.label });
  // v2.4.0 (owner): the note opens with a short height + fade transition (grid 0fr -> 1fr), its text may stay small
  const suf = h('span', { class: 'row-suffix' }), noteText = h('span', { class: 'row-info-t', text: entry.info || '' }), note = h('span', { class: 'row-info', 'aria-hidden': 'true' }, noteText);
  const paint = () => { suf.textContent = SUFFIX[entry.suffix](); const x = EXTRA[entry.suffix] && EXTRA[entry.suffix](); noteText.textContent = (entry.info || '') + (x ? ' ' + x : ''); };
  paint();
  const live = () => { if (suf.isConnected) paint(); };
  subscribeQuota(live); subscribeAdmin(live);
  const info = entry.info ? h('button', { type: 'button', class: 'btn-icon row-i', 'aria-label': 'More about ' + entry.label, 'aria-expanded': 'false', 'data-tip': entry.info, on: { click: (e) => { e.stopPropagation(); const open = !note.classList.contains('is-open'); note.classList.toggle('is-open', open); note.setAttribute('aria-hidden', String(!open)); info.setAttribute('aria-expanded', String(open)); } } }, icon('info', { size: 16 })) : null;
  return h('span', { class: 'row-label has-suffix' }, h('span', { text: entry.label }), ' ', suf, info, note);
}

function shell(entry, control, stack = false) {
  return h('div', { class: ['row', stack && 'is-stack'], 'data-setting': entry.id },
    h('span', { class: 'row-main' }, labelEl(entry), entry.desc && descEl(entry.desc)),
    h('span', { class: 'row-end' }, control));
}

export function renderControl(entry) {
  const get = () => prefs.get(entry.key, entry.default);
  if (entry.type === 'switch') {
    const flip = () => { const next = !get(); prefs.set(entry.key, next); sync(); if (next && entry.onOn === 'clipboard') askClipboard(); };
    // the switch button stops its click here: the row below handles every other tap, so one tap never flips twice
    const sw = h('button', { type: 'button', class: 'switch-hit', role: 'switch', 'aria-label': entry.label, on: { click: (e) => { e.stopPropagation(); flip(); } } }, h('span', { class: 'switch' }));
    const sync = () => { sw.setAttribute('aria-checked', String(!!get())); sw.firstChild.setAttribute('aria-checked', String(!!get())); };
    sync();
    const row = shell(entry, sw);
    row.classList.add('is-toggle');   // v2.3.0 (owner): the whole row is the switch
    row.addEventListener('click', (e) => { if (!e.target.closest('a, input, select')) flip(); });
    return row;
  }
  if (entry.type === 'seg' && entry.options.length > 3) {
    const sel = createSelect({ options: entry.options, value: get(), label: entry.label, align: 'end', onChange: (v) => prefs.set(entry.key, v) });
    return shell(entry, sel);
  }
  if (entry.type === 'seg') {
    // v2.2.2: one dropdown for tablets and PCs, the segmented control for phones. Same pref, both kept in step.
    const sel = createSelect({ options: entry.options, value: get(), label: entry.label, align: 'end', onChange: (v) => { prefs.set(entry.key, v); sync(); } });
    sel.classList.add('set-sel');
    const seg = h('div', { class: 'seg set-seg', role: 'radiogroup', 'aria-label': entry.label }, entry.options.map((o) => h('button', { type: 'button', role: 'radio', text: o.label, 'data-v': o.value, 'data-tip': entry.tips && entry.tips[o.value], on: { click: () => { prefs.set(entry.key, o.value); sync(); } } })));
    const sync = () => { seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === get()))); sel.setValue(get()); };
    sync();
    const row = shell(entry, sel);
    row.classList.add('is-dual'); row.appendChild(seg);
    return row;
  }
  if (entry.type === 'swatch') {
    const wrap = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': entry.label }, entry.options.map((o) => h('button', { type: 'button', role: 'radio', class: 'swatch', 'aria-label': o.label, 'data-tip': o.label + ' accent', 'data-v': o.value, style: { '--c': o.color }, on: { click: () => { prefs.set(entry.key, o.value); sync(); } } }, h('i'))));
    const sync = () => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === get())));
    sync();
    return shell(entry, wrap, true);
  }
  return h('div');
}
