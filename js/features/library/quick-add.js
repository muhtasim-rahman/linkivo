/**
 * Linkivo — js/features/library/quick-add.js  (v2.2.0)
 * Purpose: save one link fast. Accepts a pasted address or a bare domain, warns when the link is already saved (and where), remembers the last
 *          folder, and starts a metadata fetch for the new link. With the "clipboard link detection" setting on, a link found in the clipboard when
 *          the sheet opens is filled in (the browser may ask for permission; a refusal is ignored).
 * API: openQuickAdd({ engine, queue?, fid? }) -> Promise<link|null>
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';
import { extractLinks } from '../../core/extract.js';
import { prefs } from '../../core/local-prefs.js';
import { openFolderPicker, openFolderForm } from './pickers.js';
import { pref, LIB } from './lib-prefs.js';

const LAST = 'lib.lastFolder';

export function openQuickAdd({ engine, queue = null, fid = null }) {
  return new Promise((resolve) => {
    let saved = null;
    let target = fid && engine.getFolder(fid) ? fid : (engine.getFolder(prefs.get(LAST, '')) ? prefs.get(LAST, '') : engine.listFolders()[0]?.id || null);
    const url = h('input', { class: 'input', type: 'text', inputmode: 'url', placeholder: 'Paste a link or type a domain', 'aria-label': 'Link', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const title = h('input', { class: 'input', type: 'text', placeholder: 'Title (optional, fetched for you)', 'aria-label': 'Title', maxlength: '300', autocomplete: 'off' });
    const note = h('p', { class: 'help', role: 'status' });
    const folderBtn = h('button', { type: 'button', class: 'btn btn-ghost qa-folder', on: { click: async () => { const f = await openFolderPicker({ engine, title: 'Save to' }); if (f) { target = f; paint(); } } } });
    const hit = () => extractLinks(url.value.trim(), { bare: true })[0] || null;

    function paint() {
      const f = target && engine.getFolder(target);
      folderBtn.replaceChildren(icon('folder', { size: 18 }), h('span', { text: f ? f.name : 'Choose a folder' }), icon('chevron-down', { size: 16 }));
      const l = hit(); const dup = l && engine.findByUrl(l.url);
      note.textContent = !url.value.trim() ? '' : !l ? 'This does not look like a web address.' : dup ? `Already saved in "${engine.getFolder(dup.fid)?.name || 'a folder'}".` : '';
      note.classList.toggle('is-error', !!url.value.trim() && (!l || !!dup));
    }
    url.addEventListener('input', paint);
    async function paste() {
      try { const t = await navigator.clipboard.readText(); const l = extractLinks(t, { bare: true })[0]; if (l) { url.value = l.url; paint(); return true; } toast('No link in the clipboard.'); } catch { toast('The browser blocked clipboard access.', { type: 'error' }); }
      return false;
    }
    async function save() {
      const l = hit();
      if (!l) { toast('Enter a valid web address.', { type: 'error' }); url.focus(); return; }
      try {
        if (!target) { const f = await openFolderForm({ engine }); if (!f) return; target = f.id; }
        const r = await engine.addLinks([{ url: l.url, title: title.value.trim() || l.title, tEdit: title.value.trim() ? true : undefined }], { fid: target, dedupe: true });
        if (!r.added.length) { toast(r.skipped ? 'This link is already saved.' : 'This address can not be saved.', { type: 'error' }); return; }
        saved = r.added[0]; prefs.set(LAST, target);
        if (queue && pref(LIB.impEnrich) && !title.value.trim()) queue.enqueue({ type: 'enrich', title: 'Fetching title', params: { ids: [saved.id] }, chip: false }).catch(() => {});
        toast(`Saved to "${engine.getFolder(target).name}".`);
        sheet.close();
      } catch { toast('The link could not be saved.', { type: 'error' }); }
    }
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const sheet = openSheet({ title: 'Add a link', body: h('div', { class: 'form' },
      h('div', { class: 'qa-row' }, url, h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Paste from clipboard', on: { click: paste } }, icon('copy', { size: 18 }), 'Paste')), note, title,
      h('span', { class: 'label', text: 'Save to' }), folderBtn),
    actions: [{ label: 'Cancel', variant: 'quiet', closes: false, onClick: () => sheet.close() }, { label: 'Save link', variant: 'primary', closes: false, onClick: save }], onClose: () => resolve(saved) });
    paint(); setTimeout(async () => { url.focus(); if (pref(LIB.clipboard) && !url.value) await paste().catch(() => {}); }, 80);
  });
}
