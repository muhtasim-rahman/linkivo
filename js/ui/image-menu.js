/**
 * Linkivo — js/ui/image-menu.js  (v2.1.3)
 * Purpose: right-click (PC) or long-press (Android) on an image opens a small menu of the few useful, safe actions, because the browser's own
 *          menu is blocked app-wide (owner request, v2.1.3). Three items only: Open image in new tab, Copy image link, Download image.
 * Safety:  the address must be https, http, a blob: or a data:image/ (not SVG) URL. javascript:, file: and everything else is refused.
 *          New tabs open with noopener and noreferrer. Downloads fetch with no cookies and no referrer; if the image host does not allow
 *          that (CORS), the image opens in a new tab instead so it can be saved there. Nothing is stored or logged.
 * API: initImageMenu() -> void     safeImageUrl(src, base) -> string|''     menuItemsFor(url) -> ['open'|'copy'|'download'...]    fileNameFor(url, mime)
 */
import { openMenu } from './popover.js';
import { toast } from './toast.js';
import { log } from '../core/logger.js';

/** Returns the absolute URL if it is safe to act on, else an empty string. Pure. */
export function safeImageUrl(src, base = 'https://linkivo.web.app/') {
  if (!src || typeof src !== 'string') return '';
  let u;
  try { u = new URL(src, base); } catch { return ''; }
  if (u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'blob:') return u.href;
  if (u.protocol === 'data:' && /^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon)[;,]/i.test(src)) return src;
  return '';
}

/** Which actions apply to a safe URL: data: and blob: URLs can only be downloaded (opening or copying them is useless or blocked). */
export function menuItemsFor(url) {
  if (!url) return [];
  return /^(data|blob):/i.test(url) ? ['download'] : ['open', 'copy', 'download'];
}

/** A harmless file name: last path segment, letters digits dot dash underscore only, with an extension that matches the type when known. */
export function fileNameFor(url, mime = '') {
  let base = 'image';
  try { if (/^https?:/i.test(url)) base = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'image'); } catch { /* keep default */ }
  base = base.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '').slice(0, 80) || 'image';
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/bmp': 'bmp', 'image/x-icon': 'ico', 'image/svg+xml': 'svg' }[String(mime).split(';')[0].toLowerCase()];
  return ext && !new RegExp('\\.' + ext + '$', 'i').test(base) ? `${base.replace(/\.[A-Za-z0-9]{2,5}$/, '')}.${ext}` : base;
}

function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

async function download(url) {
  try {
    const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    if (!/^image\//i.test(blob.type)) throw new Error('not an image');
    saveBlob(blob, fileNameFor(url, blob.type));
    toast('Image saved.');
  } catch (e) {
    log.debug('image-menu', 'download fell back to a new tab', e && e.message);
    if (/^https?:/i.test(url)) { window.open(url, '_blank', 'noopener,noreferrer'); toast('Opened in a new tab. Save it from there.'); }
    else toast('Could not save this image.', { type: 'error' });
  }
}

const ACTIONS = {
  open: { label: 'Open image in new tab', icon: 'external', run: (url) => { window.open(url, '_blank', 'noopener,noreferrer'); } },
  copy: { label: 'Copy image link', icon: 'copy', run: async (url) => { try { await navigator.clipboard.writeText(url); toast('Image link copied.'); } catch { toast('Could not copy the link.', { type: 'error' }); } } },
  download: { label: 'Download image', icon: 'install', run: download }
};

export function initImageMenu() {
  document.addEventListener('contextmenu', (e) => {
    const img = e.target && e.target.closest ? e.target.closest('img') : null;
    if (!img || img.closest('input, textarea, .selectable')) return;
    const url = safeImageUrl(img.currentSrc || img.src);
    const ids = menuItemsFor(url);
    if (!ids.length) return;
    e.preventDefault();
    // the menu needs an anchor element: a 1px invisible box at the pointer
    const anchor = document.createElement('span');
    anchor.style.cssText = `position:fixed;left:${Math.round(e.clientX)}px;top:${Math.round(e.clientY)}px;width:1px;height:1px;pointer-events:none;`;
    document.body.appendChild(anchor);
    openMenu(anchor, ids.map((id) => ({ label: ACTIONS[id].label, icon: ACTIONS[id].icon, onSelect: () => ACTIONS[id].run(url) })), { align: 'start', onClose: () => anchor.remove() });
  });
}
