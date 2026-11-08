/**
 * Linkivo — js/boot.js  (v2.1.3, v2.2.2)
 * Purpose: the boot sequence (PLAN slice 4): install + update systems -> auth state -> account status -> data layer -> router and
 *          shell -> first page mounted -> splash ends. After that it keeps data, chrome and route guards in step with the session
 *          (login, logout, guest entry, deleted account).
 * API: boot() -> Promise<void>
 */
import { log } from './core/logger.js';
import { getSession, setSession, subscribeSession } from './core/session.js';
import { createRouter } from './core/router.js';
import { initUpdates } from './core/update.js';
import { initData, teardownData, getQueue, getEngine } from './core/app-data.js';
import { loadFirebase } from './core/firebase-loader.js';
import { initAuth } from './features/auth/auth-service.js';
import { loadAccountStatus } from './features/auth/account-status.js';
import { ROUTES } from './features/shell/routes.js';
import { mountShell } from './features/shell/shell.js';
import { endSplash } from './features/splash/splash.js';
import { initTaskChip } from './ui/task-chip.js';
import { prefs } from './core/local-prefs.js';
import { loadProfile, cachedProfile, applyProfileLook } from './core/profile-data.js';
import { ensureUnlocked, startLockWatch, installSensitiveGate } from './features/lock/lock-controller.js';   // v2.5.0 app lock
import { setRefreshHandler, refreshApp } from './core/refresh.js';
import { initPullRefresh } from './ui/pull-refresh.js';
import { sleep } from './core/utils.js';
import { toast } from './ui/toast.js';
import { initBackupReminder } from './features/export/backup-reminder.js';
import { initClipboardSuggest } from './features/import/clipboard-suggest.js';

/**
 * v2.4.2: safety net for the start screen. If the app is still not on screen after 15 s (a service that never answers, a blocked file), a small card with a
 * Reload button appears over the splash instead of leaving the person looking at it for ever.
 */
function startWatchdog() {
  const t = setTimeout(() => {
    if (document.documentElement.dataset.boot === 'ok' || document.documentElement.dataset.locked) return;   // v2.5.0: waiting at the lock screen is not a slow start
    log.error('boot', 'start took more than 15 seconds');
    const card = document.createElement('div');
    card.setAttribute('role', 'alert');
    card.style.cssText = 'position:fixed;inset:auto 16px 24px;z-index:99999;max-width:420px;margin:0 auto;padding:14px 16px;border-radius:16px;background:#fff;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.25);font:500 14px/1.4 system-ui,sans-serif;display:flex;gap:12px;align-items:center;justify-content:space-between';
    const msg = document.createElement('span'); msg.textContent = 'Linkivo is taking longer than usual to start.';
    const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Reload'; btn.style.cssText = 'min-height:44px;padding:0 16px;border-radius:12px;border:0;background:#2563eb;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer';
    btn.addEventListener('click', () => location.reload());
    card.append(msg, btn); document.body.appendChild(card);
  }, 15000);
  return () => clearTimeout(t);
}

export async function boot() {
  const stopWatchdog = startWatchdog();
  initUpdates({ isBusy: () => !!(getQueue() && getQueue().isBusy()), onAvailable: (v) => import('./features/shell/update-prompt.js').then((m) => m.showUpdatePrompt(v)) });
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
      if (!(await ensureUnlocked(s))) { lastKey = keyOf(getSession()); return; }   // v2.5.0: with the app lock on nothing starts before the PIN (every page load asks)
      try { await initData(s); destroyChip?.(); destroyChip = getQueue() ? initTaskChip({ queue: getQueue(), onOpen: (job) => job.type === 'check' ? import('./features/check/check-sheet.js').then((m) => m.openCheckSheet({ queue: getQueue(), engine: getEngine(), router, jobId: job.id })) : job.type !== 'import' ? import('./features/jobs/jobs-panel.js').then((m) => m.openJobsPanel({ queue: getQueue(), engine: getEngine() })) : import('./features/import/import-progress.js').then((m) => m.openJobDetails({ queue: getQueue(), engine: getEngine(), router, jobId: job.id, autoClose: true })) }) : null; }
      catch (e) { toast('Storage could not start. Reload the page.', { type: 'error' }); }
    } else { destroyChip?.(); destroyChip = null; await teardownData(); await ensureUnlocked(s); }   // (the last call only forgets the lock when signed out)
    lastKey = keyOf(getSession());
  }

  /** v2.5.0 (owner): the saved profile (photo, ring colour, admin shield colour) is applied at start, not only when the Profile page is open, and again whenever it changes
   *  (the Edit popup writes the copy on this device, which also triggers the repaint of the sidebar). */
  let offProfile = null;
  async function startProfileLook(s) {
    offProfile?.(); offProfile = null;
    if (s.mode !== 'account') { applyProfileLook({}); return; }
    const uid = s.user.uid;
    applyProfileLook(cachedProfile(uid));
    offProfile = prefs.onChange(`profile.cache.${uid}`, (p) => { applyProfileLook(p || {}); if (shell) shell.setSession(getSession()); });
    const e = getEngine();
    if (e && e.adapter) loadProfile(e.adapter, uid).then((p) => { if (getSession().user && getSession().user.uid === uid) { applyProfileLook(p); if (shell) shell.setSession(getSession()); } }).catch(() => {});
  }

  await applySession(getSession());
  startProfileLook(getSession());

  const container = document.getElementById('page-root');
  router = createRouter({ routes: ROUTES, container, getSession, isWide: () => (shell ? shell.isWide() : false), onHint: (m) => toast(m, { duration: 2000 }) });
  shell = mountShell({ router });
  installSensitiveGate();
  startLockWatch({ router, reinit: async () => { await applySession(getSession()); startProfileLook(getSession()); await router.reevaluate({ keepScroll: true }); } });
  shell.setSession(getSession());

  // keep everything in step when the session changes later (sign-in, sign-out, guest entry, deleted status)
  let chain = Promise.resolve();
  subscribeSession((s) => {
    if (keyOf(s) === lastKey) return;
    chain = chain.then(async () => { await applySession(getSession()); startProfileLook(getSession()); await router.reevaluate(); }).catch((e) => log.error('boot', 'session change failed', e));
  });

  // Pull down at the top of a page that can change (library, folder, history, profile: route flag `refresh`) = in-app refresh of that page's
  // data. No setting, no app reload, no splash, no update check (updates have their own checks). Pages without the flag ignore the gesture.
  initPullRefresh({ scroller: container, enabled: () => getSession().mode !== 'none' && router.canRefresh(),
    onRefresh: () => refreshApp() });
  // v2.5.3 (owner): ONE refresh for the gesture, the header icon and the menus: sync the account, then rebuild the page from the current data (like a reload of that page)
  setRefreshHandler(async () => {
    await Promise.all([(async () => { const e = getEngine(); if (e && e.syncNow) await e.syncNow().catch(() => {}); })(), sleep(450)]);
    if (router.canRefresh()) await router.refreshCurrent();
  });

  let stopClip = null, stopRemind = null;
  router.on('mounted', () => {
    document.documentElement.dataset.boot = 'ok'; stopWatchdog(); endSplash();
    // v2.5.4 (owner): a brand-new account first gets the welcome flow (profile, then the intro video), and only after it the offer to move guest links
    if (getSession().mode === 'account') import('./features/profile/welcome-flow.js').then((w) => w.maybeWelcome({ getEngine, getSession })).catch(() => {}).then(() => import('./features/auth/guest-transfer.js')).then((m) => m.offerGuestTransfer()).catch(() => {});   // v2.5.1: offer to move the guest links into the account (once per sign-in)
    if (!stopRemind) stopRemind = initBackupReminder({ engine: getEngine });   // v2.5.3: once per app start, after the page is up
    if (!stopClip) stopClip = initClipboardSuggest({ router });   // v2.2.2: after the app has loaded, suggest importing links found in the clipboard (needs the browser's permission)
  });
  window.addEventListener('offline', () => toast('You are offline. Changes are saved on this device.', { duration: 3500 }));
  window.addEventListener('online', () => toast('Back online.'));
  await router.start();
}
