/**
 * Linkivo — js/features/vault/vault-settings.js  (v2.5.2)
 * Purpose: the "Locked folders" rows of Settings > Security. Accounts only (the vault session lives on the server). The state (code set, hidden entry, symbol) is kept by the Worker
 *          in the account's lock state, so every device shows the same. Every change goes through requireSensitive('security') and the Worker.
 * API: vaultRows({ row, guard, withRow, toggle, redraw }) -> Element[]
 */
import { h } from '../../core/dom.js';
import { toast } from '../../ui/toast.js';
import { createSelect } from '../../ui/select.js';
import { getLock } from '../../core/lock.js';
import { requireSensitive } from '../../core/sensitive.js';
import { VAULT_PREFIXES, getVault, vaultCall, closeVault } from '../../core/vault.js';
import { describeError } from '../lock/pin-sheet.js';
import { setupVaultFlow, changeVaultCodeFlow, removeVaultFlow, forgotVaultCodeFlow, codeExample } from './vault-flows.js';

export function vaultRows({ row, guard, withRow, toggle, redraw }) {
  const s = getLock();
  if (s.scope === 'guest') return [row('Locked folders', 'Log in to an account to keep folders behind their own code.', null)];
  if (s.scope !== 'account') return [];
  const btn = (label, fn, cls = '') => h('button', { type: 'button', class: ['btn', 'btn-sm', cls], on: { click: () => guard(fn) } }, label);
  const gated = (fn) => async () => { if (await requireSensitive('security')) await fn(); };
  const save = async (patch, okText) => { try { await vaultCall('/lock/config', patch); if (okText) toast(okText); } catch (e) { toast(describeError(e).text, { type: 'error' }); } };
  if (!s.vaultSep) return [row('Locked folders', 'Keep folders behind a separate six-digit code. They are opened by typing the code into the search box and never appear anywhere else while locked.', btn('Set up', gated(setupVaultFlow)))];
  const sel = createSelect({ options: VAULT_PREFIXES.map((p) => ({ value: p, label: `${p}  (${codeExample(p)})` })), value: s.vaultPrefix, label: 'Code symbol', align: 'end', onChange: (v) => guard(gated(async () => { await save({ vaultPrefix: v }, 'Symbol saved.'); })) });
  const hidden = s.hideVault;
  const kids = [
    row('Locked folders', `On. Open them by typing ${codeExample(s.vaultPrefix)} (symbol, then your six digits) into the search box.`, null),
    row('Code symbol', 'The first character of the code. Only text with this symbol and six digits is treated as a code; everything else is a normal search.', sel),
    withRow(row('Hide the unlock entry', 'On: the search box is the only way in. Off: an Unlock entry also shows at the bottom of Library.', toggle('Hide the unlock entry', hidden, () => guard(gated(async () => { await save({ hideVault: !hidden }); })))), () => guard(gated(async () => { await save({ hideVault: !hidden }); }))),
    row('Change code', 'Choose a new six-digit code.', btn('Change', gated(changeVaultCodeFlow))),
    row('Forgot the code?', 'Sign in again to choose a new code. Your locked folders are kept.', btn('Reset', forgotVaultCodeFlow)),
    row('Turn off locked folders', 'Needs the code, and every locked folder must be moved out first.', btn('Turn off', gated(removeVaultFlow), 'btn-danger'))
  ];
  if (getVault().open) kids.splice(1, 0, row('Lock now', 'Closes the locked folders on this device.', btn('Lock', async () => { await closeVault(); redraw(); })));
  return kids;
}
