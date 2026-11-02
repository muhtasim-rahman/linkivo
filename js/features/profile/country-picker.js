/**
 * Linkivo — js/features/profile/country-picker.js  (v2.4.4)
 * Purpose: the Country dropdown of Edit profile (owner): every country with its flag emoji, a search box on top, keyboard friendly. Israel is not in the list, Palestine is
 *          (js/core/countries.js). The value is the country NAME (what the profile stores); an old free text value that matches nothing still shows as it is.
 * API: buildCountryPicker({ value, onChange(name) }) -> { el, set(name), destroy() }       filterCountries(list, query) -> list   (pure, tested)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { countryList, findCountry } from '../../core/countries.js';

export const filterCountries = (list, q) => { const t = String(q || '').trim().toLowerCase(); return t ? list.filter((c) => c.name.toLowerCase().includes(t) || c.code.toLowerCase() === t) : list; };

export function buildCountryPicker({ value = '', onChange = () => {} }) {
  let cur = value, open = false, active = -1, shown = [];
  const btn = h('button', { type: 'button', class: 'input pe-country', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': 'Country' });
  const search = h('input', { type: 'search', class: 'input pe-country-q', placeholder: 'Search countries', 'aria-label': 'Search countries', autocomplete: 'off' });
  const list = h('ul', { class: 'pe-country-list', role: 'listbox', tabindex: '-1' });
  const panel = h('div', { class: 'pe-country-panel', hidden: true }, search, list);
  const el = h('div', { class: 'pe-country-box' }, btn, panel);
  function label() { const c = findCountry(cur); btn.replaceChildren(h('span', { class: 'pe-flag', text: c ? c.flag : '' }), h('span', { class: ['pe-country-n', !cur && 'is-empty'], text: c ? c.name : cur || 'Choose a country' }), icon('chevron-down', { size: 16 })); }
  function paint() {
    shown = filterCountries(countryList(), search.value);
    list.replaceChildren(...(cur ? [h('li', { class: 'pe-opt is-clear', role: 'option', on: { click: () => pick('') } }, h('span', { class: 'pe-flag', text: '' }), 'No country')] : []),
      ...shown.map((c, i) => h('li', { class: ['pe-opt', c.name === cur && 'is-on', i === active && 'is-active'], role: 'option', 'aria-selected': String(c.name === cur), 'data-name': c.name, on: { click: () => pick(c.name) } }, h('span', { class: 'pe-flag', text: c.flag }), h('span', { text: c.name }))),
      ...(shown.length ? [] : [h('li', { class: 'pe-none', text: 'No country matches.' })]));
  }
  function pick(name) { cur = name; label(); toggle(false); onChange(name); }
  function toggle(on) {
    open = on; panel.hidden = !on; btn.setAttribute('aria-expanded', String(on));
    if (on) { search.value = ''; active = -1; paint(); requestAnimationFrame(() => { search.focus({ preventScroll: true }); const a = list.querySelector('.is-on'); if (a) a.scrollIntoView({ block: 'center' }); }); } else btn.focus({ preventScroll: true });
  }
  btn.addEventListener('click', () => toggle(!open));
  search.addEventListener('input', () => { active = shown.length ? 0 : -1; paint(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!shown.length) return; active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; paint(); const a = list.querySelector('.is-active'); a && a.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[Math.max(0, active)]) pick(shown[Math.max(0, active)].name); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggle(false); }
  });
  const outside = (e) => { if (open && !el.contains(e.target)) toggle(false); };
  document.addEventListener('pointerdown', outside, true);
  label();
  return { el, set(name) { cur = name; label(); }, destroy() { document.removeEventListener('pointerdown', outside, true); } };
}
