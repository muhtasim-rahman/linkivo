/**
 * Linkivo — js/features/vault/lock-job.js  (v2.5.3)
 * Purpose: locking a folder and removing its lock are PERSISTED JOBS (v2.5.0 slice 9 / v2.5.3): the move survives a reload. If the vault is closed when the job runs (after a reload)
 *          it pauses with a clear message and resumes by itself when the locked folders are unlocked. The folder and its links move in atomic chunks (engine/vault-layer.js).
 * API: registerVaultMoveJob({ queue, engine, getHistory }) -> off     startVaultMove({ queue, dir: 'lock'|'unlock', fids, closeAfter, title })
 */
import { getVault, closeVault, onVaultOpen } from '../../core/vault.js';

export function registerVaultMoveJob({ queue, engine, getHistory }) {
  queue.register('vault-move', async (job, ctx) => {
    const { dir, fids = [], closeAfter = false } = job.params || {};
    if (!getVault().open) throw Object.assign(new Error('Unlock your locked folders to finish this move.'), { pause: true });
    const set = new Set(fids);
    const lids = [...engine.links.values()].filter((l) => set.has(l.fid)).map((l) => l.id);   // before the move: the history must forget them
    const total = lids.length; ctx.progress({ done: 0, total });
    if (dir === 'lock') {
      await engine.lockFolders(fids, (d, t) => ctx.progress({ done: d, total: t }));
      const h = getHistory(); if (h) await h.forgetLinks(lids);
    } else { await engine.unlockFolders(fids, (d, t) => ctx.progress({ done: d, total: t })); const h = getHistory(); if (h) await h.restoreLinks(lids); }   // v2.5.7: their history goes back to the normal list
    ctx.progress({ done: total, total });
    if (closeAfter) await closeVault();
  });
  // jobs that paused because the vault was closed continue as soon as it is open again
  return onVaultOpen(() => { for (const j of queue.list()) if (j.type === 'vault-move' && j.status === 'paused') queue.resume(j.id); });
}

export const startVaultMove = ({ queue, dir, fids, closeAfter = false, title }) => queue.enqueue({ type: 'vault-move', title: title || (dir === 'lock' ? 'Locking a folder' : 'Removing a lock'), params: { dir, fids, closeAfter }, chip: true });
