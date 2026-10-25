/**
 * Linkivo — js/core/shortcuts.js  (v2.2.1)
 * Purpose: keyboard shortcuts for pages (Library, Folder, Recycle Bin). One place decides when a shortcut may run:
 *          never while typing in a field (except entries marked inInput), never while a popup or menu is open (they own Escape and the arrows).
 * API: registerShortcuts(list) -> off()      list: [{ keys:'mod+a'|'escape'|'delete'|'backspace'|'/'|'?'|'n', desc, run(e), inInput?, group? }]
 *      matchKey(event, spec) -> boolean (pure, tested)      describeKeys(spec) -> 'Ctrl + A' (pure)
 */
import { layerCount } from './nav-stack.js';

const NAMES = { esc: 'escape', del: 'delete', space: ' ' };
export function matchKey(e, spec) {
  const parts = String(spec).toLowerCase().split('+').map((p) => p.trim());
  const key = NAMES[parts[parts.length - 1]] || parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const mod = e.ctrlKey || e.metaKey;
  if (mods.has('mod') !== mod) return false;
  if (mods.has('alt') !== !!e.altKey) return false;
  if (key.length > 1 || /[a-z0-9]/.test(key)) { if (mods.has('shift') !== !!e.shiftKey) return false; }   // symbols like ? and / carry their own shift state
  return String(e.key).toLowerCase() === key;
}
export const describeKeys = (spec) => String(spec).split('+').map((p) => ({ mod: 'Ctrl', shift: 'Shift', alt: 'Alt', escape: 'Esc', delete: 'Delete', backspace: 'Backspace' }[p.trim().toLowerCase()] || p.trim().toUpperCase())).join(' + ');

const typing = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable === true);

export function registerShortcuts(list) {
  const onKey = (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (layerCount() > 0) return;                       // a popup, menu or sheet is open: it handles its own keys
    const inField = typing(e.target);
    for (const s of list) {
      if (inField && !s.inInput) continue;
      if (matchKey(e, s.keys)) { e.preventDefault(); s.run(e); return; }
    }
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}
