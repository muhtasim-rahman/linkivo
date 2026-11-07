/**
 * Linkivo — js/features/import/backup-open.js  (v2.5.3)
 * Purpose: opens a Linkivo backup file whatever it is: a plain backup is read at once, a passphrase-protected one (features/export/backup-crypto.js) first asks for the passphrase in a
 *          small popup (wrong passphrase: the same message, try again; Cancel closes it). The passphrase is used once and forgotten.
 * API: readBackupAny(text) -> Promise<{ ok, backup?, error?, cancelled? }>      askPassphrase({ envelope }) -> Promise<string|null> (the decrypted text)
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { readBackupText } from './native-import.js';
import { decryptBackup } from '../export/backup-crypto.js';

export function askPassphrase({ envelope }) {
  return new Promise((resolve) => {
    let done = false, busy = false;
    const err = h('p', { class: 'help is-error', role: 'alert', 'aria-live': 'polite' });
    const input = h('input', { class: 'input', type: 'password', autocomplete: 'off', 'aria-label': 'Backup passphrase', placeholder: 'Passphrase', on: { keydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } } } });
    const go = h('button', { type: 'button', class: 'btn btn-primary', text: 'Open backup', on: { click: async () => {
      if (busy || !input.value) return; busy = true; go.disabled = true; err.textContent = ''; go.textContent = 'Opening...';
      try { const text = await decryptBackup(envelope, input.value); done = true; resolve(text); sheet.close(); }
      catch (e) { err.textContent = e && e.code === 'bad_file' ? e.message : 'Wrong passphrase, or the file was changed.'; input.select(); }
      finally { busy = false; go.disabled = false; go.textContent = 'Open backup'; }
    } } });
    const body = h('div', { class: 'form' }, h('p', { class: 'pin-text', text: 'This backup is protected with a passphrase. Enter it to continue. Linkivo cannot recover a lost passphrase.' }), input, err, h('div', { class: 'imp-foot' }, h('button', { type: 'button', class: 'btn', text: 'Cancel', on: { click: () => sheet.close() } }), go));
    const sheet = openSheet({ title: 'Passphrase needed', body, actions: [], onClose: () => { input.value = ''; if (!done) resolve(null); } });
    setTimeout(() => input.focus(), 60);
  });
}

export async function readBackupAny(text) {
  const r = readBackupText(text);
  if (!r.encrypted) return r;
  const plain = await askPassphrase({ envelope: r.envelope });
  return plain == null ? { ok: false, cancelled: true, error: '' } : readBackupText(plain);
}
