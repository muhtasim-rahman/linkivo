/**
 * Linkivo — js/features/shell/offline-notice.js  (v2.5.5)
 * Purpose: when Linkivo is opened without a connection, or the connection drops, say so and say plainly what works and what does not (owner). A guest is fully local, so almost
 *          everything works; an account works on the copy kept on the device and syncs later. Locked folders never open offline (the code is checked by the server).
 * API: offlineSections(mode) -> { works: string[], needs: string[] } (pure)     showOfflineNotice({ mode }) -> Promise<void>     initOfflineNotice() -> void (once, from boot.js)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { getSession } from '../../core/session.js';

export function offlineSections(mode) {
  const account = mode === 'account';
  const works = [
    'Browse your folders and links saved on this device.',
    'Search, Random Discover and History.',
    'Add, edit, move, favourite and delete links and folders' + (account ? '. Changes are kept on this device and sync when you are back online.' : '. Everything is saved on this device.'),
    'Export your library and open a Linkivo backup.'];
  const needs = [
    'Opening a link in the preview and fetching titles, pictures, videos or screenshots.',
    'Checking links and importing with titles.',
    'Locked folders (vault): they open only online.',
    ...(account ? ['Syncing with your account and other devices.', 'Sign in, sign out, password and account changes.'] : [])];
  return { works, needs };
}

const list = (items, ic) => h('ul', { class: 'off-list' }, items.map((t) => h('li', null, icon(ic, { size: 16 }), h('span', { text: t }))));

export function showOfflineNotice({ mode = getSession().mode } = {}) {
  const { works, needs } = offlineSections(mode);
  return new Promise((resolve) => openSheet({
    title: 'You are using Linkivo offline',
    body: h('div', { class: 'off-body' },
      h('p', { text: mode === 'account' ? 'No connection right now. Linkivo is running on the copy saved on this device.' : 'No connection right now. As a guest everything lives on this device, so most things work.' }),
      h('h3', { class: 'off-h', text: 'Works offline' }), list(works, 'check'),
      h('h3', { class: 'off-h', text: 'Needs internet' }), list(needs, 'close')),
    actions: [{ label: 'Got it', variant: 'primary' }], onClose: () => resolve()
  }));
}

let wired = false;
/** The notice opens once when the app starts offline; later drops show the short toast (boot.js) with a "What works?" button. */
export function initOfflineNotice() {
  if (wired || typeof window === 'undefined') return; wired = true;
  if (navigator.onLine === false) setTimeout(() => { if (navigator.onLine === false) showOfflineNotice(); }, 1200);
  window.addEventListener('offline', () => toast('You are offline. Changes are saved on this device.', { duration: 5000, action: { label: 'What works?', onClick: () => showOfflineNotice() } }));
}
