/**
 * Linkivo — js/features/profile/profile-edit.js  (v2.4.3)
 * Purpose: the "Edit profile" popup (owner): photo (choose, crop square, compress, upload through the Worker to imgbb, the old photo is removed), one of four
 *          premade banners, name, bio, country, website. Everything is private (rules: the owner and admins read it). Only changed fields are written.
 * API: openProfileEdit({ session, adapter, profile, now, onSaved(profile) })
 *      buildPatch(draft, profile) -> patch   (pure, tested)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { setSession } from '../../core/session.js';
import { BANNERS, bannerUrl, photoFileName, saveProfile } from '../../core/profile-data.js';
import { uploadImage, deleteImage } from '../../core/worker-client.js';
import { avatar } from '../shell/shell-parts.js';
import { pickAndCrop } from './image-crop.js';

/** Only what differs from the saved profile; an emptied text clears the field. */
export function buildPatch(draft, profile = {}) {
  const patch = {};
  for (const k of ['name', 'bio', 'country', 'site', 'banner']) { const a = String(draft[k] || '').trim(), b = String(profile[k] || ''); if (a !== b) patch[k] = a; }
  return patch;
}
const ERR = { not_configured: 'Photo upload is not set up yet. The Worker needs the imgbb key.', rate_limited: 'Too many photo uploads. Try again in a while.', too_large: 'That photo is too large.', unauthorized: 'Sign in again to change the photo.' };

export function openProfileEdit({ session, adapter, profile = {}, now = () => Date.now(), onSaved = () => {} }) {
  const u = session.user, draft = { name: profile.name || u.name || '', bio: profile.bio || '', country: profile.country || '', site: profile.site || '', banner: profile.banner || BANNERS[0] };
  let newPhoto = null, removePhoto = false, busy = false, sheet = null;
  const photoNow = () => (removePhoto ? '' : newPhoto ? `data:image/jpeg;base64,${newPhoto}` : profile.photo || u.photo || '');
  const preview = h('div', { class: 'pe-photo' }), bannerRow = h('div', { class: 'pe-banners', role: 'radiogroup', 'aria-label': 'Banner' });
  const paintPhoto = () => { preview.replaceChildren(avatar(draft.name || u.name, true, photoNow())); remove.hidden = !photoNow(); };
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1' });
  const upload = h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => file.click() } }, icon('image', { size: 16 }), 'Upload photo');
  const remove = h('button', { type: 'button', class: 'btn btn-sm btn-quiet', on: { click: () => { newPhoto = null; removePhoto = true; paintPhoto(); } } }, 'Remove');
  file.addEventListener('change', async () => { const f = file.files && file.files[0]; file.value = ''; const b64 = await pickAndCrop(f); if (b64) { newPhoto = b64; removePhoto = false; paintPhoto(); } else if (f) toast('That file could not be used as a photo.'); });
  const paintBanners = () => bannerRow.replaceChildren(...BANNERS.map((id, i) => { const b = h('button', { type: 'button', class: ['pe-banner', draft.banner === id && 'is-on'], role: 'radio', 'aria-checked': String(draft.banner === id), 'aria-label': `Banner ${i + 1}`, style: { backgroundImage: `url(${bannerUrl(id)})` }, on: { click: () => { draft.banner = id; paintBanners(); } } }); return b; }));
  const field = (label, key, { max, area = false, ph = '' } = {}) => {
    const el = h(area ? 'textarea' : 'input', { class: area ? 'input pe-area' : 'input', maxlength: String(max), placeholder: ph, 'aria-label': label, value: draft[key], rows: area ? '3' : null, autocomplete: 'off' });
    if (area) el.value = draft[key];
    el.addEventListener('input', () => { draft[key] = el.value; if (key === 'name') paintPhoto(); });
    return h('label', { class: 'pe-f' }, h('span', { class: 'pe-l', text: label }), el);
  };
  const save = h('button', { type: 'button', class: 'btn btn-primary', on: { click: onSave } }, 'Save');
  async function onSave() {
    if (busy) return; busy = true; save.disabled = true; save.textContent = 'Saving...';
    try {
      const patch = buildPatch(draft, profile), oldDel = profile.photoDel || '';
      if (newPhoto) { const up = await uploadImage(newPhoto, photoFileName(draft.name || u.name, u.uid, now())); Object.assign(patch, { photo: up.url, photoDel: up.deleteUrl || '', photoAt: now() }); }
      else if (removePhoto && (profile.photo || oldDel)) Object.assign(patch, { photo: '', photoDel: '', photoAt: 0 });
      const next = Object.keys(patch).length ? await saveProfile(adapter, u.uid, patch) : profile;
      if (oldDel && (newPhoto || removePhoto)) deleteImage(oldDel);   // the replaced photo leaves imgbb (best effort, not awaited)
      setSession({ user: { ...u, name: next.name || u.name, photo: next.photo || u.photo } });
      toast('Profile saved.'); onSaved(next); sheet && sheet.close();
    } catch (e) { toast(ERR[e && e.message] || 'Could not save the profile. Check your connection.', { type: 'error' }); busy = false; save.disabled = false; save.textContent = 'Save'; }
  }
  const body = h('div', { class: 'pe' },
    h('div', { class: 'pe-top' }, preview, h('div', { class: 'pe-photo-btns' }, upload, remove, h('p', { class: 'pe-note', text: 'Square photo, compressed before it is uploaded.' })), file),
    h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Banner' }), bannerRow),
    field('Name', 'name', { max: 60, ph: 'Your name' }), field('Bio', 'bio', { max: 200, area: true, ph: 'A short line about you' }),
    h('div', { class: 'pe-two' }, field('Country', 'country', { max: 60, ph: 'Country' }), field('Website', 'site', { max: 200, ph: 'https://' })),
    h('p', { class: 'pe-note', text: 'Your profile details are private. Only you and the Linkivo admin can see them.' }),
    h('div', { class: 'crop-actions' }, h('button', { type: 'button', class: 'btn', on: { click: () => sheet && sheet.close() } }, 'Cancel'), save));
  paintPhoto(); paintBanners();
  sheet = openSheet({ title: 'Edit profile', body, actions: [], wide: false });
  return sheet;
}
