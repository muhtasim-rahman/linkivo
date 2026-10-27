/**
 * Linkivo — js/core/install.js  (v2.1.2)
 * Purpose: install banner and install status (FEATURES section 16). Browsers cannot always tell whether the app is installed
 *          while it runs in a normal tab, so the wording is honest: "installed" is only claimed when this device told us so.
 * API: initInstall() -> void     installState (store: { canPrompt, standalone, installedFlag, ios })
 *      promptInstall() -> Promise<'accepted'|'dismissed'|'unavailable'>     shouldShowBanner() -> boolean
 *      dismissBanner()  (hides the banner for 7 days)     installStatus() -> { kind, title, text }
 *      v2.2.3 (owner): "Installed" is claimed ONLY when the app is running as the installed app (kind 'running'). A normal browser tab that merely knows the app
 *      was installed once says so in a small note (kind 'installed', title 'In the browser'), and a fresh install prompt (beforeinstallprompt, which
 *      browsers send only when the app is NOT installed) clears that old flag, so an uninstalled app is offered again.
 */
import { createStore } from './events.js';
import { prefs } from './local-prefs.js';

const HIDE_MS = 7 * 24 * 3600 * 1000;
const detectStandalone = () => (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const detectIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const installState = createStore({ canPrompt: false, standalone: false, installedFlag: false, ios: false });
let deferred = null;

export function initInstall() {
  const standalone = detectStandalone();
  if (standalone) prefs.set('install.installed', true);
  installState.set({ standalone, installedFlag: prefs.get('install.installed', false), ios: detectIos() });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; prefs.set('install.installed', false); installState.set({ canPrompt: true, installedFlag: false }); });   // v2.2.3: a prompt means not installed (any more)
  // v2.2.4: ask the browser whether the app is installed (Chrome and Edge on Android and desktop; needs `related_applications` in the manifest). An empty answer proves
  // nothing (many browsers answer [] for everything), so it can only SET the flag; a fresh install prompt clears it again.
  try { navigator.getInstalledRelatedApps?.().then((apps) => { if (apps && apps.length && !installState.get().canPrompt) { prefs.set('install.installed', true); installState.set({ installedFlag: true }); } }).catch(() => {}); } catch { /* not supported */ }
  window.addEventListener('appinstalled', () => { deferred = null; prefs.set('install.installed', true); installState.set({ canPrompt: false, installedFlag: true }); });
}

export async function promptInstall() {
  if (!deferred) return 'unavailable';
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferred = null;
  installState.set({ canPrompt: false });
  return choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
}

export function shouldShowBanner() {
  const s = installState.get();
  if (s.standalone || s.installedFlag) return false;
  if (Date.now() < prefs.get('install.hideUntil', 0)) return false;
  return s.canPrompt || s.ios;
}
/** v2.2.4: a browser tab on a device where the app was installed once: show the note (until it is hidden for 7 days). */
export function shouldShowInstalledNote() { const s = installState.get(); return !s.standalone && s.installedFlag && Date.now() >= prefs.get('install.noteHideUntil', 0); }
export const dismissNote = () => prefs.set('install.noteHideUntil', Date.now() + HIDE_MS);
export const dismissBanner = () => prefs.set('install.hideUntil', Date.now() + HIDE_MS);

export function installStatus() {
  const s = installState.get();
  if (s.standalone) return { kind: 'running', title: 'Installed', text: 'You are using the installed app.' };
  if (s.installedFlag) return { kind: 'installed', title: 'In the browser', text: 'The app looks installed on this device. You are in a browser tab now; open Linkivo from your app list to use the app.' };
  if (s.canPrompt) return { kind: 'available', title: 'Not installed', text: 'Install Linkivo for a faster start and an app icon.' };
  if (s.ios) return { kind: 'ios', title: 'Not installed', text: 'In Safari, tap Share, then Add to Home Screen.' };
  return { kind: 'unavailable', title: 'Install from the browser menu', text: 'This browser has not offered an install button yet. In Chrome or Edge on a computer, use the install icon in the address bar or the menu item Install Linkivo. On Android, open the menu and choose Install app. If it is already installed, open it from your app list.' };
}
