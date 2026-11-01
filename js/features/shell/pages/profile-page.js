/**
 * Linkivo — js/features/shell/pages/profile-page.js  (v2.1.2, v2.4.1, rebuilt v2.4.2)
 * Purpose: Profile. Rebuilt from nothing in v2.4.2 (owner: the old page was a settings list in disguise). What a profile page is for, in order:
 *            1. WHO: cover, avatar, name, masked email, badges (account or guest, verified, admin).
 *            2. HOW MUCH: four numbers (links, folders, favourites, opened this week), each one a shortcut.
 *            3. WHAT YOU DID: the last 20 opened links as a slider, YouTube style. Thumbnail first, then the saved screenshot, then the site icon. Only what is already
 *               saved on this device is used: this page makes no request of its own (engine.peekLinkMeta reads the local copy).
 *            4. WHERE TO GO: an icon grid (History, Random, Search, Import, Export, Recycle Bin, Switch account, Settings).
 *            5. YOUR DATA: where it lives, when it last synced, what waits to upload (guests get an invitation to sign in instead).
 *            6. Log out.
 *          Wide screens: the identity card stays on the left while the rest scrolls on the right. Phones: one column, compact, app-like.
 * Page module: mount(container, ctx) -> unmount        Route flag: refresh (pull down re-reads the lists)
 */
import { h } from '../../../core/dom.js';
import { icon } from '../../../ui/icons.js';
import { getSession } from '../../../core/session.js';
import { maskEmail } from '../../../core/mask.js';
import { loadCss } from '../../../core/css-loader.js';
import { getHistory, getEngine } from '../../../core/app-data.js';
import { prefs } from '../../../core/local-prefs.js';
import { faviconUrl } from '../../library/folder-style.js';
import { relativeTime, plural } from '../../../core/format.js';
import { avatar, logOut } from '../shell-parts.js';
import { adminChip } from '../../../ui/admin-badge.js';
import { settingsShortcut } from '../../../ui/settings-shortcut.js';
import { attachScrollRow } from '../../../ui/scroll-row.js';
import { shotFromMeta } from './profile-thumbs.js';

const WEEK = 7 * 86400000;
const GRID = [['history', 'History', '/profile/history'], ['random', 'Random', '/random'], ['search', 'Search', '/search'], ['import', 'Import', '/import'],
  ['download', 'Export', '/settings/data'], ['trash', 'Recycle Bin', '/settings/recycle-bin'], ['users', 'Switch', null], ['settings', 'Settings', '/settings']];

export async function mount(container, ctx) {
  await Promise.all([loadCss('/css/pages/pages.css'), loadCss('/css/pages/profile.css')]);
  const s = getSession(), guest = s.mode === 'guest', name = guest ? 'Guest' : s.user.name;
  const engine = getEngine(), hist = getHistory();
  const stat = (ic, value, label, href) => h('a', { class: 'pf2-stat', href }, h('span', { class: 'pf2-stat-ic', 'aria-hidden': 'true' }, icon(ic, { size: 16 })), h('strong', { class: 'pf2-stat-n', text: String(value) }), h('span', { class: 'pf2-stat-l', text: label }));
  const stats = h('div', { class: 'pf2-stats', role: 'list' });
  const slider = h('div', { class: 'pf2-slider fade-x', role: 'list', tabindex: '-1' });
  const sliderBox = h('section', { class: 'pf2-sec', 'aria-labelledby': 'pf2-recent-h' });
  const dataBox = h('section', { class: 'pf2-sec', 'aria-labelledby': 'pf2-data-h' });
  let token = 0;

  function paintStats() {
    const c = engine ? engine.counts() : { folders: 0, links: 0 };
    const favs = engine ? engine.listLinks().filter((l) => l.fv).length : 0;
    const week = hist ? hist.list().filter((e) => e.ts > Date.now() - WEEK).length : 0;
    stats.replaceChildren(stat('link', c.links, 'Links', '/library'), stat('folder', c.folders, 'Folders', '/library'), stat('star', favs, 'Favourites', '/library'), stat('history', week, 'This week', '/profile/history'));
  }

  /** One card of the slider. The picture is decided once per card from saved data only. */
  async function card(e, mySeq) {
    const live = engine && engine.getLink(e.lid);
    const meta = engine && live ? await engine.peekLinkMeta(e.lid) : null;
    if (mySeq !== token) return null;
    const sources = [meta && /^https?:/.test(meta.image || '') ? meta.image : '', shotFromMeta(meta)].filter(Boolean);
    const pic = h('span', { class: 'pf2-pic' }, h('span', { class: 'pf2-pic-fav' }, e.host ? h('img', { src: faviconUrl(e.host), alt: '', width: '28', height: '28', loading: 'lazy', referrerpolicy: 'no-referrer', on: { error: (ev) => ev.target.remove() } }) : icon('globe', { size: 24 })));
    const tryNext = () => {
      const src = sources.shift(); if (!src) return;
      const im = h('img', { class: 'pf2-thumb', src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
      im.addEventListener('error', () => { im.remove(); tryNext(); }, { once: true });   // a thumbnail that fails falls to the screenshot, then to the site icon underneath
      pic.prepend(im);
    };
    tryNext();
    return h(live ? 'a' : 'div', { class: ['pf2-card', !live && 'is-gone'], role: 'listitem', href: live ? `/link/${encodeURIComponent(e.lid)}` : null }, pic,
      h('span', { class: 'pf2-card-t', text: e.title || e.host || e.url }), h('span', { class: 'pf2-card-u', text: `${e.host || ''} \u00b7 ${relativeTime(e.ts)}` }));
  }
  async function paintSlider() {
    const mySeq = ++token;
    const seen = new Set(), items = [];   // one card per link (a link opened five times is still one card)
    for (const e of hist ? hist.list() : []) { if (seen.has(e.lid)) continue; seen.add(e.lid); items.push(e); if (items.length === 20) break; }
    sliderBox.replaceChildren(h('div', { class: 'pf2-sec-head' }, h('h2', { class: 'pf2-h', id: 'pf2-recent-h', text: 'Recently opened' }), items.length ? h('a', { class: 'pf2-more', href: '/profile/history' }, 'See all', icon('chevron-right', { size: 16 })) : null),
      items.length ? slider : h('p', { class: 'pf2-empty', text: 'Links you open will show up here.' }));
    if (!items.length) return;
    const cards = (await Promise.all(items.map((e) => card(e, mySeq)))).filter(Boolean);
    if (mySeq !== token) return;
    slider.replaceChildren(...cards);
  }
  function paintData() {
    const st = engine ? engine.status() : null;
    if (guest) {
      dataBox.replaceChildren(h('h2', { class: 'pf2-h', id: 'pf2-data-h', text: 'Your data' }),
        h('div', { class: 'pf2-invite' }, h('span', { class: 'pf2-invite-ic', 'aria-hidden': 'true' }, icon('cloud', { size: 22 })),
          h('div', { class: 'pf2-invite-tx' }, h('strong', { text: 'Stored only on this device' }), h('span', { text: 'Sign in to keep your links in your account and open them anywhere.' })),
          h('button', { type: 'button', class: 'btn btn-primary btn-sm', on: { click: () => logOut(ctx.router, { guest: true }) } }, 'Log in')));
      return;
    }
    const last = (st && st.lastSync) || prefs.get('sync.last', 0);
    const kv = (ic, k, v) => h('div', { class: 'pf2-kv' }, h('span', { class: 'pf2-kv-ic', 'aria-hidden': 'true' }, icon(ic, { size: 18 })), h('span', { class: 'pf2-kv-k', text: k }), h('span', { class: 'pf2-kv-v', text: v }));
    dataBox.replaceChildren(h('h2', { class: 'pf2-h', id: 'pf2-data-h', text: 'Your data' }),
      h('div', { class: 'pf2-card-list' },
        kv('cloud', 'Stored in', 'Your account, cached on this device'),
        kv('refresh', 'Last synced', last ? relativeTime(last) : 'Not yet in this session'),
        kv('clock', 'Waiting to upload', st ? plural(st.pending, 'change') : 'Nothing'),
        h('a', { class: 'pf2-kv is-link', href: '/settings/account' }, h('span', { class: 'pf2-kv-ic', 'aria-hidden': 'true' }, icon('shield', { size: 18 })), h('span', { class: 'pf2-kv-k', text: 'Account and security' }), h('span', { class: 'pf2-kv-v' }, icon('chevron-right', { size: 18 })))));
  }

  const tiles = GRID.filter(([, , href]) => href || !guest).map(([ic, label, href]) => (href
    ? h('a', { class: 'pf2-tile', href }, h('span', { class: 'pf2-tile-ic' }, icon(ic, { size: 22 })), h('span', { class: 'pf2-tile-l', text: label }))
    : h('button', { type: 'button', class: 'pf2-tile', on: { click: () => import('../switch-account.js').then((m) => m.openSwitchAccount(ctx.router)) } }, h('span', { class: 'pf2-tile-ic' }, icon(ic, { size: 22 })), h('span', { class: 'pf2-tile-l', text: label }))));

  const badges = h('div', { class: 'pf2-badges' }, h('span', { class: 'tag', text: guest ? 'Guest mode' : 'Account' }),
    !guest && s.user.emailVerified ? h('span', { class: 'tag is-ok' }, icon('check-circle', { size: 13 }), 'Verified') : null, adminChip());
  const hero = h('section', { class: 'pf2-hero', 'aria-label': 'Profile' },
    h('div', { class: 'pf2-cover', 'aria-hidden': 'true' }),
    h('div', { class: 'pf2-id' }, avatar(name, true, s.user ? s.user.photo : '', !guest),
      h('div', { class: 'pf2-who' }, h('h1', { class: 'pf2-name', text: name }), h('p', { class: 'pf2-mail', text: guest ? 'Stored only on this device' : maskEmail(s.user.email) }), badges)),
    stats);

  const logout = h('button', { type: 'button', class: 'pf2-logout', on: { click: () => logOut(ctx.router, guest ? { guest: true } : undefined) } }, icon('logout', { size: 20 }), guest ? 'Leave guest mode' : 'Log out');
  const page = h('div', { class: 'page pf2 page-enter' },
    h('header', { class: 'pf2-bar' }, h('span', { class: 'pf2-bar-t', text: 'Profile' }), settingsShortcut('account', 'Account settings')),
    h('div', { class: 'pf2-grid' }, hero,
      h('div', { class: 'pf2-main' }, sliderBox, h('section', { class: 'pf2-sec', 'aria-label': 'Shortcuts' }, h('div', { class: 'pf2-tiles' }, tiles)), dataBox, logout)));
  container.appendChild(page);
  paintStats(); paintData(); paintSlider();
  const detach = attachScrollRow(slider, { arrows: false });
  const offs = [hist ? hist.subscribe(() => { paintStats(); paintSlider(); }) : null, engine && engine.subscribe ? engine.subscribe((ev) => { if (ev.type === 'sync' || ev.type === 'change') { paintStats(); paintData(); } }) : null].filter(Boolean);
  return () => { token++; detach(); for (const off of offs) { try { off(); } catch { /* ignore */ } } };
}

/** Pull-to-refresh: the lists are read again (the page's own data is local, so this only repaints). */
export async function refresh() { /* the subscriptions above already repaint on every change; nothing else to load */ }
