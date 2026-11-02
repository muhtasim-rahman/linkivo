/**
 * Linkivo — js/features/profile/profile-edit.js  (v2.4.3, reworked v2.4.4)
 * Purpose: the "Edit profile" popup. Photo (choose, crop square INSIDE this popup, compress, upload through the Worker to imgbb, the old photo is removed), one of six premade
 *          banners in a scrollable row, the colour of the ring around the photo (ten templates, a custom colour, or Default = follow the app accent), for admins the colour of the
 *          Admin badge, and the details: name, headline, bio, interests, country (dropdown with flags), city, birthday, languages, pronouns, website. Long texts have small limits.
 *          Everything is private (rules: the owner and admins read it). Only changed fields are written. v2.4.4 (owner): choosing a photo no longer closes the popup or loses the
 *          typed changes; closing with unsaved changes (the X, the scrim, Escape, Cancel) asks before it discards.
 * API: openProfileEdit({ session, adapter, profile, now, isAdmin, onSaved(profile) })      buildPatch(draft, profile) -> patch   hasChanges(draft, profile, photoChanged) -> boolean   (pure, tested)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { attachFade } from '../../ui/edge-fade.js';
import { setSession } from '../../core/session.js';
import { BANNERS, PALETTE, bannerUrl, photoFileName, saveProfile, applyProfileLook, isColor } from '../../core/profile-data.js';
import { uploadImage, deleteImage } from '../../core/worker-client.js';
import { avatar } from '../shell/shell-parts.js';
import { pickAndCrop } from './image-crop.js';
import { buildCountryPicker } from './country-picker.js';

const TEXT_KEYS = ['name', 'headline', 'bio', 'interests', 'country', 'city', 'birthday', 'languages', 'pronouns', 'site', 'banner', 'ring', 'adminColor'];
/** Only what differs from the saved profile; an emptied text clears the field. */
export function buildPatch(draft, profile = {}) {
  const patch = {};
  for (const k of TEXT_KEYS) { const a = String(draft[k] || '').trim(), b = String(profile[k] || ''); if (a !== b) patch[k] = a; }
  return patch;
}
export const hasChanges = (draft, profile, photoChanged) => !!photoChanged || Object.keys(buildPatch(draft, profile)).length > 0;
const ERR = { not_configured: 'Photo upload is not set up yet. The Worker needs the imgbb key.', rate_limited: 'Too many photo uploads. Try again in a while.', too_large: 'That photo is too large.', unauthorized: 'Sign in again to change the photo.' };

/** A row of colour dots: Default (follows the accent), ten templates, and a custom colour. `get/set` hold '' or '#rrggbb'. */
function colorRow({ get, set, label }) {
  const row = h('div', { class: 'pe-colors', role: 'radiogroup', 'aria-label': label });
  const custom = h('input', { type: 'color', class: 'pe-color-in', 'aria-label': `${label}: custom colour`, value: isColor(get()) ? get() : '#3b82f6' });
  custom.addEventListener('input', () => { set(custom.value); paint(); });
  function paint() {
    const cur = get(), inPalette = PALETTE.some(([c]) => c === cur);
    row.replaceChildren(
      h('button', { type: 'button', class: ['pe-dot is-default', !cur && 'is-on'], role: 'radio', 'aria-checked': String(!cur), 'aria-label': 'Default: follows the app accent', 'data-tip': 'Default (app accent)', on: { click: () => { set(''); paint(); } } }, icon('refresh', { size: 14 })),
      ...PALETTE.map(([c, name]) => h('button', { type: 'button', class: ['pe-dot', cur === c && 'is-on'], role: 'radio', 'aria-checked': String(cur === c), 'aria-label': name, 'data-tip': name, style: { '--dot': c }, on: { click: () => { set(c); paint(); } } })),
      h('label', { class: ['pe-dot is-custom', isColor(cur) && !inPalette && 'is-on'], 'data-tip': 'Custom colour', style: isColor(cur) && !inPalette ? { '--dot': cur } : {} }, icon('palette', { size: 14 }), custom));
  }
  paint(); return { el: row, paint, fade: attachFade(row) };
}

export function openProfileEdit({ session, adapter, profile = {}, now = () => Date.now(), isAdmin = false, onSaved = () => {} }) {
  const u = session.user, draft = {};
  for (const k of TEXT_KEYS) draft[k] = profile[k] || '';
  draft.name = profile.name || u.name || ''; draft.banner = profile.banner || BANNERS[0];
  let newPhoto = null, removePhoto = false, busy = false, sheet = null, crop = null;
  const photoChanged = () => !!newPhoto || removePhoto;
  const photoNow = () => (removePhoto ? '' : newPhoto ? `data:image/jpeg;base64,${newPhoto}` : profile.photo || u.photo || '');

  // ---- photo, banner, colours ------------------------------------------------------------------------------------------------------------
  const preview = h('div', { class: 'pe-photo' });
  const paintPhoto = () => { preview.style.setProperty('--ring', isColor(draft.ring) ? draft.ring : 'var(--accent)'); preview.replaceChildren(avatar(draft.name || u.name, true, photoNow())); remove.hidden = !photoNow(); };
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1' });
  const upload = h('button', { type: 'button', class: 'btn btn-sm', on: { click: () => file.click() } }, icon('image', { size: 16 }), 'Upload photo');
  const remove = h('button', { type: 'button', class: 'btn btn-sm btn-quiet', on: { click: () => { newPhoto = null; removePhoto = true; paintPhoto(); } } }, 'Remove');
  const form = h('div', { class: 'pe' }), cropHost = h('div', { class: 'pe-crop', hidden: true });
  file.addEventListener('change', () => {
    const f = file.files && file.files[0]; file.value = ''; if (!f) return;
    form.hidden = true; cropHost.hidden = false;   // the crop window replaces the form for a moment; the form (and what was typed) stays in place
    crop = pickAndCrop(f, cropHost);
    crop.done.then((b64) => { crop = null; cropHost.hidden = true; form.hidden = false; if (b64) { newPhoto = b64; removePhoto = false; paintPhoto(); } else if (f && !b64) { /* cancelled or unreadable */ } });
  });
  const bannerRow = h('div', { class: 'pe-banners', role: 'radiogroup', 'aria-label': 'Banner' });
  const bannerFade = attachFade(bannerRow);
  const paintBanners = () => { bannerRow.replaceChildren(...BANNERS.map((id, i) => h('button', { type: 'button', class: ['pe-banner', draft.banner === id && 'is-on'], role: 'radio', 'aria-checked': String(draft.banner === id), 'aria-label': `Banner ${i + 1}`, style: { backgroundImage: `url(${bannerUrl(id)})` }, on: { click: () => { draft.banner = id; paintBanners(); } } }))); bannerFade.update(); };
  const ring = colorRow({ label: 'Photo ring colour', get: () => draft.ring, set: (v) => { draft.ring = v; paintPhoto(); } });
  const adminColor = isAdmin ? colorRow({ label: 'Admin badge colour', get: () => draft.adminColor, set: (v) => { draft.adminColor = v; applyProfileLook({ adminColor: v }); } }) : null;

  // ---- text fields -----------------------------------------------------------------------------------------------------------------------
  const counters = [];
  const field = (label, key, { max, area = false, ph = '', type = 'text' } = {}) => {
    const el = h(area ? 'textarea' : 'input', { class: area ? 'input pe-area' : 'input', maxlength: String(max || 60), placeholder: ph, 'aria-label': label, type: area ? null : type, rows: area ? '3' : null, autocomplete: 'off' });
    el.value = draft[key];
    const count = max && max <= 200 && area ? h('span', { class: 'pe-count', text: `${el.value.length}/${max}` }) : null;
    el.addEventListener('input', () => { draft[key] = el.value; if (count) count.textContent = `${el.value.length}/${max}`; if (key === 'name') paintPhoto(); });
    return h('label', { class: 'pe-f' }, h('span', { class: 'pe-l' }, label, count), el);
  };
  const country = buildCountryPicker({ value: draft.country, onChange: (v) => { draft.country = v; } });
  const group = (title, ...kids) => h('fieldset', { class: 'pe-group' }, h('legend', { class: 'pe-legend', text: title }), ...kids.filter(Boolean));

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
      applyProfileLook(next); toast('Profile saved.'); saved = true; onSaved(next); sheet && sheet.close();
    } catch (e) { toast(ERR[e && e.message] || 'Could not save the profile. Check your connection.', { type: 'error' }); busy = false; save.disabled = false; save.textContent = 'Save'; }
  }
  let saved = false;
  form.append(
    group('Photo and look',
      h('div', { class: 'pe-top' }, preview, h('div', { class: 'pe-photo-btns' }, upload, remove, h('p', { class: 'pe-note', text: 'Square photo, compressed before it is uploaded.' })), file),
      h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Banner' }), bannerRow),
      h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Ring around the photo' }), ring.el),
      adminColor && h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Admin badge colour' }), adminColor.el)),
    group('About you', field('Name', 'name', { max: 60, ph: 'Your name' }), field('Headline', 'headline', { max: 60, ph: 'What you do, in a few words' }), field('Bio', 'bio', { max: 200, area: true, ph: 'A short line about you' }), field('Interests', 'interests', { max: 120, ph: 'Separate with commas' })),
    group('Details', h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Country' }), country.el),
      h('div', { class: 'pe-two' }, field('City', 'city', { max: 60, ph: 'City' }), field('Pronouns', 'pronouns', { max: 20, ph: 'e.g. he/him' })),
      h('div', { class: 'pe-two' }, field('Birthday', 'birthday', { max: 10, type: 'date' }), field('Languages', 'languages', { max: 80, ph: 'e.g. Bangla, English' })),
      field('Website', 'site', { max: 200, ph: 'https://' })),
    h('p', { class: 'pe-note', text: 'Your profile details are private. Only you and the Linkivo admin can see them.' }),
    h('div', { class: 'pe-actions' }, h('button', { type: 'button', class: 'btn', on: { click: () => sheet && sheet.requestClose() } }, 'Cancel'), save));
  paintPhoto(); paintBanners();
  const body = h('div', null, form, cropHost);
  sheet = openSheet({ title: 'Edit profile', body, actions: [], wide: true,
    // closing with unsaved changes (X, outside click, Escape, Cancel) asks first; while the crop window is open, closing only leaves the crop
    beforeClose: async () => {
      if (crop) { const c = crop; crop = null; cropHost.hidden = true; form.hidden = false; c.cancel(); return false; }
      if (saved || busy || !hasChanges(draft, profile, photoChanged())) return true;
      return confirmDialog({ title: 'Discard your changes?', message: 'You have changes that are not saved. If you close now they are lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true });
    },
    onClose: () => { country.destroy(); bannerFade.destroy(); ring.fade.destroy(); adminColor && adminColor.fade.destroy(); if (!saved) applyProfileLook(profile); } });
  return sheet;
}
