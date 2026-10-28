/**
 * Linkivo — js/features/share/share-page.js  (v2.3.0)
 * Purpose: "Save to Linkivo", route /share (Web Share Target, installed app on Android). Shows the shared link(s), lets the person pick the folder (the last
 *          used one is preselected) and fix the title, then saves. Not signed in: the share is parked and the login page opens; the Library hands it back after login.
 *          Several links in one share are listed with check boxes. Nothing is saved until Save is pressed.
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { loadCss } from '../../core/css-loader.js';
import { prefs } from '../../core/local-prefs.js';
import { getSession } from '../../core/session.js';
import { getEngine, getQueue } from '../../core/app-data.js';
import { isEnabled } from '../../core/flags.js';
import { toast } from '../../ui/toast.js';
import { emptyState } from '../../ui/empty-state.js';
import { plural } from '../../core/format.js';
import { hostOf } from '../../core/url-tools.js';
import { folderTile } from '../library/folder-style.js';
import { openFolderPicker } from '../library/pickers.js';
import { pref, LIB } from '../library/lib-prefs.js';
import { sharedLinks, pendingFromQuery, isFresh } from './share-model.js';

export const PENDING = 'share.pending', LAST_FOLDER = 'share.lastFolder';

export async function mount(container, ctx) {
  const router = ctx.router, s = getSession();
  const toLibrary = () => router.navigate('/library', { replace: true });
  if (!isEnabled('shareTarget')) { container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'Sharing is not available', text: 'This feature is switched off.', actions: [{ label: 'Go to library', primary: true, onClick: toLibrary }] }))); return; }
  // a share that came through the address (query) wins; otherwise one parked before login
  let shared = pendingFromQuery(ctx.query);
  if (!shared) { const p = prefs.get(PENDING, null); if (isFresh(p)) shared = p; }
  if (s.mode === 'none') { if (shared) prefs.set(PENDING, shared); router.navigate('/login', { replace: true }); return; }
  prefs.remove(PENDING);
  await loadCss('/css/pages/share.css');
  const engine = getEngine();
  const { items, title: sharedTitle } = sharedLinks(shared || {});
  if (!engine || !shared || !items.length) {
    container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'search', title: shared ? 'No link found in what you shared' : 'Share a page to Linkivo', text: shared ? 'Linkivo looks for a web address in the shared text. Try sharing the page itself.' : 'In your browser or another app, choose Share and then Linkivo.', actions: [{ label: 'Go to library', primary: true, onClick: toLibrary }] })));
    return;
  }

  const st = { fid: prefs.get(LAST_FOLDER, null), picked: new Set(items.map((_, i) => i)) };
  if (!st.fid || !engine.getFolder(st.fid) || engine.getFolder(st.fid).del) st.fid = (engine.listFolders()[0] || {}).id || null;
  const title = h('input', { class: 'input', type: 'text', value: sharedTitle, placeholder: 'Title (optional)', maxlength: '300', 'aria-label': 'Title', autocomplete: 'off' });
  const folderBtn = h('button', { type: 'button', class: 'row sh-folder', 'aria-label': 'Choose folder', on: { click: async () => { const f = await openFolderPicker({ engine, title: 'Save to folder' }); if (f) { st.fid = typeof f === 'string' ? f : f.id; paintFolder(); } } } });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary sh-save', on: { click: save } });
  const note = h('p', { class: 'help is-error', role: 'alert' });
  function paintFolder() {
    const f = st.fid && engine.getFolder(st.fid);
    folderBtn.replaceChildren(f ? folderTile(f, 32) : h('span', { class: 'row-ic' }, icon('folder')), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: f ? f.name : 'Choose a folder' }), h('span', { class: 'row-desc', text: f ? plural(f.lc || 0, 'link') : 'Pick where to save' })), h('span', { class: 'row-end' }, icon('chevron-right')));
    paintSave();
  }
  function paintSave() { const n = st.picked.size; saveBtn.disabled = !n; saveBtn.replaceChildren(icon('check', { size: 18 }), h('span', { text: n > 1 ? `Save ${n} links` : 'Save' })); }
  async function save() {
    note.textContent = '';
    if (!st.picked.size) return;
    let fid = st.fid;
    if (!fid) { const f = await openFolderPicker({ engine, title: 'Save to folder' }); if (!f) return; fid = typeof f === 'string' ? f : f.id; st.fid = fid; }
    saveBtn.disabled = true;
    try {
      const chosen = items.filter((_, i) => st.picked.has(i)), t = items.length === 1 ? title.value.trim() : '';
      const r = await engine.addLinks(chosen.map((i) => ({ url: i.url, title: t || i.title || undefined, tEdit: t ? true : undefined })), { fid, dedupe: true });
      prefs.set(LAST_FOLDER, fid);
      const queue = getQueue();
      if (r.added.length && queue && pref(LIB.impEnrich)) queue.enqueue({ type: 'enrich', title: 'Fetching titles', params: { ids: r.added.map((a) => a.id) }, chip: false }).catch(() => {});
      const name = (engine.getFolder(fid) || {}).name || 'your folder';
      toast(r.added.length ? `Saved ${plural(r.added.length, 'link')} to \"${name}\".` : 'Already saved.');
      router.navigate(`/folder/${encodeURIComponent(fid)}`, { replace: true });
    } catch { note.textContent = 'Could not save. Try again.'; saveBtn.disabled = false; }
  }

  container.appendChild(h('div', { class: 'page sh page-enter' },
    h('header', { class: 'page-head' }, h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Cancel', on: { click: toLibrary } }, icon('close', { size: 22 })), h('h1', { class: 'page-title', text: 'Save to Linkivo' })),
    h('ul', { class: 'sh-list' }, items.map((i, n) => h('li', null, items.length > 1 ? h('label', { class: 'sh-pick' }, h('input', { type: 'checkbox', checked: true, 'aria-label': `Save ${i.url}`, on: { change: (e) => { e.target.checked ? st.picked.add(n) : st.picked.delete(n); paintSave(); } } }), h('span', { class: 'sh-url' }, h('b', { text: i.title || hostOf(i.url) }), h('small', { text: i.url }))) : h('div', { class: 'sh-one' }, icon('link', { size: 20 }), h('span', { class: 'sh-url' }, h('b', { text: hostOf(i.url) }), h('small', { text: i.url })))))),
    items.length === 1 && title, h('div', { class: 'group' }, folderBtn), note, h('div', { class: 'sh-foot' }, h('button', { type: 'button', class: 'btn', on: { click: toLibrary } }, 'Cancel'), saveBtn)));
  paintFolder();
}
