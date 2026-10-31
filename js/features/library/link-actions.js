/**
 * Linkivo — js/features/library/link-actions.js  (v2.2.0)
 * Purpose: every action on one link or on a selection of links, with Undo. The folder page, the link menu and the bulk bar all call these.
 *          Points follow the owner rules in engine/points.js (v2.3.1: like 50, 30, 20, then +10 each time; dislike -20; favourite +-100; read later +-200).
 *          v2.3.1: toasts of one link show the new points.
 * API: linkMenuItems({ engine, link }) -> menu items       bulk = { ... }  each (engine, ids) -> Promise
 *      openLink(link)  copyText(text)  patchWithUndo(engine, ids, patchOf, message)  normalizeTags(text)
 */
import { toast } from '../../ui/toast.js';
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { dedupeKey, hostOf, parseUrl } from '../../core/url-tools.js';
import { confirmDialog } from '../../ui/confirm.js';
import { plural } from '../../core/format.js';
import { logActivity } from '../../core/activity.js';
import * as P from '../../engine/points.js';
import { openFolderPicker, openTextPrompt } from './pickers.js';
import { safeHref } from './folder-style.js';
import { prefs } from '../../core/local-prefs.js';

/** v2.3.0: a plain click on a link opens the Preview (setting "Open links in"); Ctrl, Cmd, Shift, a middle click or the setting "New tab" keep the normal browser link. Returns true when it handled the click. */
export function openInPreview(e, l, router) {
  if (e.defaultPrevented || (e.button || 0) > 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
  if (prefs.get('lib.openIn', 'preview') !== 'preview') return false;
  e.preventDefault(); router.navigate(`/link/${encodeURIComponent(l.id)}`); return true;
}
export const openLink = (l) => { const href = safeHref(l.url); if (href !== '#') { window.open(href, '_blank', 'noopener,noreferrer'); import('../../core/app-data.js').then((d) => d.recordOpen(l, 'click')).catch(() => {}); } };   // dynamic: app-data reaches this module through the import jobs   // v2.4.1: opening the site itself goes to History
export async function copyText(text, done = 'Copied.') {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast('Copy is blocked by the browser.', { type: 'error' }); }
}
export function normalizeTags(text) {
  const seen = new Set(), out = [];
  for (const t of String(text || '').split(/[,\n;]/)) { const v = t.trim().replace(/\s+/g, ' ').slice(0, 30); if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); } }
  return out.join(',').slice(0, 200);
}

/** Applies patchOf(link) to the links, remembers the old values, and offers Undo in the toast. Returns how many links changed. */
export async function patchWithUndo(engine, ids, patchOf, message) {
  const patches = new Map(), prev = new Map();
  for (const id of ids) {
    const l = engine.getLink(id); if (!l) continue;
    const p = patchOf(l); if (!p || !Object.keys(p).length) continue;
    patches.set(id, p); prev.set(id, Object.fromEntries(Object.keys(p).map((k) => [k, l[k] ?? null])));
  }
  if (!patches.size) return 0;
  await engine.updateLinks([...patches.keys()], (l) => patches.get(l.id) || {});
  // v2.3.1: one link whose points changed shows its new points in the toast (diamond icon + number)
  const only = patches.size === 1 ? [...patches.values()][0] : null;
  toast(message(patches.size), { duration: 6000, points: only && typeof only.pt === 'number' ? only.pt : null, action: { label: 'Undo', onClick: () => engine.updateLinks([...prev.keys()], (l) => prev.get(l.id) || {}) } });
  return patches.size;
}

/** Why a point action changed nothing: a blocked link keeps 0, or the number is already at the cap or the floor. */
function noChange(engine, ids, dir) {
  const l = engine.getLink(ids[0]);
  if (l && l.bl) return 'A blocked link does not get points.';
  return dir === 'up' ? `Already at the highest points (${P.MAX}).` : 'Already at the lowest points.';
}
export const bulk = {
  async favourite(engine, ids) { const all = ids.every((i) => engine.getLink(i)?.fv); return patchWithUndo(engine, ids, (l) => (all ? P.unfavourite(l) : P.favourite(l)), (n) => `${all ? 'Removed from' : 'Added to'} favourites: ${plural(n, 'link')}.`); },
  async block(engine, ids) { const all = ids.every((i) => engine.getLink(i)?.bl); return patchWithUndo(engine, ids, (l) => (all ? P.unblock(l) : P.block(l)), (n) => `${all ? 'Unblocked' : 'Blocked from Random'}: ${plural(n, 'link')}.`); },
  // v2.3.1: read later gives +200 points (taking it away gives them back) so such links come up more often in Random
  async readLater(engine, ids) { const all = ids.every((i) => engine.getLink(i)?.rl); return patchWithUndo(engine, ids, (l) => (all ? P.unreadLater(l) : P.readLater(l)), (n) => `${all ? 'Removed from' : 'Added to'} read later: ${plural(n, 'link')}.`); },
  async pin(engine, ids) { const all = ids.every((i) => engine.getLink(i)?.pn); return patchWithUndo(engine, ids, () => ({ pn: all ? null : true }), (n) => `${all ? 'Unpinned' : 'Pinned'}: ${plural(n, 'link')}.`); },
  async addTags(engine, ids) {
    const text = await openTextPrompt({ title: ids.length > 1 ? `Add tags to ${plural(ids.length, 'link')}` : 'Add tags', label: 'Tags', placeholder: 'work, read, idea', help: 'Separate tags with commas.', confirmLabel: 'Add tags' });
    const add = normalizeTags(text); if (!add) return 0;
    return patchWithUndo(engine, ids, (l) => ({ tags: normalizeTags(`${l.tags || ''},${add}`) || null }), (n) => `Tags added to ${plural(n, 'link')}.`);
  },
  async editTags(engine, ids) {
    const l = engine.getLink(ids[0]); if (!l) return 0;
    const text = await openTextPrompt({ title: 'Edit tags', label: 'Tags', value: (l.tags || '').split(',').join(', '), placeholder: 'work, read, idea', help: 'Separate tags with commas.' });
    if (text == null) return 0;
    return patchWithUndo(engine, ids, () => ({ tags: normalizeTags(text) || null }), () => 'Tags saved.');
  },
  // ! Unused since v2.2.1: replaced by editLink() (title and address in one sheet). Kept, not deleted; safe to remove in a later cleanup.
  async editTitle(engine, ids) {
    const l = engine.getLink(ids[0]); if (!l) return 0;
    const text = await openTextPrompt({ title: 'Edit title', label: 'Title', value: l.title || '', placeholder: l.host || 'Title', maxLength: 300, help: 'Your title is kept when metadata is fetched again.' });
    if (text == null) return 0;
    return patchWithUndo(engine, ids, () => (text ? { title: text, tEdit: true } : { title: null, tEdit: null }), () => 'Title saved.');
  },
  /** v2.2.1: one Edit sheet for the title AND the address (owner request). A changed address keeps the link's flags and points, updates the host,
   *  and is refused when another saved link already has it. A title typed here is kept when titles are fetched again (tEdit). */
  async editLink(engine, ids) {
    const l = engine.getLink(ids[0]); if (!l) return 0;
    return new Promise((resolve) => {
      let done = 0;
      const title = h('input', { class: 'input', value: l.title || '', placeholder: l.host || 'Title', maxlength: '300', 'aria-label': 'Title', autocomplete: 'off' });
      const url = h('input', { class: 'input', value: l.url, maxlength: '2048', inputmode: 'url', 'aria-label': 'Address', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      // v2.3.0: the same sheet now also edits the description and the tags (Preview > Details > Edit link)
      const desc = h('textarea', { class: 'input', rows: '3', maxlength: '300', value: l.desc || '', 'aria-label': 'Description', placeholder: 'Add a short note about this link' });
      const tags = h('input', { class: 'input', value: (l.tags || '').split(',').filter(Boolean).join(', '), maxlength: '200', 'aria-label': 'Tags', placeholder: 'work, read, idea', autocomplete: 'off' });
      const note = h('p', { class: 'help is-error', role: 'alert' });
      const save = async () => {
        const nextUrl = url.value.trim(); const parsed = parseUrl(nextUrl, { assumeHttps: true });
        if (!parsed) { note.textContent = 'This does not look like a web address.'; url.focus(); return false; }
        const href = parsed.toString(); const clash = dedupeKey(href) !== dedupeKey(l.url) && engine.findByUrl(href);
        if (clash) { note.textContent = `Already saved in "${engine.getFolder(clash.fid)?.name || 'another folder'}".`; return false; }
        const t = title.value.trim(); const patch = {};
        if (href !== l.url) { patch.url = href; patch.host = hostOf(href); }
        if (t !== (l.title || '')) { if (t) { patch.title = t; patch.tEdit = true; } else { patch.title = null; patch.tEdit = null; } }
        const d = desc.value.trim(); if (d !== (l.desc || '')) patch.desc = d || null;
        const tg = normalizeTags(tags.value) || null; if (tg !== (l.tags || null)) patch.tags = tg;
        if (Object.keys(patch).length) { done = await patchWithUndo(engine, ids, () => patch, () => 'Link saved.'); }
        return true;
      };
      const sheet = openSheet({ title: 'Edit link', body: h('div', { class: 'form' }, h('label', { class: 'label', text: 'Title' }), title, h('label', { class: 'label', text: 'Address' }), url, h('label', { class: 'label', text: 'Description' }), desc, h('label', { class: 'label', text: 'Tags' }), tags, note, h('p', { class: 'help', text: 'Your title and description are kept when details are fetched again.' })),
        actions: [{ label: 'Cancel', variant: 'quiet' }, { label: 'Save', variant: 'primary', onClick: async () => (await save()) }], onClose: () => resolve(done) });
      for (const i of [title, url]) i.addEventListener('keydown', async (e) => { if (e.key === 'Enter') { e.preventDefault(); if (await save()) sheet.close(); } });
      setTimeout(() => title.focus(), 60);
    });
  },
  async like(engine, ids) { const n = await patchWithUndo(engine, ids, (l) => P.like(l), (c) => (c === 1 ? 'Points up.' : `Points raised for ${plural(c, 'link')}.`)); if (!n) toast(noChange(engine, ids, 'up')); return n; },
  async dislike(engine, ids) { const n = await patchWithUndo(engine, ids, (l) => P.dislike(l), (c) => (c === 1 ? 'Points down.' : `Points lowered for ${plural(c, 'link')}.`)); if (!n) toast(noChange(engine, ids, 'down')); return n; },
  async move(engine, ids) {
    const from = new Map(ids.map((i) => [i, engine.getLink(i)?.fid]));
    const fid = await openFolderPicker({ engine, title: `Move ${plural(ids.length, 'link')} to`, exclude: ids.length === 1 ? [from.get(ids[0])] : [] });
    if (!fid) return 0;
    await engine.moveLinks(ids, fid);
    toast(`Moved ${plural(ids.length, 'link')} to "${engine.getFolder(fid)?.name}".`, { duration: 6000, action: { label: 'Undo', onClick: async () => { const groups = new Map(); for (const [id, f] of from) { if (!groups.has(f)) groups.set(f, []); groups.get(f).push(id); } for (const [f, list] of groups) if (engine.getFolder(f)) await engine.moveLinks(list, f); } } });
    return ids.length;
  },
  async copy(engine, ids) {
    const fid = await openFolderPicker({ engine, title: `Copy ${plural(ids.length, 'link')} to` });
    if (!fid) return 0;
    const items = ids.map((i) => engine.getLink(i)).filter(Boolean).map(({ id, fid: _f, up, del, imp, ...fields }) => fields);
    const r = await engine.addLinks(items, { fid, dedupe: false });
    const copied = r.added.map((l) => l.id);
    toast(`Copied ${plural(copied.length, 'link')} to "${engine.getFolder(fid)?.name}".`, { duration: 6000, action: { label: 'Undo', onClick: () => engine.purgeLinks(copied) } });
    return copied.length;
  },
  async remove(engine, ids, { ask = false } = {}) {
    if (ask && !(await confirmDialog({ title: `Delete ${plural(ids.length, 'link')}?`, message: 'They move to the Recycle Bin for 15 days.', confirmLabel: 'Delete', danger: true }))) return 0;
    await engine.deleteLinks(ids);
    await logActivity(engine, 'delete', plural(ids.length, 'link'));
    toast(`Deleted ${plural(ids.length, 'link')}.`, { duration: 7000, action: { label: 'Undo', onClick: async () => { await engine.restoreLinks(ids); toast('Restored.'); } } });
    return ids.length;
  }
};

/** v2.2.1: shorter menu in four groups (v2.2.2: separated by plain rules, no group names). "Open in new tab" moved next to the three dots (and the row itself opens the link) and "Select" left the
 *  menu because the folder page has a select button. Edit title and Edit tags became Edit link plus Tags. */
export function linkMenuItems({ engine, link: l }) {
  const ids = [l.id];
  return [
    { label: 'Edit link', icon: 'edit', onSelect: () => bulk.editLink(engine, ids) },
    { label: l.tags ? 'Edit tags' : 'Add tags', icon: 'tag', onSelect: () => bulk.editTags(engine, ids) },
    { label: 'Copy URL', icon: 'copy', onSelect: () => copyText(l.url, 'Link copied.') },
    { separator: true },
    { label: l.pn ? 'Unpin' : 'Pin to top', icon: 'pin', onSelect: () => bulk.pin(engine, ids) },
    { label: l.fv ? 'Remove from favourites' : 'Add to favourites', icon: 'heart', onSelect: () => bulk.favourite(engine, ids) },
    { label: l.rl ? 'Remove from read later' : 'Read later', icon: 'clock', onSelect: () => bulk.readLater(engine, ids) },
    { label: 'Point up', icon: 'thumb-up', disabled: !P.canLike(l), onSelect: () => bulk.like(engine, ids) },
    { label: 'Point down', icon: 'thumb-down', disabled: !P.canDislike(l), onSelect: () => bulk.dislike(engine, ids) },
    { label: l.bl ? 'Unblock from Random' : 'Block from Random', icon: 'block', onSelect: () => bulk.block(engine, ids) },
    { label: l.dd ? 'Check link again' : 'Check link', icon: 'refresh', onSelect: () => import('../check/check-sheet.js').then((m) => import('../../core/app-data.js').then((d) => m.runCheck({ engine, queue: d.getQueue(), router: null, ids }))) },   // v2.3.0
    { separator: true },
    { label: 'Move to folder', icon: 'folder', onSelect: () => bulk.move(engine, ids) },
    { label: 'Copy to folder', icon: 'copy', onSelect: () => bulk.copy(engine, ids) },
    { separator: true },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: () => bulk.remove(engine, ids) }
  ];
}
