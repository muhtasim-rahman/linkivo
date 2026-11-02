/**
 * Linkivo — js/features/shell/pages/admin-reset-page.js  (v2.4.4)
 * Purpose: /admin-reset (owner): clears the device flag that Settings > Account "Normal user" sets, then goes back to the app. For an account that is not in the
 *          admin list nothing changes (the flag is only a switch to LOWER the privileges of this device; it can never raise them, so the page needs no sign in).
 * Page module: mount(container, ctx) -> unmount
 */
import { h } from '../../../core/dom.js';
import { toast } from '../../../ui/toast.js';
import { getSession } from '../../../core/session.js';
import { getEngine } from '../../../core/app-data.js';
import { resetAdmin, isAdminAccount } from '../../../core/admin.js';

export async function mount(container, ctx) {
  const msg = h('p', { class: 'page-sub', role: 'status', text: 'Resetting...' });
  container.appendChild(h('div', { class: 'page' }, h('h1', { class: 'page-title', text: 'Admin reset' }), msg));
  const s = getSession(), engine = getEngine();
  let ok = false;
  try { ok = await resetAdmin(engine && engine.adapter, s && s.mode === 'account' && s.user ? s.user.uid : '') || isAdminAccount(); } catch { ok = false; }
  msg.textContent = ok ? 'The admin features are back on this device.' : 'The device flag is cleared. If this account is in the admin list, the admin features appear once you are signed in.';
  toast(ok ? 'Admin features are back.' : 'Admin flag cleared.');
  const t = setTimeout(() => ctx.router.navigate(s && s.mode ? '/profile' : '/login', { replace: true }), 900);
  return () => clearTimeout(t);
}
