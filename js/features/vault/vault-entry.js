/**
 * Linkivo — js/features/vault/vault-entry.js  (v2.5.2)
 * Purpose: the line at the bottom of Library for locked folders. Locked and the entry is not hidden: "Locked folders / Unlock" (opens a six-digit pad). Open: "Locked folders / Open".
 *          Hidden (setting) and locked: nothing at all; the search-box code is the only way in. Guests and accounts without a code: nothing.
 * API: mountVaultEntry({ router }) -> { el, destroy }
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { getLock, subscribeLock } from '../../core/lock.js';
import { getEngine } from '../../core/app-data.js';
import { vaultOn, getVault, subscribeVault, openVault } from '../../core/vault.js';
import { openPinFlow, stagePad } from '../lock/pin-flow.js';

async function unlockFlow(router) {
  const flow = await openPinFlow({ title: 'Locked folders' });
  const engine = getEngine();
  const done = await stagePad(flow, { digits: 6, text: 'Enter your six-digit code.', submitLabel: 'Unlock',
    check: async (code) => { await openVault(code, { adapter: engine.adapter, uid: getLock().uid }); return ''; } });   // a wrong code throws: the pad shows the same message as a wrong PIN
  if (!done) return;
  await flow.finish(); router.navigate('/vault');
}

export function mountVaultEntry({ router }) {
  const el = h('div', { class: 'vault-entry' });
  function draw() {
    if (!vaultOn()) { el.replaceChildren(); el.hidden = true; return; }
    const open = getVault().open;
    if (!open && getLock().hideVault) { el.replaceChildren(); el.hidden = true; return; }
    el.hidden = false;
    el.replaceChildren(h('button', { type: 'button', class: 'row vault-row', on: { click: () => { if (open) router.navigate('/vault'); else unlockFlow(router).catch(() => toast('Could not open locked folders.', { type: 'error' })); } } },
      h('span', { class: 'row-ic' }, icon(open ? 'unlock' : 'lock')),
      h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Locked folders' }), h('span', { class: 'row-desc', text: open ? 'Open. Tap to see them.' : 'Tap to unlock with your code.' }))));
  }
  draw();
  const a = subscribeLock(draw), b = subscribeVault(draw);
  return { el, destroy() { a && a(); b && b(); } };
}
