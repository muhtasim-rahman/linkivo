/**
 * Linkivo — js/core/clipboard-watch.js  (v2.2.2)
 * Purpose: "Look in the clipboard for links" (owner request). When the browser has ALREADY allowed clipboard reading and the setting is on (it is on by
 *          default), Linkivo reads the clipboard when the app has finished loading and whenever you come back to it, and calls onFound() with the links
 *          it saw so a small suggestion can offer to import them. It never asks for permission by itself: the prompt appears only when the user
 *          turns the setting on (askClipboard) or uses Paste, which are user actions.
 *          Browser support: Chrome and Edge can report the permission and read quietly once it is granted. Firefox and Safari cannot, so there
 *          the watcher stays silent (clipboardPermission() returns 'unsupported').
 *          The same clipboard text is suggested once: its fingerprint is remembered (local-prefs `clip.seen`).
 * API: clipboardPermission() -> Promise<'granted'|'prompt'|'denied'|'unsupported'>     askClipboard() -> Promise<boolean>   (needs a user gesture)
 *      fingerprint(urls) -> string (pure)      startClipboardWatch({ onFound, enabled, extract, store?, minGapMs? }) -> stop()
 */
import { prefs } from './local-prefs.js';
import { toast } from '../ui/toast.js';
import { log } from './logger.js';

export async function clipboardPermission() {
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return 'unsupported';
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return 'unsupported';
    const r = await navigator.permissions.query({ name: 'clipboard-read' });
    return r.state;                              // 'granted' | 'prompt' | 'denied'
  } catch { return 'unsupported'; }              // Firefox and Safari throw for this permission name
}

/** Called when the user turns the setting ON: reading once makes the browser show its permission prompt. */
export async function askClipboard() {
  const state = await clipboardPermission();
  if (state === 'unsupported') { toast('This browser cannot let Linkivo watch the clipboard. Use the Paste button instead.', { duration: 4200 }); return false; }
  if (state === 'denied') { toast('Clipboard access is blocked for this site. Allow it in the browser\'s site settings.', { duration: 4200 }); return false; }
  try { await navigator.clipboard.readText(); toast('Clipboard access is on.'); return true; }
  catch { toast('Clipboard access was not allowed.', { type: 'error' }); return false; }
}

/** Pure: a short fingerprint of the links found (FNV-1a over the joined urls), so the same clipboard is not suggested twice. */
export function fingerprint(urls) {
  let h = 0x811c9dc5; const s = urls.join('\n');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${urls.length}:${h.toString(36)}`;
}

export function startClipboardWatch({ onFound, enabled = () => true, extract, store = prefs, minGapMs = 3000 }) {
  let last = 0, busy = false, stopped = false;
  async function check() {
    if (stopped || busy || !enabled() || document.visibilityState === 'hidden' || Date.now() - last < minGapMs) return;
    busy = true; last = Date.now();
    try {
      if ((await clipboardPermission()) !== 'granted') return;           // never prompt from here
      const text = await navigator.clipboard.readText();
      if (!text || text.length > 400000) return;
      const links = extract(text).filter((l) => /^https?:\/\//i.test(l.url));
      if (!links.length) return;
      const fp = fingerprint(links.map((l) => l.url));
      if (store.get('clip.seen', '') === fp) return;
      onFound({ text, links, fp, markSeen: () => store.set('clip.seen', fp) });
    } catch (e) { log.debug?.('clipboard', 'read failed', e); }            // document not focused, blocked, empty: all fine
    finally { busy = false; }
  }
  const onVis = () => { if (document.visibilityState === 'visible') setTimeout(check, 400); };
  document.addEventListener('visibilitychange', onVis); addEventListener('focus', onVis);
  setTimeout(check, 900);                                                  // once, right after the app has loaded
  return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); removeEventListener('focus', onVis); };
}
