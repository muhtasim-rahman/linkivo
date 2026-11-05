/**
 * Linkivo — js/features/vault/vault-page.js  (v2.5.2)
 * Purpose: /vault and /vault/:fid — the locked folders, only while the vault is open. The folder list is drawn from memory (core/vault.js); nothing here reads the normal library,
 *          writes history, fetches page data or touches the search index. Links open in a new tab without Referer. When the vault closes (Lock, the app lock, a long time away) the page
 *          leaves for Library at once and its rows are removed.
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { emptyState } from '../../ui/empty-state.js';
import { confirmDialog } from '../../ui/confirm.js';
import { loadCss } from '../../core/css-loader.js';
import { getLock } from '../../core/lock.js';
import { getEngine } from '../../core/app-data.js';
import { plural } from '../../core/format.js';
import { getVault, subscribeVault, closeVault, vaultFolders, vaultLinks, moveOutOfVault, deleteInVault } from '../../core/vault.js';

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function mount(container, ctx) {
  await loadCss('/css/pages/library.css');
  const router = ctx.router, fid = ctx.params && ctx.params.fid;
  if (!getVault().open) { router.navigate('/library', { replace: true }); return () => {}; }
  const engine = getEngine(), vctx = () => ({ adapter: engine.adapter, uid: getLock().uid });
  const body = h('div', { class: 'fp-body' }), sub = h('p', { class: 'page-sub' });
  const lockBtn = h('button', { type: 'button', class: 'btn btn-sm', on: { click: async () => { await closeVault(); router.navigate('/library'); } } }, icon('lock', { size: 18 }), h('span', { text: 'Lock' }));
  const title = h('h1', { class: 'page-title', text: 'Locked folders' });
  const page = h('div', { class: 'page page-enter vault-page' }, h('div', { class: 'page-head' }, h('div', {}, title, sub), lockBtn), body);
  container.appendChild(page);

  const busy = (btn, on) => { btn.disabled = on; };
  const progressToast = (n, t) => { if (t > 100) toast(`Moving ${n} of ${t} links...`); };
  async function moveOut(f, btn) {
    const ok = await confirmDialog({ title: `Move "${f.name}" out?`, message: 'The folder and its links go back to your normal Library, where they are no longer behind the code.', confirmLabel: 'Move out' });
    if (!ok) return; busy(btn, true);
    try { const n = await moveOutOfVault(f.id, vctx(), progressToast); toast(`Moved ${plural(n, 'link')} out.`); if (fid) router.navigate('/vault', { replace: true }); } catch { toast('Could not move it. Nothing was lost: try again.', { type: 'error' }); }
    busy(btn, false); draw();
  }
  const copy = async (url) => { try { await navigator.clipboard.writeText(url); toast('Copied.'); } catch { toast('Could not copy.', { type: 'error' }); } };
  async function del(l) {
    const ok = await confirmDialog({ title: 'Delete this link?', message: 'Locked links have no Recycle Bin. This removes it for good.', confirmLabel: 'Delete', danger: true });
    if (!ok) return; try { await deleteInVault([l.id], vctx()); toast('Deleted.'); } catch { toast('Could not delete it.', { type: 'error' }); } draw();
  }
  function draw() {
    if (!getVault().open) return;
    if (!fid) {
      const fs = vaultFolders(); title.textContent = 'Locked folders'; sub.textContent = fs.length ? plural(fs.length, 'folder') : '';
      if (!fs.length) { body.replaceChildren(emptyState({ art: 'library', title: 'Nothing is locked yet', text: 'Open a folder in your Library, use its menu and choose Move to locked folders.', actions: [{ label: 'Go to Library', onClick: () => router.navigate('/library') }] })); return; }
      body.replaceChildren(h('div', { class: 'vault-list', role: 'list' }, fs.map((f) => {
        const out = h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Move ${f.name} out of locked folders`, on: { click: (e) => { e.stopPropagation(); moveOut(f, out); } } }, 'Move out');
        return h('div', { class: 'row vault-folder', role: 'listitem' }, h('button', { type: 'button', class: 'row-main vault-open', on: { click: () => router.navigate(`/vault/${f.id}`) } }, h('span', { class: 'row-label', text: f.name }), h('span', { class: 'row-desc', text: plural(vaultLinks(f.id).length, 'link') })), out);
      })));
      return;
    }
    const f = vaultFolders().find((x) => x.id === fid);
    if (!f) { router.navigate('/vault', { replace: true }); return; }
    const ls = vaultLinks(fid); title.textContent = f.name; sub.textContent = plural(ls.length, 'link');
    const out = h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => moveOut(f, out) } }, 'Move this folder out');
    body.replaceChildren(h('div', { class: 'vault-bar' }, out), ls.length ? h('div', { class: 'vault-list', role: 'list' }, ls.map((l) => h('div', { class: 'row vault-link', role: 'listitem' },
      h('a', { class: 'row-main', href: l.url, target: '_blank', rel: 'noopener noreferrer' }, h('span', { class: 'row-label', text: l.title || hostOf(l.url) || l.url }), h('span', { class: 'row-desc', text: hostOf(l.url) })),
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Copy the link', on: { click: () => copy(l.url) } }, icon('copy', { size: 18 })),
      h('button', { type: 'button', class: 'btn-icon', 'aria-label': 'Delete the link', on: { click: () => del(l) } }, icon('trash', { size: 18 }))))) : emptyState({ art: 'library', title: 'This folder is empty', text: 'Links you move here appear in this list.', actions: [] }));
  }
  draw();
  const off = subscribeVault(() => { if (!getVault().open) { body.replaceChildren(); router.navigate('/library', { replace: true }); } else draw(); });
  return () => { off(); body.replaceChildren(); };
}
