/**
 * Linkivo — js/features/profile/profile-edit.js  (v2.4.3, reworked v2.4.4, redesigned v2.5.0)
 * Purpose: the "Edit profile" popup. Photo (choose, crop square INSIDE this popup, compress, upload through the Worker to imgbb, the old photo is removed), one of six premade
 *          banners in a scrollable row, the colour of the ring around the photo (ten templates, a custom colour, or Default = follow the app accent), for admins the colour of the
 *          Admin badge, and the details: name, headline, bio, interests, country (dropdown with flags), city, birthday, languages, pronouns, website. Long texts have small limits.
 *          Everything is private (rules: the owner and admins read it). Only changed fields are written. v2.4.4 (owner): choosing a photo no longer closes the popup or loses the
 *          typed changes; closing with unsaved changes (the X, the scrim, Escape, Cancel) asks before it discards.
 *          v2.5.0 (owner): a LIVE PREVIEW of the profile card (banner, photo with its ring, the admin shield, name) sits at the top (left column on wide screens) and follows every
 *          choice at once. The photo itself is the upload button: hover or focus shows a picture icon, a click opens Upload / Remove. Banner row = the shared scroll row (it is no
 *          longer redrawn on every tap, which made it jump and stop short of the left edge). Fields are no longer nested inside <label> (a phone could not type in them: base.css
 *          makes labels user-select none on touch screens). There is ONE ring colour (all avatars) and, for admins, one colour for the shield on the photo. Pronouns are gone.
 * API: openProfileEdit({ session, adapter, profile, now, isAdmin, onSaved(profile) })      buildPatch(draft, profile) -> patch   hasChanges(draft, profile, photoChanged) -> boolean   (pure, tested)
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { confirmDialog } from '../../ui/confirm.js';
import { toast } from '../../ui/toast.js';
import { attachFade } from '../../ui/edge-fade.js';
import { buildBannerCarousel } from './banner-carousel.js';
import { openMenu } from '../../ui/popover.js';
import { setSession } from '../../core/session.js';
import { BANNERS, PALETTE, bannerUrl, photoFileName, saveProfile, applyProfileLook, isColor, readableOn } from '../../core/profile-data.js';
import { uploadImage, deleteImage } from '../../core/worker-client.js';
import { avatar } from '../shell/shell-parts.js';
import { pickAndCrop } from './image-crop.js';
import { buildCountryPicker } from './country-picker.js';

const TEXT_KEYS = ['name', 'headline', 'bio', 'interests', 'country', 'city', 'birthday', 'languages', 'site', 'banner', 'ring', 'adminColor'];
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
  custom.addEventListener('input', () => { set(custom.value); paint(); });   // (the colour wheel is part of the row)
  function paint() {
    const cur = get(), inPalette = PALETTE.some(([c]) => c === cur);
    row.replaceChildren(
      h('button', { type: 'button', class: ['pe-dot is-default', !cur && 'is-on'], role: 'radio', 'aria-checked': String(!cur), 'aria-label': 'Default: follows the app accent', 'data-tip': 'Default (app accent)', on: { click: () => { set(''); paint(); } } }, icon('refresh', { size: 14 })),
      ...PALETTE.map(([c, name]) => h('button', { type: 'button', class: ['pe-dot', cur === c && 'is-on'], role: 'radio', 'aria-checked': String(cur === c), 'aria-label': name, 'data-tip': name, style: { '--dot': c }, on: { click: () => { set(c); paint(); } } })),
      h('label', { class: ['pe-dot is-custom', isColor(cur) && !inPalette && 'is-on'], 'data-tip': 'Custom colour', style: isColor(cur) && !inPalette ? { '--dot': cur } : {} }, icon('palette', { size: 14 }), custom));
  }
  paint(); return { el: row, paint, fade: attachFade(row) };
}

export function openProfileEdit({ session, adapter, profile = {}, now = () => Date.now(), isAdmin = false, onSaved = () => {}, title = 'Edit profile', skipLabel = 'Cancel', onClosed = () => {} }) {   // v2.5.4: title, skipLabel and onClosed let the welcome flow (a new account) reuse this popup as its first step
  const u = session.user, draft = {};
  for (const k of TEXT_KEYS) draft[k] = profile[k] || '';
  draft.name = profile.name || u.name || ''; draft.banner = profile.banner || BANNERS[0];
  let newPhoto = null, removePhoto = false, busy = false, sheet = null, crop = null, saved = false;
  const photoChanged = () => !!newPhoto || removePhoto;
  const photoNow = () => (removePhoto ? '' : newPhoto ? `data:image/jpeg;base64,${newPhoto}` : profile.photo || u.photo || '');

  // ---- live preview: the same card as the Profile page, drawn from the draft -------------------------------------------------------------------
  const cover = h('div', { class: 'pe-prev-cover', 'aria-hidden': 'true' });
  const avSlot = h('span', { class: 'pe-av-slot' });
  const nameEl = h('strong', { class: 'pe-prev-name' }), headEl = h('span', { class: 'pe-prev-head' });
  const camBadge = h('span', { class: 'pe-av-cam' }, icon('image', { size: 18 }), h('span', { class: 'pe-av-cam-t', text: 'Change photo' }));
  const avBtn = h('button', { type: 'button', class: 'pe-av', 'aria-haspopup': 'menu', 'aria-label': 'Change photo', 'data-tip': 'Change photo', on: { click: () => openPhotoMenu() } }, avSlot, camBadge);
  const prev = h('div', { class: 'pe-prev', role: 'img', 'aria-label': 'Preview of your profile card' }, cover, h('div', { class: 'pe-prev-id' }, avBtn, h('div', { class: 'pe-prev-who' }, nameEl, headEl)),
    isAdmin ? h('span', { class: 'pe-prev-chip admin-chip', text: 'Admin' }) : null);
  function paintPreview() {
    cover.style.backgroundImage = `url(${bannerUrl(draft.banner)})`;
    if (isColor(draft.ring)) prev.style.setProperty('--avatar-ring', draft.ring); else prev.style.removeProperty('--avatar-ring');
    if (isColor(draft.adminColor)) { prev.style.setProperty('--admin-badge-bg', draft.adminColor); prev.style.setProperty('--admin-badge-fg', readableOn(draft.adminColor)); } else { prev.style.removeProperty('--admin-badge-bg'); prev.style.removeProperty('--admin-badge-fg'); }
    const nm = draft.name || u.name || 'Your name';
    avSlot.replaceChildren(avatar(nm, true, photoNow(), isAdmin));
    nameEl.textContent = nm; headEl.textContent = draft.headline || 'Your headline';
    headEl.classList.toggle('is-empty', !draft.headline);
  }
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, tabindex: '-1' });
  function openPhotoMenu() {
    openMenu(avBtn, [{ label: 'Upload a photo', icon: 'image', onSelect: () => file.click() }, ...(photoNow() ? [{ label: 'Remove photo', icon: 'trash', danger: true, onSelect: () => { newPhoto = null; removePhoto = true; paintPreview(); } }] : [])], { align: 'start' });
  }
  const form = h('div', { class: 'pe' }), cropHost = h('div', { class: 'pe-crop', hidden: true });
  file.addEventListener('change', () => {
    const f = file.files && file.files[0]; file.value = ''; if (!f) return;
    form.hidden = true; cropHost.hidden = false;   // the crop window replaces the form for a moment; the form (and what was typed) stays in place
    crop = pickAndCrop(f, cropHost);
    crop.done.then((b64) => { crop = null; cropHost.hidden = true; form.hidden = false; if (b64) { newPhoto = b64; removePhoto = false; paintPreview(); } });
  });

  // ---- look controls ---------------------------------------------------------------------------------------------------------------------
  // v2.5.2 (owner 3): a carousel; the chosen banner stays in the centre and the arrows move ONE banner (the old scrolling row is gone, its CSS `.pe-banners` is now unused)
  const car = buildBannerCarousel({ ids: BANNERS, urlOf: bannerUrl, get: () => draft.banner, set: (id) => { draft.banner = id; paintPreview(); } });
  const bannerBox = h('div', { class: 'pe-brow' }, car.el);
  const ring = colorRow({ label: 'Photo ring colour', get: () => draft.ring, set: (v) => { draft.ring = v; paintPreview(); } });
  const adminColor = isAdmin ? colorRow({ label: 'Admin badge colour', get: () => draft.adminColor, set: (v) => { draft.adminColor = v; paintPreview(); } }) : null;
  const look = h('div', { class: 'pe-look' },
    h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Banner' }), bannerBox),
    h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Ring around the photo' }), ring.el),
    adminColor && h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Admin badge colour (the shield on your photo)' }), adminColor.el));

  // ---- text fields (a label BESIDE the input, not around it) -----------------------------------------------------------------------------
  let fieldNo = 0;
  const field = (label, key, { max, area = false, ph = '', type = 'text' } = {}) => {
    const id = `pe-${key}-${++fieldNo}`;
    const el = h(area ? 'textarea' : 'input', { id, class: area ? 'input pe-area' : 'input', maxlength: String(max || 60), placeholder: ph, type: area ? null : type, rows: area ? '3' : null, autocomplete: 'off', autocapitalize: key === 'site' ? 'off' : null });
    el.value = draft[key];
    const count = max && max <= 200 && area ? h('span', { class: 'pe-count', text: `${el.value.length}/${max}` }) : null;
    el.addEventListener('input', () => { draft[key] = el.value; if (count) count.textContent = `${el.value.length}/${max}`; if (key === 'name' || key === 'headline') paintPreview(); });
    return h('div', { class: 'pe-f' }, h('label', { class: 'pe-l', for: id }, label, count), el);
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
      const next = Object.keys(patch).length ? await saveProfile(adapter, u.uid, patch) : profile;   // saveProfile also writes the copy on this device: the sidebar, Menu and Settings follow it
      if (oldDel && (newPhoto || removePhoto)) deleteImage(oldDel);   // the replaced photo leaves imgbb (best effort, not awaited)
      setSession({ user: { ...u, name: next.name || u.name, photo: next.photo || u.photo } });
      applyProfileLook(next); toast('Profile saved.'); saved = true; onSaved(next); sheet && sheet.close();
    } catch (e) { toast(ERR[e && e.message] || 'Could not save the profile. Check your connection.', { type: 'error' }); busy = false; save.disabled = false; save.textContent = 'Save'; }
  }
  form.append(
    h('div', { class: 'pe-side' }, prev, look, file),
    h('div', { class: 'pe-main' },
      group('About you', field('Name', 'name', { max: 60, ph: 'Your name' }), field('Headline', 'headline', { max: 60, ph: 'What you do, in a few words' }), field('Bio', 'bio', { max: 200, area: true, ph: 'A short line about you' }), field('Interests', 'interests', { max: 120, ph: 'Separate with commas' })),
      group('Details', h('div', { class: 'pe-f' }, h('span', { class: 'pe-l', text: 'Country' }), country.el),
        h('div', { class: 'pe-two' }, field('City', 'city', { max: 60, ph: 'City' }), field('Birthday', 'birthday', { max: 10, type: 'date' })),
        field('Languages', 'languages', { max: 80, ph: 'e.g. Bangla, English' }), field('Website', 'site', { max: 200, ph: 'https://' })),
      h('p', { class: 'pe-note', text: 'Your profile details are private. Only you and the Linkivo admin can see them.' }),
      h('div', { class: 'pe-actions' }, h('button', { type: 'button', class: 'btn', on: { click: () => sheet && sheet.requestClose() } }, skipLabel), save)));
  paintPreview(); car.mark();
  const body = h('div', null, form, cropHost);
  // v2.5.1 (owner: "closing without a change still asks"): compare with the draft as it was when the popup opened, not with the saved profile. A profile without a banner or name starts
  // with defaults in the draft, which the old comparison counted as a change.
  const base = { ...profile, ...draft };
  sheet = openSheet({ title, body, actions: [], wide: true,
    // closing with unsaved changes (X, outside click, Escape, Cancel) asks first; while the crop window is open, closing only leaves the crop
    beforeClose: async () => {
      if (crop) { const c = crop; crop = null; cropHost.hidden = true; form.hidden = false; c.cancel(); return false; }
      if (saved || busy || !hasChanges(draft, base, photoChanged())) return true;
      return confirmDialog({ title: 'Discard your changes?', message: 'You have changes that are not saved. If you close now they are lost.', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true });
    },
    onClose: () => { country.destroy(); car.destroy(); ring.fade.destroy(); adminColor && adminColor.fade.destroy(); try { onClosed({ saved }); } catch { /* the flow goes on */ } } });
  sheet.el.classList.add('pe-sheet');   // v2.5.1: wider on a PC (profile.css)
  return sheet;
}
