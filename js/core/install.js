/**
 * Linkivo — js/core/install.js  (v2.1.0)
 * Purpose: install banner and install status (FEATURES section 16). Browsers cannot always tell whether the app is installed
 *          while it runs in a normal tab, so the wording is honest: "installed" is only claimed when this device told us so.
 * v2.1.1: initInstall() is called from main.js BEFORE the rest of the app loads, because the browser fires `beforeinstallprompt` early; a
 *         late listener used to miss it, so the install button and banner never appeared on PC.
 * API: initInstall() -> void     installHelp() -> { title, steps[] } (manual install steps for this browser)     installState (store: { canPrompt, standalone, installedFlag, ios })
 *      promptInstall() -> Promise<'accepted'|'dismissed'|'unavailable'>     shouldShowBanner() -> boolean
 *      dismissBanner()  (hides the banner for 7 days)     installStatus() -> { kind, title, text }
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
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; installState.set({ canPrompt: true }); });
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
export const dismissBanner = () => prefs.set('install.hideUntil', Date.now() + HIDE_MS);

export function installHelp() {
  const ua = navigator.userAgent;
  if (detectIos()) return { title: 'Install on iPhone or iPad', steps: ['Open Linkivo in Safari.', 'Tap the Share button.', 'Choose Add to Home Screen, then Add.'] };
  if (/Edg\//.test(ua)) return { title: 'Install in Microsoft Edge', steps: ['Click the three dots menu at the top right.', 'Choose Apps, then Install this site as an app.', 'Confirm with Install.'] };
  if (/Firefox\//.test(ua) && !/Android/.test(ua)) return { title: 'Install from Firefox', steps: ['Firefox on desktop cannot install web apps.', 'Open Linkivo in Chrome or Edge to install it, or keep using it in this tab.'] };
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return { title: 'Install from Safari', steps: ['In the menu bar choose File, then Add to Dock.', 'Confirm with Add.'] };
  return { title: 'Install in Chrome', steps: ['Look for the install icon at the right end of the address bar and click it.', 'Or open the three dots menu and choose Install Linkivo (Cast, save and share on some versions).', 'Confirm with Install.'] };
}

export function installStatus() {
  const s = installState.get();
  if (s.standalone) return { kind: 'running', title: 'Installed', text: 'You are using the installed app.' };
  if (s.installedFlag) return { kind: 'installed', title: 'Installed on this device', text: 'Open Linkivo from your home screen or app list. This browser tab is not the installed app.' };
  if (s.canPrompt) return { kind: 'available', title: 'Not installed', text: 'Install Linkivo for a faster start and an app icon.' };
  if (s.ios) return { kind: 'ios', title: 'Not installed', text: 'In Safari, tap Share, then Add to Home Screen.' };
  return { kind: 'manual', title: 'Not installed', text: 'Your browser did not offer the install button. You can still install from its menu.' };
}
