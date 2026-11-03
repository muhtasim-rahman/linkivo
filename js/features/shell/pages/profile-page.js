/**
 * Linkivo — js/features/shell/pages/profile-page.js  (v2.1.2, v2.4.1, rebuilt v2.4.2, redesigned v2.4.3)
 * Purpose: Profile. v2.4.3 (owner): a real profile card (banner, photo, name, email, badges, country, bio, the account id that copies on tap, an Edit button that
 *          opens the Edit profile popup), a highlights grid (six numbers, each opens the real place), a Favourites slider (top points first) above the
 *          Recently opened slider (both with scroll arrows beside See all), shortcuts (Export opens the export popup right here), the data card and a Share
 *          Linkivo card. Pull down to refresh re-reads the profile. Thumbnails in the sliders can be switched off in Settings > History (profile.thumbs).
 *          The sliders use only what is already saved on this device (engine.peekLinkMeta): this page makes no request for pictures.
 *          Wide screens: profile card and highlights stay on the left, everything else scrolls on the right. Phones: one calm column.
 * Page module: mount(container, ctx) -> unmount        refresh() (pull to refresh)        Route flag: refresh
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { toast } from '../../../ui/toast.js';
import { getSession } from '../../../core/session.js';
import { maskEmail } from '../../../core/mask.js';
import { loadCss } from '../../../core/css-loader.js';
import { getHistory, getEngine, getImportLog } from '../../../core/app-data.js';
import { prefs } from '../../../core/local-prefs.js';
import { faviconUrl } from '../../library/folder-style.js';
import { relativeTime, plural } from '../../../core/format.js';
import { avatar, logOut } from '../shell-parts.js';
import { adminChip } from '../../../ui/admin-badge.js';
import { settingsShortcut } from '../../../ui/settings-shortcut.js';
import { shotFromMeta } from './profile-thumbs.js';
import { loadProfile, cachedProfile, bannerUrl, applyProfileLook, formatBirthday } from '../../../core/profile-data.js';
import { attachFade } from '../../../ui/edge-fade.js';
import { findCountry, flagUrl } from '../../../core/countries.js';
import { isAdminAccount } from '../../../core/admin.js';
import { pointsOf } from '../../../engine/points.js';

const WEEK = 7 * 86400000, APP_URL = 'https://linkivo.web.app';
let reload = null;   // set by the mounted page: pull to refresh calls it

/** Top favourites by points, then newest. Pure and exported for the tests. */
export const topFavourites = (links, n = 12) => links.filter((l) => l && l.fv && !l.del).sort((a, b) => pointsOf(b) - pointsOf(a) || (b.ts || 0) - (a.ts || 0)).slice(0, n);
/** One entry per link, newest first, at most n. Pure and exported for the tests. */
export function distinctRecent(entries, n = 20) { const seen = new Set(), out = []; for (const e of entries) { if (seen.has(e.lid)) continue; seen.add(e.lid); out.push(e); if (out.length === n) break; } return out; }

export async function mount(container, ctx) {
  await Promise.all([loadCss('/css/pages/pages.css'), loadCss('/css/pages/profile.css')]);
  const s = getSession(), guest = s.mode === 'guest', engine = getEngine(), hist = getHistory();
  const uid = guest ? '' : s.user.uid;
  let profile = guest ? {} : cachedProfile(uid), token = 0;
  const thumbsOn = () => prefs.get('ui.thumbs', true) !== false && prefs.get('profile.thumbs', true) !== false;   // v2.4.4: the global switch AND the profile one

  // ---- profile card ---------------------------------------------------------------------------------------------------------------------
  const hero = h('section', { class: 'pf2-hero', 'aria-label': 'Profile' });
  /** v2.5.0: quiet entry points to security and account deletion (accounts only; a guest has no account to delete). */
  function accountLinks() {
    if (getSession().mode !== 'account') return null;
    const go = (path) => () => ctx.router.navigate(path);
    return h('div', { class: 'pf2-acct' },
      h('button', { type: 'button', class: 'pf2-acct-b', on: { click: go('/settings/security') } }, icon('lock', { size: 16 }), h('span', { text: 'Security and app lock' })),
      h('button', { type: 'button', class: 'pf2-acct-b is-danger', on: { click: async () => { const m = await import('../../settings/delete-account.js'); m.openDeleteAccount(); } } }, icon('trash', { size: 16 }), h('span', { text: 'Delete account' })));
  }
  function paintHero() {
    const me = getSession(), name = guest ? 'Guest' : (profile.name || me.user.name), photo = guest ? '' : (profile.photo || me.user.photo || '');
    const banner = h('div', { class: 'pf2-cover', style: { backgroundImage: `url(${bannerUrl(profile.banner)})` }, 'aria-hidden': 'true' });
    const edit = guest ? null : h('button', { type: 'button', class: 'pf2-edit', 'aria-label': 'Edit profile', on: { click: openEdit } }, icon('edit', { size: 16 }), h('span', { text: 'Edit profile' }));
    const badges = [];
    if (!guest && me.user.emailVerified) badges.push(h('span', { class: 'pf2-badge is-verified' }, icon('check-circle', { size: 14 }), 'Verified'));
    badges.push(adminChip());
    if (guest) badges.push(h('span', { class: 'pf2-badge' }, 'Guest mode'));
    const uidBtn = guest ? null : h('button', { type: 'button', class: 'pf2-uid', 'aria-label': 'Copy your account id', 'data-tip': 'Tap to copy', on: { click: copyUid } }, h('span', { class: 'pf2-uid-k', text: 'ID' }), h('code', { text: uid }), icon('copy', { size: 14 }));
    hero.replaceChildren(...[banner, edit, h('div', { class: 'pf2-id' }, avatar(name, true, photo, !guest),
      h('div', { class: 'pf2-who' }, h('h1', { class: 'pf2-name', text: name }), h('p', { class: 'pf2-mail', text: guest ? 'Stored only on this device' : maskEmail(me.user.email) }))),
      profile.headline ? h('p', { class: 'pf2-headline', text: profile.headline }) : null,
      h('div', { class: 'pf2-badges' }, ...badges),
      profile.bio ? h('p', { class: 'pf2-bio', text: profile.bio }) : (guest ? null : h('button', { type: 'button', class: 'pf2-bio is-empty', on: { click: openEdit } }, 'Add a short bio')),
      profile.site && /^https?:\/\//i.test(profile.site) ? h('a', { class: 'pf2-site', href: profile.site, target: '_blank', rel: 'noopener noreferrer' }, icon('link', { size: 14 }), profile.site.replace(/^https?:\/\//i, '').slice(0, 40)) : null,   // v2.5.0 (owner): the website sits right under the description
      infoList(),
      uidBtn].filter(Boolean));   // (replaceChildren(null) writes the text "null": v2.4.3 showed it on the card)
  }
  /** A country flag as a picture (Windows shows the emoji as two letters); if the picture can not load, the emoji or the code is shown instead. */
  function flagNode(c) {
    const box = h('span', { class: 'pf2-flag' });
    const img = h('img', { src: flagUrl(c.code), alt: '', width: '20', height: '15', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => box.replaceChildren(h('span', { class: 'pf2-flag-t', text: c.flag })), { once: true });
    box.appendChild(img); return box;
  }
  /** The details as a calm list, in the owner's order (v2.5.0): location (flag, city, country), birth date as "10 Aug 2000", languages, then the Interests heading with the chips.
   *  Interests show about one and a half rows and a "See more" text when there are more (it opens and closes smoothly). Pronouns are not shown any more. */
  function infoList() {
    const rows = [], c = profile.country ? findCountry(profile.country) : null;
    const place = [profile.city, c ? c.name : profile.country].filter(Boolean).join(', ');
    if (place) rows.push([c ? flagNode(c) : icon('map-pin', { size: 15 }), place]);
    const born = formatBirthday(profile.birthday); if (born) rows.push([icon('gift', { size: 15 }), born]);
    if (profile.languages) rows.push([icon('languages', { size: 15 }), profile.languages]);
    const tags = String(profile.interests || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12);
    if (!rows.length && !tags.length) return null;
    return h('div', { class: 'pf2-info' }, ...rows.map(([lead, tx]) => h('p', { class: 'pf2-info-r' }, lead, h('span', { text: tx }))), tags.length ? interestsBlock(tags) : null);
  }
  function interestsBlock(tags) {
    const list = h('div', { class: 'pf2-interests', id: 'pf2-int-list' }, ...tags.map((t) => h('span', { class: 'pf2-int', text: t })));
    const more = h('button', { type: 'button', class: 'pf2-see', 'aria-controls': 'pf2-int-list', 'aria-expanded': 'false', hidden: true }, 'See more');
    const CLAMP = 52;   // about 1.6 rows of chips (a row is 26px plus a 6px gap)
    let open = false;
    const apply = () => { list.style.maxHeight = open ? `${list.scrollHeight}px` : `${CLAMP}px`; list.classList.toggle('is-clamped', !open); more.textContent = open ? 'See less' : 'See more'; more.setAttribute('aria-expanded', String(open)); };
    more.addEventListener('click', () => { open = !open; apply(); });
    requestAnimationFrame(() => { more.hidden = list.scrollHeight <= CLAMP + 2; if (more.hidden) { list.style.maxHeight = ''; list.classList.remove('is-clamped'); } else apply(); });
    return h('div', { class: 'pf2-int-box' }, h('h3', { class: 'pf2-int-h', text: 'Interests' }), list, more);
  }
  async function copyUid() { try { await navigator.clipboard.writeText(uid); toast('Account id copied.'); } catch { toast('Could not copy. Select the id and copy it.'); } }
  function openEdit() { import('../../profile/profile-edit.js').then((m) => m.openProfileEdit({ session: getSession(), adapter: engine && engine.adapter, profile, isAdmin: isAdminAccount(), onSaved: (p) => { profile = p; paintHero(); } })); }

  // ---- highlights -----------------------------------------------------------------------------------------------------------------------
  const highlights = h('section', { class: 'pf2-hl', 'aria-label': 'Highlights' });
  /** v2.4.4 (owner: the old six equal cards were not good): one wide Library card with how much of it was ever opened, and four tinted tiles. Each opens the real place. */
  function paintHighlights() {
    const links = engine ? engine.listLinks().filter((l) => !l.del) : [], c = engine ? engine.counts() : { folders: 0, links: 0 };
    const total = links.length, opened = links.filter((l) => l.oc > 0).length, pct = total ? Math.round((opened / total) * 100) : 0;
    const week = hist ? hist.list().filter((e) => e.ts > Date.now() - WEEK).length : 0, imports = getImportLog() ? getImportLog().list().length : 0;
    const big = h('a', { class: 'pf2-hl-big', href: '/library' }, h('span', { class: 'pf2-hl-k' }, icon('library', { size: 16 }), 'Library'), h('strong', { class: 'pf2-hl-num', text: total.toLocaleString() }),
      h('span', { class: 'pf2-hl-cap', text: `links in ${plural(c.folders, 'folder')}` }), h('span', { class: 'pf2-meter', 'aria-hidden': 'true' }, h('span', { style: { width: `${pct}%` } })), h('span', { class: 'pf2-hl-cap is-sm', text: total ? `${pct}% opened at least once` : 'Nothing saved yet' }));
    const tiles = [['star', links.filter((l) => l.fv).length, 'Favourites', '/folder/favourites', 'amber'], ['history', week, 'Opened this week', '/profile/history', 'blue'], ['random', total - opened, 'Never opened', '/random', 'violet'], ['import', imports, 'Imports', '/import', 'green']];
    highlights.replaceChildren(big, h('div', { class: 'pf2-hl-grid', role: 'list' }, ...tiles.map(([ic, n, label, href, hue]) => h('a', { class: `pf2-hlt is-${hue}`, href, role: 'listitem' }, h('span', { class: 'pf2-hlt-ic', 'aria-hidden': 'true' }, icon(ic, { size: 18 })), h('strong', { class: 'pf2-hlt-n', text: Number(n).toLocaleString() }), h('span', { class: 'pf2-hlt-l', text: label })))));
  }

  // ---- sliders (Favourites, Recently opened) --------------------------------------------------------------------------------------------
  async function card(e, sub, mySeq) {
    const live = engine && engine.getLink(e.lid), meta = thumbsOn() && engine && live ? await engine.peekLinkMeta(e.lid) : null;
    if (mySeq !== token) return null;
    const sources = thumbsOn() ? [meta && /^https?:/.test(meta.image || '') ? meta.image : '', shotFromMeta(meta)].filter(Boolean) : [];
    const pic = h('span', { class: ['pf2-pic', !thumbsOn() && 'is-icon'] }, h('span', { class: 'pf2-pic-fav' }, e.host ? h('img', { src: faviconUrl(e.host), alt: '', width: '28', height: '28', loading: 'lazy', referrerpolicy: 'no-referrer', on: { error: (ev) => ev.target.remove() } }) : icon('globe', { size: 24 })));
    const tryNext = () => { const src = sources.shift(); if (!src) return; const im = h('img', { class: 'pf2-thumb', src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }); im.addEventListener('error', () => { im.remove(); tryNext(); }, { once: true }); pic.prepend(im); };
    tryNext();
    return h(live ? 'a' : 'div', { class: ['pf2-card', !live && 'is-gone'], role: 'listitem', href: live ? `/link/${encodeURIComponent(e.lid)}` : null }, pic, h('span', { class: 'pf2-card-t', text: e.title || e.host || e.url }), h('span', { class: 'pf2-card-u', text: sub }));
  }
  /** A titled slider with See all and two scroll buttons (owner). `items` = [{ entry, sub }]. */
  function sliderSection({ id, title, href, items, empty }) {
    const track = h('div', { class: 'pf2-slider', role: 'list', tabindex: '-1' });
    const go = (dir) => track.scrollBy({ left: dir * Math.max(180, track.clientWidth * 0.8), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const prev = h('button', { type: 'button', class: 'pf2-arrow', 'aria-label': `Scroll ${title} left`, on: { click: () => go(-1) } }, icon('chevron-left', { size: 18 }));
    const next = h('button', { type: 'button', class: 'pf2-arrow', 'aria-label': `Scroll ${title} right`, on: { click: () => go(1) } }, icon('chevron-right', { size: 18 }));
    const edges = () => { prev.disabled = track.scrollLeft <= 2; next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2; };
    track.addEventListener('scroll', () => requestAnimationFrame(edges), { passive: true });
    const fade = attachFade(track);
    const sec = h('section', { class: 'pf2-sec', 'aria-labelledby': id }, h('div', { class: 'pf2-sec-head' }, h('h2', { class: 'pf2-h', id, text: title }),
      items.length ? h('span', { class: 'pf2-sec-tools' }, h('a', { class: 'pf2-more', href }, 'See all'), prev, next) : null), items.length ? track : h('p', { class: 'pf2-empty', text: empty }));
    const my = token;
    Promise.all(items.map((it) => card(it.entry, it.sub, my))).then((cards) => { if (my !== token) return; track.replaceChildren(...cards.filter(Boolean)); requestAnimationFrame(() => { edges(); fade.update(); }); });
    return sec;
  }
  const favBox = h('div'), recentBox = h('div');
  function paintSliders() {
    token++;
    const favs = engine ? topFavourites(engine.listLinks()) : [], recent = distinctRecent(hist ? hist.list() : []);
    favBox.replaceChildren(sliderSection({ id: 'pf2-fav-h', title: 'Top favourites', href: '/folder/favourites', empty: 'Favourite a link and it appears here, highest points first.',
      items: favs.map((l) => ({ entry: { lid: l.id, title: l.title, host: l.host, url: l.url }, sub: `${pointsOf(l)} points \u00b7 ${l.host || ''}` })) }));
    recentBox.replaceChildren(sliderSection({ id: 'pf2-recent-h', title: 'Recently opened', href: '/profile/history', empty: 'Links you open will show up here.',
      items: recent.map((e) => ({ entry: e, sub: `${e.host || ''} \u00b7 ${relativeTime(e.ts)}` })) }));
  }

  // ---- shortcuts, data, share -----------------------------------------------------------------------------------------------------------
  const tile = (ic, label, onClick, href) => h(href ? 'a' : 'button', { class: 'pf2-tile', href, type: href ? null : 'button', on: href ? {} : { click: onClick } }, h('span', { class: 'pf2-tile-ic' }, icon(ic, { size: 22 })), h('span', { class: 'pf2-tile-l', text: label }));
  const tiles = [tile('history', 'History', null, '/profile/history'), tile('random', 'Random', null, '/random'), tile('search', 'Search', null, '/search'), tile('import', 'Import', null, '/import'),
    tile('download', 'Export', () => import('../../export/export-sheet.js').then((m) => m.openExport({ engine }))),   // v2.4.3 (owner): the export popup opens right here
    tile('trash', 'Recycle Bin', null, '/settings/recycle-bin'), ...(guest ? [] : [tile('users', 'Switch', () => import('../switch-account.js').then((m) => m.openSwitchAccount(ctx.router)))]), tile('settings', 'Settings', null, '/settings')];
  const dataBox = h('section', { class: 'pf2-sec', 'aria-labelledby': 'pf2-data-h' });
  function paintData() {
    const st = engine ? engine.status() : null;
    if (guest) { dataBox.replaceChildren(h('h2', { class: 'pf2-h', id: 'pf2-data-h', text: 'Your data' }), h('div', { class: 'pf2-invite' }, h('span', { class: 'pf2-invite-ic', 'aria-hidden': 'true' }, icon('cloud', { size: 22 })), h('div', { class: 'pf2-invite-tx' }, h('strong', { text: 'Stored only on this device' }), h('span', { text: 'Sign in to keep your links in your account and open them anywhere.' })), h('button', { type: 'button', class: 'btn btn-primary btn-sm', on: { click: () => logOut(ctx.router, { guest: true }) } }, 'Log in'))); return; }
    const last = (st && st.lastSync) || prefs.get('sync.last', 0);
    const kv = (ic, k, v) => h('div', { class: 'pf2-kv' }, h('span', { class: 'pf2-kv-ic', 'aria-hidden': 'true' }, icon(ic, { size: 18 })), h('span', { class: 'pf2-kv-k', text: k }), h('span', { class: 'pf2-kv-v', text: v }));
    dataBox.replaceChildren(h('h2', { class: 'pf2-h', id: 'pf2-data-h', text: 'Your data' }), h('div', { class: 'pf2-card-list' }, kv('cloud', 'Stored in', 'Your account, cached on this device'), kv('refresh', 'Last synced', last ? relativeTime(last) : 'Not yet in this session'), kv('clock', 'Waiting to upload', st ? plural(st.pending, 'change') : 'Nothing'),
      h('a', { class: 'pf2-kv is-link', href: '/settings/account' }, h('span', { class: 'pf2-kv-ic', 'aria-hidden': 'true' }, icon('shield', { size: 18 })), h('span', { class: 'pf2-kv-k', text: 'Account and security' }), h('span', { class: 'pf2-kv-v' }, icon('chevron-right', { size: 18 })))));
  }
  async function shareApp() {
    const data = { title: 'Linkivo', text: 'Linkivo keeps all my links in one fast, private place.', url: APP_URL };
    try { if (navigator.share) { await navigator.share(data); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(APP_URL); toast('Link copied.'); } catch { toast(APP_URL); }
  }
  // v2.4.4 (owner): the whole card is the button (Enter and Space work too); on phones the visible button is just the icon, at the right. A link texture sits behind.
  const shareCard = h('div', { class: 'pf2-share', role: 'button', tabindex: '0', 'aria-label': 'Share Linkivo', on: { click: shareApp, keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); shareApp(); } } } },
    h('span', { class: 'pf2-share-logo', 'aria-hidden': 'true' }, h('span', { class: 'logo-mark', style: { '--w': '34px' } })),
    h('div', { class: 'pf2-share-tx' }, h('strong', { text: 'Share Linkivo' }), h('span', { text: 'Know someone with too many saved links? Send them the app.' })),
    h('span', { class: 'pf2-share-btn', 'aria-hidden': 'true' }, icon('share', { size: 18 }), h('span', { class: 'pf2-share-t', text: 'Share' })));
  const logout = h('button', { type: 'button', class: 'pf2-logout', on: { click: () => logOut(ctx.router, guest ? { guest: true } : undefined) } }, icon('logout', { size: 20 }), guest ? 'Leave guest mode' : 'Log out');

  const switchSlot = h('span', { class: 'pf2-switch' });   // v2.4.4 (owner): the account switch icon is in the Profile header too
  if (!guest) import('../switch-account.js').then((m) => switchSlot.appendChild(m.switchButton(ctx.router))).catch(() => {});
  const page = h('div', { class: 'page pf2 page-enter' }, h('header', { class: 'pf2-bar' }, h('span', { class: 'pf2-bar-t', text: 'Profile' }), h('span', { class: 'pf2-bar-act' }, switchSlot, settingsShortcut('account', 'Account settings'))),
    h('div', { class: 'pf2-grid' }, h('div', { class: 'pf2-left' }, hero, accountLinks(), highlights),
      h('div', { class: 'pf2-main' }, favBox, recentBox, h('section', { class: 'pf2-sec', 'aria-labelledby': 'pf2-explore-h' }, h('h2', { class: 'pf2-h', id: 'pf2-explore-h', text: 'Explore' }), h('div', { class: 'pf2-tiles' }, tiles)), dataBox, shareCard, logout)));
  container.appendChild(page);
  paintHero(); paintHighlights(); paintData(); paintSliders();
  reload = async () => { if (!guest && engine && engine.adapter) { profile = await loadProfile(engine.adapter, uid); if (isAdminAccount()) applyProfileLook(profile); paintHero(); } paintHighlights(); paintSliders(); paintData(); };
  if (!guest) reload();   // the saved profile arrives a moment after the page (the copy on this device is already shown)
  const offs = [hist ? hist.subscribe(() => { paintHighlights(); paintSliders(); }) : null, engine && engine.subscribe ? engine.subscribe((ev) => { if (ev.type === 'sync' || ev.type === 'change') { paintHighlights(); paintData(); } }) : null].filter(Boolean);
  return () => { token++; reload = null; for (const off of offs) { try { off(); } catch { /* ignore */ } } };
}

/** Pull-to-refresh: the profile is read again from the account and every list is repainted. */
export async function refresh() { if (reload) await reload(); }
