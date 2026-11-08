/**
 * Linkivo — js/features/vault/unlock-card.js  (v2.5.3)
 * Purpose: the "Locked folders" card at the top of the mobile Menu and of the wide Settings page (the only visible way to unlock besides the search box).
 *          v2.5.4 (owner): shown ONLY while the locked folders are unlocked (how long it stays open and a "Lock now" button). While they are locked there is no card at all.
 * API: unlockCard() -> Element (redraws itself on lock and vault changes)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { subscribeLock } from '../../core/lock.js';
import { vaultOn, getVault, subscribeVault, closeVault } from '../../core/vault.js';
import { remainingText } from './vault-unlock.js';

export function unlockCard() {
  const box = h('div', { class: 'vault-card-box' });
  let tick = 0;
  // v2.5.4 (owner): the card is NOT shown while the locked folders are locked (the way in is the search box, or Settings > Security). It appears only while they are unlocked, to lock them again at once.
  // When the app locks, the app reloads or the time runs out, the vault closes and the card goes away by itself.
  function draw() {
    clearInterval(tick);
    const v = getVault();
    if (!vaultOn() || !v.open || v.quiet) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
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
