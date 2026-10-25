/**
 * Linkivo — js/features/library/recycle-bin-page.js  (v2.2.0)
 * Purpose: /settings/recycle-bin — deleted folders and links, grouped by day, kept 15 days. Search, multi-select, Restore, Delete forever, Empty.
 *          A folder deleted together with its links is one row (restoring it brings the links back). Items older than 15 days are purged when the app opens.
 * v2.2.1: the selection bar is a dock (always fixed at the bottom), keyboard shortcuts (Ctrl+A, Esc, Delete, R, / and ?), a refresh icon on wide screens.
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { emptyState } from '../../ui/empty-state.js';
import { confirmDialog } from '../../ui/confirm.js';
import { createVirtualList } from '../../ui/virtual-list.js';
import { mountDock } from '../../ui/dock.js';
import { refreshButton } from '../../ui/refresh-button.js';
import { registerShortcuts } from '../../core/shortcuts.js';
import { openShortcutHelp } from '../../ui/shortcut-help.js';
import { loadCss } from '../../core/css-loader.js';
import { getEngine } from '../../core/app-data.js';
import { plural, relativeTime } from '../../core/format.js';
import { logActivity } from '../../core/activity.js';
import { folderTile, linkTitle } from './folder-style.js';

const DAY = 86400000, KEEP_DAYS = 15;
export const daysLeft = (del, now = Date.now()) => Math.max(0, KEEP_DAYS - Math.floor((now - del) / DAY));
export function dayGroup(del, now = Date.now()) { const d = Math.floor((now - del) / DAY); return d < 1 ? 'Today' : d < 2 ? 'Yesterday' : d < 7 ? 'This week' : 'Earlier'; }

/** Rows of the bin: folders first-class; links only when they were deleted on their own (or their folder was deleted at another time). */
export function binItems(engine) {
  const folders = engine.listFolders({ deleted: true }).map((f) => ({ kind: 'folder', id: f.id, del: f.del, name: f.name, rec: f, n: f.lc || 0 }));
  const links = engine.listLinks({ deleted: true }).filter((l) => { const f = engine.getFolder(l.fid); return !(f && f.del && f.del === l.del); }).map((l) => ({ kind: 'link', id: l.id, del: l.del, name: linkTitle(l), rec: l }));
  return [...folders, ...links].sort((a, b) => b.del - a.del);
}

export async function mount(container, ctx) {
  if (!getEngine()) { container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'Your data is not ready', text: 'Wait a moment and try again, or reload the app.', actions: [{ label: 'Open library', href: '/library', primary: true }] }))); return () => {}; }
  await loadCss('/css/pages/library.css'); await loadCss('/css/pages/data.css');
  const engine = getEngine(), scroller = document.getElementById('page-root') || document.scrollingElement;
  const st = { q: '', sel: new Set(), rows: [] };
  const page = h('div', { class: 'page bin page-enter' }); container.appendChild(page);
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search the Recycle Bin', 'aria-label': 'Search the Recycle Bin', autocomplete: 'off' });
  const sub = h('p', { class: 'page-sub' }), body = h('div', { class: 'fp-body' }), bar = h('div', { class: 'selbar', role: 'toolbar', 'aria-label': 'Selected items', hidden: true });
  const emptyBtn = h('button', { type: 'button', class: 'btn btn-sm btn-danger', on: { click: emptyBin } }, icon('trash', { size: 16 }), 'Empty bin');
  page.append(h('header', { class: 'page-head is-stack' }, h('div', { class: 'lib-headrow' }, h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Back to settings', on: { click: () => ctx.router.navigate('/settings') } }, icon('arrow-left', { size: 20 })), h('h1', { class: 'page-title', text: 'Recycle Bin' }), refreshButton(async () => { await engine.flush?.(); update(); }), emptyBtn), sub),
    h('div', { class: 'fp-tools' }, h('div', { class: 'fp-search' }, icon('search', { size: 18 }), search)), body);
  const unDock = mountDock(bar);
  let vl = null;

  const pick = () => { const folderIds = [], linkIds = []; for (const r of st.rows) if (st.sel.has(r.id) && r.kind) (r.kind === 'folder' ? folderIds : linkIds).push(r.id); return { folderIds, linkIds }; };
  async function restore() {
    const { folderIds, linkIds } = pick(); const parentFolders = new Set();
    for (const id of linkIds) { const l = engine.listLinks({ deleted: true }).find((x) => x.id === id); const f = l && engine.getFolder(l.fid); if (f && f.del && !folderIds.includes(f.id)) parentFolders.add(f.id); }
    if (folderIds.length || parentFolders.size) await engine.restoreFolders([...folderIds, ...parentFolders]);
    if (linkIds.length) await engine.restoreLinks(linkIds);
    await logActivity(engine, 'restore', `${folderIds.length} folders, ${linkIds.length} links`);
    toast(`Restored ${plural(folderIds.length + linkIds.length, 'item')}${parentFolders.size ? ' and their folder' : ''}.`); st.sel.clear(); update();
  }
  async function purge(all = false) {
    const { folderIds, linkIds } = all ? { folderIds: st.rows.filter((r) => r.kind === 'folder').map((r) => r.id), linkIds: st.rows.filter((r) => r.kind === 'link').map((r) => r.id) } : pick();
    const n = folderIds.length + linkIds.length; if (!n) return;
    if (!(await confirmDialog({ title: all ? 'Empty the Recycle Bin?' : `Delete ${plural(n, 'item')} forever?`, message: 'This can not be undone.', confirmLabel: 'Delete forever', danger: true }))) return;
    if (folderIds.length) await engine.purgeFolders(folderIds); if (linkIds.length) await engine.purgeLinks(linkIds);
    await logActivity(engine, all ? 'empty-bin' : 'delete', `${n} items deleted forever`); toast(`Deleted ${plural(n, 'item')} forever.`); st.sel.clear(); update();
  }
  async function emptyBin() { await purge(true); }

  const row = (r) => {
    if (r.head) return h('div', { class: 'bin-head', role: 'presentation', text: r.head });
    const on = st.sel.has(r.id), f = r.kind === 'folder';
    return h('label', { class: ['bin-row', on && 'is-selected'], role: 'listitem' }, h('input', { type: 'checkbox', checked: on, 'aria-label': `Select ${r.name}`, on: { change: (e) => { e.target.checked ? st.sel.add(r.id) : st.sel.delete(r.id); paintBar(); vl?.refresh(); } } }),
      f ? folderTile(r.rec, 32) : h('span', { class: 'ftile', style: { '--fc': '#64748b', '--sz': '32px' } }, icon('link', { size: 16 })),
      h('span', { class: 'ltext' }, h('span', { class: 'ltitle', text: r.name }), h('span', { class: 'lsub', text: f ? `Folder, ${plural(r.n, 'link')}  \u00b7  ${relativeTime(r.del)}` : `${r.rec.host || 'Link'}  \u00b7  ${relativeTime(r.del)}` })),
      h('span', { class: ['badge', daysLeft(r.del) <= 2 && 'is-warn'], text: `${daysLeft(r.del)} d left` }));
  };
  function paintBar() {
    const n = st.sel.size; bar.hidden = n === 0; page.classList.toggle('has-dock', n > 0); if (!n) return;
    bar.replaceChildren(h('span', { class: 'selcount', text: `${n} selected` }), h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => { st.sel = new Set(st.rows.filter((r) => r.kind).map((r) => r.id)); paintBar(); vl?.refresh(); } } }, 'Select all'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', on: { click: restore } }, icon('restore', { size: 16 }), 'Restore'), h('button', { type: 'button', class: 'btn btn-sm btn-danger', on: { click: () => purge(false) } }, icon('trash', { size: 16 }), 'Delete forever'),
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Clear selection', on: { click: () => { st.sel.clear(); paintBar(); vl?.refresh(); } } }, icon('close', { size: 20 })));
  }
  function update() {
    const all = binItems(engine), q = st.q.trim().toLowerCase(), shown = all.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.rec.url || '').toLowerCase().includes(q));
    sub.textContent = all.length ? `${plural(all.length, 'item')}. Items are deleted forever after ${KEEP_DAYS} days.` : `Deleted folders and links stay here for ${KEEP_DAYS} days.`; emptyBtn.hidden = !all.length;
    const rows = []; let last = '';
    for (const r of shown) { const g = dayGroup(r.del); if (g !== last) { rows.push({ head: g }); last = g; } rows.push(r); }
    st.rows = rows; for (const id of [...st.sel]) if (!shown.some((r) => r.id === id)) st.sel.delete(id);
    paintBar();
    if (!shown.length) { vl?.destroy(); vl = null; body.replaceChildren(emptyState({ art: 'library', title: all.length ? 'Nothing matches' : 'The Recycle Bin is empty', text: all.length ? 'Try another word.' : 'Deleted folders and links wait here, so a mistake is never final.' })); return; }
    if (!vl) { body.replaceChildren(); vl = createVirtualList({ scroller, rowHeight: 56, render: row }); vl.el.setAttribute('role', 'list'); body.appendChild(vl.el); }
    vl.setItems(rows);
  }
  // ---- keyboard (v2.2.1) ----
  const keys = [
    { keys: 'mod+a', desc: 'Select everything', run: () => { st.sel = new Set(st.rows.filter((r) => r.kind).map((r) => r.id)); paintBar(); vl?.refresh(); } },
    { keys: 'escape', desc: 'Clear the selection', run: () => { st.sel.clear(); paintBar(); vl?.refresh(); } },
    { keys: 'delete', desc: 'Delete the selected items forever', run: () => { if (st.sel.size) purge(false); } },
    { keys: 'r', desc: 'Restore the selected items', run: () => { if (st.sel.size) restore(); } },
    { keys: 'backspace', desc: 'Back to Settings', run: () => ctx.router.navigate('/settings') },
    { keys: '/', desc: 'Search the Recycle Bin', run: () => search.focus() },
    { keys: 'mod+f', desc: 'Search the Recycle Bin', run: () => search.focus() },
    { keys: '?', desc: 'Show these shortcuts', run: () => openShortcutHelp(keys) }
  ];
  const offKeys = registerShortcuts(keys);
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; st.q = ''; search.blur(); update(); } });
  let t = 0; search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { st.q = search.value; update(); }, 120); });
  let raf = 0; const off = engine.subscribe((e) => { if (e.type === 'change') { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); } });
  update();
  return () => { off(); offKeys(); unDock(); cancelAnimationFrame(raf); clearTimeout(t); vl?.destroy(); };
}
