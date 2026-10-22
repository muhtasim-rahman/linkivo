/**
 * Linkivo — js/boot.js  (v2.1.1)
 * Purpose: the boot sequence (PLAN slice 4): install + update systems -> auth state -> account status -> data layer -> router and
 *          shell -> first page mounted -> splash ends. After that it keeps data, chrome and route guards in step with the session
 *          (login, logout, guest entry, deleted account).
 * API: boot() -> Promise<void>
 */
import { log } from './core/logger.js';
import { getSession, setSession, subscribeSession } from './core/session.js';
import { createRouter } from './core/router.js';
import { initUpdates } from './core/update.js';
import { initData, teardownData, getQueue } from './core/app-data.js';
import { loadFirebase } from './core/firebase-loader.js';
import { initAuth } from './features/auth/auth-service.js';
import { loadAccountStatus } from './features/auth/account-status.js';
import { ROUTES } from './features/shell/routes.js';
import { mountShell } from './features/shell/shell.js';
import { endSplash } from './features/splash/splash.js';
import { initTaskChip } from './ui/task-chip.js';
import { initPullRefresh } from './ui/pull-refresh.js';
import { showUpdatePrompt } from './features/shell/update-prompt.js';
import { prefs } from './core/local-prefs.js';
import { toast } from './ui/toast.js';

export async function boot() {
  initUpdates({ isBusy: () => !!(getQueue() && getQueue().isBusy()), onPrompt: showUpdatePrompt });
  await initAuth();

  let router = null, shell = null, checkedUid = null, destroyChip = null, lastKey = '';
  const keyOf = (s) => `${s.mode}:${s.user ? s.user.uid : ''}:${s.status}`;

  async function applySession(s) {
    if (shell) shell.setSession(s);
    if (s.mode === 'account' && checkedUid !== s.user.uid) {
      checkedUid = s.user.uid;
      try { const status = await loadAccountStatus(await loadFirebase(), s.user); if (status !== s.status) { setSession({ status }); s = getSession(); } }
      catch (e) { log.warn('boot', 'account status unavailable', e); }
    }
    if (s.mode === 'none') checkedUid = null;
    if (s.mode === 'guest' || (s.mode === 'account' && s.status === 'active')) {
      try { await initData(s); destroyChip?.(); destroyChip = getQueue() ? initTaskChip({ queue: getQueue() }) : null; }
      catch (e) { toast('Storage could not start. Reload the page.', { type: 'error' }); }
    } else { destroyChip?.(); destroyChip = null; await teardownData(); }
    lastKey = keyOf(getSession());
  }

  await applySession(getSession());

  const container = document.getElementById('page-root');
  router = createRouter({ routes: ROUTES, container, getSession, isWide: () => (shell ? shell.isWide() : false), onHint: (m) => toast(m, { duration: 2000 }) });
  shell = mountShell({ router });
  shell.setSession(getSession());

  // keep everything in step when the session changes later (sign-in, sign-out, guest entry, deleted status)
  let chain = Promise.resolve();
  subscribeSession((s) => {
    if (keyOf(s) === lastKey) return;
    chain = chain.then(async () => { await applySession(getSession()); await router.reevaluate(); }).catch((e) => log.error('boot', 'session change failed', e));
  });

  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) initPullRefresh({ root: container, enabled: () => prefs.get('ui.pullRefresh', true) !== false, canRefresh: () => !(getQueue() && getQueue().isBusy()) });
  router.on('mounted', () => { document.documentElement.dataset.boot = 'ok'; endSplash(); });
  window.addEventListener('offline', () => toast('You are offline. Changes are saved on this device.', { duration: 3500 }));
  window.addEventListener('online', () => toast('Back online.'));
  await router.start();
}
