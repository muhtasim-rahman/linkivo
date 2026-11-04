/**
 * Linkivo — js/features/auth/guest-transfer.js  (v2.5.1)
 * Purpose: moves the guest's folders and links into the account the person has just signed in to (owner: "after logging in from guest mode the guest data was not transferred";
 *          it was the v2.5.0 slice that had not been built yet). When the guest copy on this device holds anything, ONE popup asks once per sign-in:
 *          "Move to my account" or "Not now" (it asks again next time). Moving reuses the native backup path: the guest data is read into a backup object and restored through the
 *          normal import job, so it has progress, survives a reload, can be undone from the chip, never duplicates (links already saved are skipped) and folders with the same name merge.
 *          The guest copy is erased only AFTER the job reports done (a marker remembers the job across a reload). A guest lock (PIN) is asked for first: the copy is encrypted with it.
 *          Guest settings and history stay on the device; only folders and links move.
 * API: offerGuestTransfer({ router? }) -> Promise<void>      readGuest(box?) -> { folders, links } | null      eraseGuest() -> Promise<void>   (pure parts are exported for tests)
 */
import { h } from '../../core/dom.js';
import { prefs } from '../../core/local-prefs.js';
import { log } from '../../core/logger.js';
import { getSession } from '../../core/session.js';
import { getEngine, getQueue } from '../../core/app-data.js';
import { guestBoxFor, guestHasLock, dropGuestLockRecord } from '../../core/lock.js';
import { openDbSafe, STORES } from '../../engine/idb.js';
import { openEncryptedDb } from '../../engine/encrypted-db.js';
import { createLocalEngine, GUEST_DB } from '../../engine/local-engine.js';
import { collect } from '../export/export-engine.js';
import { buildBackup } from '../export/native-format.js';
import { runRestore } from '../import/import-backup.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { plural } from '../../core/format.js';
import { openPinFlow, stagePad } from '../lock/pin-flow.js';

const MARK = 'guest.transfer';   // { job } while a transfer job is running, so a reload can still finish the clean-up
let asked = '';                    // uid already asked in this page load

/** Reads the guest copy (never writes). `box` is the guest lock's key when the copy is encrypted. Resolves null when there is nothing. */
export async function readGuest(box = null) {
  let inner = null;
  try {
    inner = await openDbSafe(GUEST_DB);
    const db = box ? await openEncryptedDb(inner, box, { discardUnreadable: false }) : inner;
    const eng = await createLocalEngine({ db });
    const c = collect(eng, { type: 'all' });
    const live = c.links.filter((l) => !l.del);
    return { folders: c.folders.filter((f) => !f.del), links: live };
  } finally { if (inner && inner.close) { try { inner.close(); } catch { /* ignore */ } } }
}

export async function eraseGuest() {
  const db = await openDbSafe(GUEST_DB);
  for (const store of Object.keys(STORES)) await db.clear(store);
  db.close && db.close();
  dropGuestLockRecord(); prefs.remove(MARK);
}

/** After a finished transfer job: erase the guest copy. Called from the queue listener and, after a reload, from offerGuestTransfer. */
function watchJob(queue, id) {
  let off = () => {};
  const check = (j) => {
    if (!j || j.id !== id) return;
    if (j.status === 'done') { off(); eraseGuest().then(() => toast('Your guest links were moved. The guest copy on this device was removed.', { duration: 3500 })).catch((e) => log.warn('guest', 'could not erase the guest copy', e)); }
    else if (j.status === 'failed' || j.status === 'stopped') { off(); prefs.remove(MARK); toast('The move did not finish. Your guest copy is still on this device.', { type: 'error' }); }
  };
  off = queue.subscribe(check);
  const now = queue.get(id); if (now) check(now);
}

export async function offerGuestTransfer() {
  const s = getSession();
  if (s.mode !== 'account' || (s.status && s.status !== 'active') || !s.user || asked === s.user.uid) return;
  const engine = getEngine(), queue = getQueue(); if (!engine || !queue) return;
  asked = s.user.uid;
  const mark = prefs.get(MARK, null);
  if (mark && mark.job) { const j = queue.get(mark.job); if (j && j.status === 'done') { await eraseGuest().catch(() => {}); return; } if (j && (j.status === 'running' || j.status === 'queued' || j.status === 'paused')) { watchJob(queue, mark.job); return; } prefs.remove(MARK); }
  let box = null, guest = null;
  try {
    if (guestHasLock()) {   // the guest copy is encrypted: the guest PIN is needed to read it
      const flow = await openPinFlow({ title: 'Your guest links' });
      const pin = await stagePad(flow, { text: 'Enter the PIN you used as a guest to move your guest links into this account.', check: async (p) => { await guestBoxFor(p); return ''; } });
      if (!pin) return;
      box = await guestBoxFor(pin);
      await flow.finish();
    }
    guest = await readGuest(box);
  } catch (e) { log.warn('guest', 'could not read the guest copy', e); return; }
  if (!guest || !guest.links.length) { if (guest && !guest.links.length && !guestHasLock()) await eraseGuest().catch(() => {}); return; }
  const n = guest.links.length, f = guest.folders.length;
  const choice = await new Promise((resolve) => {
    openSheet({ title: 'Move your guest links?', scrimClose: false,
      body: h('div', { class: 'stack' }, h('p', { text: `This device has ${plural(n, 'link')} in ${plural(f, 'folder')} saved as a guest. Move them into your account so they are safe and on all your devices.` }),
        h('p', { class: 'help', text: 'Links you already have are not added twice. Folders with the same name are merged. After the move the guest copy on this device is removed.' })),
      actions: [{ label: 'Not now', onClick: () => { resolve(false); } }, { label: 'Move to my account', variant: 'primary', onClick: () => { resolve(true); } }],
      onClose: () => resolve(false) });
  });
  if (!choice) return;
  try {
    const backup = buildBackup({ folders: guest.folders, links: guest.links, source: 'guest', now: Date.now() });
    const job = await runRestore({ engine, queue, backup, state: { folderMode: 'merge', duplicates: 'skip' } });
    if (!job) { await eraseGuest().catch(() => {}); return; }   // everything was already in the account
    prefs.set(MARK, { job: job.id }); watchJob(queue, job.id);
    toast('Moving your guest links...');
  } catch (e) { log.error('guest', 'transfer failed', e); toast('Could not move the guest links. They are still on this device.', { type: 'error' }); }
}
