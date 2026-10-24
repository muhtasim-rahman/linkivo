/**
 * Linkivo — js/features/import/import-review.js  (v2.2.0)
 * Purpose: the review step of the Import popup: every link that was found, with a checkbox, a duplicate badge (already in the library, or repeated
 *          in this list), search, sort and quick selections. Long lists are windowed. Pure row-building lives in buildRows() so it can be tested.
 * API: buildRows(links, engine) -> rows [{ i, url, title, host, key, dupOf, repeat, selected }]      sortRows(rows, mode)
 *      openReview({ engine, rows, targetName, onBack }) -> Promise<{ action: 'import'|'back'|'cancel', rows: selected rows }>
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { icon } from '../../ui/icons.js';
import { createVirtualList } from '../../ui/virtual-list.js';
import { dedupeKey, hostOf } from '../../core/url-tools.js';
import { plural } from '../../core/format.js';

export function buildRows(links, engine) {
  const seen = new Set();
  return links.map((l, i) => {
    const key = dedupeKey(l.url) || l.url, existing = engine.findByUrl(l.url), repeat = seen.has(key);
    seen.add(key);
    return { i, url: l.url, title: l.title || '', host: hostOf(l.url), key, dupOf: existing ? existing.fid : null, repeat, selected: !existing && !repeat };
  });
}
export function sortRows(rows, mode) {
  const by = { order: (a, b) => a.i - b.i, domain: (a, b) => a.host.localeCompare(b.host) || a.i - b.i, title: (a, b) => (a.title || a.host).localeCompare(b.title || b.host) || a.i - b.i }[mode] || ((a, b) => a.i - b.i);
  return [...rows].sort(by);
}

export function openReview({ engine, rows, targetName }) {
  return new Promise((resolve) => {
    let action = 'cancel'; const st = { q: '', sort: 'order', view: [] };
    const list = h('div', { class: 'rv-list', role: 'list', 'aria-label': 'Found links' });
    const count = h('span', { class: 'rv-count', role: 'status' });
    const go = h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => { action = 'import'; sheet.close(); } } });
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search found links', 'aria-label': 'Search found links', autocomplete: 'off' });
    const sort = h('select', { class: 'select', 'aria-label': 'Sort' }, [['order', 'Found order'], ['domain', 'Domain'], ['title', 'Title']].map(([v, l]) => h('option', { value: v, text: l })));
    const selected = () => rows.filter((r) => r.selected);
    const vl = createVirtualList({ scroller: list, rowHeight: 56, render: (r) => h('label', { class: ['rv-row', r.selected && 'is-on'], role: 'listitem' },
      h('input', { type: 'checkbox', checked: r.selected, 'aria-label': `Import ${r.title || r.url}`, on: { change: (e) => { r.selected = e.target.checked; paint(false); } } }),
      h('span', { class: 'rv-text' }, h('span', { class: 'rv-title', text: r.title || r.host || r.url }), h('span', { class: 'rv-url', text: r.url })),
      r.dupOf && h('span', { class: 'badge is-warn', text: `In ${engine.getFolder(r.dupOf)?.name || 'library'}` }), !r.dupOf && r.repeat && h('span', { class: 'badge is-warn', text: 'Repeated' })) });
    list.appendChild(vl.el);
    function paint(reset = true) {
      const q = st.q.trim().toLowerCase();
      if (reset) { st.view = sortRows(rows, st.sort).filter((r) => !q || `${r.title} ${r.url}`.toLowerCase().includes(q)); vl.setItems(st.view); } else vl.refresh();
      const n = selected().length, dups = rows.filter((r) => r.dupOf || r.repeat).length;
      count.textContent = `${n} of ${rows.length} selected${dups ? `  \u00b7  ${plural(dups, 'duplicate')}` : ''}`;
      go.textContent = n ? `Import ${plural(n, 'link')}` : 'Nothing selected'; go.disabled = n === 0;
    }
    let t = 0; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; paint(); }, 120); });
    sort.addEventListener('change', () => { st.sort = sort.value; paint(); });
    const setAll = (fn) => () => { for (const r of st.view) r.selected = fn(r); paint(false); };
    const body = h('div', { class: 'form rv' },
      h('p', { class: 'help', text: `Into "${targetName}". Untick anything you do not want.` }),
      h('div', { class: 'fp-search' }, icon('search', { size: 18 }), search),
      h('div', { class: 'rv-tools' }, sort, h('button', { type: 'button', class: 'btn btn-sm', on: { click: setAll(() => true) } }, 'Select all'), h('button', { type: 'button', class: 'btn btn-sm', on: { click: setAll(() => false) } }, 'Select none'),
        h('button', { type: 'button', class: 'btn btn-sm', on: { click: setAll((r) => !r.dupOf && !r.repeat) } }, 'Skip duplicates')),
      list, count,
      h('div', { class: 'imp-foot' }, h('button', { type: 'button', class: 'btn', on: { click: () => { action = 'back'; sheet.close(); } } }, 'Back'), go));
    const sheet = openSheet({ title: `Review ${plural(rows.length, 'link')}`, wide: true, body, actions: [], onClose: () => { vl.destroy(); resolve({ action, rows: selected() }); } });
    paint();
  });
}
