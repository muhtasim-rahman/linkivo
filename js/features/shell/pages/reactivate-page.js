/**
 * Linkivo — js/features/shell/pages/reactivate-page.js  (v2.1.0, built v2.5.0)
 * Purpose: the page of an account that was marked as deleted. For 15 days nothing is removed; this page shows what is still kept (the folder, link and vault counts the Worker saved
 *          when the deletion was requested) and offers "Reactivate", which asks the Worker (POST /account/reactivate) to bring the account back. After 15 days the daily cron removes
 *          everything and signing in finds an empty new account. The other choice is to log out.
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { toast } from '../../../ui/toast.js';
import { emptyState } from '../../../ui/empty-state.js';
import { getSession, setSession } from '../../../core/session.js';
import { securePost } from '../../../core/worker-client.js';
import { loadFirebase } from '../../../core/firebase-loader.js';
import { createRtdbAdapter } from '../../../engine/rtdb-adapter.js';
import { plural } from '../../../core/format.js';
import { logOut } from '../shell-parts.js';

const ERR = { expired: 'The 15 days are over, so this account can not be brought back.', not_deleted: 'This account is not marked as deleted any more. Reload the app.', not_configured: 'Reactivation is not set up on the server yet.' };

export function mount(container, ctx) {
  const s = getSession(), summary = h('p', { class: 'help', text: 'Checking what is kept...' }), err = h('p', { class: 'help is-error', role: 'alert' });
  const btn = h('button', { type: 'button', class: 'btn btn-primary' }, icon('refresh', { size: 18 }), 'Reactivate my account');
  btn.addEventListener('click', async () => {
    btn.disabled = true; err.textContent = '';
    try { await securePost('/account/reactivate'); toast('Welcome back. Your account is active again.'); setSession({ status: 'active' }); await ctx.router.reevaluate(); }
    catch (e) { err.textContent = ERR[e && e.code] || (e && e.status === 401 ? 'Sign in again, then try once more.' : 'Could not reactivate. Check your connection and try again.'); btn.disabled = false; }
  });
  container.appendChild(h('div', { class: 'page' }, emptyState({ art: 'lost', title: 'This account is scheduled for deletion',
    text: 'Nothing has been removed yet. For 15 days after the request you can bring everything back. After that it is deleted for good.', actions: [] }),
    h('div', { class: 'page-actions', style: { display: 'grid', gap: 'var(--s3)', justifyItems: 'center', textAlign: 'center' } }, summary, btn, err,
      h('button', { type: 'button', class: 'btn btn-quiet', on: { click: () => logOut(ctx.router) } }, 'Log out'))));
  (async () => {
    try {
      const firebase = await loadFirebase(), a = createRtdbAdapter({ firebase }), v = s.user ? await a.get(`deletedAccounts/${s.user.uid}/summary`) : null;
      if (v) summary.textContent = `Still kept: ${plural(v.folders || 0, 'folder')}, ${plural(v.links || 0, 'link')}${v.vaultFolders ? `, ${plural(v.vaultFolders, 'vault folder')}` : ''}.`; else summary.textContent = '';
    } catch { summary.textContent = ''; }
  })();
}
