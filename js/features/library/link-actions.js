/**
 * Linkivo — js/features/library/link-actions.js  (v2.2.0)
 * Purpose: every action on one link or on a selection of links, with Undo. The folder page, the link menu and the bulk bar all call these.
 *          Points follow the fixed owner rules in engine/points.js (normal preview context: like and dislike once a week per link).
 * API: linkMenuItems({ engine, link }) -> menu items       bulk = { ... }  each (engine, ids) -> Promise
 *      openLink(link)  copyText(text)  patchWithUndo(engine, ids, patchOf, message)  normalizeTags(text)
 */
import { toast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/confirm.js';
import { plural } from '../../core/format.js';
import { logActivity } from '../../core/activity.js';
import * as P from '../../engine/points.js';
import { openFolderPicker, openTextPrompt } from './pickers.js';
import { safeHref } from './folder-style.js';

export const openLink = (l) => { const href = safeHref(l.url); if (href !== '#') window.open(href, '_blank', 'noopener,noreferrer'); };
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
  toast(message(patches.size), { duration: 6000, action: { label: 'Undo', onClick: () => engine.updateLinks([...prev.keys()], (l) => prev.get(l.id) || {}) } });
  return patches.size;
}

const LIMIT_MSG = 'Points can change once a week for each link.';
export const bulk = {
  async favourite(engine, ids) { const all = ids.every((i) => engine.getLink(i)?.fv); return patchWithUndo(engine, ids, (l) => (all ? P.unfavourite(l) : P.favourite(l)), (n) => `${all ? 'Removed from' : 'Added to'} favourites: ${plural(n, 'link')}.`); },
  async block(engine, ids) { const all = ids.every((i) => engine.getLink(i)?.bl); return patchWithUndo(engine, ids, (l) => (all ? P.unblock(l) : P.block(l)), (n) => `${all ? 'Unblocked' : 'Blocked from Random'}: ${plural(n, 'link')}.`); },
  async readLater(engine, ids) { const all = ids.every((i) => engine.getLink(i)?.rl); return patchWithUndo(engine, ids, (l) => ({ rl: all ? null : true }), (n) => `${all ? 'Removed from' : 'Added to'} read later: ${plural(n, 'link')}.`); },
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
  async editTitle(engine, ids) {
    const l = engine.getLink(ids[0]); if (!l) return 0;
    const text = await openTextPrompt({ title: 'Edit title', label: 'Title', value: l.title || '', placeholder: l.host || 'Title', maxLength: 300, help: 'Your title is kept when metadata is fetched again.' });
    if (text == null) return 0;
    return patchWithUndo(engine, ids, () => (text ? { title: text, tEdit: true } : { title: null, tEdit: null }), () => 'Title saved.');
  },
  async like(engine, ids) { const n = await patchWithUndo(engine, ids, (l) => P.like(l, { random: false, now: engine.now() }), (c) => `Points raised for ${plural(c, 'link')}.`); if (!n) toast(LIMIT_MSG); return n; },
  async dislike(engine, ids) { const n = await patchWithUndo(engine, ids, (l) => P.dislike(l, { random: false, now: engine.now() }), (c) => `Points lowered for ${plural(c, 'link')}.`); if (!n) toast(LIMIT_MSG); return n; },
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

export function linkMenuItems({ engine, link: l, onSelect = null }) {
  const ids = [l.id];
  return [
    { label: 'Open in new tab', icon: 'external', onSelect: () => openLink(l) },
    { label: 'Copy URL', icon: 'copy', onSelect: () => copyText(l.url, 'Link copied.') },
    { label: 'Edit title', icon: 'edit', onSelect: () => bulk.editTitle(engine, ids) },
    { label: l.tags ? 'Edit tags' : 'Add tags', icon: 'tag', onSelect: () => bulk.editTags(engine, ids) },
    { separator: true },
    { label: l.pn ? 'Unpin' : 'Pin to top', icon: 'pin', onSelect: () => bulk.pin(engine, ids) },
    { label: l.fv ? 'Remove from favourites' : 'Add to favourites', icon: 'star', onSelect: () => bulk.favourite(engine, ids) },
    { label: l.rl ? 'Remove from read later' : 'Read later', icon: 'clock', onSelect: () => bulk.readLater(engine, ids) },
    { label: 'Point up', icon: 'thumb-up', disabled: !P.canLike(l, { random: false, now: engine.now() }), onSelect: () => bulk.like(engine, ids) },
    { label: 'Point down', icon: 'thumb-down', disabled: !P.canDislike(l, { random: false, now: engine.now() }), onSelect: () => bulk.dislike(engine, ids) },
    { separator: true },
    { label: 'Move to folder', icon: 'folder', onSelect: () => bulk.move(engine, ids) },
    { label: 'Copy to folder', icon: 'copy', onSelect: () => bulk.copy(engine, ids) },
    { label: l.bl ? 'Unblock from Random' : 'Block from Random', icon: 'block', onSelect: () => bulk.block(engine, ids) },
    onSelect && { label: 'Select', icon: 'check-square', onSelect },
    { label: 'Delete', icon: 'trash', danger: true, onSelect: () => bulk.remove(engine, ids) }
  ].filter(Boolean);
}
