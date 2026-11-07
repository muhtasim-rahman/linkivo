/**
 * Linkivo — js/features/vault/unlock-card.js  (v2.5.3)
 * Purpose: the "Locked folders" card at the top of the mobile Menu and of the wide Settings page (the only visible way to unlock besides the search box).
 *          Closed: "Unlock" (opens the code pad). Open: shows how long it stays open and a "Lock now" button. Nothing at all when the account has no code, for guests,
 *          or when the person chose "Only through the search box" (Settings > Security > Folder lock) and the vault is closed.
 * API: unlockCard() -> Element (redraws itself on lock and vault changes)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { getLock, subscribeLock } from '../../core/lock.js';
import { vaultOn, getVault, subscribeVault, closeVault } from '../../core/vault.js';
import { unlockFlow, remainingText } from './vault-unlock.js';

export function unlockCard() {
  const box = h('div', { class: 'vault-card-box' });
  let tick = 0;
  function draw() {
    clearInterval(tick);
    const open = getVault().open;
    if (!vaultOn() || (!open && getLock().hideVault)) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
    if (!open) {
      box.replaceChildren(h('button', { type: 'button', class: 'binrow vault-card', on: { click: () => unlockFlow().catch(() => toast('Could not unlock.', { type: 'error' })) } },
        h('span', { class: 'binrow-ic is-accent' }, icon('lock', { size: 20 })),
        h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Locked folders' }), h('span', { class: 'row-desc', text: 'Hidden. Tap to unlock with your code.' })),
        h('span', { class: 'btn btn-sm btn-primary' }, 'Unlock')));
      return;
    }
    const desc = h('span', { class: 'row-desc', text: remainingText() });
    box.replaceChildren(h('div', { class: 'binrow vault-card is-open' },
      h('span', { class: 'binrow-ic is-accent' }, icon('unlock', { size: 20 })),
      h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: 'Locked folders are unlocked' }), desc),
      h('button', { type: 'button', class: 'btn btn-sm', on: { click: async () => { await closeVault(); toast('Locked folders are hidden again.'); } } }, 'Lock now')));
    tick = setInterval(() => { if (!box.isConnected) clearInterval(tick); else desc.textContent = remainingText(); }, 15000);
  }
  draw();
  let seen = false;
  const redraw = (off) => () => { if (box.isConnected) { seen = true; draw(); } else if (seen) { off(); clearInterval(tick); } else draw(); };
  const a = subscribeLock(redraw(() => a())), b = subscribeVault(redraw(() => b()));
  return box;
}
