/**
 * Linkivo — js/core/profile-data.js  (v2.4.3)
 * Purpose: the editable profile of an account: name, bio, country, banner and photo (users/<uid>/profile, schema PROFILE_FIELDS). It is private: the owner and
 *          admins can read it, only the owner writes it (rules). A copy is kept on the device so the page opens at once and offline.
 * API: BANNERS (ids)   bannerUrl(id)   photoFileName(name, uid, now) -> string   cleanProfile(patch) -> patch   (pure, tested)
 *      loadProfile(adapter, uid) -> Promise<object>   saveProfile(adapter, uid, patch) -> Promise<object>   cachedProfile(uid) -> object
 */
import { prefs } from './local-prefs.js';

// v2.5.2 (owner 3): two new banners (b7 constellation of links, b8 contour sunset) sit in the MIDDLE of the list. Ids are stored in profiles, so b1 to b6 keep their pictures and
// only the ORDER changed; the first one (the default) is still b1.
export const BANNERS = ['b1', 'b2', 'b3', 'b7', 'b8', 'b4', 'b5', 'b6'];
export const bannerUrl = (id) => `/assets/art/banner-${BANNERS.includes(id) ? id.slice(1) : '1'}.svg`;
const pad = (n) => String(n).padStart(2, '0');
/** The pattern the owner asked for: user name, uid, date and time (readable in the imgbb gallery). */
export function photoFileName(name, uid, now = Date.now()) {
  const d = new Date(now), safe = String(name || 'user').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'user';
  return `${safe}_${uid}_${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
const LIMITS = { name: 60, bio: 200, country: 60, site: 200, banner: 8, photo: 2048, photoDel: 2048, headline: 60, city: 60, birthday: 10, languages: 80, interests: 120, pronouns: 20, ring: 9, adminColor: 9 };
/** Ten colour templates for the ring around the photo and the admin badge (owner). A custom colour is any #rrggbb. '' = follow the app accent. */
export const PALETTE = [['#3b82f6', 'Blue'], ['#6366f1', 'Indigo'], ['#8b5cf6', 'Violet'], ['#ec4899', 'Pink'], ['#ef4444', 'Red'], ['#f97316', 'Orange'], ['#f59e0b', 'Amber'], ['#22c55e', 'Green'], ['#14b8a6', 'Teal'], ['#64748b', 'Slate']];
export const isColor = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');
/** Black or white, whichever reads better on a #rrggbb background (the small shield on an admin's photo). Pure, tested. */
export function readableOn(hex) {
  if (!isColor(hex)) return '#ffffff';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111827' : '#ffffff';
}
/** v2.5.0 (owner): ONE ring around the photo everywhere (sidebar, menu, settings, profile) and ONE colour for the small shield under an admin's photo. Both are CSS variables on <html>,
 *  so every avatar follows them at once. No value = the app's own brand gradient / accent. The "Admin" word badge is NOT affected: it always follows the accent colour. */
export function applyProfileLook(profile, root = document.documentElement) {
  const ring = profile && isColor(profile.ring) ? profile.ring : '', c = profile && isColor(profile.adminColor) ? profile.adminColor : '';
  if (ring) root.style.setProperty('--avatar-ring', ring); else root.style.removeProperty('--avatar-ring');
  if (c) { root.style.setProperty('--admin-badge-bg', c); root.style.setProperty('--admin-badge-fg', readableOn(c)); }
  else { root.style.removeProperty('--admin-badge-bg'); root.style.removeProperty('--admin-badge-fg'); }
  for (const old of ['--admin-chip-bg', '--admin-chip-fg']) root.style.removeProperty(old);   // v2.4.4 names: the word badge no longer changes colour
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2000-08-10" -> "10 Aug 2000" (the owner's format; written by hand because the browser's short month names differ, for example "Sept"). '' when it is not a date. Pure, tested. */
export function formatBirthday(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); if (!m) return '';
  const mo = Number(m[2]), d = Number(m[3]); if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  return `${d} ${MONTHS[mo - 1]} ${m[1]}`;
}
/** The name and photo to SHOW for a signed-in user: what the person saved in the profile (kept on this device) wins over the sign-in provider's own picture. Used by the sidebar,
 *  the Menu, Settings and the Profile page, so a new photo appears in all of them. */
export function shownUser(user) {
  if (!user) return { name: '', photo: '' };
  const p = cachedProfile(user.uid);
  return { name: p.name || user.name || '', photo: p.photo || user.photo || '' };
}
/** Keeps only known fields, trimmed and cut to the length the rules allow; an empty text becomes null (= remove the field). */
export function cleanProfile(patch) {
  const out = {};
  for (const [k, max] of Object.entries(LIMITS)) if (k in patch) { const v = typeof patch[k] === 'string' ? patch[k].trim().slice(0, max) : patch[k]; out[k] = v === '' || v == null ? null : v; }
  if ('photoAt' in patch) out.photoAt = patch.photoAt || null;
  if (out.banner && !BANNERS.includes(out.banner)) delete out.banner;
  for (const k of ['ring', 'adminColor']) if (out[k] && !isColor(out[k])) delete out[k];
  if (out.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(out.birthday)) delete out.birthday;
  return out;
}
const key = (uid) => `profile.cache.${uid}`;
export const cachedProfile = (uid) => prefs.get(key(uid), {}) || {};
export async function loadProfile(adapter, uid) {
  try { const v = await adapter.get(`users/${uid}/profile`); const p = v && typeof v === 'object' ? v : {}; prefs.set(key(uid), p); return p; }
  catch { return cachedProfile(uid); }   // offline or a rules error: the copy on this device
}
export async function saveProfile(adapter, uid, patch) {
  const clean = cleanProfile(patch), updates = {};
  for (const [k, v] of Object.entries(clean)) updates[`users/${uid}/profile/${k}`] = v;
  if (Object.keys(updates).length) await adapter.update(updates);
  const next = { ...cachedProfile(uid) }; for (const [k, v] of Object.entries(clean)) { if (v == null) delete next[k]; else next[k] = v; }
  prefs.set(key(uid), next); return next;
}
