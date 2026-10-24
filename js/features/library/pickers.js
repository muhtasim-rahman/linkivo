/**
 * Linkivo — js/features/library/pickers.js  (v2.2.0)
 * Purpose: the small sheets the Library and folder pages share. Each returns a Promise that resolves when the sheet closes.
 * API: openFolderForm({ engine, folder? }) -> Promise<folderRecord|null>        create or edit: name, color, icon, live preview
 *      openFolderPicker({ engine, title, exclude?, allowNew?, confirmLabel? }) -> Promise<folderId|null>     search, pick, or make a new folder
 *      openTextPrompt({ title, label, value, placeholder, confirmLabel, multiline?, maxLength?, help? }) -> Promise<string|null>
 */
import { h } from '../../core/dom.js';
import { icon, FOLDER_ICONS } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { FOLDER_COLORS, DEFAULT_COLOR, folderTile, colorOf } from './folder-style.js';
import { plural } from '../../core/format.js';

export function openTextPrompt({ title, label = '', value = '', placeholder = '', confirmLabel = 'Save', multiline = false, maxLength = 300, help = '' }) {
  return new Promise((resolve) => {
    let result = null;
    const input = h(multiline ? 'textarea' : 'input', { class: 'input', value, placeholder, maxlength: String(maxLength), 'aria-label': label || title, rows: multiline ? '3' : undefined, autocomplete: 'off' });
    const save = () => { result = input.value.trim(); sheet.close(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !multiline) { e.preventDefault(); save(); } });
    const sheet = openSheet({ title, body: h('div', { class: 'form' }, label && h('label', { class: 'label', text: label }), input, help && h('p', { class: 'help', text: help })),
      actions: [{ label: 'Cancel', variant: 'quiet', closes: false, onClick: () => sheet.close() }, { label: confirmLabel, variant: 'primary', closes: false, onClick: save }], onClose: () => resolve(result) });
    setTimeout(() => { input.focus(); input.select?.(); }, 60);
  });
}

export function openFolderForm({ engine, folder = null }) {
  return new Promise((resolve) => {
    let saved = null;
    const state = { name: folder ? folder.name : '', color: folder ? colorOf(folder) : DEFAULT_COLOR, icon: folder ? folder.icon || 'folder' : 'folder' };
    const preview = h('div', { class: 'ff-preview' });
    const name = h('input', { class: 'input', value: state.name, maxlength: '80', placeholder: 'Folder name', 'aria-label': 'Folder name', autocomplete: 'off' });
    const colors = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Folder color' }, FOLDER_COLORS.map(([hex, label]) => h('button', { type: 'button', class: 'swatch', role: 'radio', style: { '--c': hex }, 'aria-label': label, 'data-tip': label, 'data-v': hex, on: { click: () => { state.color = hex; sync(); } } })));
    const icons = h('div', { class: 'ff-icons', role: 'radiogroup', 'aria-label': 'Folder icon' }, FOLDER_ICONS.map((n) => h('button', { type: 'button', class: 'ff-icon', role: 'radio', 'aria-label': n, 'data-v': n, on: { click: () => { state.icon = n; sync(); } } }, icon(n, { size: 20 }))));
    function sync() {
      preview.replaceChildren(folderTile({ color: state.color, icon: state.icon }, 44), h('span', { class: 'ff-name', text: name.value.trim() || 'Folder name' }));
      for (const b of colors.children) b.setAttribute('aria-checked', String(b.dataset.v === state.color));
      for (const b of icons.children) { b.setAttribute('aria-checked', String(b.dataset.v === state.icon)); b.style.setProperty('--fc', state.color); }
    }
    name.addEventListener('input', sync);
    async function save() {
      const n = name.value.trim();
      if (!n) { toast('Give the folder a name.', { type: 'error' }); name.focus(); return; }
      const dup = engine.listFolders().find((f) => f.name.trim().toLowerCase() === n.toLowerCase() && (!folder || f.id !== folder.id));
      if (dup) { toast('A folder with this name already exists.', { type: 'error' }); name.focus(); return; }
      try {
        saved = folder ? (await engine.updateFolder(folder.id, { name: n, color: state.color, icon: state.icon }), engine.getFolder(folder.id)) : await engine.createFolder({ name: n, color: state.color, icon: state.icon, order: engine.listFolders().length });
        sheet.close();
      } catch (e) { toast('The folder could not be saved.', { type: 'error' }); }
    }
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    const sheet = openSheet({ title: folder ? 'Edit folder' : 'New folder', wide: true, body: h('div', { class: 'form' }, preview, h('label', { class: 'label', text: 'Name' }), name, h('span', { class: 'label', text: 'Color' }), colors, h('span', { class: 'label', text: 'Icon' }), icons),
      actions: [{ label: 'Cancel', variant: 'quiet', closes: false, onClick: () => sheet.close() }, { label: folder ? 'Save' : 'Create folder', variant: 'primary', closes: false, onClick: save }], onClose: () => resolve(saved) });
    sync(); setTimeout(() => name.focus(), 60);
  });
}

export function openFolderPicker({ engine, title = 'Choose a folder', exclude = [], allowNew = true, confirmLabel = '' }) {
  return new Promise((resolve) => {
    let picked = null;
    const skip = new Set(exclude);
    const list = h('div', { class: 'picker-list', role: 'listbox', 'aria-label': 'Folders' });
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search folders', 'aria-label': 'Search folders', autocomplete: 'off' });
    function render() {
      const q = search.value.trim().toLowerCase();
      const rows = engine.listFolders().filter((f) => !skip.has(f.id) && (!q || f.name.toLowerCase().includes(q)));
      list.replaceChildren(...rows.map((f) => h('button', { type: 'button', class: 'picker-row', role: 'option', on: { click: () => { picked = f.id; sheet.close(); } } },
        folderTile(f, 32), h('span', { class: 'picker-name', text: f.name }), h('span', { class: 'picker-sub', text: plural(f.lc || 0, 'link') }))));
      if (!rows.length) list.replaceChildren(h('p', { class: 'help', text: q ? 'No folder matches.' : 'No folders yet. Create one.' }));
    }
    search.addEventListener('input', render);
    const body = h('div', { class: 'form' }, search, list,
      allowNew && h('button', { type: 'button', class: 'btn btn-ghost picker-new', on: { click: async () => { const f = await openFolderForm({ engine }); if (f) { picked = f.id; sheet.close(); } } } }, icon('plus', { size: 18 }), 'New folder'));
    const sheet = openSheet({ title, body, wide: false, actions: [{ label: 'Cancel', variant: 'quiet', closes: false, onClick: () => sheet.close() }], onClose: () => resolve(picked) });
    void confirmLabel; render(); setTimeout(() => search.focus(), 60);
  });
}
