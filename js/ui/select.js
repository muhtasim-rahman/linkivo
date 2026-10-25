/**
 * Linkivo — js/ui/select.js  (v2.2.1)
 * Purpose: THE dropdown of the app (owner request): one design everywhere, replacing the browser's own <select>. A button that shows the current
 *          choice and opens the shared anchored list (ui/popover.js), with a check mark on the chosen row. `multi` keeps the list open and
 *          lets several rows be ticked. Keyboard and screen reader behavior come from the popover (arrows, Enter, Escape, aria-checked).
 * API: createSelect({ options:[{ value, label, hint? }], value, onChange(value), label, multi, placeholder, align, block, small }) -> Element (a <button>)
 *        el.getValue()  el.setValue(v)  el.setOptions(options)       value is a string, or an array of strings when `multi`
 *      selectSummary(options, value, multi, placeholder) -> string (pure, tested)
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';
import { openMenu } from './popover.js';

export function selectSummary(options, value, multi = false, placeholder = 'Select') {
  if (!multi) return (options.find((o) => o.value === value) || {}).label || placeholder;
  const on = options.filter((o) => (value || []).includes(o.value));
  if (!on.length) return placeholder;
  return on.length <= 2 ? on.map((o) => o.label).join(', ') : `${on.length} selected`;
}

export function createSelect({ options = [], value = null, onChange = () => {}, label = 'Choose', multi = false, placeholder = 'Select', align = 'start', block = false, small = false } = {}) {
  let opts = options, cur = multi ? [...(value || [])] : value, handle = null;
  const text = h('span', { class: 'sel-text' });
  const btn = h('button', { type: 'button', class: ['sel-btn', block && 'is-block', small && 'is-small'], 'aria-haspopup': 'menu', 'aria-label': label }, text, icon('chevron-down', { size: 16 }));
  const paint = () => { text.textContent = selectSummary(opts, cur, multi, placeholder); btn.title = ''; };
  btn.addEventListener('click', () => {
    if (handle?.isOpen()) { handle.close(); return; }
    const items = opts.map((o) => ({ label: o.label, checked: multi ? cur.includes(o.value) : cur === o.value, multi, keepOpen: multi,
      onSelect: (on) => { if (multi) { cur = on ? [...new Set([...cur, o.value])] : cur.filter((v) => v !== o.value); paint(); onChange([...cur]); } else { cur = o.value; paint(); onChange(cur); } } }));
    handle = openMenu(btn, items, { align, minWidth: btn.offsetWidth, onClose: () => { handle = null; } });
  });
  btn.getValue = () => (multi ? [...cur] : cur);
  btn.setValue = (v) => { cur = multi ? [...(v || [])] : v; paint(); };
  btn.setOptions = (o) => { opts = o; paint(); };
  paint();
  return btn;
}
