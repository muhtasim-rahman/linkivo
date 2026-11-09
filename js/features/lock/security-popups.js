/**
 * Linkivo — js/features/lock/security-popups.js  (v2.5.3)
 * Purpose: Settings > Security is ONE card with two rows, "App lock" and "Folder Lock (Vault)". Each row opens a popup that holds every setting of that feature (owner, v2.5.3).
 *          Opening a popup needs the app PIN when the app lock is on; once it was confirmed, popups open again without asking for 30 seconds. Until then nothing of the settings is
 *          drawn, and the rows themselves say nothing about their state. Turning a feature on the first time is its own short step-by-step flow (pin-flow.js popups); turning it off
 *          happens inside the popup. Every change still goes through requireSensitive('security') and the Worker, which is the real check.
 * API: securityRows({ row }) -> Element (the two rows)     securityGate(what) -> Promise<boolean>     resetSecurityGate()     SECURITY_GATE_MS
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { toast } from '../../ui/toast.js';
import { openSheet } from '../../ui/sheet.js';
import { createSelect } from '../../ui/select.js';
import { getLock, subscribeLock, setAway, verifyPin, askOnReload, setAskOnReload } from '../../core/lock.js';   // v2.5.5: askOnReload, setAskOnReload   // v2.5.4: lockNow is no longer used here (the Lock now row left the App lock popup)
import { requireSensitive } from '../../core/sensitive.js';
import { markSecurityVerified, securityVerifiedRecently, resetSecurityGate } from '../../core/security-gate.js';
import { VAULT_PREFIXES, getVault, subscribeVault, vaultCall, closeVault } from '../../core/vault.js';
import { enableLockFlow, disableLockFlow, changePinFlow } from './lock-actions.js';
import { askPin, describeError, PIN_RESET } from './pin-sheet.js';
import { setupVaultFlow, changeVaultCodeFlow, removeVaultFlow, forgotVaultCodeFlow, codeExample } from '../vault/vault-flows.js';
import { unlockFlow } from '../vault/vault-unlock.js';

export const SECURITY_GATE_MS = 30000;
export { resetSecurityGate };

/** True when the popup may open: no app lock, or the PIN was confirmed now or less than 30 seconds ago. */
export async function securityGate(what = 'these settings') {
  if (!getLock().enabled) return true;
  if (securityVerifiedRecently(SECURITY_GATE_MS)) return true;
  const pin = await askPin({ title: 'Enter your PIN', text: `Your PIN is needed to open ${what}.`, verify: verifyPin });
  if (!pin) return false;   // (PIN_RESET = the PIN was just reset through "Forgot PIN?": the person proved who they are, so the popup opens)
  markSecurityVerified(); return true;
}

/** v2.5.1: one Auto lock setting. The time counts while Linkivo is minimized or another tab/app is in front. Values are seconds (-1 = never). */
export const AUTO_LOCK = [{ value: '0', label: 'Right after closing the app' }, { value: '30', label: '30 seconds after closing' }, { value: '60', label: '1 minute after closing' }, { value: '120', label: '2 minutes after closing' }, { value: '300', label: '5 minutes after closing' }, { value: '600', label: '10 minutes after closing' }, { value: '900', label: '15 minutes after closing' }, { value: '1800', label: '30 minutes after closing' }, { value: '-1', label: 'Never' }];

const sw = (label, on, flip) => h('button', { type: 'button', class: 'switch-hit', role: 'switch', 'aria-label': label, 'aria-checked': String(on), on: { click: (e) => { e.stopPropagation(); flip(); } } }, h('span', { class: 'switch', 'aria-checked': String(on) }));
const toggleRow = (row, label, desc, on, flip) => { const r = row(label, desc, sw(label, on, flip)); r.classList.add('is-toggle'); r.addEventListener('click', (e) => { if (!e.target.closest('a, input, select, button')) flip(); }); return r; };
const button = (label, fn, cls = '') => h('button', { type: 'button', class: ['btn', 'btn-sm', cls], on: { click: fn } }, label);

/** A popup whose body redraws itself when the lock or vault state changes. `build()` returns the rows. */
function openPopup({ title, build }) {
  const body = h('div', { class: 'sec-pop' });
  let busy = false, sheet = null;
  const guard = async (fn) => { if (busy) return; busy = true; try { await fn(); } catch (e) { toast(describeError(e).text, { type: 'error' }); } finally { busy = false; draw(); } };
  const draw = () => { if (sheet) body.replaceChildren(...build({ guard, draw, close: () => sheet && sheet.close() })); };
  const offs = [subscribeLock(draw), subscribeVault(draw)];
  sheet = openSheet({ title, body, actions: [], onClose: () => offs.forEach((f) => f && f()) });
  draw();
  return sheet;
}

// ---- App lock ---------------------------------------------------------------------------------------------------------------------------------------
function appLockPopup(row) {
  openPopup({ title: 'App lock', build: ({ guard, close }) => {
    const s = getLock(), kids = [];
    if (s.scope === 'none') return [h('p', { class: 'pin-text', text: 'Sign in or continue as a guest to use the lock.' })];
    const flip = () => guard(async () => {
      if (getLock().enabled) { if (await disableLockFlow()) { resetSecurityGate(); close(); } }
      else if (await requireSensitive('security')) { if (await enableLockFlow()) { markSecurityVerified(); close(); } }
    });
    kids.push(toggleRow(row, 'App lock', s.scope === 'guest' ? 'Asks for a PIN every time Linkivo opens. Your links on this device are stored encrypted with it.' : 'Asks for a PIN every time Linkivo opens. Your data is also closed on the server until the PIN is entered, and the copy on this device is encrypted.', s.enabled, flip));
    if (!s.enabled) { kids.push(h('p', { class: 'help', text: 'Turning it on asks you to choose a PIN of 4 to 8 digits. Pick something others can not guess. For extra privacy and security, install Linkivo as an app and also turn on your device\'s own app lock.' })); return kids; }
    kids.push(row('Change PIN', 'Choose a new 4 to 8 digit PIN.', button('Change', () => guard(async () => { if (await requireSensitive('security') && await changePinFlow()) markSecurityVerified(); }))));
    const sel = createSelect({ options: AUTO_LOCK, value: String(s.away), label: 'Auto lock', align: 'end', onChange: (v) => guard(async () => { if (await requireSensitive('security')) { await setAway(Number(v)); toast('Auto lock saved.'); } }) });
    kids.push(row('Auto lock', 'Locks after Linkivo has been minimized or on another tab for this long. It follows your account on every device.', sel));
    // v2.5.5 (owner): a switch for the PIN gate after a reload. ON (default): every reload or reopening asks for the PIN. OFF: within the Auto lock time a reload goes straight in. This device only.
    const onReload = askOnReload();
    kids.push(toggleRow(row, 'Ask for the PIN on every reload', onReload ? 'On: every reload or reopening of Linkivo asks for the PIN. Off (the default): a reload within the Auto lock time goes straight in; after that time the PIN is asked. This device only.' : 'Off (the default): a reload or reopening within the Auto lock time goes straight in; after that time the PIN is asked. Anyone using this unlocked browser within that time can open Linkivo. Turn on to always ask. This device only.', onReload, () => guard(async () => { if (await requireSensitive('security')) { setAskOnReload(!askOnReload()); toast(askOnReload() ? 'The PIN is asked on every reload.' : 'A reload within the Auto lock time skips the PIN.'); } })));
    // v2.5.4 (owner): the "Lock now" row was removed from this popup (the lock icon at the top of Library and the sidebar row still lock the app).
    return kids;
  } });
}

// ---- Folder lock (vault) ----------------------------------------------------------------------------------------------------------------------------
function folderLockPopup(row) {
  openPopup({ title: 'Folder Lock (Vault)', build: ({ guard }) => {
    const s = getLock(), kids = [];
    if (s.scope !== 'account') return [h('p', { class: 'pin-text', text: s.scope === 'guest' ? 'Log in to an account to keep folders behind their own code. A guest has no server to hold the lock.' : 'Sign in to use folder lock.' })];
    const gated = (fn) => () => guard(async () => { if (await requireSensitive('security')) await fn(); });
    const save = async (patch, okText) => { try { await vaultCall('/lock/config', patch); if (okText) toast(okText); } catch (e) { toast(describeError(e).text, { type: 'error' }); } };
    if (!s.vaultSep) {
      kids.push(toggleRow(row, 'Folder lock', 'Hide folders behind a separate six-digit code. Locked folders are not in Library, search, history or anywhere else until you unlock them.', false, gated(async () => { if (await setupVaultFlow()) toast('Folder lock is on. Use the menu of a folder to lock it.'); })));
      kids.push(h('p', { class: 'help', text: `Setting it up takes three short steps: confirm your PIN, choose a symbol, choose the code. You type the symbol and the code (for example ${codeExample(s.vaultPrefix || '@')}) into the search box to unlock.` }));
      return kids;
    }
    const open = getVault().open;
    kids.push(toggleRow(row, 'Folder lock', 'On. Lock a folder from its menu in Library. Locked folders show up everywhere once unlocked, with a small lock icon. Unlock them by typing your code into the search box.', true, () => guard(async () => { await removeVaultFlow(); })));
    kids.push(row('Locked folders', open ? 'Unlocked right now.' : 'Hidden right now.', open ? button('Lock now', () => guard(async () => { await closeVault(); toast('Locked folders are hidden again.'); })) : button('Unlock', () => guard(async () => { await unlockFlow(); }))));
    // v2.5.5 (owner): the "Stay unlocked for" row is gone. The vault locks when the app locks; without an app lock on this device it locks on a reload or after 15 minutes without use.
    kids.push(h('p', { class: 'help', text: s.enabled ? 'Locked folders lock again whenever the app locks (the Auto lock time, Lock now, logging out) and always on a reload.' : 'The app lock is off on this device, so locked folders lock again after a reload or 15 minutes without use. Turn the app lock on to make them follow it.' }));
    // v2.5.4 (owner): the row "Unlock only through the search box" is gone: the Unlock card left Menu and Settings, so the choice has nothing left to switch.
    kids.push(row('Code symbol', 'The first character of the code. Only text with this symbol and six digits is treated as a code; everything else is a normal search (and is not remembered in recent searches).', createSelect({ options: VAULT_PREFIXES.map((p) => ({ value: p, label: `${p}  (${codeExample(p)})` })), value: s.vaultPrefix, label: 'Code symbol', align: 'end', onChange: (v) => gated(async () => { await save({ vaultPrefix: v }, 'Symbol saved.'); })() })));
    kids.push(row('Change code', 'Choose a new six-digit code.', button('Change', gated(changeVaultCodeFlow))));
    kids.push(row('Forgot the code?', 'Sign in again to choose a new code. Your locked folders are kept.', button('Reset', () => guard(forgotVaultCodeFlow))));
    return kids;
  } });
}

// ---- the two rows -----------------------------------------------------------------------------------------------------------------------------------
export function securityRows({ row }) {
  const open = (what, fn) => async () => { if (await securityGate(what)) fn(row); };
  const mk = (ic, label, desc, fn) => { const r = h('button', { type: 'button', class: 'row is-link', 'aria-haspopup': 'dialog', on: { click: fn } }, h('span', { class: 'row-ic' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label }), h('span', { class: 'row-desc', text: desc })), h('span', { class: 'row-end' }, icon('chevron-right', { size: 18 }))); return r; };
  return h('div', { class: 'sec-rows' },
    mk('lock', 'App lock', 'PIN, auto lock and lock now', open('the app lock settings', appLockPopup)),
    mk('folder', 'Folder Lock (Vault)', 'Keep folders behind a separate code', open('the folder lock settings', folderLockPopup)));
}
